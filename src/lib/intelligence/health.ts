/**
 * ZenZebra Retail Intelligence Platform - Business Health Engine
 * Calculates overall Business Health Score (0-100) and domain sub-scores.
 */

export interface DomainHealthScores {
	revenueHealth: number;
	customerHealth: number;
	pipelineHealth: number;
	cashFlowHealth: number;
	inventoryHealth: number;
	overallBusinessHealth: number;
	status: "EXCELLENT" | "HEALTHY" | "NEEDS_ATTENTION" | "CRITICAL";
	statusMessage: string;
}

export function calculateBusinessHealth(input: {
	revenueGrowthPercent?: number;
	grossMarginPercent?: number;
	repeatPurchaseRate?: number;
	closedWonRate?: number;
	openPoSpend?: number;
}): DomainHealthScores {
	// Revenue Health (30% weight)
	const growth = input.revenueGrowthPercent || 0;
	let revenueHealth = 70;
	if (growth > 15) revenueHealth = 95;
	else if (growth > 5) revenueHealth = 85;
	else if (growth < 0) revenueHealth = 50;

	// Customer Health (25% weight)
	const repeatRate = input.repeatPurchaseRate || 0;
	let customerHealth = 70;
	if (repeatRate >= 45) customerHealth = 95;
	else if (repeatRate >= 35) customerHealth = 85;
	else if (repeatRate < 25) customerHealth = 55;

	// Pipeline Health (20% weight)
	const winRate = input.closedWonRate || 0;
	let pipelineHealth = 70;
	if (winRate >= 30) pipelineHealth = 95;
	else if (winRate >= 20) pipelineHealth = 80;
	else if (winRate < 15) pipelineHealth = 50;

	// Cash Flow & Inventory Health (25% weight)
	const margin = input.grossMarginPercent || 0;
	let cashFlowHealth = 75;
	if (margin >= 40) cashFlowHealth = 90;
	else if (margin < 25) cashFlowHealth = 55;

	const inventoryHealth = 82; // Baseline inventory health

	// Calculate weighted overall score
	const overallBusinessHealth = Math.round(
		revenueHealth * 0.3 +
			customerHealth * 0.25 +
			pipelineHealth * 0.2 +
			cashFlowHealth * 0.15 +
			inventoryHealth * 0.1,
	);

	let status: DomainHealthScores["status"] = "HEALTHY";
	let statusMessage =
		"Business operations are performing stably across key domains.";

	if (overallBusinessHealth >= 90) {
		status = "EXCELLENT";
		statusMessage =
			"All commercial and customer growth indicators are exceeding targets.";
	} else if (overallBusinessHealth < 70) {
		status = "NEEDS_ATTENTION";
		statusMessage =
			"Revenue dip or low retention requires proactive founder intervention.";
	} else if (overallBusinessHealth < 50) {
		status = "CRITICAL";
		statusMessage = "Critical margin erosion or revenue decline detected.";
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
