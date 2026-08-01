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
	const { sql } = await import("../lib/db");

	console.log(
		"=== DATATYPE AND CAST TEST FOR FACT_SALES_ORDERS.DATE_ORDER ===",
	);

	const schemaRes = await sql`
		SELECT column_name, data_type 
		FROM information_schema.columns 
		WHERE table_name = 'fact_sales_orders' AND column_name = 'date_order'
	`;
	console.log("fact_sales_orders.date_order data_type:", schemaRes[0]);

	const sampleOrders = await sql`
		SELECT 
			id,
			name,
			date_order::text as date_order_text,
			date_order::date as raw_date_cast,
			(date_order AT TIME ZONE 'Asia/Kolkata')::date as ist_date_cast
		FROM fact_sales_orders
		WHERE date_order >= '2026-07-30 18:30:00' AND date_order <= '2026-07-31 18:29:59'
		LIMIT 10
	`;
	console.table(sampleOrders);
}

main().catch(console.error);
