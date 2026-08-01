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

	const recommendations = generateRecommendations({
		grossRevenue: totalRevenue,
		repeatPurchaseRate: 38.5,
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
