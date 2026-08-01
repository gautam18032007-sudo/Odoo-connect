"use client";

import { format } from "date-fns";
import { BarChart3, HelpCircle, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { GlobalFilterBar } from "@/components/founder/global-filter-bar";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useCohorts } from "@/hooks/useCohorts";
import { formatCurrency } from "@/lib/utils";

type CohortMetricType = "retention" | "revenue" | "aov" | "billCuts";

export default function CohortsPage() {
	const router = useRouter();
	const [status, setStatus] = useState<any>(null);
	const [selectedMetric, setSelectedMetric] =
		useState<CohortMetricType>("retention");

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
	const { data, isLoading } = useCohorts(hasData);

	// Calculate maximum values for color scaling in the heatmap
	const limits = useMemo(() => {
		if (!data || data.length === 0)
			return { maxRevenue: 1, maxAov: 1, maxBillCuts: 1 };

		let maxRevenue = 1;
		let maxAov = 1;
		let maxBillCuts = 1;

		for (const cohort of data) {
			for (const m of cohort.months) {
				if (m.revenue > maxRevenue) maxRevenue = m.revenue;
				if (m.aov > maxAov) maxAov = m.aov;
				if (m.billCuts > maxBillCuts) maxBillCuts = m.billCuts;
			}
		}

		return { maxRevenue, maxAov, maxBillCuts };
	}, [data]);

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

	// Helper to render cohort cell styled appropriately
	const renderCell = (_cohortCustomers: number, m: any) => {
		if (!m || m.activeCustomers === 0) {
			return (
				<TableCell
					key={m?.monthIndex ?? Math.random()}
					className="text-center text-muted-foreground/30 font-mono text-[11px] p-2 md:p-3 border-r border-white/5 bg-black/5 dark:bg-white/5"
				>
					-
				</TableCell>
			);
		}

		let valueText = "";
		let _bgClass = "";
		let textStyle = {};

		if (selectedMetric === "retention") {
			const pct = m.retentionPct;
			valueText = `${pct}%`;
			// Retention always maps from 0 to 100
			const opacity = Math.min(1, Math.max(0.02, pct / 100));
			_bgClass = "bg-blue-500/20 text-blue-600 dark:text-blue-400";
			textStyle = {
				backgroundColor: `rgba(59, 130, 246, ${opacity * 0.45})`,
				color: opacity > 0.6 ? "var(--foreground)" : "var(--muted-foreground)",
				fontWeight: opacity > 0.5 ? "600" : "500",
			};
		} else if (selectedMetric === "revenue") {
			valueText = formatCurrency(m.revenue, { noDecimals: true });
			const opacity = Math.min(
				1,
				Math.max(0.02, m.revenue / limits.maxRevenue),
			);
			_bgClass = "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400";
			textStyle = {
				backgroundColor: `rgba(16, 185, 129, ${opacity * 0.45})`,
				color: opacity > 0.6 ? "var(--foreground)" : "var(--muted-foreground)",
				fontWeight: opacity > 0.5 ? "600" : "500",
			};
		} else if (selectedMetric === "aov") {
			valueText = formatCurrency(m.aov, { noDecimals: true });
			const opacity = Math.min(1, Math.max(0.02, m.aov / limits.maxAov));
			_bgClass = "bg-indigo-500/20 text-indigo-600 dark:text-indigo-400";
			textStyle = {
				backgroundColor: `rgba(99, 102, 241, ${opacity * 0.45})`,
				color: opacity > 0.6 ? "var(--foreground)" : "var(--muted-foreground)",
				fontWeight: opacity > 0.5 ? "600" : "500",
			};
		} else if (selectedMetric === "billCuts") {
			valueText = `${m.billCuts}x`;
			const opacity = Math.min(
				1,
				Math.max(0.02, m.billCuts / limits.maxBillCuts),
			);
			_bgClass = "bg-amber-500/20 text-amber-600 dark:text-amber-400";
			textStyle = {
				backgroundColor: `rgba(245, 158, 11, ${opacity * 0.45})`,
				color: opacity > 0.6 ? "var(--foreground)" : "var(--muted-foreground)",
				fontWeight: opacity > 0.5 ? "600" : "500",
			};
		}

		return (
			<TableCell
				key={m.monthIndex}
				className="text-center font-mono text-[11px] p-2 md:p-3 border-r border-white/5 transition-all duration-150 hover:brightness-110"
				style={textStyle}
			>
				<span className="block leading-none">{valueText}</span>
				{selectedMetric !== "retention" && (
					<span className="block text-[9px] text-muted-foreground/60 mt-0.5 font-sans">
						({m.activeCustomers} active)
					</span>
				)}
			</TableCell>
		);
	};

	return (
		<div className="flex flex-col gap-6 p-4 md:p-8 pt-4">
			{/* Title Section */}
			<div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
				<div className="flex flex-col gap-1">
					<h1 className="text-3xl font-bold leading-none tracking-tight">
						Customer Cohort Analysis
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
				<div className="flex flex-col gap-6 mt-2">
					<Skeleton className="h-[40px] w-[350px] rounded-lg" />
					<Skeleton className="h-[350px] w-full rounded-2xl" />
				</div>
			) : (
				<div className="flex flex-col gap-6">
					<Card className="border-white/10 bg-white/5 dark:bg-black/20 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.08)] overflow-hidden">
						<CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between pb-4">
							<div className="flex flex-col gap-1">
								<CardTitle className="text-lg flex items-center gap-2">
									Cohort Heatmap
									<TooltipProvider>
										<Tooltip>
											<TooltipTrigger asChild>
												<HelpCircle className="size-4 text-muted-foreground cursor-pointer" />
											</TooltipTrigger>
											<TooltipContent className="max-w-xs p-3 space-y-1.5 text-xs">
												<p>
													<strong>Month 0</strong> is the month the customer
													made their first purchase.
												</p>
												<p>
													<strong>Month 1-5</strong> represents subsequent
													active spending in the months following initial
													acquisition.
												</p>
											</TooltipContent>
										</Tooltip>
									</TooltipProvider>
								</CardTitle>
								<CardDescription>
									Detailed retail cohort grid tracking loyalty behavior over
									time.
								</CardDescription>
							</div>

							<Tabs
								value={selectedMetric}
								onValueChange={(val) =>
									setSelectedMetric(val as CohortMetricType)
								}
								className="w-full md:w-auto"
							>
								<TabsList className="grid grid-cols-4 w-full md:w-auto">
									<TabsTrigger value="retention" className="text-xs">
										Retention %
									</TabsTrigger>
									<TabsTrigger value="revenue" className="text-xs">
										Revenue
									</TabsTrigger>
									<TabsTrigger value="aov" className="text-xs">
										AOV
									</TabsTrigger>
									<TabsTrigger value="billCuts" className="text-xs">
										Bill Cuts
									</TabsTrigger>
								</TabsList>
							</Tabs>
						</CardHeader>
						<CardContent className="p-0">
							<div className="overflow-x-auto w-full">
								<Table className="min-w-[800px] border-collapse">
									<TableHeader>
										<TableRow className="bg-white/5 border-b border-white/10 hover:bg-white/5">
											<TableHead className="font-semibold text-xs py-3 pl-4 border-r border-white/5">
												Cohort Start Month
											</TableHead>
											<TableHead className="font-semibold text-xs py-3 pl-4 text-right border-r border-white/5">
												Cohort Size
											</TableHead>
											{[
												"Month 0",
												"Month 1",
												"Month 2",
												"Month 3",
												"Month 4",
												"Month 5",
											].map((label) => (
												<TableHead
													key={label}
													className="font-semibold text-xs py-3 text-center border-r border-white/5"
												>
													{label}
												</TableHead>
											))}
										</TableRow>
									</TableHeader>
									<TableBody>
										{data.length === 0 ? (
											<TableRow>
												<TableCell
													colSpan={8}
													className="h-32 text-center text-muted-foreground"
												>
													No cohort data matches filters in selected period.
												</TableCell>
											</TableRow>
										) : (
											data.map((cohort: any) => (
												<TableRow
													key={cohort.cohortMonth}
													className="hover:bg-white/5 border-b border-white/5"
												>
													<TableCell className="font-semibold py-3 pl-4 text-xs whitespace-nowrap border-r border-white/5">
														{cohort.cohortLabel}
													</TableCell>
													<TableCell className="font-mono text-xs py-3 pl-4 text-right tabular-nums pr-6 border-r border-white/5">
														{cohort.cohortCustomers.toLocaleString()} customers
													</TableCell>
													{Array.from({ length: 6 }).map((_, idx) => {
														const m = cohort.months.find(
															(month: any) => month.monthIndex === idx,
														);
														return renderCell(
															cohort.cohortCustomers,
															m || { monthIndex: idx, activeCustomers: 0 },
														);
													})}
												</TableRow>
											))
										)}
									</TableBody>
								</Table>
							</div>
						</CardContent>
					</Card>

					{/* Interpretation & Summary Section */}
					<div className="grid gap-6 grid-cols-1 md:grid-cols-2">
						<Card className="border-white/10 bg-white/5 dark:bg-black/20 backdrop-blur-xl p-5">
							<h3 className="text-sm font-semibold mb-2">
								Understanding the Cohort Grid
							</h3>
							<ul className="text-xs text-muted-foreground space-y-2 list-disc list-inside">
								<li>
									Each row represents a group of unique customers who placed
									their first order in that month.
								</li>
								<li>
									Columns track their activity at subsequent intervals, e.g.{" "}
									<strong>Month 1</strong> is exactly 1 calendar month later.
								</li>
								<li>
									Higher color intensities indicate stronger repeat purchases
									and retention densities.
								</li>
							</ul>
						</Card>

						<Card className="border-white/10 bg-white/5 dark:bg-black/20 backdrop-blur-xl p-5 flex flex-col justify-between">
							<div>
								<h3 className="text-sm font-semibold mb-2 text-primary">
									Cohort Strategy Tip
								</h3>
								<p className="text-xs text-muted-foreground leading-relaxed">
									If your <strong>AOV Cohort</strong> numbers are increasing
									over time (Month 1 &gt; Month 0), it confirms customers build
									trust and expand their checkouts. If AOV or Bill Cuts are
									falling, consider deploying re-engagement offers.
								</p>
							</div>
						</Card>
					</div>
				</div>
			)}
		</div>
	);
}
