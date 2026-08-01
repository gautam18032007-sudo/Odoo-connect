import { NextResponse } from "next/server";
import {
	getExecutiveInventoryMetrics,
	getFastSlowMovingProducts,
	getReorderRecommendations,
	getStockAgingDistribution,
	getStoreInventoryBreakdown,
} from "@/lib/repositories/inventory.repository";

export async function GET() {
	const startTime = Date.now();

	try {
		const [overview, storeBreakdown, fastSlow, reorderRecs, stockAging] =
			await Promise.all([
				getExecutiveInventoryMetrics(),
				getStoreInventoryBreakdown(),
				getFastSlowMovingProducts(),
				getReorderRecommendations(),
				getStockAgingDistribution(),
			]);

		const queryLatencyMs = Date.now() - startTime;

		return NextResponse.json({
			success: true,
			data: {
				overview,
				storeBreakdown,
				fastMoving: fastSlow.fastMoving,
				slowMoving: fastSlow.slowMoving,
				reorderRecommendations: reorderRecs,
				stockAging,
				performance: {
					queryLatencyMs,
					dataFreshness: "2-5s (Odoo SaaS Live Sync)",
				},
			},
		});
	} catch (err: any) {
		console.error("❌ Inventory Dashboard API Error:", err);
		return NextResponse.json(
			{
				success: false,
				error: err.message || "Failed to load inventory dashboard metrics",
			},
			{ status: 500 },
		);
	}
}
