import * as path from "node:path";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

async function main() {
	console.log(
		"🧹 Clearing Odoo Canonical Tables to test baseline regression...",
	);

	if (!process.env.DATABASE_URL) {
		console.error("❌ DATABASE_URL is not set.");
		process.exit(1);
	}

	const { sql } = await import("../lib/db");

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
