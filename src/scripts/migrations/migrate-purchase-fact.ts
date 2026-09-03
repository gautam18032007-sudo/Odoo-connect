import path from "node:path";
import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

/**
 * Purchase Intelligence — vendor-side lifecycle.
 *
 * Sales and purchase have different lifecycles (customer vs vendor transaction),
 * so purchases live in their own fact table and are NEVER mixed into sales_fact.
 * All profitability analytics read `purchase_fact_v`, mirroring the sales_fact_v
 * pattern (adds the normalized store_display_name via store_dimension).
 */
async function migrate() {
	if (!process.env.DATABASE_URL) {
		console.error("Missing DATABASE_URL in environment.");
		process.exit(1);
	}

	console.log("Connecting to database...");
	const sql = neon(process.env.DATABASE_URL);

	console.log("Creating purchase_fact table...");
	await sql`
    CREATE TABLE IF NOT EXISTS purchase_fact (
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

	console.log("Creating uniqueness + lookup indexes...");
	// De-dupe key mirrors sales_fact's natural key so incremental re-uploads are idempotent.
	await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS purchase_fact_natural_key
    ON purchase_fact (purchase_date, COALESCE(bill_no, ''), COALESCE(billed_by, ''), product_key);
  `;
	await sql`CREATE INDEX IF NOT EXISTS purchase_fact_date_idx ON purchase_fact (purchase_date);`;
	await sql`CREATE INDEX IF NOT EXISTS purchase_fact_product_key_idx ON purchase_fact (product_key);`;
	await sql`CREATE INDEX IF NOT EXISTS purchase_fact_brand_idx ON purchase_fact (brand);`;
	await sql`CREATE INDEX IF NOT EXISTS purchase_fact_category_idx ON purchase_fact (category);`;
	await sql`CREATE INDEX IF NOT EXISTS purchase_fact_billed_by_idx ON purchase_fact (billed_by);`;

	console.log("Creating purchase_fact_v view (adds store_display_name)...");
	await sql`DROP VIEW IF EXISTS purchase_fact_v;`;
	await sql`
    CREATE VIEW purchase_fact_v AS
    SELECT
      pf.id,
      pf.upload_id,
      pf.purchase_date,
      pf.bill_no,
      pf.billed_by,
      pf.product_key,
      pf.sku_code,
      pf.item_name,
      pf.brand,
      pf.category,
      pf.quantity,
      pf.gross_purchase_amount,
      pf.tax_amount,
      pf.net_purchase_amount,
      pf.supplier_name,
      pf.source_billed_by,
      pf.store_id,
      COALESCE(sd.display_name, pf.billed_by) AS store_display_name
    FROM purchase_fact pf
    LEFT JOIN store_dimension sd ON pf.store_id = sd.id;
  `;

	console.log("Creating purchase_batches table (upload audit trail)...");
	await sql`
    CREATE TABLE IF NOT EXISTS purchase_batches (
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
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `;

	console.log("Creating staging_purchase_rows table...");
	await sql`
    CREATE TABLE IF NOT EXISTS staging_purchase_rows (
      id BIGSERIAL PRIMARY KEY,
      batch_id INTEGER REFERENCES purchase_batches(id) ON DELETE CASCADE,
      row_number INTEGER,
      parsed JSONB NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('valid', 'quarantined')),
      error_reason TEXT
    );
  `;

	console.log("✅ purchase_fact schema migration completed successfully.");
}

migrate().catch((err) => {
	console.error("❌ Migration failed:", err);
	process.exit(1);
});
