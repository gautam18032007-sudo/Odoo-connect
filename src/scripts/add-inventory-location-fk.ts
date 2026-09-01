import path from "node:path";
import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

/**
 * Phase 3, gated step: adds the fact_inventory.location_id → dim_locations.id
 * FK. Per approval, this must ONLY be run after
 * validate-inventory-locations.ts reports zero orphans. This script
 * re-checks that condition itself before altering anything, so it is safe
 * even if run out of order.
 */
async function main() {
	if (!process.env.DATABASE_URL) {
		console.error("Missing DATABASE_URL in environment.");
		process.exit(1);
	}
	const sql = neon(process.env.DATABASE_URL);

	const orphans = await sql`
		SELECT DISTINCT fi.location_id, fi.location_name
		FROM fact_inventory fi
		LEFT JOIN dim_locations dl ON dl.id = fi.location_id
		WHERE dl.id IS NULL
	`;
	if (orphans.length > 0) {
		console.error(
			`❌ Refusing to add FK: ${orphans.length} orphan location(s) still present:`,
			JSON.stringify(orphans),
		);
		process.exit(1);
	}

	console.log("Zero orphans confirmed. Adding FK...");
	await sql`
		ALTER TABLE fact_inventory
		ADD CONSTRAINT fact_inventory_location_id_fkey
		FOREIGN KEY (location_id) REFERENCES dim_locations(id)
	`;
	console.log("✅ fact_inventory.location_id FK added.");
}

main().catch((err) => {
	console.error("❌ FK add failed:", err.message || err);
	process.exit(1);
});
