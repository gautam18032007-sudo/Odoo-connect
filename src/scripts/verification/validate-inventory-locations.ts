import path from "node:path";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

/**
 * Phase 3 hard gate (per approval): every distinct fact_inventory.location_id
 * must resolve to a row in dim_locations BEFORE the FK is added. This script
 * only reads and reports — it does not add the FK. If it reports any
 * orphans, STOP: do not run add-inventory-location-fk.ts.
 */
async function main() {
	if (!process.env.DATABASE_URL) {
		console.error("Missing DATABASE_URL in environment.");
		process.exit(1);
	}
	const { sql } = await import("../../lib/db");

	const distinctLocations = await sql`
		SELECT fi.location_id, fi.location_name, COUNT(*) AS quant_rows
		FROM fact_inventory fi
		GROUP BY fi.location_id, fi.location_name
		ORDER BY fi.location_id
	`;
	console.log("Distinct fact_inventory.location_id values:");
	console.log(JSON.stringify(distinctLocations, null, 2));

	const orphans = await sql`
		SELECT DISTINCT fi.location_id, fi.location_name
		FROM fact_inventory fi
		LEFT JOIN dim_locations dl ON dl.id = fi.location_id
		WHERE dl.id IS NULL
	`;

	if (orphans.length > 0) {
		console.log(
			`\n❌ STOP: ${orphans.length} location(s) in fact_inventory have no matching dim_locations row:`,
		);
		console.log(JSON.stringify(orphans, null, 2));
		console.log(
			"\nDo NOT run add-inventory-location-fk.ts until these are resolved (either they need syncing into dim_locations, or they are a data-quality issue to investigate).",
		);
		process.exit(1);
	}

	console.log(
		"\n✅ Zero orphans. Every fact_inventory.location_id resolves to a dim_locations row. Safe to add the FK.",
	);
}

main().catch((err) => {
	console.error("❌ Validation failed:", err.message || err);
	process.exit(1);
});
