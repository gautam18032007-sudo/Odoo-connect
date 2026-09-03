import path from "node:path";
import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

/**
 * Net Purchase Engine — Independent finance-owned purchase ledger.
 *
 * This creates an entirely separate storage layer from:
 *   - sales_fact (Sales Engine)
 *   - product_master (Inventory Engine)
 *   - purchase_fact (existing Purchase/Profitability Engine)
 *
 * The Net Purchase Engine is an additive module. It does not read from,
 * write to, or depend on any existing table.
 */
async function migrate() {
	if (!process.env.DATABASE_URL) {
		console.error("Missing DATABASE_URL in environment.");
		process.exit(1);
	}

	console.log("Connecting to database...");
	const sql = neon(process.env.DATABASE_URL);

	// ── Batch Audit Trail ────────────────────────────────────────────────
	console.log("Creating net_purchase_batches table...");
	await sql`
    CREATE TABLE IF NOT EXISTS net_purchase_batches (
      id SERIAL PRIMARY KEY,
      filename TEXT,
      status TEXT NOT NULL DEFAULT 'success',
      row_count INTEGER,
      valid_row_count INTEGER,
      quarantined_row_count INTEGER,
      date_range_start DATE,
      date_range_end DATE,
      upload_type TEXT,
      net_purchase NUMERIC,
      uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `;

	// ── Staging Table (for chunked browser uploads) ──────────────────────
	console.log("Creating staging_net_purchase_rows table...");
	await sql`
    CREATE TABLE IF NOT EXISTS staging_net_purchase_rows (
      id SERIAL PRIMARY KEY,
      batch_id INTEGER NOT NULL,
      row_number INTEGER NOT NULL,
      parsed JSONB NOT NULL,
      status TEXT NOT NULL DEFAULT 'valid',
      error_reason TEXT
    );
  `;
	await sql`CREATE INDEX IF NOT EXISTS staging_net_purchase_batch_idx ON staging_net_purchase_rows (batch_id);`;

	// ── Fact Table ───────────────────────────────────────────────────────
	console.log("Creating net_purchase_fact table...");
	await sql`
    CREATE TABLE IF NOT EXISTS net_purchase_fact (
      id SERIAL PRIMARY KEY,
      upload_id INTEGER,
      purchase_date DATE NOT NULL,
      bill_no TEXT,
      billed_by TEXT,
      product_key TEXT NOT NULL,
      sku_code TEXT,
      item_name TEXT NOT NULL,
      brand TEXT,
      category TEXT,
      quantity INTEGER NOT NULL DEFAULT 0,
      gross_purchase_amount NUMERIC NOT NULL DEFAULT 0,
      tax_amount NUMERIC NOT NULL DEFAULT 0,
      net_purchase_amount NUMERIC NOT NULL DEFAULT 0,
      supplier_name TEXT,
      source_billed_by TEXT,
      store_id INTEGER REFERENCES store_dimension(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `;

	// ── Indexes ──────────────────────────────────────────────────────────
	console.log("Creating uniqueness + lookup indexes...");
	await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS net_purchase_fact_natural_key
    ON net_purchase_fact (purchase_date, COALESCE(bill_no, ''), COALESCE(billed_by, ''), product_key);
  `;
	await sql`CREATE INDEX IF NOT EXISTS net_purchase_fact_date_idx ON net_purchase_fact (purchase_date);`;
	await sql`CREATE INDEX IF NOT EXISTS net_purchase_fact_product_key_idx ON net_purchase_fact (product_key);`;
	await sql`CREATE INDEX IF NOT EXISTS net_purchase_fact_brand_idx ON net_purchase_fact (brand);`;
	await sql`CREATE INDEX IF NOT EXISTS net_purchase_fact_category_idx ON net_purchase_fact (category);`;
	await sql`CREATE INDEX IF NOT EXISTS net_purchase_fact_billed_by_idx ON net_purchase_fact (billed_by);`;
	await sql`CREATE INDEX IF NOT EXISTS net_purchase_fact_store_id_idx ON net_purchase_fact (store_id);`;

	// ── View (joins store_dimension for display names) ───────────────────
	console.log("Creating net_purchase_fact_v view...");
	await sql`DROP VIEW IF EXISTS net_purchase_fact_v;`;
	await sql`
    CREATE VIEW net_purchase_fact_v AS
    SELECT
      npf.id,
      npf.upload_id,
      npf.purchase_date,
      npf.bill_no,
      npf.billed_by,
      npf.product_key,
      npf.sku_code,
      npf.item_name,
      npf.brand,
      npf.category,
      npf.quantity,
      npf.gross_purchase_amount,
      npf.tax_amount,
      npf.net_purchase_amount,
      npf.supplier_name,
      npf.source_billed_by,
      npf.store_id,
      COALESCE(sd.display_name, npf.billed_by) AS store_display_name
    FROM net_purchase_fact npf
    LEFT JOIN store_dimension sd ON npf.store_id = sd.id;
  `;

	console.log("✅ net_purchase_fact schema migration completed successfully.");
}

migrate().catch((err) => {
	console.error("Migration failed:", err);
	process.exit(1);
});
