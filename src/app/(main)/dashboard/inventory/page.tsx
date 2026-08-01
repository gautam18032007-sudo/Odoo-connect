"use client";

import {
	Activity,
	AlertCircle,
	Boxes,
	CheckCircle2,
	Clock,
	IndianRupee,
	RefreshCw,
	Search,
	Store,
	TrendingUp,
	Zap,
} from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCurrency } from "@/lib/utils";

interface InventoryDashboardData {
	overview: {
		totalItemsCount: number;
		totalSohQty: number;
		totalInventoryValueMrp: number;
		totalInventoryValueCost: number;
		healthyStockCount: number;
		lowStockCount: number;
		outOfStockCount: number;
		deadStockCount: number;
		lastUpdated: string;
		syncHealth: {
			status: "healthy" | "degraded" | "syncing";
			lastSyncAt: string | null;
			recordsProcessed: number;
			pendingQueueJobs: number;
		};
	};
	storeBreakdown: Array<{
		storeId: number;
		storeName: string;
		storeCode: string;
		itemCount: number;
		totalQuantity: number;
		valuationMrp: number;
	}>;
	fastMoving: Array<{
		productId: number;
		name: string;
		sku: string;
		category: string;
		qtyOnHand: number;
		unitsSold30d: number;
		velocityDaily: number;
		turnoverCategory: string;
		listPrice: number;
	}>;
	slowMoving: Array<{
		productId: number;
		name: string;
		sku: string;
		category: string;
		qtyOnHand: number;
		unitsSold30d: number;
		velocityDaily: number;
		turnoverCategory: string;
		listPrice: number;
	}>;
	reorderRecommendations: Array<{
		productId: number;
		name: string;
		sku: string;
		category: string;
		qtyOnHand: number;
		dailyRunRate: number;
		daysOfSupplyRemaining: number;
		suggestedReorderQty: number;
		recommendedVendor: string;
		urgency: "critical" | "high" | "medium";
	}>;
	stockAging: Array<{
		ageRange: string;
		itemCount: number;
		totalQuantity: number;
		valuationCost: number;
	}>;
	performance: {
		queryLatencyMs: number;
		dataFreshness: string;
	};
}

import { useStabilizedDashboard } from "@/hooks/use-stabilized-dashboard";

