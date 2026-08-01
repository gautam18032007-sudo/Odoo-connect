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
		"=== TESTING VIEW SALE_DATE WITH AT TIME ZONE 'Asia/Kolkata' ===",
	);

	// First let's update sales_fact_v view to use (fo.date_order AT TIME ZONE 'Asia/Kolkata')::date
	await sql`
		CREATE OR REPLACE VIEW sales_fact_v AS
		-- Part A: Legacy Excel Upload Data
		SELECT
			id::text, upload_id, bill_no, sale_date,
			CASE
				WHEN billed_by IN ('Klj store', 'SmartworksNoida Noida') THEN billed_by
				ELSE 'Head office'
			END AS billed_by,
			product_key, sku_code, item_name,
			brand, category, quantity, mrp_amount,
			GREATEST(0.00, mrp_amount - gross_amount)::numeric(12,2) AS discount_amount,
			gross_amount, tax_amount, net_amount,
			customer_mobile, customer_name, payment_method,
			CASE
				WHEN billed_by = 'SmartworksNoida Noida' THEN 'Smart Works Noida'
				WHEN billed_by = 'Klj store' THEN 'KLJ'
				ELSE 'Head office'
			END AS store_display_name
		FROM sales_fact

		UNION ALL

		-- Part B: Verified Live Odoo Sync Data
		SELECT
			fl.id AS id,
			999999 AS upload_id, -- Reserved Odoo identifier
			fo.name AS bill_no,
			(fo.date_order AT TIME ZONE 'Asia/Kolkata')::date AS sale_date,
			CASE
				WHEN ds.code = 'KLJ' THEN 'Klj store'
				WHEN ds.code = 'SWN' THEN 'SmartworksNoida Noida'
				ELSE 'Head office'
			END AS billed_by,
			fl.id AS product_key,
			dp.default_code AS sku_code,
			dp.name AS item_name,
			'Odoo' AS brand,
			COALESCE(dp.category, 'Uncategorized') AS category,
			fl.qty::int AS quantity,
			(dp.list_price * fl.qty)::numeric(12,2) AS mrp_amount,
			((dp.list_price * fl.qty) - (fl.price_subtotal + COALESCE(fl.tax_amount, 0.00)))::numeric(12,2) AS discount_amount,
			(fl.price_subtotal + COALESCE(fl.tax_amount, 0.00))::numeric(12,2) AS gross_amount,
			COALESCE(fl.tax_amount, 0.00)::numeric(12,2) AS tax_amount,
			fl.price_subtotal AS net_amount,
			dc.mobile AS customer_mobile,
			dc.name AS customer_name,
			'Odoo POS' AS payment_method,
			CASE
				WHEN ds.code = 'KLJ' THEN 'KLJ'
				WHEN ds.code = 'SWN' THEN 'Smart Works Noida'
				ELSE 'Head office'
			END AS store_display_name
		FROM fact_sales_lines fl
		JOIN fact_sales_orders fo ON fl.order_id = fo.id
		JOIN dim_products dp ON fl.product_id = dp.id
		LEFT JOIN dim_customers dc ON fo.partner_id = dc.id
		LEFT JOIN dim_stores ds ON fo.store_id = ds.id;
	`;

	console.log(
		"View sales_fact_v updated with (fo.date_order AT TIME ZONE 'Asia/Kolkata')::date!",
	);

	// Query sales_fact_v for sale_date = '2026-07-31'
	const viewRes = await sql`
		SELECT 
			COUNT(*)::int as line_count,
			COUNT(DISTINCT bill_no)::int as bill_cuts,
			SUM(gross_amount)::numeric(12,2) as collection,
			SUM(net_amount)::numeric(12,2) as net_revenue,
			SUM(discount_amount)::numeric(12,2) as discount,
			SUM(tax_amount)::numeric(12,2) as gst,
			SUM(quantity)::int as units
		FROM sales_fact_v
		WHERE sale_date = '2026-07-31'::date
	`;

	console.log("\nsales_fact_v query results for 31 Jul 2026:");
	console.table(viewRes);
}

main().catch(console.error);
