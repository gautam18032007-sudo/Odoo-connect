import * as path from "node:path";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

/**
 * Creates the missing customer_metrics view (forensic audit, Task 19/20).
 *
 * This deliberately does NOT reuse src/scripts/migrate-customer-retention.ts:
 * that script's customer_metrics definition uses COUNT(DISTINCT bill_no) as
 * order identity — the same DEFECT-005 pattern already fixed everywhere else
 * in production code (bill_no is not globally unique for Odoo-era rows).
 * Running it as-is would reintroduce that bug into a brand-new object.
 *
 * Also, of the 4 views that script creates (customer_metrics, customer_ltv,
 * customer_segments, customer_retention_summary) plus 3 indexes, only
 * customer_metrics is actually referenced anywhere in application code
 * (cac.service.ts, ltv.service.ts, retention.service.ts, metric-registry.ts —
 * confirmed via repo-wide grep). retention.service.ts's own customer_segments
 * is a query-local CTE, not this DB object. The other 3 views/3 indexes are
 * unused dead weight and are intentionally NOT created here.
 *
 * Only columns actually consumed by production code (customer_mobile,
 * first_purchase_date) are load-bearing; the remaining columns
 * (customer_name, last_purchase_date, total_orders, total_revenue, aov) are
 * kept for schema parity with the original migration's intent, in case a
 * future consumer needs them, using the corrected order_id identity.
 */
async function main() {
	if (!process.env.DATABASE_URL) {
		console.error("DATABASE_URL is not set.");
		process.exit(1);
	}

	const { sql } = await import("../lib/db");

	console.log("Creating customer_metrics view (order_id-based)...");

	await sql`
		CREATE OR REPLACE VIEW customer_metrics AS
		SELECT
			customer_mobile,
			MAX(customer_name) AS customer_name,
			MIN(sale_date) AS first_purchase_date,
			MAX(sale_date) AS last_purchase_date,
			COUNT(DISTINCT order_id) AS total_orders,
			SUM(net_amount) AS total_revenue,
			SUM(net_amount) / NULLIF(COUNT(DISTINCT order_id), 0) AS aov
		FROM sales_fact_v
		WHERE customer_mobile IS NOT NULL AND customer_mobile <> ''
		GROUP BY customer_mobile;
	`;

	console.log("customer_metrics view created.");
}

main().catch((err) => {
	console.error("customer_metrics deployment failed:", err.message || err);
	process.exit(1);
});
