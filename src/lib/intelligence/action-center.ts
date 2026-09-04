/**
 * ZenZebra Retail Intelligence Platform - Founder Action Center Engine
 *
 * Each recommendation must be backed by a real, passed-in count. A prior
 * version attached unconditional fabricated rupee impact estimates
 * (₹4.5L, ₹1.2L) and fabricated confidence percentages (92/88/85) to every
 * action regardless of actual data — those have been removed rather than
 * replaced with other guesses. Impact/confidence fields are optional and
 * are only ever included when there's a real calculation behind them.
 */

export interface FounderActionItem {
	id: string;
	title: string;
	category: "CRM" | "Commercial" | "Retention" | "Finance" | "Inventory";
	priority: "P0" | "P1" | "P2";
	/** Omitted when no real calculation supports a monetary estimate. */
	impactEstimate?: string;
	/** Omitted when there's no measurable statistical basis. */
	confidencePercent?: number;
	actionUrl: string;
	actionButtonText: string;
	createdAt: string;
}

export function generateFounderActions(input: {
	hotLeadsCount?: number;
	pendingProposalsCount?: number;
	decliningStoresCount?: number;
	lowStockItemsCount?: number;
}): FounderActionItem[] {
	const actions: FounderActionItem[] = [];
	const now = new Date().toISOString();

	// P0: Hot Leads requiring follow-up
	if (input.hotLeadsCount && input.hotLeadsCount > 0) {
		actions.push({
			id: "act_hot_leads",
			title: `Follow up with ${input.hotLeadsCount} Hot Opportunities`,
			category: "CRM",
			priority: "P0",
			actionUrl: "/dashboard/crm",
			actionButtonText: "Open CRM Board",
			createdAt: now,
		});
	}

	// P1: Store Dip Investigation
	if (input.decliningStoresCount && input.decliningStoresCount > 0) {
		actions.push({
			id: "act_store_dip",
			title: `Investigate Revenue Dip in ${input.decliningStoresCount} Store`,
			category: "Commercial",
			priority: "P1",
			actionUrl: "/dashboard/ecommerce",
			actionButtonText: "View Store Analytics",
			createdAt: now,
		});
	}

	// P1: Overdue Proposals
	if (input.pendingProposalsCount && input.pendingProposalsCount > 0) {
		actions.push({
			id: "act_pending_proposals",
			title: `Review ${input.pendingProposalsCount} Pending Enterprise Proposals`,
			category: "CRM",
			priority: "P1",
			actionUrl: "/dashboard/crm",
			actionButtonText: "Review Proposals",
			createdAt: now,
		});
	}

	return actions;
}
