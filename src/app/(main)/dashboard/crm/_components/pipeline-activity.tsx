"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface CrmSummary {
	totalLeads: number;
	stageCounts: Record<string, { count: number; value: number }>;
}

/**
 * A prior version of this component sourced "Qualified Leads" from real
 * sales order counts (dailyTrends.orders) — an unrelated domain — and
 * derived "Discovery Calls Booked" as qualifiedLeads * 0.48, an invented
 * ratio with no real discovery-call data source. Both have been removed.
 *
 * This now shows the real CRM stage breakdown from crm_leads. There is no
 * genuine discovery-call tracking source in this codebase, so that figure
 * is reported as not connected rather than estimated.
 */
export function PipelineActivity({
	summary,
}: {
	summary: CrmSummary | null | undefined;
}) {
	const hasCrmData = Boolean(summary && summary.totalLeads > 0);
	const qualifiedCount = summary?.stageCounts?.["Qualified"]?.count ?? 0;
	const discoveryCount = summary?.stageCounts?.["Discovery"]?.count ?? 0;

	return (
		<div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
			<Card className="xl:col-span-8">
				<CardHeader>
					<CardTitle>Pipeline Stage Breakdown</CardTitle>
					<p className="text-muted-foreground text-sm mt-1">
						Real lead counts per pipeline stage, from recorded CRM leads.
					</p>
				</CardHeader>
				<CardContent>
					{hasCrmData && summary ? (
						<div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
							{Object.entries(summary.stageCounts).map(([stage, info]) => (
								<div
									key={stage}
									className="rounded-lg border border-border/60 p-3"
								>
									<div className="text-xs text-muted-foreground">{stage}</div>
									<div className="text-xl font-bold tabular-nums">
										{info.count}
									</div>
								</div>
							))}
						</div>
					) : (
						<div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
							No CRM leads recorded yet
						</div>
					)}
				</CardContent>
			</Card>

			<Card className="xl:col-span-4">
				<CardContent className="flex h-full flex-col gap-5 pt-6">
					<div className="flex flex-col gap-1">
						<div className="font-medium text-3xl tabular-nums leading-none font-bold">
							{hasCrmData ? qualifiedCount.toLocaleString() : "N/A"}{" "}
							<span className="font-normal text-lg text-muted-foreground font-sans">
								leads
							</span>
						</div>
						<p className="text-muted-foreground text-sm">
							Leads currently in the Qualified stage.
						</p>
					</div>

					<div className="flex flex-col gap-3 rounded-lg border border-border/60 p-3">
						<div className="text-[11px] text-muted-foreground uppercase tracking-widest font-semibold">
							Discovery Calls Booked
						</div>
						<div className="font-medium text-2xl tabular-nums leading-none text-muted-foreground">
							N/A
						</div>
						<p className="text-muted-foreground text-sm">
							Not connected — no discovery-call tracking source exists yet.
							{hasCrmData &&
								` (${discoveryCount} lead(s) currently in Discovery stage.)`}
						</p>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
