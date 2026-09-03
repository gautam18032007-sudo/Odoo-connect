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
	const { syncProducts } = await import("../../lib/odoo/sync/syncProducts");
	const { syncSales } = await import("../../lib/odoo/sync/syncSales");

	console.log("\n=======================================================");
	console.log("=== EXECUTING FULL SYNC TEST FOR ODOO ↔ DB ===");
	console.log("=======================================================\n");

	const client = new OdooClient();
	if (client.getMockModeStatus()) {
		console.log("Running in mock mode. Exiting.");
		return;
	}

	await client.authenticate();

	console.log("1. Running full product sync (lastSync = null)...");
	const productsSynced = await syncProducts(client, null);
	console.log(`- Products synced: ${productsSynced}`);

	console.log("\n2. Running full sales sync (lastSync = null)...");
	const salesSynced = await syncSales(client, null);
	console.log(`- Sales orders synced: ${salesSynced}`);

	console.log("\n3. Re-auditing 31 Jul 2026 data after full sync:");
	const view31Jul = await sql`
		SELECT 
			COUNT(*)::int as line_count,
			COUNT(DISTINCT bill_no)::int as bill_cuts,
			SUM(gross_amount)::numeric(12,2) as collection,
			SUM(net_amount)::numeric(12,2) as net_revenue,
			SUM(discount_amount)::numeric(12,2) as discount,
			SUM(tax_amount)::numeric(12,2) as gst
		FROM sales_fact_v
		WHERE sale_date = '2026-07-31'::date
	`;
	console.table(view31Jul);

	console.log("\n=======================================================\n");
}

main().catch(console.error);
