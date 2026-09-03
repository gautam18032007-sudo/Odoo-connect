import * as path from "node:path";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

/**
 * DESTRUCTIVE — TRUNCATEs 7 core Odoo-canonical tables with CASCADE
 * (fact_sales_lines, fact_sales_orders, dim_customers, dim_products,
 * dim_stores, fact_inventory, sync_telemetry). Intended only for wiping a
 * throwaway/test database before a from-scratch resync test.
 *
 * Safety guard added (DEFECT-107, Phase 2 remediation): this script
 * previously ran unconditionally the moment it was invoked, against
 * whatever DATABASE_URL happened to be configured — no confirmation, no
 * visibility into which database was about to be wiped. It now refuses to
 * run unless both gates below are satisfied, and always prints the exact
 * target host first so the operator cannot miss what they're about to
 * truncate.
 *
 * Usage: npx tsx src/scripts/clear-odoo-tables.ts --confirm
 */
async function main() {
	if (!process.env.DATABASE_URL) {
		console.error("❌ DATABASE_URL is not set.");
		process.exit(1);
	}

	const host =
		process.env.DATABASE_URL.match(/@([^/]+)\//)?.[1] ?? "(unknown host)";
	console.log(`⚠️  This will TRUNCATE ... CASCADE 7 core tables on: ${host}`);
	console.log(
		"⚠️  fact_sales_lines, fact_sales_orders, dim_customers, dim_products, dim_stores, fact_inventory, sync_telemetry",
	);

	if (!process.argv.includes("--confirm")) {
		console.error(
			"\n❌ Refusing to run without explicit confirmation. Re-run with --confirm if you are certain this is the intended database.",
		);
		process.exit(1);
	}

	console.log("\n🧹 Confirmed — clearing Odoo canonical tables...");

	const { sql } = await import("../../lib/db");

	try {
		await sql`TRUNCATE fact_sales_lines CASCADE`;
		await sql`TRUNCATE fact_sales_orders CASCADE`;
		await sql`TRUNCATE dim_customers CASCADE`;
		await sql`TRUNCATE dim_products CASCADE`;
		await sql`TRUNCATE dim_stores CASCADE`;
		await sql`TRUNCATE fact_inventory CASCADE`;
		await sql`TRUNCATE sync_telemetry CASCADE`;
		console.log("✅ Odoo Canonical Tables cleared successfully!");
	} catch (err: any) {
		console.error("❌ Failed to truncate tables:", err.message || err);
		process.exit(1);
	}
}

main();
