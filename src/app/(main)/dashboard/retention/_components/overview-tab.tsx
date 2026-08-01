"use client";

import { Coins, Layers, TrendingUp, Users } from "lucide-react";
import { useMemo } from "react";
import {
	CartesianGrid,
	Tooltip as ChartTooltip,
	Legend,
	Line,
	LineChart,
	ResponsiveContainer,
	XAxis,
	YAxis,
} from "recharts";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { MetricCard } from "@/components/ui/metric-card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { useLTV } from "@/hooks/useLTV";
import { formatCurrency } from "@/lib/utils";

export function OverviewTab({ hasData }: { hasData: boolean }) {
	const { data, isLoading } = useLTV(hasData);
	const overview = data?.overview;
	const trend = data?.trend || [];
	const topCustomers = data?.topCustomers || [];

	const summaryStats = useMemo(() => {
		if (!overview) {
			return { avgLtv: 0, avgAov: 0, cac: 0, ratio: "0:1" };
		}

		return {
			avgLtv: Math.round(overview.ltv?.current || 0),
			avgAov: Math.round(overview.avgAov?.current || 0),
			cac: Math.round(overview.cac?.current || 0),
			ratio: `${overview.ltvCacRatio?.current || 0}:1`,
		};
	}, [overview]);

	return (
		<div className="flex flex-col gap-6">
			<div className="grid gap-4 md:grid-cols-3">
				<MetricCard
					title="Average AOV"
					value={formatCurrency(summaryStats.avgAov, { noDecimals: true })}
					growth={overview?.avgAov?.growth}
					comparisonLabel="Average ticket size"
					icon={Coins}
				/>
				<MetricCard
					title="Average LTV"
					value={formatCurrency(summaryStats.avgLtv, { noDecimals: true })}
					growth={overview?.ltv?.growth}
					comparisonLabel="Lifetime value per customer"
					icon={TrendingUp}
				/>
				<MetricCard
					title="Average CAC"
					value={formatCurrency(summaryStats.cac, { noDecimals: true })}
					growth={overview?.cac?.growth}
					comparisonLabel="Cost to acquire a new customer"
					icon={Users}
				/>
			</div>

			<div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr] items-stretch">
				<Card className="xl:col-span-1 border-[0.5px] border-zinc-800 bg-zinc-950 rounded-[12px] shadow-none">
					<CardHeader>
						<CardTitle className="text-lg text-zinc-100 font-mono">
							LTV / AOV / CAC Trend
						</CardTitle>
						<CardDescription className="text-zinc-500">
							Track how customer value and acquisition efficiency are moving
							across the selected period.
						</CardDescription>
					</CardHeader>
					<CardContent className="h-[300px] pb-4">
						{trend.length === 0 ? (
							<div className="flex h-full items-center justify-center text-xs text-zinc-500">
								No monthly trend data is available yet.
							</div>
						) : (
							<ResponsiveContainer width="100%" height="100%">
								<LineChart
									data={trend}
									margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
								>
									<CartesianGrid
										strokeDasharray="3 3"
										stroke="#27272a"
										vertical={false}
									/>
									<XAxis
										dataKey="monthLabel"
										stroke="#71717a"
										tickLine={false}
										axisLine={false}
										style={{ fontSize: 11 }}
									/>
									<YAxis
										stroke="#71717a"
										tickLine={false}
										axisLine={false}
										style={{ fontSize: 11 }}
									/>
									<ChartTooltip
										contentStyle={{
											backgroundColor: "#09090b",
											borderColor: "#27272a",
											borderRadius: "8px",
											color: "#f4f4f5",
											fontSize: "11px",
										}}
										formatter={(value) => [
											formatCurrency(Number(value), { noDecimals: true }),
											"Value",
										]}
									/>
									<Legend
										verticalAlign="top"
										height={36}
										wrapperStyle={{ fontSize: 11, color: "#a1a1aa" }}
									/>
									<Line
										type="monotone"
										name="LTV"
										dataKey="ltv"
										stroke="#f4f4f5"
										strokeWidth={2}
										dot={{ r: 3, strokeWidth: 0, fill: "#f4f4f5" }}
									/>
									<Line
										type="monotone"
										name="AOV"
										dataKey="aov"
										stroke="#71717a"
										strokeWidth={2}
										dot={{ r: 3, strokeWidth: 0, fill: "#71717a" }}
									/>
									<Line
										type="monotone"
										name="CAC"
										dataKey="cac"
										stroke="#e66767"
										strokeWidth={2}
										dot={{ r: 3, strokeWidth: 0, fill: "#e66767" }}
									/>
								</LineChart>
							</ResponsiveContainer>
						)}
					</CardContent>
				</Card>

				<Card className="xl:col-span-1 border-[0.5px] border-zinc-800 bg-zinc-950 rounded-[12px] shadow-none">
					<CardHeader>
						<CardTitle className="text-lg text-zinc-100 font-mono flex items-center gap-2">
							<Layers className="size-4 text-zinc-400" />
							LTV:CAC Relationship
						</CardTitle>
						<CardDescription className="text-zinc-500">
							Relationship between acquisition cost, order value and long-term
							customer value.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
							<div className="text-xs uppercase tracking-[0.2em] text-zinc-500 font-mono">
								Current ratio
							</div>
							<div className="mt-2 text-3xl font-semibold text-white font-mono">
								{summaryStats.ratio}
							</div>
							<div className="mt-2 text-sm text-zinc-500">
								CAC → First purchase → AOV → Repeat purchase → LTV
							</div>
						</div>
						<div className="rounded-xl border border-zinc-800 p-4 text-sm text-zinc-500">
							<div className="font-medium text-zinc-200">Status</div>
							<div className="mt-2 flex items-center gap-2">
								<span
									className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${Number(summaryStats.ratio.split(":")[0]) >= 3 ? "bg-emerald-500/10 text-emerald-500" : "bg-amber-500/10 text-amber-500"}`}
								>
									{Number(summaryStats.ratio.split(":")[0]) >= 3
										? "Excellent"
										: "Healthy"}
								</span>
								<span>
									Customer value is creating a healthy return on acquisition
									spend.
								</span>
							</div>
						</div>
					</CardContent>
				</Card>
			</div>

			<div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr] items-stretch">
				<Card className="border-[0.5px] border-zinc-800 bg-zinc-950 rounded-[12px] shadow-none">
					<CardHeader>
						<CardTitle className="text-lg text-zinc-100 font-mono">
							Customer Analytics
						</CardTitle>
						<CardDescription className="text-zinc-500">
							High-value customers with their order count, revenue, AOV and LTV.
						</CardDescription>
					</CardHeader>
					<CardContent className="p-0">
						<div className="overflow-x-auto">
							<Table>
								<TableHeader>
									<TableRow className="border-b border-zinc-900 hover:bg-transparent">
										<TableHead className="text-xs py-3 pl-4 text-zinc-500">
											Customer
										</TableHead>
										<TableHead className="text-xs py-3 text-right text-zinc-500">
											Orders
										</TableHead>
										<TableHead className="text-xs py-3 text-right text-zinc-500">
											Revenue
										</TableHead>
										<TableHead className="text-xs py-3 text-right text-zinc-500">
											AOV
										</TableHead>
										<TableHead className="text-xs py-3 text-right text-zinc-500">
											LTV
										</TableHead>
										<TableHead className="text-xs py-3 text-right pr-4 text-zinc-500">
											Status
										</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{topCustomers.slice(0, 8).map((customer: any) => {
										const status =
											customer.retentionScore >= 70
												? "VIP"
												: customer.retentionScore >= 40
													? "Loyal"
													: customer.customerType === "New"
														? "New"
														: "Standard";
										return (
											<TableRow
												key={customer.customerMobile}
												className="border-b border-zinc-900 hover:bg-zinc-900/40"
											>
												<TableCell className="py-3 pl-4">
													<div className="text-xs font-semibold text-zinc-200">
														{customer.customerName}
													</div>
													<div className="text-[10px] text-zinc-500">
														{customer.customerMobile}
													</div>
												</TableCell>
												<TableCell className="py-3 text-right font-mono text-xs text-zinc-300">
													{customer.orders ?? 0}
												</TableCell>
												<TableCell className="py-3 text-right font-mono text-xs text-zinc-300">
													{formatCurrency(customer.revenue ?? 0, {
														noDecimals: true,
													})}
												</TableCell>
												<TableCell className="py-3 text-right font-mono text-xs text-zinc-300">
													{formatCurrency(customer.aov ?? 0, {
														noDecimals: true,
													})}
												</TableCell>
												<TableCell className="py-3 text-right font-mono text-xs text-white font-semibold">
													{formatCurrency(customer.ltv ?? 0, {
														noDecimals: true,
													})}
												</TableCell>
												<TableCell className="py-3 text-right pr-4">
													<span
														className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-medium ${status === "VIP" ? "bg-white/10 text-zinc-100" : status === "Loyal" ? "bg-emerald-500/10 text-emerald-500" : status === "New" ? "bg-zinc-500/15 text-zinc-400" : "bg-zinc-800 text-zinc-500"}`}
													>
														{status}
													</span>
												</TableCell>
											</TableRow>
										);
									})}
								</TableBody>
							</Table>
						</div>
					</CardContent>
				</Card>

				<Card className="border-[0.5px] border-zinc-800 bg-zinc-950 rounded-[12px] shadow-none">
					<CardHeader>
						<CardTitle className="text-lg text-zinc-100 font-mono">
							AOV Stability
						</CardTitle>
						<CardDescription className="text-zinc-500">
							Customer spending behaviour and whether their AOV is stable,
							growing or declining.
						</CardDescription>
					</CardHeader>
					<CardContent className="p-0">
						<div className="overflow-x-auto">
							<Table>
								<TableHeader>
									<TableRow className="border-b border-zinc-900 hover:bg-transparent">
										<TableHead className="text-xs py-3 pl-4 text-zinc-500">
											Customer
										</TableHead>
										<TableHead className="text-xs py-3 text-right text-zinc-500">
											Latest AOV
										</TableHead>
										<TableHead className="text-xs py-3 text-right pr-4 text-zinc-500">
											Stability
										</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{topCustomers.slice(0, 6).map((customer: any) => (
										<TableRow
											key={customer.customerMobile}
											className="border-b border-zinc-900 hover:bg-zinc-900/40"
										>
											<TableCell className="py-3 pl-4">
												<div className="text-xs font-semibold text-zinc-200">
													{customer.customerName}
												</div>
											</TableCell>
											<TableCell className="py-3 text-right font-mono text-xs text-zinc-300">
												{formatCurrency(customer.aov ?? 0, {
													noDecimals: true,
												})}
											</TableCell>
											<TableCell className="py-3 text-right pr-4">
												<span
													className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-medium ${customer.aovStability === "Increasing" ? "bg-emerald-500/10 text-emerald-500" : customer.aovStability === "Decreasing" ? "bg-rose-500/10 text-rose-500" : "bg-zinc-500/15 text-zinc-400"}`}
												>
													{customer.aovStability ?? "Stable"}
												</span>
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
