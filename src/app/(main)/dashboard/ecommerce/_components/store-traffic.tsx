"use client";

import { format } from "date-fns";
import { ArrowUpRight } from "lucide-react";
import { useMemo } from "react";
import { Area, AreaChart, CartesianGrid, Line, XAxis, YAxis } from "recharts";

import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	type ChartConfig,
	ChartContainer,
	ChartLegend,
	ChartLegendContent,
	ChartTooltip,
	ChartTooltipContent,
} from "@/components/ui/chart";

const trafficConfig = {
	orders: {
		label: "Orders",
		color: "var(--chart-3)",
	},
	units: {
		label: "Units Sold",
		color: "var(--destructive)",
	},
} satisfies ChartConfig;

function formatTrafficTooltipLabel(value: string) {
	try {
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return value;
		return format(date, "do MMMM yyyy");
	} catch {
		return value;
	}
}

export function StoreTraffic({ data }: { data: any }) {
	const trends = data?.dailyTrends || [];
	const totalOrders = useMemo(() => {
		return trends.reduce(
			(acc: number, curr: any) => acc + (curr.orders || 0),
			0,
		);
	}, [trends]);

	const _firstTimestamp = trends[0]?.date || "";
	const _lastTimestamp = trends.at(-1)?.date || "";

	function formatTrafficTick(value: string) {
		try {
			const date = new Date(value);
			if (Number.isNaN(date.getTime())) return value;
			return format(date, "d MMM");
		} catch {
			return value;
		}
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle className="font-normal text-muted-foreground text-sm">
					Store Transaction Volume
				</CardTitle>
				<CardDescription className="text-foreground text-xl tabular-nums leading-none tracking-tight">
					{totalOrders.toLocaleString()} orders
				</CardDescription>
				<CardAction>
					<ArrowUpRight className="size-4" />
				</CardAction>
			</CardHeader>

			<CardContent>
				<ChartContainer config={trafficConfig} className="h-54 w-full">
					<AreaChart
						accessibilityLayer
						data={trends}
						margin={{ bottom: 0, left: 0, right: 0, top: 8 }}
					>
						<defs>
							<linearGradient id="fillOrders" x1="0" x2="0" y1="0" y2="1">
								<stop
									offset="5%"
									stopColor="var(--color-orders)"
									stopOpacity={0.28}
								/>
								<stop
									offset="95%"
									stopColor="var(--color-orders)"
									stopOpacity={0.02}
								/>
							</linearGradient>
						</defs>
						<CartesianGrid vertical={false} />
						<XAxis
							axisLine={false}
							dataKey="date"
							tick={{ fontSize: 10 }}
							tickFormatter={formatTrafficTick}
							tickLine={false}
							tickMargin={10}
							interval="preserveEnd"
						/>
						<YAxis
							axisLine={false}
							tickLine={false}
							tickMargin={6}
							width={36}
						/>
						<ChartTooltip
							content={
								<ChartTooltipContent
									labelFormatter={(value) =>
										formatTrafficTooltipLabel(String(value))
									}
								/>
							}
							cursor={{ stroke: "var(--border)", strokeDasharray: "4 4" }}
						/>
						<ChartLegend
							align="right"
							verticalAlign="top"
							className="justify-end"
							content={<ChartLegendContent />}
						/>
						<Area
							dataKey="orders"
							dot={false}
							fill="url(#fillOrders)"
							stroke="var(--color-orders)"
							strokeWidth={2}
							type="monotone"
						/>
						<Line
							dataKey="units"
							dot={false}
							stroke="var(--color-units)"
							strokeLinecap="round"
							strokeWidth={1.2}
							type="monotone"
						/>
					</AreaChart>
				</ChartContainer>
			</CardContent>
		</Card>
	);
}
