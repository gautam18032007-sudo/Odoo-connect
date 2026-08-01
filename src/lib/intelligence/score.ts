/**
 * ZenZebra CRM 7-Factor Weighted Lead Scoring Model
 * Evaluates deal potential on a 0-100 scale.
 */

export interface LeadScoreInput {
	expectedRevenue: number;
	industryFit?: string;
	sourceQuality?: string;
	engagementRecencyDays?: number;
	hasDecisionMakerAccess?: boolean;
	buyingTimelineDays?: number;
	historicalSimilarityScore?: number;
}

export interface LeadScoreOutput {
	score: number;
	badge: "Hot" | "Warm" | "Cold";
	color: string;
	factorsBreakdown: {
		revenueFactor: number;
		industryFactor: number;
		sourceFactor: number;
		engagementFactor: number;
		decisionMakerFactor: number;
		timelineFactor: number;
		similarityFactor: number;
	};
}

export function calculateLeadScore(input: LeadScoreInput): LeadScoreOutput {
	// 1. Revenue Factor (25% weight) - Max score at ₹1,00,000+
	const rev = input.expectedRevenue || 0;
	let revenueFactor = 20;
	if (rev >= 100000) revenueFactor = 100;
	else if (rev >= 50000) revenueFactor = 85;
	else if (rev >= 20000) revenueFactor = 70;
	else if (rev >= 5000) revenueFactor = 50;

	// 2. Industry Fit Factor (15% weight)
	const industryFactor =
		input.industryFit === "Retail Corporate" ||
		input.industryFit === "Enterprise"
			? 90
			: 70;

	// 3. Source Quality Factor (15% weight)
	const sourceFactor =
		input.sourceQuality === "Inbound Web" || input.sourceQuality === "Odoo CRM"
			? 95
			: 65;

	// 4. Engagement Recency Factor (15% weight)
	const daysAgo = input.engagementRecencyDays ?? 0;
	let engagementFactor = 40;
	if (daysAgo <= 2) engagementFactor = 100;
	else if (daysAgo <= 7) engagementFactor = 85;
	else if (daysAgo <= 14) engagementFactor = 65;

	// 5. Decision Maker Access Factor (10% weight)
	const decisionMakerFactor = input.hasDecisionMakerAccess ? 100 : 50;

	// 6. Buying Timeline Factor (10% weight)
	const timelineDays = input.buyingTimelineDays ?? 30;
	let timelineFactor = 50;
	if (timelineDays <= 7) timelineFactor = 100;
	else if (timelineDays <= 14) timelineFactor = 80;
	else if (timelineDays <= 30) timelineFactor = 65;

	// 7. Historical Similarity Factor (10% weight)
	const similarityFactor = input.historicalSimilarityScore ?? 75;

	// Weighted Score Calculation
	const weightedScore = Math.round(
		revenueFactor * 0.25 +
			industryFactor * 0.15 +
			sourceFactor * 0.15 +
			engagementFactor * 0.15 +
			decisionMakerFactor * 0.1 +
			timelineFactor * 0.1 +
			similarityFactor * 0.1,
	);

	let badge: LeadScoreOutput["badge"] = "Warm";
	let color = "text-amber-600 bg-amber-500/10 border-amber-500/30";

	if (weightedScore >= 80) {
		badge = "Hot";
		color = "text-emerald-600 bg-emerald-500/10 border-emerald-500/30";
	} else if (weightedScore < 55) {
		badge = "Cold";
		color = "text-blue-600 bg-blue-500/10 border-blue-500/30";
	}

	return {
		score: weightedScore,
		badge,
		color,
		factorsBreakdown: {
			revenueFactor,
			industryFactor,
			sourceFactor,
			engagementFactor,
			decisionMakerFactor,
			timelineFactor,
			similarityFactor,
		},
	};
}
