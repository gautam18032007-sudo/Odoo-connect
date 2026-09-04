import { generateRecommendations } from "@/lib/ai/recommendation-engine";
import { sql } from "@/lib/db";
import { generateSalesForecast } from "@/lib/intelligence/forecast/sales";
import { calculateAOV } from "@/lib/metrics/engine";
import {
	getCommercialBrandBreakdown,
	getStoreScorecards,
} from "../repositories/commercial.repository";

export async function getCommercialIntelligence() {
	const [stores, brands, dailyRevenueRows] = await Promise.all([
		getStoreScorecards(),
		getCommercialBrandBreakdown(),
		sql`
			SELECT sale_date::text AS date, COALESCE(SUM(net_amount), 0)::float AS revenue
			FROM sales_fact_v
			WHERE sale_date >= CURRENT_DATE - INTERVAL '90 days'
			GROUP BY sale_date
			ORDER BY sale_date ASC
		`,
	]);

	const totalRevenue = stores.reduce((sum, s) => sum + s.grossRevenue, 0);
	const totalOrders = stores.reduce((sum, s) => sum + s.orderCount, 0);
	const overallAov = calculateAOV(totalRevenue, totalOrders);

	// Real historical daily revenue (up to 90 days) — not a single synthetic
	// averaged point — so the forecast engine can compute a genuine trend.
	const forecast = generateSalesForecast(
		dailyRevenueRows.map((r) => ({
			date: String(r.date),
			revenue: Number(r.revenue),
		})),
	);

	// No repeat-purchase-rate figure is currently wired into this
	// intelligence layer (a real one exists in retention.service.ts, but
	// this function takes no periods/filters to compute it comparably) —
	// omitting it entirely rather than fabricating a number; the rule that
	// depends on it (generateRecommendations) already treats `undefined`
	// as "no signal" and skips that recommendation rather than guessing.
	const recommendations = generateRecommendations({
		grossRevenue: totalRevenue,
	});

	return {
		executive: {
			totalRevenue,
			totalOrders,
			overallAov,
			activeStoresCount: stores.length,
		},
		stores,
		brands,
		forecast,
		recommendations,
	};
}
