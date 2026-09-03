import * as path from "node:path";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

async function main() {
	console.log("🚀 Starting Phase 4 Odoo Compatibility View Migration...");

	if (!process.env.DATABASE_URL) {
		console.error("❌ DATABASE_URL is not set.");
		process.exit(1);
	}

	const { sql } = await import("../../lib/db");

	try {
		console.log("Dropping existing sales_fact_v view...");
		await sql`DROP VIEW IF EXISTS sales_fact_v CASCADE`;

		console.log("Creating new Odoo compatibility view sales_fact_v...");
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
				discount_amount, gross_amount, tax_amount, net_amount,
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
				fo.date_order::date AS sale_date,
				CASE
					WHEN ds.code = 'KLJ' THEN 'Klj store'
					WHEN ds.code = 'SWN' THEN 'SmartworksNoida Noida'
					ELSE 'Head office'
				END AS billed_by,
				fl.id AS product_key,
				dp.default_code AS sku_code,
				dp.name AS item_name,
				'Odoo' AS brand,
				'General' AS category,
				fl.qty::int AS quantity,
				dp.list_price AS mrp_amount,
				((fl.price_unit * fl.qty) * (fl.discount / 100.0))::numeric(12,2) AS discount_amount,
				(fl.price_unit * fl.qty)::numeric(12,2) AS gross_amount,
				0.00::numeric(12,2) AS tax_amount,
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

		console.log("✅ Compatibility view sales_fact_v deployed successfully!");
	} catch (err: any) {
		console.error("❌ Migration failed:", err.message || err);
		process.exit(1);
	}
}

main();
