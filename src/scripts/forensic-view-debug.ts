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

	console.log("\n=======================================================");
	console.log("=== FORENSIC VIEW DEBUG (31 JUL 2026 IST) ===");
	console.log("=======================================================\n");

	const istStartUtc = "2026-07-30 18:30:00";
	const istEndUtc = "2026-07-31 18:29:59";

	// 1. All raw orders in fact_sales_orders for 31 Jul 2026 IST
	const rawOrders = await sql`
		SELECT id, name, date_order::text, (date_order AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date as ist_date, amount_total
		FROM fact_sales_orders
		WHERE date_order >= ${istStartUtc}::timestamp
		  AND date_order <= ${istEndUtc}::timestamp
		  AND state IN ('paid', 'done', 'invoiced')
		ORDER BY date_order
	`;
	console.log(
		`1. Raw Orders in fact_sales_orders for IST window (${istStartUtc} to ${istEndUtc}): Count = ${rawOrders.length}`,
	);

	// 2. Orders present in sales_fact_v for sale_date = '2026-07-31'
	const viewBills = await sql`
		SELECT DISTINCT bill_no
		FROM sales_fact_v
		WHERE sale_date = '2026-07-31'::date
	`;
	const viewBillNames = new Set(viewBills.map((b) => b.bill_no));
	console.log(
		`2. Distinct bill_no in sales_fact_v for sale_date = '2026-07-31': Count = ${viewBills.length}`,
	);

	// 3. Find raw orders NOT in sales_fact_v
	const missingFromView = rawOrders.filter((o) => !viewBillNames.has(o.name));
	console.log(
		`3. Orders in fact_sales_orders BUT MISSING from sales_fact_v (Count = ${missingFromView.length}):`,
	);
	console.table(missingFromView.slice(0, 15));

	// 4. Test why sample missing order is excluded from sales_fact_v
	if (missingFromView.length > 0) {
		const sample = missingFromView[0];
		console.log(
			`\n4. Investigating sample missing order: ID=${sample.id}, Name=${sample.name}`,
		);

		const linesInPg = await sql`
			SELECT fl.id, fl.order_id, fl.product_id, dp.id as dim_product_id, dp.name as product_name
			FROM fact_sales_lines fl
			LEFT JOIN dim_products dp ON fl.product_id = dp.id
			WHERE fl.order_id = ${sample.id}
		`;
		console.log(
			`Lines in fact_sales_lines for order ${sample.id}: Count = ${linesInPg.length}`,
		);
		console.table(linesInPg);

		const viewMatch = await sql`
			SELECT * FROM sales_fact_v WHERE bill_no = ${sample.name}
		`;
		console.log(
			`Rows in sales_fact_v for bill_no ${sample.name}: Count = ${viewMatch.length}`,
		);
		if (viewMatch.length > 0) {
			console.log("View row sale_date:", viewMatch[0].sale_date);
		}
	}

	console.log("\n=======================================================\n");
}

main().catch(console.error);
