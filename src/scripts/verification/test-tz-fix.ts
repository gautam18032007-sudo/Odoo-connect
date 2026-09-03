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

	console.log("=== TESTING TIMEZONE EXPRESSION ON TIMESTAMPTZ COLUMN ===");

	const res = await sql`
		SELECT 
			id,
			name,
			date_order::text as raw_timestamptz,
			(date_order AT TIME ZONE 'Asia/Kolkata')::date as correct_ist_date,
			(date_order AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date as double_shifted_date
		FROM fact_sales_orders
		WHERE date_order >= '2026-07-30 18:30:00' AND date_order <= '2026-07-31 18:29:59'
		LIMIT 10
	`;
	console.table(res);

	const countCorrect = await sql`
		SELECT COUNT(*)::int as count, COUNT(DISTINCT name)::int as distinct_bills, SUM(amount_total)::numeric(12,2) as gross
		FROM fact_sales_orders
		WHERE (date_order AT TIME ZONE 'Asia/Kolkata')::date = '2026-07-31'::date
		  AND state IN ('paid', 'done', 'invoiced')
	`;
	console.log(
		"\nCounts using (date_order AT TIME ZONE 'Asia/Kolkata')::date = '2026-07-31':",
	);
	console.table(countCorrect);

	const countDoubleShift = await sql`
		SELECT COUNT(*)::int as count, COUNT(DISTINCT name)::int as distinct_bills, SUM(amount_total)::numeric(12,2) as gross
		FROM fact_sales_orders
		WHERE (date_order AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date = '2026-07-31'::date
		  AND state IN ('paid', 'done', 'invoiced')
	`;
	console.log(
		"\nCounts using (date_order AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date = '2026-07-31':",
	);
	console.table(countDoubleShift);
}

main().catch(console.error);
