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

	console.log("=== CHECKING DISTINCT IST DATES IN FACT_SALES_ORDERS ===");

	const dateGroup = await sql`
		SELECT 
			(date_order AT TIME ZONE 'Asia/Kolkata')::date::text as ist_date_str,
			COUNT(*)::int as order_count,
			SUM(amount_total)::numeric(12,2) as total_gross
		FROM fact_sales_orders
		WHERE state IN ('paid', 'done', 'invoiced')
		  AND date_order >= '2026-07-29 00:00:00+00'
		GROUP BY 1
		ORDER BY 1 DESC
	`;

	console.table(dateGroup);
}

main().catch(console.error);
