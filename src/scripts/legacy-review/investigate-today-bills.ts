import * as fs from "node:fs";
import * as path from "node:path";

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

	console.log("=== ODOO SAAS BILLS TODAY ===");
	const client = new OdooClient();
	await client.authenticate();

	const odooTodayPos = await client.callKw<any[]>(
		"pos.order",
		"search_read",
		[],
		{
			domain: [
				["state", "in", ["paid", "done", "invoiced"]],
				["date_order", ">=", "2026-08-01 00:00:00"],
				["date_order", "<=", "2026-08-01 23:59:59"],
			],
			fields: [
				"id",
				"name",
				"date_order",
				"amount_total",
				"state",
				"config_id",
			],
			order: "date_order desc",
		},
	);

	console.log("Live Odoo POS Orders today (01 Aug 2026 IST):");
	console.table(odooTodayPos);

	const odooTodaySo = await client.callKw<any[]>(
		"sale.order",
		"search_read",
		[],
		{
			domain: [
				["state", "in", ["sale", "done"]],
				["date_order", ">=", "2026-08-01 00:00:00"],
				["date_order", "<=", "2026-08-01 23:59:59"],
			],
			fields: ["id", "name", "date_order", "amount_total", "state"],
			order: "date_order desc",
		},
	);

	console.log("\nLive Odoo Sale Orders today (01 Aug 2026 IST):");
	console.table(odooTodaySo);

	console.log("\n=== NEON DB FACT_SALES_ORDERS TOP 5 LATEST ===");
	const top5Db = await sql`
		SELECT id, name, date_order::text as date_order_raw, (date_order AT TIME ZONE 'Asia/Kolkata')::text as ist_date_order, amount_total, state
		FROM fact_sales_orders
		ORDER BY date_order DESC
		LIMIT 5
	`;
	console.table(top5Db);

	console.log("\n=== SALES_FACT_V TODAY ===");
	const viewToday = await sql`
		SELECT bill_no, sale_date, gross_amount, net_amount, billed_by
		FROM sales_fact_v
		WHERE sale_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date
	`;
	console.table(viewToday);
}

main().catch(console.error);
