import { generateRecommendations } from "@/lib/ai/recommendation-engine";
import { generateSalesForecast } from "@/lib/intelligence/forecast/sales";
import { calculateAOV } from "@/lib/metrics/engine";
import {
	getCommercialBrandBreakdown,
	getStoreScorecards,
} from "../repositories/commercial.repository";

export async function getCommercialIntelligence() {
	const [stores, brands] = await Promise.all([
		getStoreScorecards(),
		getCommercialBrandBreakdown(),
	]);

	const totalRevenue = stores.reduce((sum, s) => sum + s.grossRevenue, 0);
	const totalOrders = stores.reduce((sum, s) => sum + s.orderCount, 0);
	const overallAov = calculateAOV(totalRevenue, totalOrders);

	const forecast = generateSalesForecast([
		{ date: new Date().toISOString(), revenue: totalRevenue / 30 },
	]);

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
