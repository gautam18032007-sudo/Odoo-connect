import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import {
	getExecutiveInventoryMetrics,
	getStoreInventoryBreakdown,
} from "@/lib/repositories/inventory.repository";

export const runtime = "nodejs";

export async function GET() {
	try {
		const [todaySales] = await sql`
			SELECT 
				COALESCE(SUM(net_amount), 0) AS revenue,
				COUNT(DISTINCT order_id) AS bills,
				COALESCE(SUM(quantity), 0) AS units
			FROM sales_fact_v
			WHERE sale_date = CURRENT_DATE
		`;

		const storeRanking = await sql`
			SELECT 
				billed_by,
				COALESCE(SUM(net_amount), 0) AS revenue,
				COUNT(DISTINCT order_id) AS bills
			FROM sales_fact_v
			GROUP BY billed_by
			ORDER BY revenue DESC
		`;

		const topProducts = await sql`
			SELECT 
				item_name,
				sku_code,
				COALESCE(SUM(quantity), 0) AS units_sold,
				COALESCE(SUM(net_amount), 0) AS revenue
			FROM sales_fact_v
			GROUP BY item_name, sku_code
			ORDER BY revenue DESC
			LIMIT 5
		`;

		const [inventoryMetrics, _storeInventory] = await Promise.all([
			getExecutiveInventoryMetrics(),
			getStoreInventoryBreakdown(),
		]);

		return NextResponse.json({
			success: true,
			data: {
				today: {
					revenue: Number(todaySales?.revenue || 0),
					bills: Number(todaySales?.bills || 0),
					units: Number(todaySales?.units || 0),
				},
				storeRanking: storeRanking.map((s) => ({
					storeName: String(s.billed_by),
					revenue: Number(s.revenue),
					bills: Number(s.bills),
				})),
				topProducts: topProducts.map((p) => ({
					name: String(p.item_name),
					sku: String(p.sku_code || "SKU-N/A"),
					unitsSold: Number(p.units_sold),
					revenue: Number(p.revenue),
				})),
				inventory: inventoryMetrics,
				alerts: {
					marginAlerts:
						inventoryMetrics.lowStockCount > 0
							? [
									`${inventoryMetrics.lowStockCount} items require reorder stock`,
								]
							: [],
					syncHealth: inventoryMetrics.syncHealth.status,
				},
			},
		});
	} catch (error: any) {
		console.error("Failed to load Founder AI Ops data:", error);
		return NextResponse.json(
			{
				success: false,
				error: error.message || "Failed to load Founder AI Ops data",
			},
			{ status: 500 },
		);
	}
}
