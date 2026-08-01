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

	console.log("=== DUMPING LATEST 30 ORDERS FROM FACT_SALES_ORDERS ===");

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
		ORDER BY id DESC
		LIMIT 30
	`;

	console.table(rows);
}

main().catch(console.error);
