import * as fs from "fs";
import * as path from "path";

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
	const { sql } = await import("../lib/db");
	const { OdooClient } = await import("../lib/odoo/client");

	console.log("=== FINDING THE 5 REMAINING MISSING BILLS FOR 31 JUL 2026 IST ===");

	const client = new OdooClient();
	if (client.getMockModeStatus()) return;
	await client.authenticate();

	const istStartUtc = "2026-07-30 18:30:00";
	const istEndUtc = "2026-07-31 18:29:59";

	// 1. Fetch all 161 orders from Odoo for 31 Jul IST
	const odooOrders = await client.callKw<any[]>("pos.order", "search_read", [], {
		domain: [
			["state", "in", ["paid", "done", "invoiced"]],
			["date_order", ">=", istStartUtc],
			["date_order", "<=", istEndUtc],
		],
		fields: ["id", "name", "date_order", "amount_total", "lines"],
	});
	console.log(`Odoo orders count: ${odooOrders.length}`);

	// 2. Fetch all bills in sales_fact_v for 31 Jul IST
	const viewBills = await sql`
		SELECT DISTINCT bill_no
		FROM sales_fact_v
		WHERE sale_date = '2026-07-31'::date
	`;
	const viewBillNames = new Set(viewBills.map((b) => b.bill_no));

	// 3. Find the missing orders in Odoo that are not in sales_fact_v
	const missingFromView = odooOrders.filter((o) => !viewBillNames.has(o.name));
	console.log(`\nMissing Orders (${missingFromView.length}):`);
	console.table(missingFromView.map((o) => ({ id: o.id, name: o.name, date_order: o.date_order, amount: o.amount_total, linesCount: o.lines?.length })));

	// 4. For each missing order, check if it exists in fact_sales_orders and why its lines/view entry are missing
	for (const o of missingFromView) {
		const orderInDb = await sql`
			SELECT id, name, date_order::text, (date_order AT TIME ZONE 'Asia/Kolkata')::date as ist_date
			FROM fact_sales_orders WHERE id = ${`pos_${o.id}`} OR name = ${o.name}
		`;
		console.log(`\nChecking DB for ${o.name} (pos_${o.id}):`, orderInDb);

		const linesInDb = await sql`
			SELECT fl.id, fl.product_id, dp.name as product_name
			FROM fact_sales_lines fl
			LEFT JOIN dim_products dp ON fl.product_id = dp.id
			WHERE fl.order_id = ${`pos_${o.id}`}
		`;
		console.log(`Lines in fact_sales_lines for pos_${o.id}:`, linesInDb);
	}
}

main().catch(console.error);
