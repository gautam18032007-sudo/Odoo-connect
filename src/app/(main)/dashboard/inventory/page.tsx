"use client";

import { motion, useReducedMotion } from "framer-motion";
import {
	Activity,
	AlertCircle,
	ArrowDown,
	ArrowUp,
	ArrowUpDown,
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
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { MetricCard } from "@/components/ui/metric-card";
import {
	Pagination,
	PaginationContent,
	PaginationEllipsis,
	PaginationItem,
	PaginationLink,
	PaginationNext,
	PaginationPrevious,
} from "@/components/ui/pagination";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
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
		locationMapped: boolean;
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

interface VelocityItem {
	productId: number;
	name: string;
	sku: string;
	category: string;
	qtyOnHand: number;
	unitsSold30d: number;
	velocityDaily: number;
	turnoverCategory: string;
	listPrice: number;
}

interface ReorderItem {
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
}

interface AbcItem {
	productId: number;
	name: string;
	sku: string;
	category: string;
	revenue: number;
	revenueSharePct: number;
	cumulativeSharePct: number;
	abcClass: "A" | "B" | "C";
}

type VelocitySortBy = "sales" | "velocity" | "soh" | "name";
type VelocitySortDir = "asc" | "desc";
type ReorderSortBy = "urgency" | "name";
type ReorderSortDir = "asc" | "desc";

const ALL_PRODUCTS_PAGE_SIZE = 25;
const REORDER_PAGE_SIZE = 25;
const ABC_PAGE_SIZE = 25;

// Windowed page-number list for the pagination bar: first, last, current ±1,
// with ellipses filling the gaps once the catalog spans more than 7 pages.
function getPageNumbers(
	current: number,
	total: number,
): Array<number | "ellipsis"> {
	if (total <= 7) {
		return Array.from({ length: total }, (_, i) => i + 1);
	}
	const pages: Array<number | "ellipsis"> = [1];
	if (current > 3) pages.push("ellipsis");
	const start = Math.max(2, current - 1);
	const end = Math.min(total - 1, current + 1);
	for (let p = start; p <= end; p++) pages.push(p);
	if (current < total - 2) pages.push("ellipsis");
	pages.push(total);
	return pages;
}

// Grows the store allocation bar from 0 to its real value once on mount —
// Radix Progress's indicator is transform-based, so driving `value` through
// a delayed state update lets its existing `transition-all` do the tween
// without fighting the primitive. Later polling updates snap directly
// instead of replaying the 0→value growth every 5s refresh.
function AnimatedStoreBar({ pct }: { pct: number }) {
	const shouldReduceMotion = useReducedMotion();
	const [width, setWidth] = useState(shouldReduceMotion ? pct : 0);
	const hasMounted = useRef(false);

	useEffect(() => {
		if (!hasMounted.current) {
			hasMounted.current = true;
			if (shouldReduceMotion) {
				setWidth(pct);
				return;
			}
			const raf = requestAnimationFrame(() => setWidth(pct));
			return () => cancelAnimationFrame(raf);
		}
		setWidth(pct);
	}, [pct, shouldReduceMotion]);

	return (
		<Progress
			value={width}
			className="h-2"
			indicatorClassName="transition-transform duration-[400ms] ease-out"
		/>
	);
}

import { GlobalFilterBar } from "@/components/founder/global-filter-bar";
import { useFilterStore } from "@/stores/founder/filter-store";

export default function ExecutiveInventoryDashboardPage() {
	const shouldReduceMotion = useReducedMotion();
	const [searchQuery, setSearchQuery] = useState("");
	const [status, setStatus] = useState<any>(null);

	const { startDate, endDate, store, category, brand, sku } = useFilterStore();

	useEffect(() => {
		const fetchStatus = async () => {
			try {
				const res = await fetch("/api/sales/status");
				const json = await res.json();
				if (json.success) setStatus(json.data);
			} catch (err) {
				console.error("Failed to fetch status", err);
			}
		};
		fetchStatus();
	}, []);

	// "All Products" tab — full-catalog, server-paginated/sorted/searched view
	// (separate from the Fast/Slow top-10 lists, which stay client-filtered).
	// Declared above the loading/error early-returns below so hook order
	// stays stable across renders regardless of fetch state (Rules of Hooks).
	const [allPage, setAllPage] = useState(1);
	const [allSortBy, setAllSortBy] = useState<VelocitySortBy>("sales");
	const [allSortDir, setAllSortDir] = useState<VelocitySortDir>("desc");
	const [allSearchInput, setAllSearchInput] = useState("");
	const [allSearch, setAllSearch] = useState("");
	const [allData, setAllData] = useState<{
		items: VelocityItem[];
		totalCount: number;
		page: number;
		pageSize: number;
	} | null>(null);
	const [allLoading, setAllLoading] = useState(false);

	useEffect(() => {
		const timer = setTimeout(() => {
			setAllPage(1);
			setAllSearch(allSearchInput);
		}, 300);
		return () => clearTimeout(timer);
	}, [allSearchInput]);

	useEffect(() => {
		let cancelled = false;
		setAllLoading(true);
		const params = new URLSearchParams({
			page: String(allPage),
			pageSize: String(ALL_PRODUCTS_PAGE_SIZE),
			sortBy: allSortBy,
			sortDir: allSortDir,
			search: allSearch,
		});
		if (store !== "ALL") params.set("store", store);
		if (category !== "All Categories") params.set("category", category);
		if (brand !== "All Brands") params.set("brand", brand);
		if (sku) params.set("sku", sku);

		fetch(`/api/inventory/velocity?${params.toString()}`)
			.then((res) => res.json())
			.then((json) => {
				if (cancelled) return;
				if (json.success) setAllData(json.data);
			})
			.finally(() => {
				if (!cancelled) setAllLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [allPage, allSortBy, allSortDir, allSearch, store, category, brand, sku]);

	// Reorder Recommendations — full eligible pool, server-paginated/searched,
	// not a fixed top-10. Same pattern as the All Products tab above.
	const [reorderPage, setReorderPage] = useState(1);
	const [reorderSortBy, setReorderSortBy] = useState<ReorderSortBy>("urgency");
	const [reorderSortDir, setReorderSortDir] = useState<ReorderSortDir>("asc");
	const [reorderSearchInput, setReorderSearchInput] = useState("");
	const [reorderSearch, setReorderSearch] = useState("");
	const [reorderData, setReorderData] = useState<{
		items: ReorderItem[];
		totalCount: number;
		page: number;
		pageSize: number;
	} | null>(null);
	const [reorderLoading, setReorderLoading] = useState(false);

	useEffect(() => {
		const timer = setTimeout(() => {
			setReorderPage(1);
			setReorderSearch(reorderSearchInput);
		}, 300);
		return () => clearTimeout(timer);
	}, [reorderSearchInput]);

	useEffect(() => {
		let cancelled = false;
		setReorderLoading(true);
		const params = new URLSearchParams({
			page: String(reorderPage),
			pageSize: String(REORDER_PAGE_SIZE),
			sortBy: reorderSortBy,
			sortDir: reorderSortDir,
			search: reorderSearch,
		});
		if (store !== "ALL") params.set("store", store);
		if (category !== "All Categories") params.set("category", category);
		if (brand !== "All Brands") params.set("brand", brand);

		fetch(`/api/inventory/reorder?${params.toString()}`)
			.then((res) => res.json())
			.then((json) => {
				if (cancelled) return;
				if (json.success) setReorderData(json.data);
			})
			.finally(() => {
				if (!cancelled) setReorderLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [
		reorderPage,
		reorderSortBy,
		reorderSortDir,
		reorderSearch,
		store,
		category,
		brand,
	]);

	// ABC Classification — real Pareto (80/15/5 cumulative revenue) computed
	// from Odoo-native data (dim_products + fact_sales_lines/fact_sales_orders).
	const [abcPage, setAbcPage] = useState(1);
	const [abcSearchInput, setAbcSearchInput] = useState("");
	const [abcSearch, setAbcSearch] = useState("");
	const [abcData, setAbcData] = useState<{
		items: AbcItem[];
		totalCount: number;
		page: number;
		pageSize: number;
		summary: {
			aCount: number;
			bCount: number;
			cCount: number;
			totalRevenue: number;
			earliestSaleDate: string | null;
			latestSaleDate: string | null;
		};
	} | null>(null);
	const [abcLoading, setAbcLoading] = useState(false);

	useEffect(() => {
		const timer = setTimeout(() => {
			setAbcPage(1);
			setAbcSearch(abcSearchInput);
		}, 300);
		return () => clearTimeout(timer);
	}, [abcSearchInput]);

	useEffect(() => {
		let cancelled = false;
		setAbcLoading(true);
		const params = new URLSearchParams({
			page: String(abcPage),
			pageSize: String(ABC_PAGE_SIZE),
			search: abcSearch,
		});
		if (store !== "ALL") params.set("store", store);
		if (category !== "All Categories") params.set("category", category);

		fetch(`/api/inventory/abc?${params.toString()}`)
			.then((res) => res.json())
			.then((json) => {
				if (cancelled) return;
				if (json.success) setAbcData(json.data);
			})
			.finally(() => {
				if (!cancelled) setAbcLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [abcPage, abcSearch, store, category]);

	const fetcher = async (signal: AbortSignal) => {
		const params = new URLSearchParams();
		if (store !== "ALL") params.set("store", store);
		if (category !== "All Categories") params.set("category", category);
		if (brand !== "All Brands") params.set("brand", brand);
		if (sku) params.set("sku", sku);

		const res = await fetch(`/api/inventory/dashboard?${params.toString()}`, {
			signal,
		});
		const json = await res.json();
		if (json.success) {
			return json.data;
		}
		throw new Error(json.error || "Failed to load inventory metrics");
	};

	const INVENTORY_POLL_INTERVAL_MS = 30000; // 30s retail-safe refresh to optimize Neon compute

	const { data, isInitialLoading, isRefreshing, error, refetch } =
		useStabilizedDashboard<InventoryDashboardData>({
			fetcher,
			refreshInterval: INVENTORY_POLL_INTERVAL_MS,
			dependencies: [store, category, brand, sku],
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
						<Skeleton key={i} className="h-[135px] rounded-2xl" />
					))}
				</div>
				<div className="grid gap-6 md:grid-cols-2">
					<Skeleton className="h-72 rounded-xl" />
					<Skeleton className="h-72 rounded-xl" />
				</div>
				<Skeleton className="h-[420px] rounded-xl" />
				<Skeleton className="h-72 rounded-xl" />
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

	// Each list scales its relative sales bar against its own max — fast and
	// slow movers operate on completely different volume scales.
	const maxFastSold = Math.max(1, ...filteredFast.map((i) => i.unitsSold30d));
	const maxSlowSold = Math.max(1, ...filteredSlow.map((i) => i.unitsSold30d));

	const handleAllSort = (col: VelocitySortBy) => {
		setAllPage(1);
		if (allSortBy === col) {
			setAllSortDir((d) => (d === "asc" ? "desc" : "asc"));
		} else {
			setAllSortBy(col);
			setAllSortDir("desc");
		}
	};

	const allTotalPages = allData
		? Math.max(1, Math.ceil(allData.totalCount / allData.pageSize))
		: 1;
	const maxAllSold = Math.max(
		1,
		...(allData?.items.map((i) => i.unitsSold30d) || []),
	);

	function SortIcon({ column }: { column: VelocitySortBy }) {
		if (allSortBy !== column) {
			return <ArrowUpDown className="size-3 text-muted-foreground/50" />;
		}
		return allSortDir === "asc" ? (
			<ArrowUp className="size-3" />
		) : (
			<ArrowDown className="size-3" />
		);
	}

	const handleReorderSort = (col: ReorderSortBy) => {
		setReorderPage(1);
		if (reorderSortBy === col) {
			setReorderSortDir((d) => (d === "asc" ? "desc" : "asc"));
		} else {
			setReorderSortBy(col);
			setReorderSortDir("asc");
		}
	};

	const reorderTotalPages = reorderData
		? Math.max(1, Math.ceil(reorderData.totalCount / reorderData.pageSize))
		: 1;

	function ReorderSortIcon({ column }: { column: ReorderSortBy }) {
		if (reorderSortBy !== column) {
			return <ArrowUpDown className="size-3 text-muted-foreground/50" />;
		}
		return reorderSortDir === "asc" ? (
			<ArrowUp className="size-3" />
		) : (
			<ArrowDown className="size-3" />
		);
	}

	const abcTotalPages = abcData
		? Math.max(1, Math.ceil(abcData.totalCount / abcData.pageSize))
		: 1;

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

			<GlobalFilterBar
				availableStores={status?.availableStores || []}
				availableCategories={status?.availableCategories || []}
				availableBrands={status?.availableBrands || []}
				categoryBrandMap={status?.categoryBrandMap || {}}
				hideDateRange
				onSearchProducts={async (query) => {
					const params = new URLSearchParams({ q: query });
					if (store !== "ALL") params.set("store", store);
					if (category !== "All Categories") params.set("category", category);
					if (brand !== "All Brands") params.set("brand", brand);
					const res = await fetch(
						`/api/inventory/products/search?${params.toString()}`,
					);
					const json = await res.json();
					return json.success ? json.data : [];
				}}
			/>

			{/* ── Key Operational Metric Cards ────────────────────────────── */}
			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
				<motion.div
					initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 8 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.25, delay: 0, ease: "easeOut" }}
				>
					<MetricCard
						title="Total Stock on Hand"
						value={`${overview.totalSohQty.toLocaleString()} units`}
						icon={Boxes}
						comparisonLabel={`Across ${overview.totalItemsCount.toLocaleString()} active SKUs`}
					/>
				</motion.div>

				<motion.div
					initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 8 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.25, delay: 0.06, ease: "easeOut" }}
				>
					<MetricCard
						title="Inventory Valuation (MRP)"
						value={formatCurrency(overview.totalInventoryValueMrp)}
						icon={IndianRupee}
						comparisonLabel={`Cost Valuation: ${formatCurrency(overview.totalInventoryValueCost)}`}
					/>
				</motion.div>

				<motion.div
					initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 8 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.25, delay: 0.12, ease: "easeOut" }}
				>
					<Card className="shadow-sm hover:shadow-md transition-shadow">
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
				</motion.div>

				<motion.div
					initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 8 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.25, delay: 0.18, ease: "easeOut" }}
				>
					<MetricCard
						title="Odoo SaaS Sync Status"
						value={overview.syncHealth.status.toUpperCase()}
						icon={CheckCircle2}
						comparisonLabel={`Telemetry Processed: ${overview.syncHealth.recordsProcessed.toLocaleString()} recs`}
					/>
				</motion.div>
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
							if (!store.locationMapped) {
								return (
									<Empty
										key={store.storeId}
										className="border-b pb-3 last:border-0 last:pb-0 p-2"
									>
										<EmptyTitle>
											{store.storeName} ({store.storeCode})
										</EmptyTitle>
										<EmptyDescription>
											No location mapping yet — inventory sync will populate
											this once the store's stock location is resolved.
										</EmptyDescription>
									</Empty>
								);
							}

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
									<AnimatedStoreBar pct={pct} />
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
						{stockAging.map((age, i) => (
							<motion.div
								key={age.ageRange}
								initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 8 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{
									duration: 0.25,
									delay: i * 0.06,
									ease: "easeOut",
								}}
								className="flex items-center justify-between border-b pb-2.5 last:border-0 last:pb-0 rounded-md px-1.5 -mx-1.5 hover:bg-muted/40 transition-colors"
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
							</motion.div>
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
							Operational Item Turnover Velocity
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
						<TabsList className="grid w-full grid-cols-4 max-w-xl mb-4">
							<TabsTrigger value="fast">Fast Moving (Top 10)</TabsTrigger>
							<TabsTrigger value="slow">Slow Moving (Top 10)</TabsTrigger>
							<TabsTrigger value="all">All Products</TabsTrigger>
							<TabsTrigger value="abc">ABC Classification</TabsTrigger>
						</TabsList>

						<TabsContent value="fast" className="space-y-3">
							<div className="rounded-md border">
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead className="w-10">#</TableHead>
											<TableHead>PRODUCT / SKU</TableHead>
											<TableHead className="text-right">30-DAY SALES</TableHead>
											<TableHead className="text-right">VELOCITY</TableHead>
											<TableHead className="text-right">SOH QTY</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{filteredFast.map((item, i) => {
											const barPct = Math.round(
												(item.unitsSold30d / maxFastSold) * 100,
											);
											return (
												<TableRow key={item.productId}>
													<TableCell className="font-mono text-xs text-muted-foreground">
														{String(i + 1).padStart(2, "0")}
													</TableCell>
													<TableCell className="whitespace-normal">
														<div className="truncate">
															<p className="font-medium truncate">
																{item.name}
															</p>
															<p className="text-xs text-muted-foreground font-mono">
																{item.sku} • {item.category}
															</p>
														</div>
													</TableCell>
													<TableCell className="text-right">
														<div className="flex flex-col items-end gap-1">
															<span className="font-semibold">
																{item.unitsSold30d} units
															</span>
															<div className="h-1 w-20 rounded-full bg-muted overflow-hidden">
																<div
																	className="h-full rounded-full bg-emerald-500"
																	style={{ width: `${barPct}%` }}
																/>
															</div>
														</div>
													</TableCell>
													<TableCell className="text-right">
														<Badge
															variant="outline"
															className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-xs font-mono"
														>
															{item.velocityDaily}/day
														</Badge>
													</TableCell>
													<TableCell className="text-right font-mono font-bold">
														<span className="inline-flex items-center gap-1.5 justify-end">
															{item.qtyOnHand}
															{item.qtyOnHand === 0 && (
																<span
																	className="inline-block size-1.5 rounded-full bg-destructive"
																	title="Top seller out of stock"
																/>
															)}
														</span>
													</TableCell>
												</TableRow>
											);
										})}
									</TableBody>
								</Table>
							</div>
						</TabsContent>

						<TabsContent value="slow" className="space-y-3">
							<div className="rounded-md border">
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead className="w-10">#</TableHead>
											<TableHead>PRODUCT / SKU</TableHead>
											<TableHead className="text-right">30-DAY SALES</TableHead>
											<TableHead className="text-right">VELOCITY</TableHead>
											<TableHead className="text-right">SOH QTY</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{filteredSlow.map((item, i) => {
											const barPct = Math.round(
												(item.unitsSold30d / maxSlowSold) * 100,
											);
											return (
												<TableRow key={item.productId}>
													<TableCell className="font-mono text-xs text-muted-foreground">
														{String(i + 1).padStart(2, "0")}
													</TableCell>
													<TableCell className="whitespace-normal">
														<div className="truncate">
															<p className="font-medium truncate">
																{item.name}
															</p>
															<p className="text-xs text-muted-foreground font-mono">
																{item.sku} • {item.category}
															</p>
														</div>
													</TableCell>
													<TableCell className="text-right">
														<div className="flex flex-col items-end gap-1">
															<span className="font-semibold text-muted-foreground">
																{item.unitsSold30d} units
															</span>
															<div className="h-1 w-20 rounded-full bg-muted overflow-hidden">
																<div
																	className="h-full rounded-full bg-amber-500"
																	style={{ width: `${barPct}%` }}
																/>
															</div>
														</div>
													</TableCell>
													<TableCell className="text-right">
														<Badge
															variant="outline"
															className="bg-amber-500/10 text-amber-600 border-amber-500/20 text-xs font-mono"
														>
															{item.velocityDaily}/day
														</Badge>
													</TableCell>
													<TableCell className="text-right font-mono font-bold text-amber-600">
														{item.qtyOnHand}
													</TableCell>
												</TableRow>
											);
										})}
									</TableBody>
								</Table>
							</div>
						</TabsContent>

						<TabsContent value="all" className="space-y-3">
							<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-1">
								<p className="text-xs text-muted-foreground">
									{allData
										? `Showing ${allData.totalCount === 0 ? 0 : (allPage - 1) * allData.pageSize + 1}-${Math.min(allPage * allData.pageSize, allData.totalCount)} of ${allData.totalCount.toLocaleString()}`
										: "Loading…"}
								</p>
								<div className="relative w-full sm:w-64">
									<Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
									<Input
										placeholder="Search all SKUs..."
										value={allSearchInput}
										onChange={(e) => setAllSearchInput(e.target.value)}
										className="pl-9 h-9 text-xs"
									/>
								</div>
							</div>

							<div className="rounded-md border">
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead className="w-10">#</TableHead>
											<TableHead>
												<button
													type="button"
													onClick={() => handleAllSort("name")}
													className="flex items-center gap-1 hover:text-foreground"
												>
													PRODUCT / SKU <SortIcon column="name" />
												</button>
											</TableHead>
											<TableHead className="text-right">
												<button
													type="button"
													onClick={() => handleAllSort("sales")}
													className="flex items-center gap-1 ml-auto hover:text-foreground"
												>
													30-DAY SALES <SortIcon column="sales" />
												</button>
											</TableHead>
											<TableHead className="text-right">
												<button
													type="button"
													onClick={() => handleAllSort("velocity")}
													className="flex items-center gap-1 ml-auto hover:text-foreground"
												>
													VELOCITY <SortIcon column="velocity" />
												</button>
											</TableHead>
											<TableHead className="text-right">
												<button
													type="button"
													onClick={() => handleAllSort("soh")}
													className="flex items-center gap-1 ml-auto hover:text-foreground"
												>
													SOH QTY <SortIcon column="soh" />
												</button>
											</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{allLoading && !allData ? (
											<TableRow>
												<TableCell colSpan={5} className="text-center py-8">
													<Skeleton className="h-6 w-full" />
												</TableCell>
											</TableRow>
										) : allData && allData.items.length === 0 ? (
											<TableRow>
												<TableCell colSpan={5} className="py-8">
													<Empty>
														<EmptyTitle>No products found</EmptyTitle>
														<EmptyDescription>
															No SKUs match "{allSearch}".
														</EmptyDescription>
													</Empty>
												</TableCell>
											</TableRow>
										) : (
											allData?.items.map((item, i) => {
												const barPct = Math.round(
													(item.unitsSold30d / maxAllSold) * 100,
												);
												const rank =
													(allPage - 1) * ALL_PRODUCTS_PAGE_SIZE + i + 1;
												return (
													<TableRow key={item.productId}>
														<TableCell className="font-mono text-xs text-muted-foreground">
															{String(rank).padStart(2, "0")}
														</TableCell>
														<TableCell className="whitespace-normal">
															<div className="truncate">
																<p className="font-medium truncate">
																	{item.name}
																</p>
																<p className="text-xs text-muted-foreground font-mono">
																	{item.sku} • {item.category}
																</p>
															</div>
														</TableCell>
														<TableCell className="text-right">
															<div className="flex flex-col items-end gap-1">
																<span className="font-semibold">
																	{item.unitsSold30d} units
																</span>
																<div className="h-1 w-20 rounded-full bg-muted overflow-hidden">
																	<div
																		className="h-full rounded-full bg-primary"
																		style={{ width: `${barPct}%` }}
																	/>
																</div>
															</div>
														</TableCell>
														<TableCell className="text-right">
															<Badge
																variant="outline"
																className="text-xs font-mono"
															>
																{item.velocityDaily}/day
															</Badge>
														</TableCell>
														<TableCell className="text-right font-mono font-bold">
															<span className="inline-flex items-center gap-1.5 justify-end">
																{item.qtyOnHand}
																{item.qtyOnHand === 0 && (
																	<span
																		className="inline-block size-1.5 rounded-full bg-destructive"
																		title="Out of stock"
																	/>
																)}
															</span>
														</TableCell>
													</TableRow>
												);
											})
										)}
									</TableBody>
								</Table>
							</div>

							{allData && allTotalPages > 1 && (
								<Pagination>
									<PaginationContent>
										<PaginationItem>
											<PaginationPrevious
												href="#"
												onClick={(e) => {
													e.preventDefault();
													setAllPage((p) => Math.max(1, p - 1));
												}}
												className={
													allPage <= 1 ? "pointer-events-none opacity-50" : ""
												}
											/>
										</PaginationItem>
										{getPageNumbers(allPage, allTotalPages).map((p, idx) =>
											p === "ellipsis" ? (
												// biome-ignore lint/suspicious/noArrayIndexKey: ellipsis markers carry no identity; there are at most two per render and their position is stable for a given allPage/allTotalPages pair.
												<PaginationItem key={`ellipsis-${idx}`}>
													<PaginationEllipsis />
												</PaginationItem>
											) : (
												<PaginationItem key={p}>
													<PaginationLink
														href="#"
														isActive={p === allPage}
														onClick={(e) => {
															e.preventDefault();
															setAllPage(p);
														}}
													>
														{p}
													</PaginationLink>
												</PaginationItem>
											),
										)}
										<PaginationItem>
											<PaginationNext
												href="#"
												onClick={(e) => {
													e.preventDefault();
													setAllPage((p) => Math.min(allTotalPages, p + 1));
												}}
												className={
													allPage >= allTotalPages
														? "pointer-events-none opacity-50"
														: ""
												}
											/>
										</PaginationItem>
									</PaginationContent>
								</Pagination>
							)}
						</TabsContent>

						<TabsContent value="abc" className="space-y-3">
							<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-1">
								<div className="flex flex-wrap items-center gap-2 text-xs">
									{abcData ? (
										<>
											<Badge className="bg-emerald-600 text-white text-[10px]">
												A: {abcData.summary.aCount}
											</Badge>
											<Badge className="bg-amber-600 text-white text-[10px]">
												B: {abcData.summary.bCount}
											</Badge>
											<Badge className="bg-slate-500 text-white text-[10px]">
												C: {abcData.summary.cCount}
											</Badge>
											<span className="text-muted-foreground">
												Revenue window:{" "}
												{abcData.summary.earliestSaleDate?.slice(0, 10) ?? "—"}{" "}
												to {abcData.summary.latestSaleDate?.slice(0, 10) ?? "—"}
											</span>
										</>
									) : (
										<span className="text-muted-foreground">Loading…</span>
									)}
								</div>
								<div className="relative w-full sm:w-64">
									<Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
									<Input
										placeholder="Search products..."
										value={abcSearchInput}
										onChange={(e) => setAbcSearchInput(e.target.value)}
										className="pl-9 h-9 text-xs"
									/>
								</div>
							</div>
							<p className="text-xs text-muted-foreground">
								Pareto classification (A = top 80% cumulative revenue, B = next
								15%, C = remaining 5%) from Odoo-native sales history only —
								does not cross into the legacy Excel sales data, so
								classifications reflect only the window shown above.
							</p>

							<div className="rounded-md border">
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead className="w-10">CLASS</TableHead>
											<TableHead>PRODUCT / SKU</TableHead>
											<TableHead className="text-right">REVENUE</TableHead>
											<TableHead className="text-right">SHARE</TableHead>
											<TableHead className="text-right">CUMULATIVE</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{abcLoading && !abcData ? (
											<TableRow>
												<TableCell colSpan={5} className="text-center py-8">
													<Skeleton className="h-6 w-full" />
												</TableCell>
											</TableRow>
										) : abcData && abcData.items.length === 0 ? (
											<TableRow>
												<TableCell colSpan={5} className="py-8">
													<Empty>
														<EmptyTitle>No products found</EmptyTitle>
														<EmptyDescription>
															No SKUs match "{abcSearch}".
														</EmptyDescription>
													</Empty>
												</TableCell>
											</TableRow>
										) : (
											abcData?.items.map((item) => (
												<TableRow key={item.productId}>
													<TableCell>
														<Badge
															className={
																item.abcClass === "A"
																	? "bg-emerald-600 text-white text-[10px]"
																	: item.abcClass === "B"
																		? "bg-amber-600 text-white text-[10px]"
																		: "bg-slate-500 text-white text-[10px]"
															}
														>
															{item.abcClass}
														</Badge>
													</TableCell>
													<TableCell className="whitespace-normal">
														<div className="truncate">
															<p className="font-medium truncate">
																{item.name}
															</p>
															<p className="text-xs text-muted-foreground font-mono">
																{item.sku} • {item.category}
															</p>
														</div>
													</TableCell>
													<TableCell className="text-right font-mono font-bold">
														{formatCurrency(item.revenue)}
													</TableCell>
													<TableCell className="text-right font-mono text-xs">
														{item.revenueSharePct}%
													</TableCell>
													<TableCell className="text-right font-mono text-xs text-muted-foreground">
														{item.cumulativeSharePct}%
													</TableCell>
												</TableRow>
											))
										)}
									</TableBody>
								</Table>
							</div>

							{abcData && abcTotalPages > 1 && (
								<Pagination>
									<PaginationContent>
										<PaginationItem>
											<PaginationPrevious
												href="#"
												onClick={(e) => {
													e.preventDefault();
													setAbcPage((p) => Math.max(1, p - 1));
												}}
												className={
													abcPage <= 1 ? "pointer-events-none opacity-50" : ""
												}
											/>
										</PaginationItem>
										{getPageNumbers(abcPage, abcTotalPages).map((p, idx) =>
											p === "ellipsis" ? (
												// biome-ignore lint/suspicious/noArrayIndexKey: ellipsis markers carry no identity; there are at most two per render and their position is stable for a given abcPage/abcTotalPages pair.
												<PaginationItem key={`abc-ellipsis-${idx}`}>
													<PaginationEllipsis />
												</PaginationItem>
											) : (
												<PaginationItem key={p}>
													<PaginationLink
														href="#"
														isActive={p === abcPage}
														onClick={(e) => {
															e.preventDefault();
															setAbcPage(p);
														}}
													>
														{p}
													</PaginationLink>
												</PaginationItem>
											),
										)}
										<PaginationItem>
											<PaginationNext
												href="#"
												onClick={(e) => {
													e.preventDefault();
													setAbcPage((p) => Math.min(abcTotalPages, p + 1));
												}}
												className={
													abcPage >= abcTotalPages
														? "pointer-events-none opacity-50"
														: ""
												}
											/>
										</PaginationItem>
									</PaginationContent>
								</Pagination>
							)}
						</TabsContent>
					</Tabs>
				</CardContent>
			</Card>

			{/* ── Reorder Recommendations — full eligible pool, paginated/searchable ── */}
			<Card className="border-l-4 border-l-violet-500 shadow-sm">
				<CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4">
					<div>
						<CardTitle className="flex items-center gap-2 text-violet-700 dark:text-violet-400 text-base font-semibold">
							<Zap className="size-5" />
							Reorder Recommendations
						</CardTitle>
						<CardDescription>
							Deterministic calculation from 30-day run rate and current
							stock-on-hand (stock ≤15 units) —{" "}
							{reorderData
								? `${reorderData.totalCount.toLocaleString()} products eligible`
								: "loading…"}
							, fully searchable and paginated below.
						</CardDescription>
					</div>
					<div className="relative w-full md:w-64">
						<Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
						<Input
							placeholder="Search SKU or Product..."
							value={reorderSearchInput}
							onChange={(e) => setReorderSearchInput(e.target.value)}
							className="pl-9 h-9 text-xs"
						/>
					</div>
				</CardHeader>
				<CardContent className="space-y-3">
					<div className="rounded-md border">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>
										<button
											type="button"
											onClick={() => handleReorderSort("name")}
											className="flex items-center gap-1 hover:text-foreground"
										>
											PRODUCT / SKU <ReorderSortIcon column="name" />
										</button>
									</TableHead>
									<TableHead className="text-center">
										<button
											type="button"
											onClick={() => handleReorderSort("urgency")}
											className="flex items-center gap-1 mx-auto hover:text-foreground"
										>
											SOH QTY <ReorderSortIcon column="urgency" />
										</button>
									</TableHead>
									<TableHead className="text-center">DAILY RUN RATE</TableHead>
									<TableHead className="text-center">DAYS REMAINING</TableHead>
									<TableHead className="text-right">
										SUGGESTED REORDER
									</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{reorderLoading && !reorderData ? (
									<TableRow>
										<TableCell colSpan={5} className="text-center py-8">
											<Skeleton className="h-6 w-full" />
										</TableCell>
									</TableRow>
								) : reorderData && reorderData.items.length === 0 ? (
									<TableRow>
										<TableCell colSpan={5} className="py-8">
											<Empty>
												<EmptyTitle>No reorder candidates</EmptyTitle>
												<EmptyDescription>
													No products in the current filter match the reorder
													criteria (stock ≤15 units)
													{reorderSearch
														? ` and search "${reorderSearch}"`
														: ""}
													.
												</EmptyDescription>
											</Empty>
										</TableCell>
									</TableRow>
								) : (
									reorderData?.items.map((rec) => (
										<TableRow key={rec.productId}>
											<TableCell className="whitespace-normal">
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
											</TableCell>
											<TableCell className="text-center font-mono font-bold text-destructive">
												{rec.qtyOnHand}
											</TableCell>
											<TableCell className="text-center text-xs font-mono">
												{rec.dailyRunRate} / day
											</TableCell>
											<TableCell className="text-center font-bold text-xs text-amber-600 font-mono">
												{rec.daysOfSupplyRemaining} days left
											</TableCell>
											<TableCell className="text-right font-mono font-bold text-violet-700 dark:text-violet-300">
												+{rec.suggestedReorderQty} units
											</TableCell>
										</TableRow>
									))
								)}
							</TableBody>
						</Table>
					</div>

					{reorderData && reorderTotalPages > 1 && (
						<Pagination>
							<PaginationContent>
								<PaginationItem>
									<PaginationPrevious
										href="#"
										onClick={(e) => {
											e.preventDefault();
											setReorderPage((p) => Math.max(1, p - 1));
										}}
										className={
											reorderPage <= 1 ? "pointer-events-none opacity-50" : ""
										}
									/>
								</PaginationItem>
								{getPageNumbers(reorderPage, reorderTotalPages).map((p, idx) =>
									p === "ellipsis" ? (
										// biome-ignore lint/suspicious/noArrayIndexKey: ellipsis markers carry no identity; there are at most two per render and their position is stable for a given reorderPage/reorderTotalPages pair.
										<PaginationItem key={`reorder-ellipsis-${idx}`}>
											<PaginationEllipsis />
										</PaginationItem>
									) : (
										<PaginationItem key={p}>
											<PaginationLink
												href="#"
												isActive={p === reorderPage}
												onClick={(e) => {
													e.preventDefault();
													setReorderPage(p);
												}}
											>
												{p}
											</PaginationLink>
										</PaginationItem>
									),
								)}
								<PaginationItem>
									<PaginationNext
										href="#"
										onClick={(e) => {
											e.preventDefault();
											setReorderPage((p) => Math.min(reorderTotalPages, p + 1));
										}}
										className={
											reorderPage >= reorderTotalPages
												? "pointer-events-none opacity-50"
												: ""
										}
									/>
								</PaginationItem>
							</PaginationContent>
						</Pagination>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
