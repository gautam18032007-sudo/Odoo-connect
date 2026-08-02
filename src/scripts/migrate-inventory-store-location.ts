import path from "node:path";
import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

/**
 * Inventory dashboard bug fix migration:
 * - dim_stores.location_id: resolves the pos.config -> stock.location ID space
 *   mismatch that made getStoreInventoryBreakdown() always join to zero rows.
 * - dim_products.is_storable: verified discriminator for excluding Odoo POS
 *   pseudo-products (Discount, Deposit, etc.) from reorder recommendations —
 *   `type` alone is insufficient since "Discount" shares type:'consu' with
 *   real stock items. Defaults to true so existing rows aren't wrongly
 *   excluded before the next sync backfills the real value.
 */
async function migrate() {
	if (!process.env.DATABASE_URL) {
		console.error("Missing DATABASE_URL in environment.");
		process.exit(1);
	}

	console.log("Connecting to database...");
	const sql = neon(process.env.DATABASE_URL);

	console.log("Adding dim_stores.location_id...");
	await sql`ALTER TABLE dim_stores ADD COLUMN IF NOT EXISTS location_id INTEGER`;

	console.log("Adding dim_products.is_storable...");
	await sql`ALTER TABLE dim_products ADD COLUMN IF NOT EXISTS is_storable BOOLEAN DEFAULT true`;

	console.log(
		"✅ Inventory dashboard schema migration completed successfully.",
	);
}

migrate().catch((err) => {
	console.error("Migration failed:", err);
	process.exit(1);
});
