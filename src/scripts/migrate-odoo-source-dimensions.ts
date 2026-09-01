import path from "node:path";
import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

/**
 * Phase 3 (Odoo source-of-truth modernization): creates the 5 canonical
 * dimension tables designed in docs/ODOO_SOURCE_OF_TRUTH_AUDIT.md's Phase 2
 * report (dim_companies, dim_pos_configs, dim_tax, dim_locations,
 * dim_product_categories), plus the additive, nullable FK-precursor columns
 * on dim_stores/dim_products that Phase 2 §12 steps 4 and 6 called for.
 *
 * Additive only:
 *  - No existing table is altered destructively.
 *  - No existing column is dropped or retyped.
 *  - fact_inventory.location_id FK is deliberately NOT added here — Phase 2's
 *    approved plan gates that behind a separate zero-orphan validation
 *    (see validate-inventory-locations.ts), run only after this migration.
 */
async function migrate() {
	if (!process.env.DATABASE_URL) {
		console.error("Missing DATABASE_URL in environment.");
		process.exit(1);
	}

	console.log("Connecting to database...");
	const sql = neon(process.env.DATABASE_URL);

	console.log("Creating dim_companies...");
	await sql`
		CREATE TABLE IF NOT EXISTS dim_companies (
			id INTEGER PRIMARY KEY,
			name TEXT NOT NULL,
			vat TEXT,
			state_name TEXT,
			country_name TEXT,
			active BOOLEAN NOT NULL DEFAULT true,
			updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)
	`;

	console.log("Creating dim_pos_configs...");
	await sql`
		CREATE TABLE IF NOT EXISTS dim_pos_configs (
			id INTEGER PRIMARY KEY,
			name TEXT NOT NULL,
			company_id INTEGER REFERENCES dim_companies(id),
			warehouse_id INTEGER,
			warehouse_code TEXT,
			picking_type_id INTEGER,
			active BOOLEAN NOT NULL DEFAULT true,
			updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)
	`;

	console.log("Creating dim_tax...");
	await sql`
		CREATE TABLE IF NOT EXISTS dim_tax (
			id INTEGER PRIMARY KEY,
			name TEXT NOT NULL,
			amount NUMERIC(10, 4) NOT NULL DEFAULT 0,
			amount_type TEXT NOT NULL,
			type_tax_use TEXT NOT NULL,
			company_id INTEGER REFERENCES dim_companies(id),
			active BOOLEAN NOT NULL DEFAULT true,
			updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)
	`;

	console.log("Creating dim_locations...");
	await sql`
		CREATE TABLE IF NOT EXISTS dim_locations (
			id INTEGER PRIMARY KEY,
			name TEXT NOT NULL,
			complete_name TEXT,
			usage TEXT,
			company_id INTEGER REFERENCES dim_companies(id),
			parent_location_id INTEGER REFERENCES dim_locations(id),
			warehouse_id INTEGER,
			updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)
	`;

	console.log("Creating dim_product_categories...");
	await sql`
		CREATE TABLE IF NOT EXISTS dim_product_categories (
			id INTEGER PRIMARY KEY,
			raw_name TEXT NOT NULL,
			normalized_name TEXT NOT NULL,
			parent_category_id INTEGER REFERENCES dim_product_categories(id),
			updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)
	`;

	console.log(
		"Adding dim_stores.company_id (nullable, additive — no existing row changed)...",
	);
	await sql`ALTER TABLE dim_stores ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES dim_companies(id)`;

	console.log(
		"Adding dim_products.category_id (nullable, additive — dim_products.category text column untouched)...",
	);
	await sql`ALTER TABLE dim_products ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES dim_product_categories(id)`;

	console.log(
		"✅ Phase 3 dimension tables created. fact_inventory.location_id FK intentionally NOT added — run validate-inventory-locations.ts next.",
	);
}

migrate().catch((err) => {
	console.error("Migration failed:", err);
	process.exit(1);
});
