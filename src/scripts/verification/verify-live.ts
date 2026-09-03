import path from "node:path";
import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

async function main() {
	console.log("==================================================");
	console.log("⚡ ZenZebra Phase 3 Enterprise Live Verification");
	console.log("==================================================");

	if (!process.env.DATABASE_URL) {
		console.error("❌ FAIL: DATABASE_URL environment variable is missing.");
		process.exit(1);
	}

	const sql = neon(process.env.DATABASE_URL);
	let passedCount = 0;
	let failedCount = 0;

	function report(name: string, ok: boolean, details?: string) {
		if (ok) {
			console.log(`✅ PASS  ${name}${details ? ` — ${details}` : ""}`);
			passedCount++;
		} else {
			console.log(`❌ FAIL  ${name}${details ? ` — ${details}` : ""}`);
			failedCount++;
		}
	}

	// 1. Database Health Check
	try {
		const [dbRow] =
			await sql`SELECT current_database() AS db, version() AS ver`;
		report(
			"Database Health & Connectivity",
			Boolean(dbRow?.db),
			`Database: ${dbRow?.db}`,
		);
	} catch (err: any) {
		report("Database Health & Connectivity", false, err.message);
	}

	// 2. Canonical Tables Check
	try {
		const tables = await sql`
			SELECT table_name 
			FROM information_schema.tables 
			WHERE table_schema = 'public' 
			  AND table_name IN ('dim_products', 'dim_customers', 'dim_stores', 'fact_sales_orders', 'fact_sales_lines', 'fact_inventory', 'sync_telemetry')
		`;
		report(
			"Canonical PostgreSQL Tables",
			tables.length >= 7,
			`${tables.length}/7 canonical tables present`,
		);
	} catch (err: any) {
		report("Canonical PostgreSQL Tables", false, err.message);
	}

	// 3. Views Check
	try {
		const views = await sql`
			SELECT table_name 
			FROM information_schema.views 
			WHERE table_schema = 'public' AND table_name = 'sales_fact_v'
		`;
		report(
			"sales_fact_v Compatibility View",
			views.length === 1,
			"sales_fact_v present",
		);
	} catch (err: any) {
		report("sales_fact_v Compatibility View", false, err.message);
	}

	// 4. Financial Equations Check
	try {
		const [odooSalesAgg] = await sql`
			SELECT 
				COALESCE(SUM(mrp_amount), 0) AS total_mrp,
				COALESCE(SUM(discount_amount), 0) AS total_discount,
				COALESCE(SUM(gross_amount), 0) AS total_collection,
				COALESCE(SUM(tax_amount), 0) AS total_gst,
				COALESCE(SUM(net_amount), 0) AS total_revenue
			FROM sales_fact_v
			WHERE upload_id = 999999
		`;

		const mrp = Number(odooSalesAgg.total_mrp || 0);
		const discount = Number(odooSalesAgg.total_discount || 0);
		const collection = Number(odooSalesAgg.total_collection || 0);
		const gst = Number(odooSalesAgg.total_gst || 0);
		const revenue = Number(odooSalesAgg.total_revenue || 0);

		const eq1Diff = Math.abs(mrp - discount - collection);
		const eq2Diff = Math.abs(collection - gst - revenue);

		report(
			"Financial Equation 1 (Odoo Sync: MRP - Discount = Collection)",
			eq1Diff < 0.05,
			`MRP ₹${mrp.toFixed(2)} - Discount ₹${discount.toFixed(2)} = Collection ₹${collection.toFixed(2)} (diff: ₹${eq1Diff.toFixed(2)})`,
		);

		report(
			"Financial Equation 2 (Collection - GST = Revenue)",
			eq2Diff < 0.05,
			`Collection ₹${collection.toFixed(2)} - GST ₹${gst.toFixed(2)} = Revenue ₹${revenue.toFixed(2)} (diff: ₹${eq2Diff.toFixed(2)})`,
		);
	} catch (err: any) {
		report("Financial Equations Verification", false, err.message);
	}

	// 5. Telemetry & Worker Health Check
	try {
		const [latestTelemetry] = await sql`
			SELECT completed_at::text, status, records_processed
			FROM sync_telemetry
			ORDER BY id DESC
			LIMIT 1
		`;
		report(
			"Sync Telemetry Logging",
			Boolean(latestTelemetry),
			`Last telemetry record: ${latestTelemetry?.completed_at || "N/A"} (${latestTelemetry?.records_processed || 0} recs)`,
		);
	} catch (err: any) {
		report("Sync Telemetry Logging", false, err.message);
	}

	console.log("==================================================");
	console.log(`📊 Summary: ${passedCount} PASSED, ${failedCount} FAILED`);
	console.log("==================================================");

	if (failedCount > 0) {
		process.exit(1);
	}
}

main().catch((err) => {
	console.error("❌ Fatal error in live verification:", err);
	process.exit(1);
});
