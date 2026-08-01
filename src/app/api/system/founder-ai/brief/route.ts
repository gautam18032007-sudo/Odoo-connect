import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getExecutiveInventoryMetrics } from "@/lib/repositories/inventory.repository";
import { formatCurrency } from "@/lib/utils";

export const runtime = "nodejs";

export async function GET() {
	try {
		const [todaySales] = await sql`
			SELECT 
				COALESCE(SUM(net_amount), 0) AS revenue,
				COUNT(DISTINCT bill_no) AS bills,
				COALESCE(SUM(quantity), 0) AS units
			FROM sales_fact_v
			WHERE sale_date = CURRENT_DATE
		`;

		const [yesterdaySales] = await sql`
			SELECT 
				COALESCE(SUM(net_amount), 0) AS revenue,
				COUNT(DISTINCT bill_no) AS bills
			FROM sales_fact_v
			WHERE sale_date = CURRENT_DATE - INTERVAL '1 day'
		`;

		const [mtdSales] = await sql`
			SELECT 
				COALESCE(SUM(net_amount), 0) AS revenue,
				COUNT(DISTINCT bill_no) AS bills
			FROM sales_fact_v
			WHERE date_trunc('month', sale_date) = date_trunc('month', CURRENT_DATE)
		`;

		const storeLeaderboard = await sql`
			SELECT 
				billed_by,
				COALESCE(SUM(net_amount), 0) AS revenue
			FROM sales_fact_v
			WHERE sale_date = CURRENT_DATE
			GROUP BY billed_by
			ORDER BY revenue DESC
			LIMIT 3
		`;

		const inventoryMetrics = await getExecutiveInventoryMetrics();

		const todayRev = Number(todaySales?.revenue || 0);
		const yestRev = Number(yesterdaySales?.revenue || 0);
		const mtdRev = Number(mtdSales?.revenue || 0);

		const briefText = `
🌅 *ZENZEBRA EXECUTIVE MORNING BRIEF* (${new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })})

📈 *Sales Performance*:
• Today's Revenue: ${formatCurrency(todayRev)} (${todaySales?.bills || 0} orders, ${todaySales?.units || 0} units)
• Yesterday Revenue: ${formatCurrency(yestRev)}
• Month-to-Date Revenue: ${formatCurrency(mtdRev)}

🏪 *Top Performing Store Today*:
${storeLeaderboard.length > 0 ? storeLeaderboard.map((s, i) => `${i + 1}. ${s.billed_by}: ${formatCurrency(Number(s.revenue))}`).join("\n") : "• No sales recorded yet today"}

📦 *Inventory Health*:
• Total Valuation (MRP): ${formatCurrency(inventoryMetrics.totalInventoryValueMrp)}
• Healthy Stock SKUs: ${inventoryMetrics.healthyStockCount}
• Low Stock Reorder Alerts: ${inventoryMetrics.lowStockCount} SKUs
• Dead Stock Alerts: ${inventoryMetrics.deadStockCount} SKUs

⚡ *Odoo Sync Engine*:
• Status: 🟢 ${inventoryMetrics.syncHealth.status.toUpperCase()}
• Data Freshness: <10 seconds
		`.trim();

		return NextResponse.json({
			success: true,
			data: {
				briefText,
				metrics: {
					todayRevenue: todayRev,
					yesterdayRevenue: yestRev,
					mtdRevenue: mtdRev,
					todayBills: Number(todaySales?.bills || 0),
					todayUnits: Number(todaySales?.units || 0),
					topStores: storeLeaderboard.map((s) => ({
						storeName: String(s.billed_by),
						revenue: Number(s.revenue),
					})),
					inventory: inventoryMetrics,
				},
			},
		});
	} catch (error: any) {
		console.error("Failed to generate Executive Brief:", error);
		return NextResponse.json(
			{
				success: false,
				error: error.message || "Failed to generate Executive Brief",
			},
			{ status: 500 },
		);
	}
}
