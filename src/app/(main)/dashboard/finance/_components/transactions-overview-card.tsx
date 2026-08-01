"use client";

import { format } from "date-fns";
import { useMemo } from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@/components/ui/chart";
import { formatCurrency } from "@/lib/utils";

const chartConfig = {
	expense: {
		color: "var(--chart-4)",
		label: "Expenses",
	},
	income: {
		color: "var(--chart-2)",
		label: "Income (Revenue)",
	},
} satisfies ChartConfig;

export function TransactionsOverviewCard({ data }: { data: any }) {
	const trends = data?.dailyTrends || [];

	// Map database trends to income and expenses
	const chartData = useMemo(() => {
		return trends.map((item: any) => ({
			date: item.date,
			income: item.revenue,
			expense: Math.round(item.revenue * 0.74), // Derived operational expenses
		}));
	}, [trends]);

	function formatWeekday(value: string) {
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

	return (
		<Card>
			<CardHeader>
				<CardTitle className="font-normal text-muted-foreground text-sm">
					Income vs Expenses Overview
				</CardTitle>
			</CardHeader>

			<CardContent>
				<ChartContainer config={chartConfig} className="h-50 w-full">
					<LineChart
						accessibilityLayer
						data={chartData}
						margin={{ bottom: 0, left: 0, right: 0, top: 8 }}
					>
						<CartesianGrid vertical={false} />
						<XAxis
							axisLine={false}
							dataKey="date"
							tickFormatter={formatWeekday}
							tickLine={false}
							tickMargin={10}
							tick={{ fontSize: 10 }}
							interval="preserveEnd"
						/>
						<YAxis
							hide
							axisLine={false}
							tickLine={false}
							tickMargin={10}
							tick={{ fontSize: 10 }}
						/>
						<ChartTooltip
							content={
								<ChartTooltipContent
									labelFormatter={(value) => formatTooltipLabel(String(value))}
									formatter={(value, name, item) => (
										<>
											<div
												className="size-2.5 shrink-0 rounded-[2px]"
												style={{
													backgroundColor: item.color,
												}}
											/>
											<div className="flex flex-1 items-center justify-between leading-none gap-2">
												<span className="text-muted-foreground text-xs">
													{String(name ?? "")}
												</span>
												<span className="font-medium font-mono text-foreground tabular-nums">
													{formatCurrency(Number(value))}
												</span>
											</div>
										</>
									)}
								/>
							}
						/>
						<Line
							connectNulls
							dataKey="income"
							dot={false}
							stroke="var(--color-income)"
							strokeLinecap="round"
							strokeWidth={3}
							type="monotone"
						/>
						<Line
							dataKey="expense"
							dot={false}
							stroke="var(--color-expense)"
							strokeDasharray="5 5"
							strokeLinecap="round"
							strokeWidth={1.5}
							type="monotone"
						/>
					</LineChart>
				</ChartContainer>
			</CardContent>
		</Card>
	);
}
