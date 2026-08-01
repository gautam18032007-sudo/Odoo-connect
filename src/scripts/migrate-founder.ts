import path from "node:path";
import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

// Load environment variables from .env.local for local scripts
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

async function migrate() {
	if (!process.env.DATABASE_URL) {
		console.error("Missing DATABASE_URL in environment.");
		process.exit(1);
	}

	console.log("Connecting to database...");
	const sql = neon(process.env.DATABASE_URL);

	console.log("Creating upload_batches table...");
	await sql`
    CREATE TABLE IF NOT EXISTS upload_batches (
      id SERIAL PRIMARY KEY,
      filename TEXT NOT NULL,
      status TEXT NOT NULL,
      row_count INTEGER NOT NULL DEFAULT 0,
      error_count INTEGER NOT NULL DEFAULT 0,
      valid_row_count INTEGER NOT NULL DEFAULT 0,
      quarantined_row_count INTEGER NOT NULL DEFAULT 0,
      date_range_start DATE,
      date_range_end DATE,
      uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `;

	console.log("Ensuring upload_batches columns...");
	await sql`ALTER TABLE upload_batches ADD COLUMN IF NOT EXISTS valid_row_count INTEGER NOT NULL DEFAULT 0;`;
	await sql`ALTER TABLE upload_batches ADD COLUMN IF NOT EXISTS quarantined_row_count INTEGER NOT NULL DEFAULT 0;`;
	await sql`ALTER TABLE upload_batches ADD COLUMN IF NOT EXISTS date_range_start DATE;`;
	await sql`ALTER TABLE upload_batches ADD COLUMN IF NOT EXISTS date_range_end DATE;`;

	console.log("Creating sales_fact table...");
	await sql`
    CREATE TABLE IF NOT EXISTS sales_fact (
      id SERIAL PRIMARY KEY,
      batch_id INTEGER REFERENCES upload_batches(id) ON DELETE CASCADE,
      sale_date DATE NOT NULL,
      sale_time TIME,
      bill_no TEXT NOT NULL,
      billed_by TEXT NOT NULL,
      store TEXT NOT NULL,
      category TEXT NOT NULL,
      brand TEXT NOT NULL,
      sku TEXT NOT NULL,
      product_name TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      net_amount NUMERIC(12, 2) NOT NULL,
      total_amount NUMERIC(12, 2),
      sgst NUMERIC(8, 2),
      cgst NUMERIC(8, 2),
      igst NUMERIC(8, 2),
      payment_method TEXT,
      customer_id TEXT,
      customer_name TEXT,
      row_number INTEGER NOT NULL
    );
  `;

	console.log("Adding new columns to sales_fact if they don't exist...");
	await sql`ALTER TABLE sales_fact ADD COLUMN IF NOT EXISTS sale_time TIME;`;
	await sql`ALTER TABLE sales_fact ADD COLUMN IF NOT EXISTS billed_by TEXT;`;
	await sql`ALTER TABLE sales_fact ADD COLUMN IF NOT EXISTS total_amount NUMERIC(12, 2);`;
	await sql`ALTER TABLE sales_fact ADD COLUMN IF NOT EXISTS sgst NUMERIC(8, 2);`;
	await sql`ALTER TABLE sales_fact ADD COLUMN IF NOT EXISTS cgst NUMERIC(8, 2);`;
	await sql`ALTER TABLE sales_fact ADD COLUMN IF NOT EXISTS igst NUMERIC(8, 2);`;
	await sql`ALTER TABLE sales_fact ADD COLUMN IF NOT EXISTS payment_method TEXT;`;
	await sql`ALTER TABLE sales_fact ADD COLUMN IF NOT EXISTS customer_name TEXT;`;

	console.log("Creating indexes...");
	await sql`CREATE INDEX IF NOT EXISTS idx_sales_fact_batch_id ON sales_fact (batch_id);`;
	await sql`CREATE INDEX IF NOT EXISTS idx_sales_fact_sale_date ON sales_fact (sale_date);`;
	await sql`CREATE INDEX IF NOT EXISTS idx_sales_fact_sale_time ON sales_fact (sale_time);`;
	await sql`CREATE INDEX IF NOT EXISTS idx_sales_fact_store ON sales_fact (store);`;
	await sql`CREATE INDEX IF NOT EXISTS idx_sales_fact_billed_by ON sales_fact (billed_by);`;
	await sql`CREATE INDEX IF NOT EXISTS idx_sales_fact_category ON sales_fact (category);`;
	await sql`CREATE INDEX IF NOT EXISTS idx_sales_fact_brand ON sales_fact (brand);`;
	await sql`CREATE INDEX IF NOT EXISTS idx_sales_fact_sku ON sales_fact (sku);`;
	await sql`CREATE INDEX IF NOT EXISTS idx_sales_fact_bill_no ON sales_fact (bill_no);`;
	await sql`CREATE INDEX IF NOT EXISTS idx_sales_fact_date_bill_sku ON sales_fact (sale_date, bill_no, sku);`;
	await sql`CREATE INDEX IF NOT EXISTS idx_sales_fact_date_billed_by ON sales_fact (sale_date, billed_by);`;

	console.log("✅ Migration complete!");
	console.log("");
	console.log("📊 New columns added to sales_fact:");
	console.log("  ✅ sale_time (TIME) - Transaction time in HH:MM:SS format");
	console.log(
		"  ✅ billed_by (TEXT) - PRIMARY store differentiator (KLJ vs Smart_Works_Noida)",
	);
	console.log("  ✅ total_amount (NUMERIC) - Amount with taxes");
	console.log("  ✅ sgst (NUMERIC) - State GST");
	console.log("  ✅ cgst (NUMERIC) - Central GST");
	console.log("  ✅ igst (NUMERIC) - Integrated GST");
	console.log(
		"  ✅ payment_method (TEXT) - Payment type (COD, UPI, Card, etc.)",
	);
	console.log("  ✅ customer_name (TEXT) - Customer name");
}

migrate().catch((err) => {
	console.error("❌ Migration failed:", err);
	process.exit(1);
});
