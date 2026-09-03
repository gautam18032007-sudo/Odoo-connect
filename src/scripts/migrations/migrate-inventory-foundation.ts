import path from "node:path";
import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

async function migrate() {
	if (!process.env.DATABASE_URL) {
		console.error("Missing DATABASE_URL in environment.");
		process.exit(1);
	}

	console.log("Connecting to database...");
	const sql = neon(process.env.DATABASE_URL);

	console.log("Creating product_master table...");
	await sql`
		CREATE TABLE IF NOT EXISTS product_master (
			product_key TEXT PRIMARY KEY,
			sku_code TEXT,
			product_name TEXT NOT NULL,
			category TEXT,
			mrp NUMERIC(12, 2) NOT NULL DEFAULT 0,
			purchase_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
			active BOOLEAN NOT NULL DEFAULT true,
			updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
		);
	`;

	console.log("Creating product_master indexes...");
	await sql`CREATE INDEX IF NOT EXISTS product_master_sku_code_idx ON product_master (sku_code);`;
	await sql`CREATE INDEX IF NOT EXISTS product_master_category_idx ON product_master (category);`;

	console.log("Creating inventory_batches table...");
	await sql`
		CREATE TABLE IF NOT EXISTS inventory_batches (
			id SERIAL PRIMARY KEY,
			filename TEXT,
			status TEXT NOT NULL DEFAULT 'success',
			row_count INTEGER,
			valid_row_count INTEGER,
			quarantined_row_count INTEGER,
			uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
		);
	`;

	console.log("Creating inventory_snapshot table...");
	await sql`
		CREATE TABLE IF NOT EXISTS inventory_snapshot (
			id SERIAL PRIMARY KEY,
			batch_id INTEGER REFERENCES inventory_batches(id) ON DELETE CASCADE,
			product_key TEXT REFERENCES product_master(product_key) ON DELETE CASCADE,
			main_stock INTEGER NOT NULL DEFAULT 0,
			smartworks_stock INTEGER NOT NULL DEFAULT 0,
			klj_stock INTEGER NOT NULL DEFAULT 0,
			snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
			created_at TIMESTAMPTZ NOT NULL DEFAULT now()
		);
	`;

	console.log("Creating inventory_snapshot indexes...");
	await sql`CREATE INDEX IF NOT EXISTS inventory_snapshot_product_key_idx ON inventory_snapshot (product_key);`;
	await sql`CREATE INDEX IF NOT EXISTS inventory_snapshot_date_idx ON inventory_snapshot (snapshot_date);`;
	await sql`
		CREATE UNIQUE INDEX IF NOT EXISTS inventory_snapshot_unique_day
		ON inventory_snapshot (product_key, snapshot_date);
	`;

	console.log("Creating staging_inventory_rows table...");
	await sql`
		CREATE TABLE IF NOT EXISTS staging_inventory_rows (
			id BIGSERIAL PRIMARY KEY,
			batch_id INTEGER REFERENCES inventory_batches(id) ON DELETE CASCADE,
			row_number INTEGER,
			parsed JSONB NOT NULL,
			status TEXT NOT NULL CHECK (status IN ('valid', 'quarantined')),
			error_reason TEXT
		);
	`;

	console.log(
		"✅ Inventory foundation schema migration completed successfully.",
	);
}

migrate().catch((err) => {
	console.error("❌ Migration failed:", err);
	process.exit(1);
});
