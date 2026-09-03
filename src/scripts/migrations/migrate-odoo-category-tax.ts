import path from "node:path";
import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

/**
 * Phase 1 of the Odoo migration scoping: closes two of the placeholder gaps
 * in the canonical Odoo sync schema (category was hardcoded 'General', tax
 * was hardcoded 0.00 — see docs/odoo_migration_gap_assessment.md). Additive
 * only — does not touch sales_fact_v or any production read path.
 */
async function migrate() {
	if (!process.env.DATABASE_URL) {
		console.error("Missing DATABASE_URL in environment.");
		process.exit(1);
	}

	console.log("Connecting to database...");
	const sql = neon(process.env.DATABASE_URL);

	console.log("Adding dim_products.category...");
	await sql`ALTER TABLE dim_products ADD COLUMN IF NOT EXISTS category TEXT`;

	console.log("Adding fact_sales_lines.tax_amount...");
	await sql`ALTER TABLE fact_sales_lines ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(12, 2) DEFAULT 0.00`;

	console.log("✅ Odoo category/tax schema migration completed successfully.");
}

migrate().catch((err) => {
	console.error("Migration failed:", err);
	process.exit(1);
});
