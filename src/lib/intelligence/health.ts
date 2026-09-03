/**
 * ZenZebra Retail Intelligence Platform - Business Health Engine
 * Calculates overall Business Health Score (0-100) and domain sub-scores.
 */

export interface DomainHealthScores {
	revenueHealth: number | null;
	customerHealth: number | null;
	pipelineHealth: number | null;
	cashFlowHealth: number | null;
	inventoryHealth: number | null;
	overallBusinessHealth: number | null;
	status: "EXCELLENT" | "HEALTHY" | "NEEDS_ATTENTION" | "CRITICAL" | "UNKNOWN";
	statusMessage: string;
}

interface WeightedDomain {
	value: number | null;
	weight: number;
}

/** Weighted average over only the domains that have a real value — a
 * missing domain is excluded and its weight is redistributed
 * proportionally among the known domains, rather than being silently
 * treated as 0 (which previously understated the score whenever an input
 * was simply not provided, e.g. no inventory-health data source existed).
 */
function weightedAverage(domains: WeightedDomain[]): number | null {
	const known = domains.filter(
		(d): d is { value: number; weight: number } => d.value !== null,
	);
	const totalKnownWeight = known.reduce((sum, d) => sum + d.weight, 0);
	if (totalKnownWeight === 0) return null;
	const weightedSum = known.reduce((sum, d) => sum + d.value * d.weight, 0);
	return Math.round(weightedSum / totalKnownWeight);
}

export function calculateBusinessHealth(input: {
	revenueGrowthPercent?: number;
	grossMarginPercent?: number;
	repeatPurchaseRate?: number;
	closedWonRate?: number;
	openPoSpend?: number;
	/** 0-100. No live inventory-health signal is wired into this endpoint
	 * yet — omit rather than pass a placeholder; the domain is then
	 * excluded from the overall score instead of contributing a fabricated
	 * constant. */
	inventoryHealthScore?: number;
}): DomainHealthScores {
	// Revenue Health (30% weight)
	let revenueHealth: number | null = null;
	if (input.revenueGrowthPercent !== undefined) {
		const growth = input.revenueGrowthPercent;
		revenueHealth = 70;
		if (growth > 15) revenueHealth = 95;
		else if (growth > 5) revenueHealth = 85;
		else if (growth < 0) revenueHealth = 50;
	}

	// Customer Health (25% weight)
	let customerHealth: number | null = null;
	if (input.repeatPurchaseRate !== undefined) {
		const repeatRate = input.repeatPurchaseRate;
		customerHealth = 70;
		if (repeatRate >= 45) customerHealth = 95;
		else if (repeatRate >= 35) customerHealth = 85;
		else if (repeatRate < 25) customerHealth = 55;
	}

	// Pipeline Health (20% weight)
	let pipelineHealth: number | null = null;
	if (input.closedWonRate !== undefined) {
		const winRate = input.closedWonRate;
		pipelineHealth = 70;
		if (winRate >= 30) pipelineHealth = 95;
		else if (winRate >= 20) pipelineHealth = 80;
		else if (winRate < 15) pipelineHealth = 50;
	}

	// Cash Flow Health (15% weight)
	let cashFlowHealth: number | null = null;
	if (input.grossMarginPercent !== undefined) {
		const margin = input.grossMarginPercent;
		cashFlowHealth = 75;
		if (margin >= 40) cashFlowHealth = 90;
		else if (margin < 25) cashFlowHealth = 55;
	}

	// Inventory Health (10% weight) — no fabricated baseline; only used if
	// the caller supplies a real, sourced score.
	const inventoryHealth =
		input.inventoryHealthScore !== undefined
			? input.inventoryHealthScore
			: null;

	const overallBusinessHealth = weightedAverage([
		{ value: revenueHealth, weight: 0.3 },
		{ value: customerHealth, weight: 0.25 },
		{ value: pipelineHealth, weight: 0.2 },
		{ value: cashFlowHealth, weight: 0.15 },
		{ value: inventoryHealth, weight: 0.1 },
	]);

	let status: DomainHealthScores["status"] = "UNKNOWN";
	let statusMessage =
		"Not enough live data is wired in yet to compute a business health score.";

	if (overallBusinessHealth !== null) {
		status = "HEALTHY";
		statusMessage =
			"Business operations are performing stably across key domains.";
		if (overallBusinessHealth >= 90) {
			status = "EXCELLENT";
			statusMessage =
				"All commercial and customer growth indicators are exceeding targets.";
		} else if (overallBusinessHealth < 50) {
			status = "CRITICAL";
			statusMessage = "Critical margin erosion or revenue decline detected.";
		} else if (overallBusinessHealth < 70) {
			status = "NEEDS_ATTENTION";
			statusMessage =
				"Revenue dip or low retention requires proactive founder intervention.";
		}
	}

	return {
		revenueHealth,
		customerHealth,
		pipelineHealth,
		cashFlowHealth,
		inventoryHealth,
		overallBusinessHealth,
		status,
		statusMessage,
	};
}
