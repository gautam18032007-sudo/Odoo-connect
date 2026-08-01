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
	const { sql } = await import("../lib/db");

	console.log("\n=======================================================");
	console.log("=== CHECKING 01 AUG 2026 IST ORDERS IN FACT_SALES_ORDERS ===");
	console.log("=======================================================\n");

	const resIstDate = await sql`
		SELECT 
			COUNT(*)::int as bill_cuts,
			SUM(amount_total)::numeric(12,2) as gross_amount,
			SUM(amount_untaxed)::numeric(12,2) as net_amount
		FROM fact_sales_orders
		WHERE (date_order AT TIME ZONE 'Asia/Kolkata')::date = '2026-08-01'::date
		  AND state IN ('paid', 'done', 'invoiced')
	`;
	console.log(
		"Orders queried by (date_order AT TIME ZONE 'Asia/Kolkata')::date = '2026-08-01':",
	);
	console.table(resIstDate);

	const resView = await sql`
		SELECT 
			COUNT(DISTINCT bill_no)::int as bill_cuts,
			SUM(gross_amount)::numeric(12,2) as collection,
			SUM(net_amount)::numeric(12,2) as net_revenue,
			SUM(quantity)::int as units
		FROM sales_fact_v
		WHERE sale_date = '2026-08-01'::date
	`;
	console.log("\nOrders in sales_fact_v for sale_date = '2026-08-01':");
	console.table(resView);
}

main().catch(console.error);
