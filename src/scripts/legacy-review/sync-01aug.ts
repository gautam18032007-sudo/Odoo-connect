import * as fs from "node:fs";
import * as path from "node:path";

// Load .env.local
const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
	const envConfig = fs.readFileSync(envPath, "utf8");
	for (const line of envConfig.split("\n")) {
		const trimmed = line.trim();
		if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
			const [key, ...valueParts] = trimmed.split("=");
			const value = valueParts.join("=").replace(/^["']|["']$/g, "");
			if (key && !process.env[key.trim()]) {
				process.env[key.trim()] = value;
			}
		}
	}
}

async function main() {
	const { sql } = await import("../../lib/db");
	const { OdooClient } = await import("../../lib/odoo/client");
	const { syncSales } = await import("../../lib/odoo/sync/syncSales");

	console.log("\n=======================================================");
	console.log("=== TARGETED SYNC SWEEP FOR 01 AUG 2026 IST ===");
	console.log("=======================================================\n");

	const client = new OdooClient();
	if (client.getMockModeStatus()) return;
	await client.authenticate();

	// Explicitly sync sales with lastSync = null to ensure 100% of orders are pulled
	const total = await syncSales(client, null);
	console.log(`Synced total orders: ${total}`);

	// Now check 01 Aug 2026 IST counts in DB
	const istStartUtc = "2026-07-31 18:30:00";
	const istEndUtc = "2026-08-01 18:29:59";

	const orders01Aug = await sql`
		SELECT 
			COUNT(*)::int as bill_cuts,
			SUM(amount_total)::numeric(12,2) as gross_amount,
			SUM(amount_untaxed)::numeric(12,2) as net_amount
		FROM fact_sales_orders
		WHERE date_order >= ${istStartUtc}::timestamp
		  AND date_order <= ${istEndUtc}::timestamp
		  AND state IN ('paid', 'done', 'invoiced')
	`;
	console.log("fact_sales_orders for 01 Aug 2026 IST:", orders01Aug[0]);

	const view01Aug = await sql`
		SELECT 
			COUNT(*)::int as line_count,
			COUNT(DISTINCT bill_no)::int as bill_cuts,
			SUM(gross_amount)::numeric(12,2) as collection,
			SUM(net_amount)::numeric(12,2) as net_revenue
		FROM sales_fact_v
		WHERE sale_date = '2026-08-01'::date
	`;
	console.log("sales_fact_v View for 01 Aug 2026 IST:", view01Aug[0]);

	console.log("\n=======================================================\n");
}

main().catch(console.error);
