"use client";

import {
	AlertCircle,
	Bot,
	Copy,
	RefreshCw,
	Store,
	TrendingUp,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/utils";

interface FounderAiData {
	today: {
		revenue: number;
		bills: number;
		units: number;
	};
	storeRanking: Array<{
		storeName: string;
		revenue: number;
		bills: number;
	}>;
	topProducts: Array<{
		name: string;
		sku: string;
		unitsSold: number;
		revenue: number;
	}>;
	inventory: {
		totalSohQty: number;
		totalInventoryValueMrp: number;
		healthyStockCount: number;
		lowStockCount: number;
		outOfStockCount: number;
		deadStockCount: number;
	};
	alerts: {
		marginAlerts: string[];
		syncHealth: string;
	};
}

export default function FounderAiOpsPage() {
	const [data, setData] = useState<FounderAiData | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);

	const fetchOps = useCallback(async () => {
		try {
			const res = await fetch("/api/system/founder-ai");
			const json = await res.json();
			if (json.success) {
				setData(json.data);
				setError(null);
			} else {
				setError(json.error || "Failed to load Founder AI Ops");
			}
		} catch (err: unknown) {
			setError(err instanceof Error ? err.message : "Network error");
		} finally {
			setLoading(false);
		}
	}, []);

	const copyMorningBrief = async () => {
		try {
			const res = await fetch("/api/system/founder-ai/brief");
			const json = await res.json();
			if (json.success && json.data.briefText) {
				await navigator.clipboard.writeText(json.data.briefText);
				setCopied(true);
				setTimeout(() => setCopied(false), 2500);
			}
		} catch (err) {
			console.error("Failed to copy brief:", err);
		}
	};

	useEffect(() => {
		fetchOps();
	}, [fetchOps]);

	if (loading) {
		return (
			<div className="flex flex-col gap-6 p-4 pt-4 md:p-8">
				<Skeleton className="h-8 w-64" />
				<div className="grid gap-4 md:grid-cols-3">
					{[1, 2, 3].map((i) => (
						<Skeleton key={i} className="h-32 rounded-xl" />
					))}
				</div>
				<Skeleton className="h-96 rounded-xl" />
			</div>
		);
	}

	if (error || !data) {
		return (
			<div className="flex flex-col items-center justify-center min-h-[60vh] p-4 text-center space-y-4">
				<AlertCircle className="size-16 text-destructive" />
				<h2 className="text-xl font-bold">Failed to load Founder AI Ops</h2>
				<p className="text-muted-foreground text-sm max-w-md">{error}</p>
				<Button onClick={fetchOps}>Retry</Button>
			</div>
		);
	}

	const { today, storeRanking, topProducts, inventory, alerts } = data;

	return (
		<div className="flex flex-col gap-6 p-4 pt-4 md:p-8 transition-all">
			{/* ── Header ────────────────────────────────────────── */}
			<div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
				<div>
					<div className="flex items-center gap-2">
						<h1 className="text-3xl font-bold tracking-tight">
							Founder AI Operations Panel
						</h1>
						<Badge
							variant="outline"
							className="bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20 gap-1 font-mono text-xs"
						>
							<Bot className="size-3.5 fill-violet-500" />
							Executive Ops AI
						</Badge>
					</div>
					<p className="text-muted-foreground text-sm mt-1">
						Real-Time Sales Performance, Store Leaderboards & Automated
						Inventory Margin Safeguards
					</p>
				</div>
				<div className="flex items-center gap-2">
					<Button
						variant="default"
						size="sm"
						onClick={copyMorningBrief}
						className="gap-2 bg-violet-600 hover:bg-violet-700 text-white shadow-sm"
					>
						<Copy className="size-4" />
						{copied ? "Brief Copied!" : "Copy Morning Brief"}
					</Button>
					<Button
						variant="outline"
						size="sm"
						onClick={fetchOps}
						className="gap-2 shadow-sm"
					>
						<RefreshCw className="size-4" />
						Refresh
					</Button>
				</div>
			</div>

			{/* ── Today's Performance Cards ─────────────────────── */}
			<div className="grid gap-4 sm:grid-cols-3">
				<Card className="border-l-4 border-l-emerald-500 shadow-sm hover:shadow-md transition-shadow">
					<CardHeader className="pb-2">
						<CardTitle className="text-sm font-medium text-muted-foreground">
							Today&apos;s Live Revenue
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">
							{formatCurrency(today.revenue)}
						</div>
						<p className="text-xs text-muted-foreground mt-1 font-mono">
							{today.bills} Orders • {today.units} Units Sold
						</p>
					</CardContent>
				</Card>

				<Card className="border-l-4 border-l-blue-500 shadow-sm hover:shadow-md transition-shadow">
					<CardHeader className="pb-2">
						<CardTitle className="text-sm font-medium text-muted-foreground">
							Total Inventory Valuation
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">
							{formatCurrency(inventory.totalInventoryValueMrp)}
						</div>
						<p className="text-xs text-muted-foreground mt-1 font-mono">
							{inventory.totalSohQty.toLocaleString()} units on hand
						</p>
					</CardContent>
				</Card>

				<Card className="border-l-4 border-l-violet-500 shadow-sm hover:shadow-md transition-shadow">
					<CardHeader className="pb-2">
						<CardTitle className="text-sm font-medium text-muted-foreground">
							Inventory Stock Health
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="flex items-center gap-2">
							<span className="text-2xl font-bold font-mono">
								{inventory.healthyStockCount}
							</span>
							<span className="text-xs text-emerald-600 font-semibold">
								Healthy
							</span>
							<span className="text-xs text-muted-foreground">•</span>
							<span className="text-xs text-amber-600 font-semibold">
								{inventory.lowStockCount} Low
							</span>
						</div>
						<p className="text-xs text-destructive mt-1 font-medium font-mono">
							{inventory.deadStockCount} Dead Stock items
						</p>
					</CardContent>
				</Card>
			</div>

			{/* ── Store Leaderboard & Top Products ──────────────── */}
			<div className="grid gap-6 md:grid-cols-2">
				<Card className="shadow-sm">
					<CardHeader>
						<CardTitle className="flex items-center gap-2 text-base font-semibold">
							<Store className="size-5 text-primary" />
							Store Revenue Leaderboard
						</CardTitle>
						<CardDescription>
							Live revenue & order distribution across stores
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						{storeRanking.map((store, i) => (
							<div
								key={store.storeName}
								className="flex items-center justify-between border-b pb-3 last:border-0 last:pb-0"
							>
								<div className="flex items-center gap-3">
									<Badge className="bg-primary text-primary-foreground font-mono">
										#{i + 1}
									</Badge>
									<div>
										<p className="font-semibold text-sm">{store.storeName}</p>
										<p className="text-xs text-muted-foreground font-mono">
											{store.bills} orders
										</p>
									</div>
								</div>
								<div className="text-right font-mono font-bold">
									{formatCurrency(store.revenue)}
								</div>
							</div>
						))}
					</CardContent>
				</Card>

				<Card className="shadow-sm">
					<CardHeader>
						<CardTitle className="flex items-center gap-2 text-base font-semibold">
							<TrendingUp className="size-5 text-emerald-500" />
							Top Performing Products
						</CardTitle>
						<CardDescription>
							Highest revenue generators across all locations
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						{topProducts.map((p) => (
							<div
								key={p.sku}
								className="flex items-center justify-between border-b pb-3 last:border-0 last:pb-0 text-sm"
							>
								<div>
									<p className="font-semibold truncate max-w-[220px]">
										{p.name}
									</p>
									<p className="text-xs text-muted-foreground font-mono">
										{p.sku} • {p.unitsSold} units
									</p>
								</div>
								<div className="text-right font-mono font-bold">
									{formatCurrency(p.revenue)}
								</div>
							</div>
						))}
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
