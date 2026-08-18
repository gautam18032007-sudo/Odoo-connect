"use client";

import {
	Activity,
	AlertTriangle,
	ArrowDownRight,
	ArrowLeft,
	ArrowUpRight,
	Calendar,
	IndianRupee,
	ShoppingCart,
	Store,
	Tag,
	TrendingUp,
} from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";

// ── Types ──────────────────────────────────────────────────────────────────────
interface StoreMetric {
	current: number;
	previous: number;
	growth: number | "NEW STORE";
}

interface StoreData {
	name: string;
	billedBy: string;
	currentRevenue: number;
	previousRevenue: number;
	growth: number;
	currentBills: number;
	previousBills: number;
	aovCurrent: number;
	aovPrevious: number;
	performance: {
		revenue: StoreMetric;
		billCuts: StoreMetric;
		aov: StoreMetric;
	};
	forecast: {
		workingDaysPassed: number;
		remainingWorkingDays: number;
		runRate: number;
		expectedClosing: number;
		previousMonthClosing: number;
		growthVsPrevMonth: number;
		confidence: string;
		reason: string;
	};
	diagnosis: {
		type: string;
		owner: string;
		message: string;
		priority?: number;
	};
}

interface ApiResponse {
	success: boolean;
	data: {
		context: { title: string; current: string; previous: string };
		period: {
			current: { label: string; start: string; end: string };
			previous: { label: string; start: string; end: string };
		};
		stores: StoreData[];
	};
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function formatCurrency(value: number): string {
	if (value >= 10_00_000) {
		return `₹${(value / 10_00_000).toFixed(2)}L`;
	}
	if (value >= 1000) {
		return `₹${(value / 1000).toFixed(1)}K`;
	}
	return `₹${value.toFixed(0)}`;
}

function GrowthBadge({ growth }: { growth: number | "NEW STORE" }) {
	if (growth === "NEW STORE") {
		return (
			<span className="text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-500/10 dark:bg-blue-500/15 px-1.5 py-0.5 rounded-full">
				New
			</span>
		);
	}
	const isPositive = growth >= 0;
	const Icon = isPositive ? ArrowUpRight : ArrowDownRight;
	return (
		<span
			className={`inline-flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded-full ${
				isPositive
					? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 dark:bg-emerald-500/15"
					: "text-red-600 dark:text-red-400 bg-red-500/10 dark:bg-red-500/15"
			}`}
		>
			<Icon className="size-3" />
			{Math.abs(growth).toFixed(1)}%
		</span>
	);
}

function DiagnosisBadge({ type }: { type: string }) {
	const map: Record<string, { label: string; color: string }> = {
		HEALTHY: {
			label: "Healthy",
			color:
				"text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 dark:bg-emerald-500/15",
		},
		STABLE: {
			label: "Stable",
			color:
				"text-blue-600 dark:text-blue-400 bg-blue-500/10 dark:bg-blue-500/15",
		},
		WARNING: {
			label: "Warning",
			color:
				"text-amber-600 dark:text-amber-400 bg-amber-500/10 dark:bg-amber-500/15",
		},
		CRITICAL: {
			label: "Critical",
			color: "text-red-600 dark:text-red-400 bg-red-500/10 dark:bg-red-500/15",
		},
	};
	const entry = map[type] ?? {
		label: type,
		color: "text-muted-foreground bg-muted dark:bg-muted/50",
	};
	return (
		<span
			className={`text-xs font-semibold px-2 py-0.5 rounded-full ${entry.color}`}
		>
			{entry.label}
		</span>
	);
}

// ── Main Component ─────────────────────────────────────────────────────────────
import { useFilterStore } from "@/stores/founder/filter-store";

export default function Page({
	params,
}: {
	params: Promise<{ storeId: string }>;
}) {
	const { storeId } = React.use(params);
	// billedBy values use real spaces (encoded as %20), NOT underscores
	const rawStoreName = decodeURIComponent(storeId);
	const storeName = rawStoreName.replace(/\b\w/g, (c) => c.toUpperCase());

	const { startDate, endDate, store, category, brand, sku } = useFilterStore();

	const [storeData, setStoreData] = React.useState<StoreData | null>(null);
	const [context, setContext] = React.useState<
		ApiResponse["data"]["context"] | null
	>(null);
	const [period, setPeriod] = React.useState<
		ApiResponse["data"]["period"] | null
	>(null);
	const [loading, setLoading] = React.useState(true);
	const [error, setError] = React.useState<string | null>(null);

	React.useEffect(() => {
		async function load() {
			setLoading(true);
			setError(null);
			try {
				// Decode the URL param — billedBy uses real spaces encoded as %20
				const rawStore = decodeURIComponent(storeId).trim();
				const queryParams = new URLSearchParams();
				if (startDate) queryParams.set("startDate", startDate);
				if (endDate) queryParams.set("endDate", endDate);
				if (store !== "ALL") queryParams.set("store", store);
				if (category !== "All Categories")
					queryParams.set("category", category);
				if (brand !== "All Brands") queryParams.set("brand", brand);
				if (sku) queryParams.set("sku", sku);

				const res = await fetch(
					`/api/sales/store-overview?${queryParams.toString()}`,
				);
				if (!res.ok) throw new Error(`API error ${res.status}`);
				const json: ApiResponse = await res.json();
				if (!json.success) throw new Error("API returned failure");

				console.log("[StoreDetail] Looking for store:", rawStore);
				console.log(
					"[StoreDetail] Available stores:",
					json.data.stores.map((s) => s.billedBy),
				);

				// Case-insensitive match against billedBy or name
				const normalise = (s: string) => s.trim().toLowerCase();
				const found = json.data.stores.find(
					(s) =>
						normalise(s.billedBy) === normalise(rawStore) ||
						normalise(s.name) === normalise(rawStore),
				);
				setStoreData(found ?? null);
				setContext(json.data.context);
				setPeriod(json.data.period);
			} catch (err: any) {
				setError(err.message ?? "Failed to load store data");
			} finally {
				setLoading(false);
			}
		}
		load();
	}, [storeId, startDate, endDate, store, category, brand, sku]);

	return (
		<div className="flex flex-col gap-6 p-4 md:p-8 pt-4">
			{/* Header */}
			<div className="flex items-center gap-3">
				<Button variant="outline" size="icon" asChild className="h-8 w-8">
					<Link href="/dashboard/ecommerce">
						<ArrowLeft className="size-4" />
					</Link>
				</Button>
				<div className="flex flex-col">
					<h1 className="text-2xl font-bold tracking-tight">{storeName}</h1>
					{context && (
						<p className="text-xs text-muted-foreground mt-0.5">
							{context.title}
						</p>
					)}
				</div>
			</div>

			{/* Error */}
			{error && (
				<Card className="border-destructive/40 bg-destructive/5">
					<CardContent className="flex items-center gap-2 py-4">
						<AlertTriangle className="size-4 text-destructive" />
						<span className="text-sm text-destructive">{error}</span>
					</CardContent>
				</Card>
			)}

			{/* KPI Cards */}
			<div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
				{/* Revenue */}
				<Card className="flex flex-col">
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-xs font-semibold text-muted-foreground uppercase">
							Revenue
						</CardTitle>
						<IndianRupee className="size-4 text-muted-foreground" />
					</CardHeader>
					<CardContent className="flex-1 flex flex-col justify-between">
						{loading ? (
							<div className="h-7 w-24 bg-muted animate-pulse rounded" />
						) : storeData ? (
							<div>
								<div className="text-2xl font-bold">
									{formatCurrency(storeData.currentRevenue)}
								</div>
								<div className="flex items-center gap-1.5 mt-1.5">
									<GrowthBadge growth={storeData.performance.revenue.growth} />
									<span className="text-[10px] text-muted-foreground">
										vs {formatCurrency(storeData.previousRevenue)}
									</span>
								</div>
							</div>
						) : (
							<div className="text-lg font-bold text-muted-foreground">—</div>
						)}
					</CardContent>
				</Card>

				{/* Transactions */}
				<Card className="flex flex-col">
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-xs font-semibold text-muted-foreground uppercase">
							Transactions
						</CardTitle>
						<ShoppingCart className="size-4 text-muted-foreground" />
					</CardHeader>
					<CardContent className="flex-1 flex flex-col justify-between">
						{loading ? (
							<div className="h-7 w-16 bg-muted animate-pulse rounded" />
						) : storeData ? (
							<div>
								<div className="text-2xl font-bold">
									{storeData.currentBills}
								</div>
								<div className="flex items-center gap-1.5 mt-1.5">
									<GrowthBadge growth={storeData.performance.billCuts.growth} />
									<span className="text-[10px] text-muted-foreground">
										vs {storeData.previousBills} bills
									</span>
								</div>
							</div>
						) : (
							<div className="text-lg font-bold text-muted-foreground">—</div>
						)}
					</CardContent>
				</Card>

				{/* AOV */}
				<Card className="flex flex-col">
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-xs font-semibold text-muted-foreground uppercase">
							AOV
						</CardTitle>
						<Tag className="size-4 text-muted-foreground" />
					</CardHeader>
					<CardContent className="flex-1 flex flex-col justify-between">
						{loading ? (
							<div className="h-7 w-20 bg-muted animate-pulse rounded" />
						) : storeData ? (
							<div>
								<div className="text-2xl font-bold">
									{formatCurrency(storeData.aovCurrent)}
								</div>
								<div className="flex items-center gap-1.5 mt-1.5">
									<GrowthBadge growth={storeData.performance.aov.growth} />
									<span className="text-[10px] text-muted-foreground">
										vs {formatCurrency(storeData.aovPrevious)}
									</span>
								</div>
							</div>
						) : (
							<div className="text-lg font-bold text-muted-foreground">—</div>
						)}
					</CardContent>
				</Card>

				{/* Diagnosis / Health */}
				<Card className="flex flex-col">
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-xs font-semibold text-muted-foreground uppercase">
							Health
						</CardTitle>
						<Activity className="size-4 text-muted-foreground" />
					</CardHeader>
					<CardContent className="flex-1 flex flex-col justify-between">
						{loading ? (
							<div className="h-7 w-20 bg-muted animate-pulse rounded" />
						) : storeData ? (
							<div>
								<div className="flex items-center gap-2 mt-0.5">
									<DiagnosisBadge type={storeData.diagnosis.type} />
								</div>
								<p className="text-[10px] text-muted-foreground mt-2 leading-relaxed line-clamp-2">
									{storeData.diagnosis.message ||
										`Owner: ${storeData.diagnosis.owner}`}
								</p>
							</div>
						) : (
							<div className="text-lg font-bold text-muted-foreground">—</div>
						)}
					</CardContent>
				</Card>
			</div>

			{/* Forecast & Comparison Cards Grid */}
			{(loading || storeData?.forecast) && (
				<div className="grid gap-4 grid-cols-1 md:grid-cols-2">
					<Card className="flex flex-col">
						<CardHeader>
							<CardTitle className="text-sm font-semibold flex items-center gap-2">
								<TrendingUp className="size-4" />
								Month Forecast
							</CardTitle>
							{period && (
								<CardDescription className="text-xs">
									{period.current.label}
								</CardDescription>
							)}
						</CardHeader>
						<CardContent className="flex-1 flex flex-col justify-between">
							{loading ? (
								<div className="space-y-2">
									{[1, 2, 3].map((i) => (
										<div
											key={i}
											className="h-4 bg-muted animate-pulse rounded w-3/4"
										/>
									))}
								</div>
							) : storeData ? (
								<dl className="space-y-2.5 text-sm">
									<div className="flex justify-between items-center">
										<dt className="text-muted-foreground text-xs">
											Expected Closing
										</dt>
										<dd className="font-semibold font-mono">
											{formatCurrency(storeData.forecast.expectedClosing)}
										</dd>
									</div>
									<div className="flex justify-between items-center">
										<dt className="text-muted-foreground text-xs">
											Run Rate / Day
										</dt>
										<dd className="font-semibold font-mono">
											{formatCurrency(storeData.forecast.runRate)}
										</dd>
									</div>
									<div className="flex justify-between items-center">
										<dt className="text-muted-foreground text-xs">
											vs Last Month Close
										</dt>
										<dd className="font-semibold flex items-center gap-1.5 font-mono">
											{formatCurrency(storeData.forecast.previousMonthClosing)}
											<GrowthBadge
												growth={storeData.forecast.growthVsPrevMonth}
											/>
										</dd>
									</div>
									<div className="flex justify-between items-center">
										<dt className="text-muted-foreground text-xs">
											Working Days Left
										</dt>
										<dd className="font-semibold">
											{storeData.forecast.remainingWorkingDays} days
										</dd>
									</div>
									<div className="flex justify-between items-start gap-4">
										<dt className="text-muted-foreground text-xs shrink-0 pt-0.5">
											Confidence
										</dt>
										<dd className="font-semibold text-right text-xs">
											<span className="capitalize">
												{storeData.forecast.confidence}
											</span>
											{storeData.forecast.reason && (
												<span className="text-muted-foreground font-normal ml-1">
													— {storeData.forecast.reason}
												</span>
											)}
										</dd>
									</div>
								</dl>
							) : null}
						</CardContent>
					</Card>

					{/* Period Context */}
					<Card className="flex flex-col">
						<CardHeader>
							<CardTitle className="text-sm font-semibold flex items-center gap-2">
								<Calendar className="size-4" />
								Period Comparison
							</CardTitle>
						</CardHeader>
						<CardContent className="flex-1 flex flex-col justify-between">
							{loading ? (
								<div className="space-y-2">
									{[1, 2].map((i) => (
										<div
											key={i}
											className="h-4 bg-muted animate-pulse rounded w-1/2"
										/>
									))}
								</div>
							) : period ? (
								<dl className="space-y-3.5 text-sm h-full flex flex-col justify-between">
									<div className="space-y-1">
										<dt className="text-muted-foreground text-[10px] uppercase font-bold tracking-wider">
											Current Period
										</dt>
										<dd className="font-semibold text-sm">
											{period.current.label}
										</dd>
										<dd className="text-xs text-muted-foreground font-mono">
											{period.current.start} &rarr; {period.current.end}
										</dd>
									</div>
									<div className="space-y-1">
										<dt className="text-muted-foreground text-[10px] uppercase font-bold tracking-wider">
											Compared Against
										</dt>
										<dd className="font-semibold text-sm">
											{period.previous.label}
										</dd>
										<dd className="text-xs text-muted-foreground font-mono">
											{period.previous.start} &rarr; {period.previous.end}
										</dd>
									</div>
									{storeData && (
										<div className="pt-2.5 border-t">
											<dt className="text-muted-foreground text-[10px] uppercase font-bold tracking-wider mb-1">
												Diagnosis Summary
											</dt>
											<dd className="text-xs leading-relaxed text-foreground bg-muted/30 p-2.5 rounded-lg border">
												{storeData.diagnosis.message}
											</dd>
										</div>
									)}
								</dl>
							) : null}
						</CardContent>
					</Card>
				</div>
			)}

			{/* Empty state when no data found for this store */}
			{!loading && !error && !storeData && (
				<Card>
					<CardContent className="h-48 flex flex-col items-center justify-center border-2 border-dashed border-border rounded-lg m-6">
						<Store className="size-8 text-muted-foreground mb-2" />
						<span className="text-sm text-muted-foreground">
							No data found for <strong>{storeName}</strong>
						</span>
						<span className="text-xs text-muted-foreground mt-1">
							Check that the store name matches your sales data.
						</span>
					</CardContent>
				</Card>
			)}
		</div>
	);
}
