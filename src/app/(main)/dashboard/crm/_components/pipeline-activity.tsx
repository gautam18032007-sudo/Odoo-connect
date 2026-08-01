"use client";

import { format } from "date-fns";
import { useMemo } from "react";
import { Bar, BarChart, Cell, XAxis, YAxis } from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@/components/ui/chart";
import { Progress } from "@/components/ui/progress";

const pipelineChartConfig = {
	orders: {
		label: "Qualified Leads",
		color: "oklch(0.42 0 0)",
	},
} satisfies ChartConfig;

const BAR_BASE_FILL = "oklch(0.42 0 0)";
const BAR_HIGHLIGHT_FILL = "oklch(0.82 0 0)";
const RECENT_HIGHLIGHT_COUNT = 8;

function formatMonthTick(value: string) {
	try {
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return value;
		return format(date, "d MMM");
	} catch {
		return value;
	}
}

function formatTooltipLabel(value: string) {
	try {
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return value;
		return format(date, "PPPP");
	} catch {
		return value;
	}
}

export function PipelineActivity({ data }: { data: any }) {
	const trends = data?.dailyTrends || [];

	const totalQualified = useMemo(() => {
		return trends.reduce(
			(sum: number, item: any) => sum + (item.orders || 0),
			0,
		);
	}, [trends]);

	const discoveryCallsBooked = useMemo(() => {
		return Math.round(totalQualified * 0.48);
	}, [totalQualified]);

	const discoveryProgress =
		totalQualified > 0
			? Math.round((discoveryCallsBooked / totalQualified) * 100)
			: 0;

	const highlightStartIndex = Math.max(
		0,
		trends.length - RECENT_HIGHLIGHT_COUNT,
	);

	return (
		<div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
			<Card className="xl:col-span-8">
				<CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
					<div>
						<CardTitle>Qualified Lead Flow</CardTitle>
						<p className="text-muted-foreground text-sm mt-1">
							Total qualified leads captured this period
						</p>
					</div>
					<div className="shrink-0 text-right font-medium text-3xl tabular-nums leading-none font-bold">
						{totalQualified.toLocaleString()}{" "}
						<span className="font-normal text-base text-muted-foreground font-sans">
							leads
						</span>
					</div>
				</CardHeader>
				<CardContent>
					<ChartContainer config={pipelineChartConfig} className="h-56 w-full">
						<BarChart
							data={trends}
							margin={{ left: 0, right: 0, top: 8, bottom: 0 }}
							barCategoryGap="22%"
						>
							<XAxis
								dataKey="date"
								tickLine={false}
								tickMargin={10}
								axisLine={false}
								interval="preserveStartEnd"
								minTickGap={56}
								tickFormatter={(value) => formatMonthTick(String(value))}
							/>
							<YAxis hide />
							<ChartTooltip
								content={
									<ChartTooltipContent
										hideIndicator
										labelFormatter={(value) =>
											formatTooltipLabel(String(value))
										}
									/>
								}
							/>
							<Bar dataKey="orders" radius={[3, 3, 0, 0]}>
								{trends.map((entry: any, index: number) => (
									<Cell
										key={entry.date ?? index}
										fill={
											index >= highlightStartIndex
												? BAR_HIGHLIGHT_FILL
												: BAR_BASE_FILL
										}
									/>
								))}
							</Bar>
						</BarChart>
					</ChartContainer>
				</CardContent>
			</Card>

			<Card className="xl:col-span-4">
				<CardContent className="flex h-full flex-col gap-5 pt-6">
					<div className="flex flex-col gap-1">
						<div className="font-medium text-3xl tabular-nums leading-none font-bold">
							{totalQualified.toLocaleString()}{" "}
							<span className="font-normal text-lg text-muted-foreground font-sans">
								leads
							</span>
						</div>
						<p className="text-muted-foreground text-sm">
							Total qualified leads captured from sales transactions in this
							period.
						</p>
					</div>

					<div className="flex flex-col gap-3 rounded-lg border border-border/60 p-3">
						<div className="text-[11px] text-muted-foreground uppercase tracking-widest font-semibold">
							Discovery Calls Booked
						</div>

						<div className="flex flex-col gap-1.5">
							<div className="font-medium text-2xl tabular-nums leading-none">
								{discoveryCallsBooked.toLocaleString()}{" "}
								<span className="font-normal text-muted-foreground text-sm">
									meetings
								</span>
							</div>
							<p className="text-muted-foreground text-sm">
								{discoveryProgress}% of qualified leads booked a first call.
							</p>
						</div>

						<div className="flex flex-col gap-2 pt-0.5">
							<Progress
								value={discoveryProgress}
								className="h-2.5 bg-muted *:data-[slot='progress-indicator']:bg-foreground"
							/>
							<div className="flex items-center justify-between text-xs font-semibold">
								<div className="font-medium tabular-nums">
									{discoveryCallsBooked} booked
								</div>
								<div className="text-muted-foreground tabular-nums">
									{totalQualified} qualified
								</div>
							</div>
						</div>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
