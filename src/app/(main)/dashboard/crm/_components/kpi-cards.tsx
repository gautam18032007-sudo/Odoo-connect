"use client";

import { ArrowUpRight } from "lucide-react";

import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
} from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";

interface CrmSummary {
	totalPipelineValue: number;
	totalLeads: number;
	avgDealSize: number;
	winRate: number | null;
	stageCounts: Record<string, { count: number; value: number }>;
}

/**
 * Pipeline Overview KPI cards for /dashboard/crm.
 *
 * Every value here comes directly from `crm_leads` (via getCrmPipelineSummary
 * in crm.repository.ts) — never derived from sales revenue or customer
 * counts. A prior version fabricated all four cards from sales KPIs with
 * invented multipliers (revenue*1.4, hardcoded 28.4%/18.1% baselines,
 * customer count relabeled as "opportunities"); that logic has been removed
 * entirely rather than replaced with another guess.
 *
 * There is no historical/previous-period CRM summary query, so unlike the
 * sales KPI cards elsewhere in this app, these show only the current value
 * — no fabricated growth badge.
 */
export function KpiCards({
	summary,
}: {
	summary: CrmSummary | null | undefined;
}) {
	const hasCrmData = Boolean(summary && summary.totalLeads > 0);

	const qualifiedCount = summary?.stageCounts?.["Qualified"]?.count ?? 0;
	const closedWonCount = summary?.stageCounts?.["Closed Won"]?.count ?? 0;
	const qualifiedLeadRate =
		hasCrmData && summary
			? Math.round((qualifiedCount / summary.totalLeads) * 1000) / 10
			: null;
	const openOpportunities =
		hasCrmData && summary ? summary.totalLeads - closedWonCount : null;

	function Metric({ label, value }: { label: string; value: string | null }) {
		return (
			<Card>
				<CardHeader>
					<CardDescription>{label}</CardDescription>
					<CardAction>
						<ArrowUpRight className="size-4" />
					</CardAction>
				</CardHeader>
				<CardContent className="space-y-2">
					<span className="text-3xl leading-none tracking-tight font-bold">
						{value ?? "N/A"}
					</span>
					{value === null && (
						<p className="text-sm text-muted-foreground">
							No CRM data available
						</p>
					)}
				</CardContent>
			</Card>
		);
	}

	return (
		<section className="space-y-5">
			<div className="space-y-1">
				<h2 className="text-3xl tracking-tight font-bold">Pipeline Overview</h2>
				<p className="text-muted-foreground text-sm">
					Real CRM pipeline metrics from recorded leads and opportunities.
				</p>
			</div>

			<div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
				<Metric
					label="Pipeline Value"
					value={
						hasCrmData && summary
							? formatCurrency(summary.totalPipelineValue)
							: null
					}
				/>
				<Metric
					label="Qualified Lead Rate"
					value={qualifiedLeadRate !== null ? `${qualifiedLeadRate}%` : null}
				/>
				<Metric
					label="Open Opportunities"
					value={
						openOpportunities !== null
							? openOpportunities.toLocaleString()
							: null
					}
				/>
				<Metric
					label="Win Rate"
					value={
						hasCrmData &&
						summary?.winRate !== null &&
						summary?.winRate !== undefined
							? `${summary.winRate}%`
							: null
					}
				/>
			</div>
		</section>
	);
}
