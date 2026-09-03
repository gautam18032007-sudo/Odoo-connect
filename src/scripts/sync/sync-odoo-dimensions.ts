import path from "node:path";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

/**
 * One-off, re-runnable (idempotent) Phase 3 runner: populates the 5
 * canonical dimension tables from live Odoo. Does not touch fact_inventory,
 * dim_stores, or dim_products — those are separate, later steps (backfill
 * scripts), gated on this succeeding first per the approved Phase 3 order.
 */
async function main() {
	if (!process.env.DATABASE_URL) {
		console.error("Missing DATABASE_URL in environment.");
		process.exit(1);
	}

	const { OdooClient } = await import("../../lib/odoo/client");
	const { syncAllDimensions } = await import(
		"../../lib/odoo/sync/syncDimensions"
	);

	const client = new OdooClient();
	const result = await syncAllDimensions(client);

	console.log("✅ Phase 3 dimension sync complete:");
	console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
	console.error("❌ Dimension sync failed:", err.message || err);
	process.exit(1);
});
