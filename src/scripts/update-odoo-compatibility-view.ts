import * as path from "node:path";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

/**
 * Updates the LIVE sales_fact_v compatibility view (originally deployed by
 * deploy-compatibility-view.ts) to read real category/tax data instead of
 * the hardcoded 'General'/0.00 placeholders — see docs/odoo_migration_gap_assessment.md
 * and docs/TECH_DEBT.md (TD-002 covers what's still a genuine placeholder:
 * brand and payment_method, neither of which has an Odoo-side source yet).
 *
 * Everything else in this view (Part A / Excel, store-code CASE expressions,
 * join structure) is unchanged from the live deployed version.
 */
async function main() {
	if (!process.env.DATABASE_URL) {
		console.error("❌ DATABASE_URL is not set.");
		process.exit(1);
	}

	const { sql } = await import("../lib/db");

	console.log(
		"Updating sales_fact_v: category (from dim_products.category) and tax_amount (from fact_sales_lines.tax_amount)...",
	);

	await sql`DROP VIEW IF EXISTS sales_fact_v CASCADE`;

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
			NULL::integer AS customer_id,
			NULL::text AS customer_email,
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
			COALESCE(dp.default_code, 'SKU-UNKNOWN') AS sku_code,
			COALESCE(dp.name, 'Unknown Product') AS item_name,
			'Odoo' AS brand,
			COALESCE(dp.category, 'Uncategorized') AS category,
			fl.qty::int AS quantity,
			(COALESCE(dp.list_price, 0.00) * fl.qty)::numeric(12,2) AS mrp_amount,
			((COALESCE(dp.list_price, 0.00) * fl.qty) - (fl.price_subtotal + COALESCE(fl.tax_amount, 0.00)))::numeric(12,2) AS discount_amount,
			(fl.price_subtotal + COALESCE(fl.tax_amount, 0.00))::numeric(12,2) AS gross_amount,
			COALESCE(fl.tax_amount, 0.00)::numeric(12,2) AS tax_amount,
			fl.price_subtotal AS net_amount,
			dc.mobile AS customer_mobile,
			dc.name AS customer_name,
			'Odoo POS' AS payment_method,
			dc.id AS customer_id,
			dc.email AS customer_email,
			CASE
				WHEN ds.code = 'KLJ' THEN 'KLJ'
				WHEN ds.code = 'SWN' THEN 'Smart Works Noida'
				ELSE 'Head office'
			END AS store_display_name
		FROM fact_sales_lines fl
		JOIN fact_sales_orders fo ON fl.order_id = fo.id
		LEFT JOIN dim_products dp ON fl.product_id = dp.id
		LEFT JOIN dim_customers dc ON fo.partner_id = dc.id
		LEFT JOIN dim_stores ds ON fo.store_id = ds.id;
	`;

	console.log(
		"✅ sales_fact_v updated: real category + tax_amount for Odoo-sourced rows.",
	);
}

main().catch((err) => {
	console.error("❌ View update failed:", err.message || err);
	process.exit(1);
});
