import { type NextRequest, NextResponse } from "next/server";
import {
	getExecutiveInventoryMetrics,
	getFastSlowMovingProducts,
	getReorderRecommendations,
	getStockAgingDistribution,
	getStoreInventoryBreakdown,
} from "@/lib/repositories/inventory.repository";

export async function GET(req: NextRequest) {
	const startTime = Date.now();

	try {
		const searchParams = req.nextUrl.searchParams;
		const store = searchParams.get("store");
		const category = searchParams.get("category");
		const brand = searchParams.get("brand");
		const sku = searchParams.get("sku");

		const filters = {
			store: store && store !== "All Stores" ? store : undefined,
			category:
				category && category !== "All Categories" ? category : undefined,
			brand: brand && brand !== "All Brands" ? brand : undefined,
			sku: sku || undefined,
		};

		const [overview, storeBreakdown, fastSlow, reorderRecs, stockAging] =
			await Promise.all([
				getExecutiveInventoryMetrics(filters),
				getStoreInventoryBreakdown(filters),
				getFastSlowMovingProducts(filters),
				getReorderRecommendations(filters),
				getStockAgingDistribution(filters),
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
