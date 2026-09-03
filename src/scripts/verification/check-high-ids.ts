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

	console.log("=== CHECKING SPECIFIC RECENT POS IDS IN FACT_SALES_ORDERS ===");

	const rows = await sql`
		SELECT 
			id,
			name,
			date_order::text as date_order_raw,
			(date_order AT TIME ZONE 'Asia/Kolkata')::text as ist_timestamp,
			(date_order AT TIME ZONE 'Asia/Kolkata')::date as ist_date,
			amount_total,
			state
		FROM fact_sales_orders
		WHERE id IN ('pos_1618', 'pos_1617', 'pos_1616', 'pos_1615', 'pos_1614', 'pos_1613', 'pos_1612', 'pos_1611', 'pos_1610')
	`;

	console.table(rows);
}

main().catch(console.error);
