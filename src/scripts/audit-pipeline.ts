import * as fs from "node:fs";
import * as path from "node:path";

// Manually load .env.local
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
	console.log("=== ENTERPRISE PIPELINE AUDIT (31 JUL 2026) ===");
	console.log("=======================================================\n");

	// 1. Check fact_sales_orders count & sum for 2026-07-31
	const orders31Jul = await sql`
		SELECT 
			COUNT(*)::int as order_count,
			COUNT(DISTINCT name)::int as distinct_bills,
			SUM(amount_total)::numeric(12,2) as total_sales,
			SUM(amount_untaxed)::numeric(12,2) as net_sales,
			order_type,
			state
		FROM fact_sales_orders
		WHERE date_order::date = '2026-07-31'::date
		GROUP BY order_type, state
	`;
	console.log(
		"1. fact_sales_orders grouped by (order_type, state) for 31 Jul 2026:",
	);
	console.table(orders31Jul);

	// 2. Check total fact_sales_orders overall for 2026-07-31
	const totalOrders31Jul = await sql`
		SELECT 
			COUNT(*)::int as total_orders,
			COUNT(DISTINCT name)::int as distinct_bills,
			SUM(amount_total)::numeric(12,2) as total_sales,
			SUM(amount_untaxed)::numeric(12,2) as net_sales
		FROM fact_sales_orders
		WHERE date_order::date = '2026-07-31'::date
	`;
	console.log("\n2. fact_sales_orders Overall for 31 Jul 2026:");
	console.table(totalOrders31Jul);

	// 3. Check fact_sales_lines linked to orders of 2026-07-31
	const lines31Jul = await sql`
		SELECT 
			COUNT(*)::int as line_count,
			COUNT(DISTINCT order_id)::int as orders_with_lines,
			SUM(qty)::int as total_units,
			SUM(price_subtotal)::numeric(12,2) as net_subtotal,
			SUM(tax_amount)::numeric(12,2) as tax_amount
		FROM fact_sales_lines fl
		JOIN fact_sales_orders fo ON fl.order_id = fo.id
		WHERE fo.date_order::date = '2026-07-31'::date
	`;
	console.log("\n3. fact_sales_lines linked to 31 Jul 2026 orders:");
	console.table(lines31Jul);

	// 4. Check sales_fact (Excel upload table) for 2026-07-31
	const excel31Jul = await sql`
		SELECT 
			COUNT(*)::int as line_count,
			COUNT(DISTINCT bill_no)::int as bill_cuts,
			SUM(gross_amount)::numeric(12,2) as gross,
			SUM(net_amount)::numeric(12,2) as net
		FROM sales_fact
		WHERE sale_date = '2026-07-31'::date
	`;
	console.log("\n4. sales_fact (Excel upload table) for 31 Jul 2026:");
	console.table(excel31Jul);

	// 5. Check sales_fact_v (View) for 2026-07-31
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
	console.log("\n5. sales_fact_v (View used by Dashboard) for 31 Jul 2026:");
	console.table(view31Jul);

	// 6. Orders in fact_sales_orders for 31 Jul 2026 that have NO lines in fact_sales_lines
	const ordersWithoutLines = await sql`
		SELECT 
			COUNT(*)::int as orders_without_lines,
			SUM(amount_total)::numeric(12,2) as missing_amount_total,
			SUM(amount_untaxed)::numeric(12,2) as missing_amount_untaxed
		FROM fact_sales_orders fo
		LEFT JOIN fact_sales_lines fl ON fo.id = fl.order_id
		WHERE fo.date_order::date = '2026-07-31'::date
		  AND fl.id IS NULL
	`;
	console.log(
		"\n6. fact_sales_orders for 31 Jul 2026 WITHOUT lines in fact_sales_lines:",
	);
	console.table(ordersWithoutLines);

	// 7. Timezone analysis: date_order in UTC vs Asia/Kolkata
	const tzDistribution = await sql`
		SELECT 
			(date_order AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date as kolkata_date,
			COUNT(*)::int as order_count,
			SUM(amount_total)::numeric(12,2) as total_sales,
			SUM(amount_untaxed)::numeric(12,2) as net_sales
		FROM fact_sales_orders
		WHERE date_order >= '2026-07-30' AND date_order <= '2026-08-01'
		GROUP BY kolkata_date
		ORDER BY kolkata_date
	`;
	console.log("\n7. Orders distribution by Asia/Kolkata local date:");
	console.table(tzDistribution);

	console.log("\n=======================================================\n");
}

main().catch(console.error);
