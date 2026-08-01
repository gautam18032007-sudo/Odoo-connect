"use client";

import { format } from "date-fns";
import {
	ArrowUpRight,
	DollarSign,
	PackageCheck,
	ReceiptText,
	RotateCcw,
	ShoppingBag,
	Users,
} from "lucide-react";
import {
	Area,
	Bar,
	CartesianGrid,
	ComposedChart,
	XAxis,
	YAxis,
} from "recharts";

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
	ChartTooltip,
	ChartTooltipContent,
} from "@/components/ui/chart";
import { formatSignedPercent, growthTextClass } from "@/lib/growth-ui";
import { formatCurrency } from "@/lib/utils";

const revenueOverviewConfig = {
	revenue: {
		label: "Revenue",
		color: "var(--foreground)",
	},
	profit: {
		label: "Profit",
		color: "var(--muted-foreground)",
	},
} satisfies ChartConfig;

function formatMonthTick(value: string) {
	try {
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return value;
		// Only display label for every few days or middle of the month to avoid overcrowding
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

export function KpiStrip({ data }: { data: any }) {
	const trends = data?.dailyTrends || [];
	const kpis = data?.salesKpis || {
		revenue: { current: 0, growth: 0 },
		billCuts: { current: 0, growth: 0 },
	};
	const aov = data?.aovKpi || { current: 0, growth: 0 };
	const customers = data?.customers || { current: 0, growth: 0 };

	return (
		<div className="h-full overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 xl:col-span-12">
			<div>
				<div className="grid grid-cols-1 xl:grid-cols-12">
					<div className="grid grid-cols-1 md:grid-cols-2 md:grid-rows-3 xl:col-span-5 xl:border-r">
						<Card className="h-full rounded-none border-0 border-border border-b ring-0 md:border-r">
							<CardHeader>
								<CardTitle className="font-normal text-sm">
									Total Sales
								</CardTitle>
								<CardDescription className="text-3xl text-foreground tabular-nums leading-none tracking-tight">
									{formatCurrency(kpis.revenue.current)}
								</CardDescription>
								<CardAction className="grid size-6 place-items-center rounded-sm bg-muted">
									<DollarSign className="size-3 text-foreground" />
								</CardAction>
							</CardHeader>
							<CardContent>
								<div className="text-sm">
									<span className={growthTextClass(kpis.revenue.growth)}>
										{formatSignedPercent(kpis.revenue.growth)}
									</span>
									<span className="text-muted-foreground"> vs last period</span>
								</div>
							</CardContent>
						</Card>

						<Card className="h-full rounded-none border-0 border-border border-b ring-0">
							<CardHeader>
								<CardTitle className="font-normal text-sm">
									Total Orders
								</CardTitle>
								<CardDescription className="text-3xl text-foreground tabular-nums leading-none tracking-tight">
									{kpis.billCuts.current.toLocaleString()}
								</CardDescription>
								<CardAction className="grid size-6 place-items-center rounded-sm bg-muted">
									<ShoppingBag className="size-3 text-foreground" />
								</CardAction>
							</CardHeader>
							<CardContent>
								<div className="text-sm">
									<span className={growthTextClass(kpis.billCuts.growth)}>
										{formatSignedPercent(kpis.billCuts.growth)}
									</span>
									<span className="text-muted-foreground"> vs last period</span>
								</div>
							</CardContent>
						</Card>

						<Card className="h-full rounded-none border-0 border-border border-b ring-0 md:border-r">
							<CardHeader>
								<CardTitle className="font-normal text-sm">
									Customer Growth
								</CardTitle>
								<CardDescription className="text-3xl text-foreground tabular-nums leading-none tracking-tight">
									{customers.current.toLocaleString()}
								</CardDescription>
								<CardAction className="grid size-6 place-items-center rounded-sm bg-muted">
									<Users className="size-3 text-foreground" />
								</CardAction>
							</CardHeader>
							<CardContent>
								<div className="text-sm">
									<span className={growthTextClass(customers.growth)}>
										{formatSignedPercent(customers.growth)}
									</span>
									<span className="text-muted-foreground"> vs last period</span>
								</div>
							</CardContent>
						</Card>

						<Card className="h-full rounded-none border-0 border-border border-b ring-0">
							<CardHeader>
								<CardTitle className="font-normal text-sm">
									Average Order
								</CardTitle>
								<CardDescription className="text-3xl text-foreground tabular-nums leading-none tracking-tight">
									{formatCurrency(aov.current)}
								</CardDescription>
								<CardAction className="grid size-6 place-items-center rounded-sm bg-muted">
									<ReceiptText className="size-3 text-foreground" />
								</CardAction>
							</CardHeader>
							<CardContent>
								<div className="text-sm">
									<span className={growthTextClass(aov.growth)}>
										{formatSignedPercent(aov.growth)}
									</span>
									<span className="text-muted-foreground"> vs last period</span>
								</div>
							</CardContent>
						</Card>

						<Card className="h-full rounded-none border-0 border-border border-b ring-0 md:border-r md:border-b-0">
							<CardHeader>
								<CardTitle className="font-normal text-sm">
									Return Requests
								</CardTitle>
								<CardDescription className="text-3xl text-foreground tabular-nums leading-none tracking-tight">
									18
								</CardDescription>
								<CardAction className="grid size-6 place-items-center rounded-sm bg-muted">
									<RotateCcw className="size-3 text-foreground" />
								</CardAction>
							</CardHeader>
							<CardContent>
								<div className="text-sm">
									<span className="text-green-700 dark:text-green-300">
										+0.6%
									</span>
									<span className="text-muted-foreground"> vs last period</span>
								</div>
							</CardContent>
						</Card>

						<Card className="h-full rounded-none border-0 ring-0">
							<CardHeader>
								<CardTitle className="font-normal text-sm">
									Stock Accuracy
								</CardTitle>
								<CardDescription className="text-3xl text-foreground tabular-nums leading-none tracking-tight">
									97%
								</CardDescription>
								<CardAction className="grid size-6 place-items-center rounded-sm bg-muted">
									<PackageCheck className="size-3 text-foreground" />
								</CardAction>
							</CardHeader>
							<CardContent>
								<div className="text-sm">
									<span className="text-green-700 dark:text-green-300">
										+2.4 pts
									</span>
									<span className="text-muted-foreground"> vs last audit</span>
								</div>
							</CardContent>
						</Card>
					</div>

					<Card className="h-full rounded-none border-0 ring-0 xl:col-span-7">
						<CardHeader>
							<CardTitle className="font-normal">Sales Overview</CardTitle>
							<CardAction>
								<ArrowUpRight className="size-4" />
							</CardAction>
						</CardHeader>

						<CardContent>
							<ChartContainer
								config={revenueOverviewConfig}
								className="h-74 w-full"
							>
								<ComposedChart
									accessibilityLayer
									data={trends}
									margin={{ bottom: 0, left: 0, right: 0, top: 0 }}
								>
									<defs>
										<filter
											id="sales-line-glow"
											x="-20%"
											y="-20%"
											width="140%"
											height="140%"
										>
											<feGaussianBlur stdDeviation="4" result="blur" />
											<feFlood
												floodColor="var(--color-revenue)"
												floodOpacity="0.35"
											/>
											<feComposite in2="blur" operator="in" />
											<feMerge>
												<feMergeNode />
												<feMergeNode in="SourceGraphic" />
											</feMerge>
										</filter>
									</defs>
									<CartesianGrid yAxisId="profit" vertical={false} />
									<XAxis
										dataKey="date"
										axisLine={false}
										height={30}
										interval="preserveEnd"
										tick={{ fontSize: 10 }}
										tickLine={false}
										tickMargin={8}
										tickFormatter={(value) => formatMonthTick(String(value))}
									/>
									<YAxis yAxisId="revenue" hide />
									<YAxis yAxisId="profit" hide />
									<ChartTooltip
										content={
											<ChartTooltipContent
												className="w-40"
												labelFormatter={(value) =>
													formatTooltipLabel(String(value))
												}
												formatter={(value, name, item) => (
													<>
														<div
															className="size-2.5 shrink-0 rounded-[2px]"
															style={{
																backgroundColor: item.color,
															}}
														/>
														<div className="flex flex-1 items-center justify-between leading-none">
															<span className="text-muted-foreground">
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
										cursor={{
											stroke: "var(--border)",
											strokeDasharray: "4 4",
										}}
									/>
									<Bar
										yAxisId="profit"
										barSize={4}
										dataKey="profit"
										fill="var(--color-profit)"
										name="Profit"
										opacity={0.18}
										radius={[6, 6, 0, 0]}
									/>
									<Area
										yAxisId="revenue"
										dataKey="revenue"
										fill="none"
										filter="url(#sales-line-glow)"
										name="Revenue"
										stroke="var(--color-revenue)"
										strokeWidth={1.8}
										type="monotone"
										activeDot={{
											r: 4,
											fill: "var(--background)",
											stroke: "var(--color-revenue)",
											strokeWidth: 2,
										}}
										dot={false}
									/>
								</ComposedChart>
							</ChartContainer>
						</CardContent>
					</Card>
				</div>
			</div>
		</div>
	);
}
