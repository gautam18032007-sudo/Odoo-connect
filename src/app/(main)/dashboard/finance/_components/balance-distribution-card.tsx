"use client";

import * as React from "react";
import { Label, Pie, PieChart } from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@/components/ui/chart";
import { formatCurrency } from "@/lib/utils";

const chartConfig = {
	amount: {
		label: "Sales Allocation",
	},
	KLJ: {
		color: "var(--chart-2)",
		label: "KLJ Store",
	},
	Smart_Works_Noida: {
		color: "var(--chart-4)",
		label: "Smart Works Noida",
	},
	Head_Office: {
		color: "var(--chart-1)",
		label: "Head office",
	},
} satisfies ChartConfig;

export function BalanceDistributionCard({ data }: { data: any }) {
	const storePerformance = data?.storePerformance || [];
	const currentTotalRevenue = data?.salesKpis?.revenue?.current || 0;

	// Process actual database store splits
	const chartData = React.useMemo(() => {
		if (storePerformance.length === 0 || currentTotalRevenue <= 0) {
			return [
				{
					account: "KLJ Store",
					amount: 0,
					key: "KLJ",
					percentage: 0,
					fill: "var(--chart-2)",
				},
				{
					account: "Smart Works Noida",
					amount: 0,
					key: "Smart_Works_Noida",
					percentage: 0,
					fill: "var(--chart-4)",
				},
				{
					account: "Head office",
					amount: 0,
					key: "Head_Office",
					percentage: 0,
					fill: "var(--chart-1)",
				},
			];
		}

		return storePerformance.map(
			(item: {
				storeDisplayName: string;
				billedBy: string;
				revenue: number;
			}) => {
				const share =
					currentTotalRevenue > 0
						? (item.revenue / currentTotalRevenue) * 100
						: 0;
				let key = "Head_Office";
				let fill = "var(--chart-1)";
				if (item.billedBy === "SmartworksNoida Noida") {
					key = "Smart_Works_Noida";
					fill = "var(--chart-4)";
				} else if (item.billedBy === "Klj store") {
					key = "KLJ";
					fill = "var(--chart-2)";
				}
				return {
					account: item.storeDisplayName,
					amount: Number(item.revenue),
					key,
					percentage: Number(share.toFixed(1)),
					fill,
				};
			},
		);
	}, [storePerformance, currentTotalRevenue]);

	return (
		<Card>
			<CardHeader>
				<CardTitle className="font-normal text-muted-foreground text-sm">
					Store Allocation Split
				</CardTitle>
			</CardHeader>

			<CardContent className="grid items-center gap-4 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)]">
				<ChartContainer
					config={chartConfig}
					className="mx-auto aspect-square h-50"
				>
					<PieChart>
						<ChartTooltip
							cursor={false}
							content={
								<ChartTooltipContent
									hideLabel
									className="w-52"
									nameKey="account"
								/>
							}
						/>
						<Pie
							cornerRadius={6}
							data={chartData}
							dataKey="amount"
							innerRadius={65}
							nameKey="account"
							outerRadius={90}
							paddingAngle={2}
							strokeWidth={5}
						>
							<Label
								content={({ viewBox }) => {
									if (!(viewBox && "cx" in viewBox && "cy" in viewBox)) {
										return null;
									}

									return (
										<text
											dominantBaseline="middle"
											textAnchor="middle"
											x={viewBox.cx}
											y={viewBox.cy}
										>
											<tspan
												className="fill-muted-foreground text-xs"
												x={viewBox.cx}
												y={(viewBox.cy ?? 0) - 8}
											>
												Total Sales
											</tspan>
											<tspan
												className="fill-foreground font-medium text-lg tabular-nums font-bold font-mono"
												x={viewBox.cx}
												y={(viewBox.cy ?? 0) + 14}
											>
												{formatCurrency(currentTotalRevenue, {
													noDecimals: true,
												})}
											</tspan>
										</text>
									);
								}}
							/>
						</Pie>
					</PieChart>
				</ChartContainer>

				<div className="flex min-w-0 flex-col gap-3">
					{chartData.map((item: any) => (
						<div
							className="grid grid-cols-[1fr_auto] items-end gap-3"
							key={item.key}
						>
							<div className="min-w-0">
								<div className="flex min-w-0 items-center gap-1">
									<span
										aria-hidden="true"
										className="h-2 w-1 rounded-full"
										style={{ backgroundColor: item.fill }}
									/>
									<p className="truncate text-muted-foreground text-xs">
										{item.account}
									</p>
								</div>
								<p className="font-medium tabular-nums font-mono">
									{formatCurrency(item.amount, { noDecimals: true })}
								</p>
							</div>
							<div className="font-medium tabular-nums font-mono">
								{item.percentage}%
							</div>
						</div>
					))}
				</div>
			</CardContent>
		</Card>
	);
}
