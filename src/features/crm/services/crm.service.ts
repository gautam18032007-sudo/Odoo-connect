import { calculateLeadScore } from "@/lib/intelligence/score";
import {
	calculatePipelineVelocity,
	calculateWinRate,
} from "@/lib/metrics/engine";
import {
	getCrmLeads,
	getCrmPipelineSummary,
} from "@/lib/repositories/crm.repository";

export async function getCrmIntelligence() {
	const [summary, rawLeads] = await Promise.all([
		getCrmPipelineSummary(),
		getCrmLeads(),
	]);

	const scoredLeads = rawLeads.map((lead) => {
		const scoreResult = calculateLeadScore({
			expectedRevenue: lead.expectedRevenue,
			industryFit: "Retail Corporate",
			sourceQuality: lead.source || "Inbound Web",
			engagementRecencyDays: 2,
			hasDecisionMakerAccess: true,
			buyingTimelineDays: 14,
		});

		return {
			...lead,
			leadScore: scoreResult.score,
			leadBadge: scoreResult.badge,
			leadBadgeColor: scoreResult.color,
		};
	});

	const closedWonCount = rawLeads.filter((l) => l.won).length;
	const winRate = calculateWinRate(closedWonCount, rawLeads.length);
	const velocity = calculatePipelineVelocity(
		summary.totalPipelineValue,
		winRate,
		30,
	);

	return {
		summary: {
			...summary,
			winRate,
			pipelineVelocity: velocity,
		},
		leads: scoredLeads,
		slaStatus: {
			qualifiedAvgHours: 4.2,
			proposalAvgHours: 18.5,
			negotiationAvgHours: 42.0,
		},
	};
}
