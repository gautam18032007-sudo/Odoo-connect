"use client";

import { format } from "date-fns";
import {
	BarChart3,
	DollarSign,
	HelpCircle,
	RefreshCw,
	Star,
	TrendingUp,
	Upload,
	Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { GlobalFilterBar } from "@/components/founder/global-filter-bar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MetricCard } from "@/components/ui/metric-card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useCAC } from "@/hooks/useCAC";
import { formatCurrency } from "@/lib/utils";

export default function CACPage() {
	const router = useRouter();
	const [status, setStatus] = useState<any>(null);

	useEffect(() => {
		const fetchStatus = async () => {
			try {
				const res = await fetch("/api/sales/status");
				const json = await res.json();
				if (json.success) {
					setStatus(json.data);
				}
			} catch (err) {
				console.error("Failed to fetch status", err);
			}
		};
		fetchStatus();
	}, []);

	const hasData = status?.hasData ?? false;
	const { data, isLoading } = useCAC(hasData);

	const spend = data?.totalSpend;
	const newCust = data?.newCustomers;
	const cac = data?.cac;
	const ratio = data?.ltvCacRatio;
	const payback = data?.paybackPeriod;

	// Calculate ratio status
	const ratioRating = useMemo(() => {
		if (!ratio)
			return {
				label: "Unknown",
				color: "text-gray-500",
				bg: "bg-gray-500/10 border-gray-500/20",
			};
		const score = ratio.current;
		if (score < 1.0) {
			return {
				label: "Dangerous (Losing Money)",
				color: "text-rose-500",
				bg: "bg-rose-500/10 border-rose-500/20",
			};
		}
		if (score < 3.0) {
			return {
				label: "Average Growth",
				color: "text-amber-500",
				bg: "bg-amber-500/10 border-amber-500/20",
			};
		}
		if (score < 5.0) {
			return {
				label: "Healthy Expansion",
				color: "text-emerald-500",
				bg: "bg-emerald-500/10 border-emerald-500/20",
			};
		}
		return {
			label: "Excellent Performance",
			color: "text-blue-500",
			bg: "bg-blue-500/10 border-blue-500/20",
		};
	}, [ratio]);

	if (!status) {
		return (
			<div className="p-8">
				<Skeleton className="h-[400px] w-full animate-pulse" />
			</div>
		);
	}

	if (!status.hasData) {
		return (
			<div className="flex flex-col items-center justify-center min-h-[60vh] p-4 text-center space-y-6">
				<div className="bg-muted/30 p-8 rounded-full">
					<BarChart3 className="size-20 text-muted-foreground" />
				</div>
				<div className="max-w-md space-y-2">
					<h2 className="text-2xl font-bold">Welcome to ZenZebra</h2>
					<p className="text-muted-foreground">
						No data has been uploaded yet. Upload your first daily sales sheet
						to unlock insights.
					</p>
				</div>
				<Button
					size="lg"
					onClick={() => router.push("/dashboard/sales/upload")}
				>
					<Upload className="mr-2 size-5" />
					Upload Sales Data
				</Button>
			</div>
		);
	}

	const formattedDate = format(new Date(), "EEEE, do MMMM yyyy");

	return (
		<div className="flex flex-col gap-6 p-4 md:p-8 pt-4">
			{/* Title Section */}
			<div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
				<div className="flex flex-col gap-1">
					<h1 className="text-3xl font-bold leading-none tracking-tight">
						CAC Analysis
					</h1>
					<p className="text-muted-foreground text-sm">{formattedDate}</p>
				</div>
				<div className="flex items-center gap-3">
					<Button
						variant="outline"
						onClick={() => router.push("/dashboard/sales/upload")}
					>
						<Upload className="mr-2 size-4" />
						Upload Data
					</Button>
				</div>
			</div>

			<GlobalFilterBar
				availableCategories={status.availableCategories || []}
				availableBrands={status.availableBrands || []}
			/>

			{isLoading || !data ? (
				<div className="grid gap-6 grid-cols-1 md:grid-cols-3 mt-2">
					<Skeleton className="h-[120px] rounded-2xl" />
					<Skeleton className="h-[120px] rounded-2xl" />
					<Skeleton className="h-[120px] rounded-2xl" />
					<Skeleton className="h-[250px] md:col-span-3 rounded-2xl" />
				</div>
			) : (
				<div className="flex flex-col gap-6">
					{/* KPI Card Grid */}
					<div className="grid gap-4 grid-cols-1 md:grid-cols-3">
						<MetricCard
							title="Total Marketing Spend"
							value={formatCurrency(spend?.current || 0, { noDecimals: true })}
							growth={spend?.growth}
							comparisonLabel="vs last period"
							icon={DollarSign}
						/>
						<MetricCard
							title="New Customers Count"
							value={newCust?.current?.toLocaleString() || 0}
							growth={newCust?.growth}
							comparisonLabel="vs last period"
							icon={Users}
						/>
						<MetricCard
							title="Customer Acquisition Cost"
							value={formatCurrency(cac?.current || 0, { noDecimals: true })}
							growth={cac?.growth}
							comparisonLabel="Spend / New Customers"
							icon={TrendingUp}
						/>
					</div>

					{/* Hero Cards Section */}
					<div className="grid gap-6 grid-cols-1 md:grid-cols-2">
						{/* LTV:CAC Ratio Card */}
						<Card className="border-white/10 bg-white/5 dark:bg-black/20 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.08)] flex flex-col justify-between p-6">
							<div className="space-y-4">
								<div className="flex items-center justify-between">
									<h2 className="text-lg font-bold flex items-center gap-2">
										LTV:CAC Ratio
										<TooltipProvider>
											<Tooltip>
												<TooltipTrigger asChild>
													<HelpCircle className="size-4 text-muted-foreground cursor-pointer" />
												</TooltipTrigger>
												<TooltipContent className="max-w-xs p-3 text-xs">
													<p>
														Calculates how much value a customer returns
														relative to the cost to acquire them. A standard
														healthy target is <strong>3x or greater</strong>.
													</p>
												</TooltipContent>
											</Tooltip>
										</TooltipProvider>
									</h2>
									<Star className="size-5 text-amber-500 fill-amber-500/20" />
								</div>

								<div className="flex items-baseline gap-2 mt-2">
									<span className="text-5xl font-black font-mono tracking-tight text-foreground">
										{ratio?.current}x
									</span>
									<div
										className={`px-2.5 py-0.5 rounded-full border text-xs font-semibold ${ratioRating.bg} ${ratioRating.color}`}
									>
										{ratioRating.label}
									</div>
								</div>

								<p className="text-xs text-muted-foreground leading-relaxed">
									A ratio of {ratio?.current}x indicates that every rupee
									invested in customer acquisition yields {ratio?.current}{" "}
									rupees in lifetime sales value.
								</p>
							</div>

							<div className="space-y-2 mt-6 pt-4 border-t border-white/5">
								<div className="flex justify-between text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
									<span>Dangerous (&lt;1x)</span>
									<span>Average (1-3x)</span>
									<span>Healthy (3-5x)</span>
									<span>Excellent (&gt;5x)</span>
								</div>
								<Progress
									value={Math.min(100, ((ratio?.current || 0) / 6) * 100)}
									className="h-2 bg-white/5"
								/>
							</div>
						</Card>

						{/* Payback Period Card */}
						<Card className="border-white/10 bg-white/5 dark:bg-black/20 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.08)] flex flex-col justify-between p-6">
							<div className="space-y-4">
								<div className="flex items-center justify-between">
									<h2 className="text-lg font-bold flex items-center gap-2">
										Acquisition Cost Payback
										<TooltipProvider>
											<Tooltip>
												<TooltipTrigger asChild>
													<HelpCircle className="size-4 text-muted-foreground cursor-pointer" />
												</TooltipTrigger>
												<TooltipContent className="max-w-xs p-3 text-xs">
													<p>
														The average duration in months required for a
														customer to generate sufficient gross margins to
														fully recoup their customer acquisition cost.
													</p>
												</TooltipContent>
											</Tooltip>
										</TooltipProvider>
									</h2>
									<RefreshCw className="size-5 text-blue-500" />
								</div>

								<div className="flex items-baseline gap-2 mt-2">
									<span className="text-5xl font-black font-mono tracking-tight text-foreground">
										{payback?.current}
									</span>
									<span className="text-sm font-semibold text-muted-foreground">
										Months
									</span>
								</div>

								<p className="text-xs text-muted-foreground leading-relaxed">
									ZenZebra recovers the ₹{cac?.current} acquisition cost in
									exactly {payback?.current} months, after which the customer is
									contributing net positive profits to operations.
								</p>
							</div>

							<div className="mt-6 pt-4 border-t border-white/5 bg-blue-500/5 rounded-xl p-3 text-[11px] text-blue-600 dark:text-blue-400">
								<strong>Optimization insight:</strong> Decreasing customer
								acquisition costs or improving repeat frequency will shorten the
								payback threshold.
							</div>
						</Card>
					</div>
				</div>
			)}
		</div>
	);
}
