import path from "node:path";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

/**
 * Phase 3 §12 step 6: one-off, idempotent backfill of dim_stores.company_id,
 * .code, and .location_id from the now-populated dim_pos_configs +
 * dim_locations tables. Does not touch syncSales.ts's live sync code path —
 * that remains Phase 4/7 work per the approved order ("no production sync
 * behavior changes until the dimensions themselves are validated").
 */
async function main() {
	if (!process.env.DATABASE_URL) {
		console.error("Missing DATABASE_URL in environment.");
		process.exit(1);
	}
	const { backfillStoreSourceFields, backfillProductCategoryIds } =
		await import("../lib/repositories/odoo-dimensions.repository");
	const { sql } = await import("../lib/db");

	console.log("Before:");
	console.log(
		JSON.stringify(
			await sql`SELECT id, name, code, location_id, company_id FROM dim_stores ORDER BY id`,
			null,
			2,
		),
	);

	const updated = await backfillStoreSourceFields();
	console.log("\nBackfilled dim_stores rows:");
	console.log(JSON.stringify(updated, null, 2));

	await backfillProductCategoryIds();
	const catBackfillCount =
		await sql`SELECT COUNT(*) FROM dim_products WHERE category_id IS NOT NULL`;
	console.log(
		`\ndim_products.category_id populated on ${catBackfillCount[0].count} rows.`,
	);

	console.log("\nAfter:");
	console.log(
		JSON.stringify(
			await sql`SELECT id, name, code, location_id, company_id FROM dim_stores ORDER BY id`,
			null,
			2,
		),
	);
}

main().catch((err) => {
	console.error("❌ Backfill failed:", err.message || err);
	process.exit(1);
});