export default function ExecutiveInventoryDashboardPage() {
	const [searchQuery, setSearchQuery] = useState("");

	const fetcher = async (signal: AbortSignal) => {
		const res = await fetch("/api/inventory/dashboard", { signal });
		const json = await res.json();
		if (json.success) {
			return json.data;
		}
		throw new Error(json.error || "Failed to load inventory metrics");
	};

	const { data, isInitialLoading, isRefreshing, error, refetch } =
		useStabilizedDashboard<InventoryDashboardData>({
			fetcher,
			refreshInterval: 5000,
		});

	if (isInitialLoading && !data) {
		return (
			<div className="flex flex-col gap-6 p-4 pt-4 md:p-8">
				<div className="flex items-center justify-between">
					<Skeleton className="h-8 w-64" />
					<Skeleton className="h-10 w-48" />
				</div>
				<div className="grid gap-4 md:grid-cols-4">
					{[1, 2, 3, 4].map((i) => (
						<Skeleton key={i} className="h-32 rounded-xl" />
					))}
				</div>
				<Skeleton className="h-96 rounded-xl" />
			</div>
		);
	}

	if (error && !data) {
		return (
			<div className="flex flex-col items-center justify-center min-h-[60vh] p-4 text-center space-y-4">
				<AlertCircle className="size-16 text-destructive" />
				<h2 className="text-xl font-bold">
					Failed to load Inventory Dashboard
				</h2>
				<p className="text-muted-foreground text-sm max-w-md">{error}</p>
				<Button onClick={() => refetch()}>Retry Connection</Button>
			</div>
		);
	}

	if (!data) return null;

	const {
		overview,
		storeBreakdown,
		fastMoving,
		slowMoving,
		reorderRecommendations,
		stockAging,
		performance,
	} = data;

	const healthRatio = Math.round(
		(overview.healthyStockCount / Math.max(1, overview.totalItemsCount)) * 100,
	);

	const filteredFast = fastMoving.filter(
		(item) =>
			item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
			item.sku.toLowerCase().includes(searchQuery.toLowerCase()),
	);

	const filteredSlow = slowMoving.filter(
		(item) =>
			item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
			item.sku.toLowerCase().includes(searchQuery.toLowerCase()),
	);

	return (
		<div className="flex flex-col gap-6 p-4 pt-4 md:p-8 transition-all">
			{/* ── Executive Header ────────────────────────────────────────── */}
			<div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
				<div>
					<div className="flex items-center gap-2">
						<h1 className="text-3xl font-bold tracking-tight">
							Executive Inventory Ops
						</h1>
						<Badge
							variant="outline"
							className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 gap-1 font-mono text-xs"
						>
							<Zap className="size-3 fill-emerald-500" />
							PostgreSQL Live Read ({performance.queryLatencyMs}ms)
						</Badge>
					</div>
					<p className="text-muted-foreground text-sm mt-1">
						Real-Time Stock Health, Operational Turnover & Automated AI Reorder
						Intelligence
					</p>
				</div>
				<div className="flex items-center gap-3">
					<Badge variant="secondary" className="gap-1.5 py-1 px-3">
						<Clock className="size-3.5 text-muted-foreground" />
						Adaptive Polling (2–15s)
					</Badge>
					<Button
						variant="outline"
						size="sm"
						onClick={() => refetch()}
						disabled={isRefreshing}
						className="gap-2 shadow-sm"
					>
						<RefreshCw
							className={`size-4 ${isRefreshing ? "animate-spin" : ""}`}
						/>
						Refresh
					</Button>
				</div>
			</div>

			{/* ── Key Operational Metric Cards ────────────────────────────── */}
			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
				<Card className="border-l-4 border-l-primary shadow-sm hover:shadow-md transition-shadow">
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium text-muted-foreground">
							Total Stock on Hand
						</CardTitle>
						<Boxes className="size-4 text-primary" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">
							{overview.totalSohQty.toLocaleString()} units
						</div>
						<p className="text-xs text-muted-foreground mt-1">
							Across {overview.totalItemsCount.toLocaleString()} active SKUs
						</p>
					</CardContent>
				</Card>

				<Card className="border-l-4 border-l-emerald-500 shadow-sm hover:shadow-md transition-shadow">
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium text-muted-foreground">
							Inventory Valuation (MRP)
						</CardTitle>
						<IndianRupee className="size-4 text-emerald-500" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">
							{formatCurrency(overview.totalInventoryValueMrp)}
						</div>
						<p className="text-xs text-muted-foreground mt-1">
							Cost Valuation: {formatCurrency(overview.totalInventoryValueCost)}
						</p>
					</CardContent>
				</Card>

				<Card className="border-l-4 border-l-amber-500 shadow-sm hover:shadow-md transition-shadow">
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium text-muted-foreground">
							Stock Health Score
						</CardTitle>
						<Activity className="size-4 text-amber-500" />
					</CardHeader>
					<CardContent>
						<div className="flex items-center justify-between">
							<span className="text-2xl font-bold">{healthRatio}%</span>
							<Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 font-mono">
								{overview.healthyStockCount} Healthy SKUs
							</Badge>
						</div>
						<Progress value={healthRatio} className="h-1.5 mt-2" />
						<p className="text-xs text-destructive font-medium mt-1.5">
							{overview.lowStockCount} Low • {overview.outOfStockCount} Out •{" "}
							{overview.deadStockCount} Dead Stock
						</p>
					</CardContent>
				</Card>

				<Card className="border-l-4 border-l-sky-500 shadow-sm hover:shadow-md transition-shadow">
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium text-muted-foreground">
							Odoo SaaS Sync Status
						</CardTitle>
						<CheckCircle2 className="size-4 text-sky-500" />
					</CardHeader>
					<CardContent>
						<div className="flex items-center gap-2">
							<Badge className="bg-emerald-500 text-white font-mono">
								🟢 {overview.syncHealth.status.toUpperCase()}
							</Badge>
						</div>
						<p className="text-xs text-muted-foreground mt-2">
							Telemetry Processed:{" "}
							{overview.syncHealth.recordsProcessed.toLocaleString()} recs
						</p>
					</CardContent>
				</Card>
			</div>

			{/* ── Store-Wise Inventory & Stock Aging ──────────────────────── */}
			<div className="grid gap-6 md:grid-cols-2">
				{/* Store Distribution */}
				<Card className="shadow-sm">
					<CardHeader>
						<CardTitle className="flex items-center gap-2 text-base font-semibold">
							<Store className="size-5 text-primary" />
							Store-Wise Stock Allocation Matrix
						</CardTitle>
						<CardDescription>
							Real-time stock distribution across active retail locations
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						{storeBreakdown.map((store) => {
							const pct = Math.round(
								(store.totalQuantity / Math.max(1, overview.totalSohQty)) * 100,
							);
							return (
								<div
									key={store.storeId}
									className="space-y-1.5 border-b pb-3 last:border-0 last:pb-0"
								>
									<div className="flex items-center justify-between text-sm font-medium">
										<span>
											{store.storeName} ({store.storeCode})
										</span>
										<span className="font-mono text-xs">
											{store.totalQuantity.toLocaleString()} units ({pct}%)
										</span>
									</div>
									<Progress value={pct} className="h-2" />
									<p className="text-xs text-muted-foreground">
										Valuation: {formatCurrency(store.valuationMrp)} •{" "}
										{store.itemCount} SKUs
									</p>
								</div>
							);
						})}
					</CardContent>
				</Card>

				{/* Stock Aging Analysis */}
				<Card className="shadow-sm">
					<CardHeader>
						<CardTitle className="flex items-center gap-2 text-base font-semibold">
							<Clock className="size-5 text-amber-500" />
							Stock Aging & Working Capital
						</CardTitle>
						<CardDescription>
							Inventory age brackets & non-moving capital exposure
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						{stockAging.map((age) => (
							<div
								key={age.ageRange}
								className="flex items-center justify-between border-b pb-2.5 last:border-0 last:pb-0"
							>
								<div>
									<p className="font-semibold text-sm">{age.ageRange}</p>
									<p className="text-xs text-muted-foreground">
										{age.itemCount} SKUs • {age.totalQuantity} units
									</p>
								</div>
								<div className="text-right">
									<p className="font-mono text-sm font-bold">
										{formatCurrency(age.valuationCost)}
									</p>
									<Badge
										variant="outline"
										className={
											age.ageRange === "90+ Days"
												? "border-destructive/30 bg-destructive/10 text-destructive text-[10px]"
												: "text-[10px]"
										}
									>
										{age.ageRange === "90+ Days"
											? "Dead Stock Alert"
											: "Active Stock"}
									</Badge>
								</div>
							</div>
						))}
					</CardContent>
				</Card>
			</div>

			{/* ── Fast vs Slow Moving Tabs with Instant Search Filter ──────── */}
			<Card className="shadow-sm">
				<CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4">
					<div>
						<CardTitle className="flex items-center gap-2 text-base font-semibold">
							<TrendingUp className="size-5 text-emerald-500" />
							Operational Item Turnover Velocity (ABC Analysis)
						</CardTitle>
						<CardDescription>
							Identify high-velocity drivers and slow-moving capital items
						</CardDescription>
					</div>
					<div className="relative w-full md:w-64">
						<Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
						<Input
							placeholder="Search SKU or Product..."
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
							className="pl-9 h-9 text-xs"
						/>
					</div>
				</CardHeader>
				<CardContent>
					<Tabs defaultValue="fast" className="w-full">
						<TabsList className="grid w-full grid-cols-2 max-w-xs mb-4">
							<TabsTrigger value="fast">Fast Moving (Top 10)</TabsTrigger>
							<TabsTrigger value="slow">Slow Moving (Top 10)</TabsTrigger>
						</TabsList>

						<TabsContent value="fast" className="space-y-3">
							<div className="rounded-md border">
								<div className="grid grid-cols-12 bg-muted/40 p-3 text-xs font-semibold text-muted-foreground border-b">
									<div className="col-span-5">PRODUCT / SKU</div>
									<div className="col-span-3 text-right">30-DAY SALES</div>
									<div className="col-span-2 text-right">VELOCITY</div>
									<div className="col-span-2 text-right">SOH QTY</div>
								</div>
								{filteredFast.map((item) => (
									<div
										key={item.productId}
										className="grid grid-cols-12 p-3 text-sm border-b last:border-0 items-center hover:bg-muted/30 transition-colors"
									>
										<div className="col-span-5">
											<div className="flex items-center gap-2">
												<Badge className="bg-emerald-600 text-white text-[10px]">
													A-ITEM
												</Badge>
												<div className="truncate">
													<p className="font-medium truncate">{item.name}</p>
													<p className="text-xs text-muted-foreground font-mono">
														{item.sku} • {item.category}
													</p>
												</div>
											</div>
										</div>
										<div className="col-span-3 text-right font-semibold">
											{item.unitsSold30d} units
										</div>
										<div className="col-span-2 text-right">
											<Badge
												variant="outline"
												className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-xs font-mono"
											>
												{item.velocityDaily}/day
											</Badge>
										</div>
										<div className="col-span-2 text-right font-mono font-bold">
											{item.qtyOnHand}
										</div>
									</div>
								))}
							</div>
						</TabsContent>

						<TabsContent value="slow" className="space-y-3">
							<div className="rounded-md border">
								<div className="grid grid-cols-12 bg-muted/40 p-3 text-xs font-semibold text-muted-foreground border-b">
									<div className="col-span-5">PRODUCT / SKU</div>
									<div className="col-span-3 text-right">30-DAY SALES</div>
									<div className="col-span-2 text-right">VELOCITY</div>
									<div className="col-span-2 text-right">SOH QTY</div>
								</div>
								{filteredSlow.map((item) => (
									<div
										key={item.productId}
										className="grid grid-cols-12 p-3 text-sm border-b last:border-0 items-center hover:bg-muted/30 transition-colors"
									>
										<div className="col-span-5">
											<div className="flex items-center gap-2">
												<Badge className="bg-amber-600 text-white text-[10px]">
													C-ITEM
												</Badge>
												<div className="truncate">
													<p className="font-medium truncate">{item.name}</p>
													<p className="text-xs text-muted-foreground font-mono">
														{item.sku} • {item.category}
													</p>
												</div>
											</div>
										</div>
										<div className="col-span-3 text-right font-semibold text-muted-foreground">
											{item.unitsSold30d} units
										</div>
										<div className="col-span-2 text-right">
											<Badge
												variant="outline"
												className="bg-amber-500/10 text-amber-600 border-amber-500/20 text-xs font-mono"
											>
												{item.velocityDaily}/day
											</Badge>
										</div>
										<div className="col-span-2 text-right font-mono font-bold text-amber-600">
											{item.qtyOnHand}
										</div>
									</div>
								))}
							</div>
						</TabsContent>
					</Tabs>
				</CardContent>
			</Card>

			{/* ── AI Automated Reorder & Replenishment Recommendations ──── */}
			<Card className="border-l-4 border-l-violet-500 shadow-sm">
				<CardHeader>
					<div className="flex items-center justify-between">
						<div>
							<CardTitle className="flex items-center gap-2 text-violet-700 dark:text-violet-400 text-base font-semibold">
								<Zap className="size-5" />
								AI Automated Replenishment Recommendations
							</CardTitle>
							<CardDescription>
								Calculated from 30-day velocity, lead time & safety stock
								buffers
							</CardDescription>
						</div>
						<Badge className="bg-violet-600 text-white font-mono">
							AI Engine Active
						</Badge>
					</div>
				</CardHeader>
				<CardContent>
					<div className="rounded-md border">
						<div className="grid grid-cols-12 bg-muted/40 p-3 text-xs font-semibold text-muted-foreground border-b">
							<div className="col-span-4">PRODUCT / SKU</div>
							<div className="col-span-2 text-center">SOH QTY</div>
							<div className="col-span-2 text-center">DAILY RUN RATE</div>
							<div className="col-span-2 text-center">DAYS REMAINING</div>
							<div className="col-span-2 text-right">SUGGESTED REORDER</div>
						</div>
						{reorderRecommendations.map((rec) => (
							<div
								key={rec.productId}
								className="grid grid-cols-12 p-3 text-sm border-b last:border-0 items-center hover:bg-muted/30 transition-colors"
							>
								<div className="col-span-4">
									<div className="flex items-center gap-2">
										<Badge
											className={
												rec.urgency === "critical"
													? "bg-destructive text-white text-[10px]"
													: rec.urgency === "high"
														? "bg-amber-500 text-white text-[10px]"
														: "bg-blue-500 text-white text-[10px]"
											}
										>
											{rec.urgency.toUpperCase()}
										</Badge>
										<div className="truncate">
											<p className="font-medium truncate">{rec.name}</p>
											<p className="text-xs text-muted-foreground font-mono">
												{rec.sku}
											</p>
										</div>
									</div>
								</div>
								<div className="col-span-2 text-center font-mono font-bold text-destructive">
									{rec.qtyOnHand}
								</div>
								<div className="col-span-2 text-center text-xs font-mono">
									{rec.dailyRunRate} / day
								</div>
								<div className="col-span-2 text-center font-bold text-xs text-amber-600 font-mono">
									{rec.daysOfSupplyRemaining} days left
								</div>
								<div className="col-span-2 text-right font-mono font-bold text-violet-700 dark:text-violet-300">
									+{rec.suggestedReorderQty} units
								</div>
							</div>
						))}
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
