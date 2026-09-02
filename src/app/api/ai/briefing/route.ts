import { neon } from "@neondatabase/serverless";
import { NextResponse } from "next/server";

/**
 * Founder AI — Morning Executive Briefing Endpoint.
 * Computes daily revenue, store comparisons, top movers, low stock warnings,
 * and high-value customer activity from canonical PostgreSQL tables.
 */
export async function GET() {
	if (!process.env.DATABASE_URL) {
		return NextResponse.json(
			{ error: "DATABASE_URL missing" },
			{ status: 500 },
		);
	}

	const sql = neon(process.env.DATABASE_URL);

	try {
		// 1. Sales & Revenue Overview (Today / Yesterday comparison)
		const [revenueStats] = await sql`
			SELECT 
				COALESCE(SUM(net_amount), 0)::numeric AS total_revenue,
				COUNT(DISTINCT order_id)::int AS total_orders,
				ROUND(COALESCE(SUM(net_amount) / NULLIF(COUNT(DISTINCT order_id), 0), 0)::numeric, 2) AS aov,
				COALESCE(SUM(tax_amount), 0)::numeric AS total_gst
			FROM sales_fact_v
			WHERE sale_date >= CURRENT_DATE - INTERVAL '1 day'
		`;

		// 2. Multi-Store Revenue Comparison
		const storeComparison = await sql`
			SELECT 
				billed_by AS store_name,
				COALESCE(SUM(net_amount), 0)::numeric AS revenue,
				COUNT(DISTINCT order_id)::int AS orders,
				ROUND(COALESCE(SUM(net_amount) / NULLIF(COUNT(DISTINCT order_id), 0), 0)::numeric, 2) AS aov
			FROM sales_fact_v
			WHERE sale_date >= CURRENT_DATE - INTERVAL '30 days'
			GROUP BY billed_by
			ORDER BY revenue DESC
		`;

		// 3. Inventory Alerts (Low Stock / Stockout Risk)
		const lowStockAlerts = await sql`
			SELECT 
				name,
				default_code AS sku,
				qty_available,
				free_qty
			FROM dim_products
			WHERE qty_available <= 5 AND active = true
			ORDER BY qty_available ASC
			LIMIT 10
		`;

		// 4. Customer Activity (VIP Detection) — computed from sales_fact_v since
		// dim_customers has no stored customer_id/lifetime_value columns; lifetime
		// spend is derived directly from actual sales, mirroring the identity/
		// aggregation pattern used elsewhere in this app.
		const [vipRow] = await sql`
			WITH lifetime_spend AS (
				SELECT customer_mobile, SUM(net_amount) AS spend
				FROM sales_fact_v
				WHERE customer_mobile IS NOT NULL AND customer_mobile <> ''
				GROUP BY customer_mobile
				HAVING SUM(net_amount) >= 5000
			)
			SELECT
				COUNT(*)::int AS total_vip_customers,
				COALESCE(SUM(spend), 0)::numeric AS total_vip_spend
			FROM lifetime_spend
		`;
		const vipStats = vipRow;

		const briefing = {
			generatedAt: new Date().toISOString(),
			title: "ZenZebra Founder AI Executive Briefing",
			highlights: {
				totalRevenue: Number(revenueStats.total_revenue),
				totalOrders: Number(revenueStats.total_orders),
				aov: Number(revenueStats.aov),
				gstLiability: Number(revenueStats.total_gst),
			},
			stores: storeComparison.map((s) => ({
				storeName: s.store_name,
				revenue: Number(s.revenue),
				orders: Number(s.orders),
				aov: Number(s.aov),
			})),
			inventoryAlerts: lowStockAlerts.map((i) => ({
				productName: i.name,
				sku: i.sku || "N/A",
				onHand: Number(i.qty_available),
				freeQty: Number(i.free_qty),
			})),
			customerIntelligence: {
				vipCount: Number(vipStats.total_vip_customers || 0),
				vipSpend: Number(vipStats.total_vip_spend || 0),
			},
		};

		return NextResponse.json({ success: true, briefing });
	} catch (error: any) {
		console.error("[Founder AI Briefing] Error:", error.message);
		return NextResponse.json(
			{ success: false, error: error.message },
			{ status: 500 },
		);
	}
}
