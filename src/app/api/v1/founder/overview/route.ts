import type { NextRequest } from "next/server";
import { getCommercialIntelligence } from "@/features/commercial/services/commercial.service";
import { getCrmIntelligence } from "@/features/crm/services/crm.service";
import { createApiErrorResponse, createApiResponse } from "@/lib/api/response";
import { generateFounderActions } from "@/lib/intelligence/action-center";
import { calculateBusinessHealth } from "@/lib/intelligence/health";
import { logger } from "@/lib/observability/logger";

export async function GET(_req: NextRequest) {
	const { requestId, startTime } = logger.startRequest(
		"GET",
		"/api/v1/founder/overview",
	);

	try {
		const [commercial, crm] = await Promise.all([
			getCommercialIntelligence(),
			getCrmIntelligence(),
		]);

		const businessHealth = calculateBusinessHealth({
			revenueGrowthPercent: commercial.forecast.growthTrendPercent,
			repeatPurchaseRate: 38.5,
			closedWonRate: crm.summary.winRate,
		});

		const hotLeads = crm.leads.filter((l: any) => l.leadBadge === "Hot").length;
		const actions = generateFounderActions({
			hotLeadsCount: hotLeads,
			decliningStoresCount: 1,
			pendingProposalsCount: 2,
		});

		const payload = {
			businessHealth,
			executive: commercial.executive,
			commercial: {
				stores: commercial.stores,
				brands: commercial.brands,
			},
			crm: {
				summary: crm.summary,
				topOpportunities: crm.leads.slice(0, 5),
			},
			recommendations: commercial.recommendations,
			actions,
		};

		logger.logApiPerformance({
			requestId,
			method: "GET",
			path: "/api/v1/founder/overview",
			durationMs: performance.now() - startTime,
			status: 200,
		});

		return createApiResponse(payload, { requestId, startTime });
	} catch (err: any) {
		logger.logApiPerformance({
			requestId,
			method: "GET",
			path: "/api/v1/founder/overview",
			durationMs: performance.now() - startTime,
			status: 500,
			error: err.message,
		});

		return createApiErrorResponse(
			err.message || "Failed to fetch founder overview",
			{
				requestId,
				startTime,
			},
		);
	}
}
