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
 * Part B's store attribution (billed_by / store_display_name) now derives
 * dynamically from dim_stores.name via fact_sales_orders.store_id, instead
 * of a hardcoded KLJ/SWN CASE — new stores (e.g. HQ27GGN) appear correctly
 * without a code change. Part A (legacy Excel) is unchanged, since sales_fact
 * only ever contains the original two stores.
 *
 * New `order_id` column (forensic-audit fix, DEFECT-005): `bill_no` (Odoo's
 * pos.order.name) is NOT a safe unique transaction identity — a full census
 * found 450 collision groups / 1,166 affected orders / a 716-order (16%)
 * undercount when COUNT(DISTINCT bill_no) is used as "bill cuts", because
 * Odoo's per-session order numbering legitimately resets and repeats across
 * distinct real transactions. `order_id` exposes the actually-unique
 * identity per row: `fo.id` (fact_sales_orders' own stable, Odoo-ID-derived
 * PK) for the Odoo branch, `bill_no` itself for the legacy Excel branch
 * (which has no Odoo order ID and was verified ground-truth against bill_no
 * as its grain — see verify-ground-truth.ts). Consumers should switch bill
 * counts to COUNT(DISTINCT order_id), not COUNT(DISTINCT bill_no).
 */
async function main() {
	if (!process.env.DATABASE_URL) {
		console.error("❌ DATABASE_URL is not set.");
		process.exit(1);
	}

	const { sql } = await import("../../lib/db");

	console.log(
		"Updating sales_fact_v: category (from dim_products.category) and tax_amount (from fact_sales_lines.tax_amount)...",
	);

	await sql`DROP VIEW IF EXISTS sales_fact_v CASCADE`;

	await sql`
		CREATE OR REPLACE VIEW sales_fact_v AS
		-- Part A: Legacy Excel Upload Data
		SELECT
			id::text, upload_id, bill_no, bill_no AS order_id, sale_date,
			-- Store unification (Phase 12): emit the same short codes the
			-- Odoo branch already uses (dim_stores.name / .code), instead of
			-- the raw Excel-era strings, so one physical store isn't split
			-- into two separate billed_by values across the historical
			-- Excel/current Odoo boundary. sales_fact.billed_by itself is
			-- NOT modified — this is a view-presentation change only.
			-- Reuses the exact mapping already present below in
			-- store_display_name, rather than a new mechanism.
			CASE
				WHEN billed_by = 'SmartworksNoida Noida' THEN 'SWN'
				WHEN billed_by = 'Klj store' THEN 'KLJ'
				ELSE 'Head office'
			END AS billed_by,
			product_key, sku_code, item_name,
			brand, category, quantity, mrp_amount,
			GREATEST(0.00, mrp_amount - gross_amount)::numeric(12,2) AS discount_amount,
			gross_amount, tax_amount, net_amount,
			customer_mobile, customer_name, payment_method,
			NULL::integer AS customer_id,
			NULL::text AS customer_email,
			-- Store identity unification (Task 14): store_display_name now
			-- agrees exactly with billed_by (same CASE values) so no
			-- downstream GROUP BY on either/both column can split one
			-- physical store's Excel-era and Odoo-era rows apart — closes
			-- the whole class of bug (store-performance.ts, payment-
			-- analysis.ts, store-trend.ts, profitability.ts) in one place,
			-- not per-consumer.
			CASE
				WHEN billed_by = 'SmartworksNoida Noida' THEN 'SWN'
				WHEN billed_by = 'Klj store' THEN 'KLJ'
				ELSE 'Head office'
			END AS store_display_name
		FROM sales_fact
		WHERE NOT EXISTS (
			SELECT 1
			FROM fact_sales_orders fo
			WHERE LOWER(TRIM(fo.name)) = LOWER(TRIM(sales_fact.bill_no))
		)

		UNION ALL

		-- Part B: Verified Live Odoo Sync Data
		SELECT
			fl.id AS id,
			999999 AS upload_id, -- Reserved Odoo identifier
			fo.name AS bill_no,
			fo.id AS order_id, -- stable per-order identity; bill_no is not unique (see header comment)
			(fo.date_order AT TIME ZONE 'Asia/Kolkata')::date AS sale_date,
			COALESCE(ds.name, 'Unknown Store') AS billed_by,
			fl.id AS product_key,
			COALESCE(dp.default_code, 'SKU-UNKNOWN') AS sku_code,
			COALESCE(dp.name, 'Unknown Product') AS item_name,
			'Odoo' AS brand,
			-- Category canonicalization (forensic audit, Task 18): dim_products.category
			-- carries inconsistent free-text casing/whitespace from Odoo product-catalog
			-- data entry (e.g. 'Beverages ', 'Beverages' vs the canonical 'BEVERAGES').
			-- FOOD_CATEGORIES (filter-sql.ts) and every retailFilter() consumer compare
			-- category with an exact string match against the canonical uppercase forms,
			-- so uncanonicalized variants silently leaked out of the food-category
			-- exclusion and were counted as "retail" — confirmed 100% Odoo-sourced
			-- (Excel/Part A already stores clean canonical values), ₹358,390.61 / 4,334
			-- orders affected at time of fix. Only the 3 known FOOD_CATEGORIES values are
			-- normalized here; every other category passes through unchanged.
			CASE
				WHEN UPPER(TRIM(dp.category)) = 'BEVERAGES' THEN 'BEVERAGES'
				WHEN UPPER(TRIM(dp.category)) = 'LIVE MENU' THEN 'LIVE MENU'
				WHEN UPPER(TRIM(dp.category)) = 'SNACK CORNER' THEN 'SNACK CORNER'
				ELSE COALESCE(dp.category, 'Uncategorized')
			END AS category,
			fl.qty::int AS quantity,
			(COALESCE(dp.list_price, 0.00) * fl.qty)::numeric(12,2) AS mrp_amount,
			-- discount_amount/tax_amount sign-correction (forensic audit, Task 18):
			-- gross_amount and net_amount already flip sign for refund lines (qty<0)
			-- when Odoo's raw price_subtotal wasn't pre-signed, but tax_amount was
			-- passed through raw (never flipped) and discount_amount was derived from
			-- the raw, unflipped subtotal+tax — breaking the mrp-discount=gross and
			-- gross-tax=net identities for exactly the 98 currently-affected refund
			-- rows (proven: data-validation's Equation 1/2 self-checks, ₹17,569.80 and
			-- ₹1,721.48 variance, both 100% attributable to these rows; GST total was
			-- overstated by ₹1,695.56 as a result). Both now use the same qty<0 sign
			-- trigger already established for gross_amount/net_amount, and
			-- discount_amount is derived from the corrected gross_amount instead of
			-- the raw unflipped subtotal+tax.
			((COALESCE(dp.list_price, 0.00) * fl.qty) - (CASE
				WHEN fl.qty < 0 AND (fl.price_subtotal + COALESCE(fl.tax_amount, 0.00)) > 0
				THEN -(fl.price_subtotal + COALESCE(fl.tax_amount, 0.00))
				ELSE (fl.price_subtotal + COALESCE(fl.tax_amount, 0.00))
			END))::numeric(12,2) AS discount_amount,
			(CASE
				WHEN fl.qty < 0 AND (fl.price_subtotal + COALESCE(fl.tax_amount, 0.00)) > 0
				THEN -(fl.price_subtotal + COALESCE(fl.tax_amount, 0.00))
				ELSE (fl.price_subtotal + COALESCE(fl.tax_amount, 0.00))
			END)::numeric(12,2) AS gross_amount,
			(CASE
				WHEN fl.qty < 0 AND (fl.price_subtotal + COALESCE(fl.tax_amount, 0.00)) > 0
				THEN -COALESCE(fl.tax_amount, 0.00)
				ELSE COALESCE(fl.tax_amount, 0.00)
			END)::numeric(12,2) AS tax_amount,
			CASE
				WHEN fl.qty < 0 AND fl.price_subtotal > 0 THEN -fl.price_subtotal
				ELSE fl.price_subtotal
			END AS net_amount,
			dc.mobile AS customer_mobile,
			dc.name AS customer_name,
			'Odoo POS' AS payment_method,
			dc.id AS customer_id,
			dc.email AS customer_email,
			COALESCE(ds.name, 'Unknown Store') AS store_display_name
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
