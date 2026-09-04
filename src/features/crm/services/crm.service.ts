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
	// summary.winRate is already null when there are 0 leads (a real "no CRM
	// data" state, not a fabricated 0% win rate) — only recompute it here
	// when there's real data to recompute from, so that null survives rather
	// than being silently overwritten by calculateWinRate(0, 0) === 0.
	const winRate =
		rawLeads.length > 0
			? calculateWinRate(closedWonCount, rawLeads.length)
			: null;
	const velocity =
		winRate !== null
			? calculatePipelineVelocity(summary.totalPipelineValue, winRate, 30)
			: null;

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
