import * as path from "node:path";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

async function main() {
	console.log("🔍 Checking Canonical PostgreSQL Sync Tables...");

	if (!process.env.DATABASE_URL) {
		console.error("❌ DATABASE_URL is not set.");
		process.exit(1);
	}

	const { sql } = await import("../lib/db");

	try {
		// 1. Check stores
		const storesRes = await sql`SELECT COUNT(*)::int as count FROM dim_stores`;
		console.log(`- dim_stores: ${storesRes[0]?.count || 0} records.`);

		// 2. Check products
		const productsRes =
			await sql`SELECT COUNT(*)::int as count FROM dim_products`;
		console.log(`- dim_products: ${productsRes[0]?.count || 0} records.`);

		// 3. Check customers
		const customersRes =
			await sql`SELECT COUNT(*)::int as count FROM dim_customers`;
		console.log(`- dim_customers: ${customersRes[0]?.count || 0} records.`);

		// 4. Check sales orders
		const ordersRes =
			await sql`SELECT COUNT(*)::int as count FROM fact_sales_orders`;
		console.log(`- fact_sales_orders: ${ordersRes[0]?.count || 0} records.`);

		// 5. Check sales lines
		const linesRes =
			await sql`SELECT COUNT(*)::int as count FROM fact_sales_lines`;
		console.log(`- fact_sales_lines: ${linesRes[0]?.count || 0} records.`);

		// 6. Check inventory
		const inventoryRes =
			await sql`SELECT COUNT(*)::int as count FROM fact_inventory`;
		console.log(`- fact_inventory: ${inventoryRes[0]?.count || 0} records.`);

		// 7. Check telemetry logs
		const telemetryRes = await sql`
			SELECT sync_type, status, records_processed, started_at::text, completed_at::text
			FROM sync_telemetry
			ORDER BY started_at DESC
			LIMIT 5
		`;
		console.log("\n📋 Recent Sync Telemetry Logs:");
		console.table(telemetryRes);
	} catch (err: any) {
		console.error("❌ Error reading db records:", err.message || err);
		process.exit(1);
	}
}

main();
