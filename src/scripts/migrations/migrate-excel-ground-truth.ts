import path from "node:path";
import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

async function migrate() {
	if (!process.env.DATABASE_URL) {
		console.error("Missing DATABASE_URL");
		process.exit(1);
	}

	const sql = neon(process.env.DATABASE_URL);
	console.log("Starting Excel ground-truth schema migration...");

	console.log("Dropping views first to avoid column mismatch errors...");
	await sql`DROP VIEW IF EXISTS data_freshness CASCADE`;
	await sql`DROP VIEW IF EXISTS sales_fact_v CASCADE`;

	console.log("Extending upload_batches...");
	await sql`ALTER TABLE upload_batches ADD COLUMN IF NOT EXISTS upload_type TEXT`;
	await sql`ALTER TABLE upload_batches ADD COLUMN IF NOT EXISTS latest_sale_date DATE`;
	await sql`ALTER TABLE upload_batches ADD COLUMN IF NOT EXISTS row_count_raw INTEGER`;
	await sql`ALTER TABLE upload_batches ADD COLUMN IF NOT EXISTS row_count_stored INTEGER`;
	await sql`ALTER TABLE upload_batches ADD COLUMN IF NOT EXISTS rows_quarantined INTEGER`;
	await sql`ALTER TABLE upload_batches ADD COLUMN IF NOT EXISTS stores_found TEXT[]`;
	await sql`ALTER TABLE upload_batches ADD COLUMN IF NOT EXISTS categories_found TEXT[]`;
	await sql`ALTER TABLE upload_batches ADD COLUMN IF NOT EXISTS net_sales NUMERIC(12,2)`;

	await sql`
    UPDATE upload_batches
    SET
      row_count_raw = COALESCE(row_count_raw, row_count),
      row_count_stored = COALESCE(row_count_stored, valid_row_count),
      rows_quarantined = COALESCE(rows_quarantined, quarantined_row_count)
    WHERE row_count_raw IS NULL OR row_count_stored IS NULL OR rows_quarantined IS NULL
  `;

	console.log("Migrating sales_fact columns...");
	const renames: Array<[string, string]> = [
		["sku", "sku_code"],
		["product_name", "item_name"],
		["customer_id", "customer_mobile"],
		["batch_id", "upload_id"],
	];

	for (const [from, to] of renames) {
		const exists = await sql`
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'sales_fact' AND column_name = ${from}
      LIMIT 1
    `;
		const targetExists = await sql`
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'sales_fact' AND column_name = ${to}
      LIMIT 1
    `;
		if (
			Array.isArray(exists) &&
			exists.length > 0 &&
			Array.isArray(targetExists) &&
			targetExists.length === 0
		) {
			await sql.query(`ALTER TABLE sales_fact RENAME COLUMN ${from} TO ${to}`);
			console.log(`  Renamed sales_fact.${from} → ${to}`);
		}
	}

	for (const col of [
		"store",
		"sale_time",
		"total_amount",
		"sgst",
		"cgst",
		"igst",
		"row_number",
	]) {
		const exists = await sql`
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'sales_fact' AND column_name = ${col}
      LIMIT 1
    `;
		if (Array.isArray(exists) && exists.length > 0) {
			await sql.query(`ALTER TABLE sales_fact DROP COLUMN ${col}`);
			console.log(`  Dropped sales_fact.${col}`);
		}
	}

	await sql`ALTER TABLE sales_fact ALTER COLUMN sku_code DROP NOT NULL`;
	await sql`ALTER TABLE sales_fact ALTER COLUMN brand DROP NOT NULL`;
	await sql`ALTER TABLE sales_fact ALTER COLUMN category DROP NOT NULL`;

	console.log("Adding product_key column to sales_fact...");
	await sql`ALTER TABLE sales_fact ADD COLUMN IF NOT EXISTS product_key TEXT`;
	await sql`UPDATE sales_fact SET product_key = COALESCE(sku_code, item_name) WHERE product_key IS NULL`;
	await sql`ALTER TABLE sales_fact ALTER COLUMN product_key SET NOT NULL`;

	console.log("Updating financial columns...");
	await sql`ALTER TABLE sales_fact DROP COLUMN IF EXISTS net_amount CASCADE`;
	await sql`ALTER TABLE sales_fact ADD COLUMN IF NOT EXISTS mrp_amount NUMERIC(12,2)`;
	await sql`ALTER TABLE sales_fact ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12,2)`;
	await sql`ALTER TABLE sales_fact ADD COLUMN IF NOT EXISTS gross_amount NUMERIC(12,2)`;
	await sql`ALTER TABLE sales_fact ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(12,2)`;
	await sql`ALTER TABLE sales_fact ADD COLUMN IF NOT EXISTS net_amount NUMERIC(12,2)`;

	console.log("Updating unique constraint...");
	await sql`ALTER TABLE sales_fact DROP CONSTRAINT IF EXISTS uq_sales_fact_key`;
	try {
		await sql`
      ALTER TABLE sales_fact
      ADD CONSTRAINT uq_sales_fact_key
      UNIQUE (sale_date, bill_no, billed_by, product_key)
    `;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (!message.includes("already exists")) throw error;
		console.log("  uq_sales_fact_key already exists");
	}

	console.log("Creating indexes...");
	await sql`CREATE INDEX IF NOT EXISTS idx_sales_sku_code ON sales_fact (sku_code)`;
	await sql`CREATE INDEX IF NOT EXISTS idx_sales_product_key ON sales_fact (product_key)`;
	await sql`CREATE INDEX IF NOT EXISTS idx_sales_composite ON sales_fact (sale_date, billed_by, category)`;

	console.log("Creating staging_upload_rows...");
	await sql`
    CREATE TABLE IF NOT EXISTS staging_upload_rows (
      id BIGSERIAL PRIMARY KEY,
      batch_id INTEGER REFERENCES upload_batches(id) ON DELETE CASCADE,
      row_number INTEGER,
      parsed JSONB NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('valid', 'quarantined')),
      error_reason TEXT
    )
  `;

	console.log("Creating sales_fact_v view...");
	await sql`
    CREATE OR REPLACE VIEW sales_fact_v AS
    SELECT
      sf.id,
      sf.upload_id,
      sf.bill_no,
      sf.sale_date,
      CASE 
        WHEN sf.billed_by IN ('Klj store', 'SmartworksNoida Noida') THEN sf.billed_by
        ELSE 'Head office'
      END AS billed_by,
      sf.product_key,
      sf.sku_code,
      sf.item_name,
      sf.brand,
      sf.category,
      sf.quantity,
      sf.mrp_amount,
      sf.discount_amount,
      sf.gross_amount,
      sf.tax_amount,
      sf.net_amount,
      sf.customer_mobile,
      sf.customer_name,
      sf.payment_method,
      CASE 
        WHEN sf.billed_by = 'SmartworksNoida Noida' THEN 'Smart Works Noida'
        WHEN sf.billed_by = 'Klj store' THEN 'KLJ'
        ELSE 'Head office'
      END AS store_display_name
    FROM sales_fact sf
  `;

	console.log("Creating data_freshness view...");
	await sql`
    CREATE OR REPLACE VIEW data_freshness AS
    SELECT
      MAX(sf.sale_date) AS latest_sale_date,
      CURRENT_DATE - MAX(sf.sale_date) AS days_stale,
      COUNT(DISTINCT sf.bill_no) AS total_bills,
      SUM(sf.net_amount) AS total_revenue,
      MAX(ub.uploaded_at) AS last_upload_at
    FROM sales_fact sf
    JOIN upload_batches ub ON sf.upload_id = ub.id
  `;

	console.log("Migration complete.");
}

migrate().catch((error) => {
	console.error("Migration failed:", error);
	process.exit(1);
});
