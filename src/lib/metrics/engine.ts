/**
 * ZenZebra CRM Universal Metrics Engine
 * Single Source of Truth for all financial, sales, retention, and CRM velocity computations.
 * Pure mathematical functions with zero side-effects.
 */

export interface MetricInput {
	revenue?: number;
	orderCount?: number;
	purchaseSpend?: number;
	operatingExpenses?: number;
	marketingSpend?: number;
	newCustomersCount?: number;
	totalUniqueCustomers?: number;
	repeatCustomersCount?: number;
	closedWonCount?: number;
	totalClosedCount?: number;
	totalOpportunityValue?: number;
	opportunityCount?: number;
	salesCycleDays?: number;
}

export interface RfmInput {
	lastOrderDaysAgo: number;
	orderCount: number;
	totalSpend: number;
}

export interface RfmResult {
	recencyScore: number;
	frequencyScore: number;
	monetaryScore: number;
	compositeScore: number;
	segment: "Champion" | "Loyal" | "Potential Loyalist" | "At Risk" | "Lost";
}

/**
 * Calculates Average Order Value (AOV)
 */
export function calculateAOV(revenue: number, orderCount: number): number {
	if (!orderCount || orderCount <= 0 || !revenue || revenue <= 0) return 0;
	return Number((revenue / orderCount).toFixed(2));
}

/**
 * Calculates Gross Margin in currency and percentage
 */
export function calculateGrossMargin(
	revenue: number,
	purchaseSpend: number,
): {
	marginAmount: number;
	marginPercent: number;
} {
	if (!revenue || revenue <= 0) {
		return { marginAmount: 0, marginPercent: 0 };
	}
	const marginAmount = revenue - (purchaseSpend || 0);
	const marginPercent = Number(((marginAmount / revenue) * 100).toFixed(2));
	return { marginAmount, marginPercent };
}

/**
 * Calculates Customer Repeat Purchase Rate %
 */
export function calculateRepeatPurchaseRate(
	repeatCustomers: number,
	totalCustomers: number,
): number {
	if (!totalCustomers || totalCustomers <= 0) return 0;
	return Number(((repeatCustomers / totalCustomers) * 100).toFixed(2));
}

/**
 * Calculates Customer Lifetime Value (LTV)
 */
export function calculateLTV(
	aov: number,
	purchaseFrequency: number,
	lifespanYears = 1,
): number {
	if (!aov || aov <= 0) return 0;
	return Number((aov * purchaseFrequency * lifespanYears).toFixed(2));
}

/**
 * Calculates Customer Acquisition Cost (CAC) and Payback Period
 */
export function calculateCAC(
	marketingSpend: number,
	newCustomers: number,
	aov = 0,
	marginPercent = 100,
): {
	cac: number;
	paybackMonths: number;
} {
	if (
		!newCustomers ||
		newCustomers <= 0 ||
		!marketingSpend ||
		marketingSpend <= 0
	) {
		return { cac: 0, paybackMonths: 0 };
	}
	const cac = Number((marketingSpend / newCustomers).toFixed(2));
	const monthlyMarginPerCustomer = (aov * (marginPercent / 100)) / 12;
	const paybackMonths =
		monthlyMarginPerCustomer > 0
			? Number((cac / monthlyMarginPerCustomer).toFixed(1))
			: 0;

	return { cac, paybackMonths };
}

/**
 * Computes RFM Scores and Segment Placement
 */
export function calculateRFM(input: RfmInput): RfmResult {
	// Recency Score (1-5)
	let rScore = 1;
	if (input.lastOrderDaysAgo <= 7) rScore = 5;
	else if (input.lastOrderDaysAgo <= 30) rScore = 4;
	else if (input.lastOrderDaysAgo <= 60) rScore = 3;
	else if (input.lastOrderDaysAgo <= 90) rScore = 2;

	// Frequency Score (1-5)
	let fScore = 1;
	if (input.orderCount >= 10) fScore = 5;
	else if (input.orderCount >= 5) fScore = 4;
	else if (input.orderCount >= 3) fScore = 3;
	else if (input.orderCount >= 2) fScore = 2;

	// Monetary Score (1-5)
	let mScore = 1;
	if (input.totalSpend >= 50000) mScore = 5;
	else if (input.totalSpend >= 20000) mScore = 4;
	else if (input.totalSpend >= 10000) mScore = 3;
	else if (input.totalSpend >= 5000) mScore = 2;

	const compositeScore = Number(((rScore + fScore + mScore) / 3).toFixed(2));

	let segment: RfmResult["segment"] = "Lost";
	if (rScore >= 4 && fScore >= 4 && mScore >= 4) segment = "Champion";
	else if (fScore >= 3 && mScore >= 3) segment = "Loyal";
	else if (rScore >= 3 && fScore >= 2) segment = "Potential Loyalist";
	else if (rScore <= 2 && fScore >= 2) segment = "At Risk";

	return {
		recencyScore: rScore,
		frequencyScore: fScore,
		monetaryScore: mScore,
		compositeScore,
		segment,
	};
}

/**
 * Calculates CRM Pipeline Velocity
 */
export function calculatePipelineVelocity(
	opportunityValue: number,
	winRatePercent: number,
	salesCycleDays: number,
): number {
	if (!salesCycleDays || salesCycleDays <= 0) return 0;
	const winRate = winRatePercent / 100;
	return Number(((opportunityValue * winRate) / salesCycleDays).toFixed(2));
}

/**
 * Calculates CRM Win Rate %
 */
export function calculateWinRate(
	closedWon: number,
	totalClosed: number,
): number {
	if (!totalClosed || totalClosed <= 0) return 0;
	return Number(((closedWon / totalClosed) * 100).toFixed(2));
}
