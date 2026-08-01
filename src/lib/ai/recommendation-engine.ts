/**
 * ZenZebra CRM AI & Algorithmic Recommendation Engine
 * Evaluates real-time KPIs and returns structured "What happened? -> Why? -> Action" recommendations.
 */

export interface ActionRecommendation {
	id: string;
	title: string;
	category: "Sales" | "Retention" | "CRM" | "Finance";
	condition: string;
	insight: string;
	reason: string;
	recommendation: string;
	priority: "HIGH" | "MEDIUM" | "LOW";
	suggestedActionText: string;
	actionUrl?: string;
}

export function generateRecommendations(metrics: {
	grossRevenue?: number;
	revenueGrowthPercent?: number;
	repeatPurchaseRate?: number;
	closedWonRate?: number;
	openPoSpend?: number;
}): ActionRecommendation[] {
	const recommendations: ActionRecommendation[] = [];

	// Rule 1: Decline in repeat purchase rate
	if (
		metrics.repeatPurchaseRate !== undefined &&
		metrics.repeatPurchaseRate < 35
	) {
		recommendations.push({
			id: "rec_retention_repeat_drop",
			title: "Declining Repeat Purchases",
			category: "Retention",
			condition: `Repeat Purchase Rate at ${metrics.repeatPurchaseRate}% (below 35% target)`,
			insight:
				"Existing customer transaction volume has dropped across recent monthly cohorts.",
			reason:
				"Customer engagement post-first purchase is falling off within 30 days.",
			recommendation:
				"Launch a targeted SMS/WhatsApp reactivation campaign offering a 15% discount for 2nd orders.",
			priority: "HIGH",
			suggestedActionText: "Create Reactivation Campaign",
			actionUrl: "/dashboard/retention",
		});
	}

	// Rule 2: Low CRM Win Rate
	if (metrics.closedWonRate !== undefined && metrics.closedWonRate < 20) {
		recommendations.push({
			id: "rec_crm_win_rate_low",
			title: "Low Deal Conversion Rate",
			category: "CRM",
			condition: `Closed-Won Rate at ${metrics.closedWonRate}% (target > 25%)`,
			insight:
				"Opportunities are stalling in the Proposal Sent & Negotiation stages.",
			reason: "Lack of quick follow-up calls or unoptimized proposal pricing.",
			recommendation:
				"Schedule automated task reminders for reps within 24 hours of proposal delivery.",
			priority: "MEDIUM",
			suggestedActionText: "Review CRM Pipeline",
			actionUrl: "/dashboard/crm",
		});
	}

	// Rule 3: High Open Purchase Order Spend
	if (metrics.openPoSpend !== undefined && metrics.openPoSpend > 500000) {
		recommendations.push({
			id: "rec_finance_po_spend",
			title: "Capital Tied Up in Open POs",
			category: "Finance",
			condition: `Open PO Spend exceeds ₹${metrics.openPoSpend.toLocaleString()}`,
			insight:
				"Significant working capital is locked in unfulfilled supplier purchase orders.",
			reason: "Delayed GRN validations from vendor receipts.",
			recommendation:
				"Reconcile vendor receipts against delivery notes to speed up inventory check-ins.",
			priority: "MEDIUM",
			suggestedActionText: "View Open POs",
			actionUrl: "/dashboard/finance",
		});
	}

	return recommendations;
}
