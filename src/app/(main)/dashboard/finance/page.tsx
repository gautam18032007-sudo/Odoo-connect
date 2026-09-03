"use client";

import { format } from "date-fns";
import {
	ArrowUpRight,
	Building2,
	CheckCircle2,
	DollarSign,
	Receipt,
	RefreshCw,
	TrendingUp,
	Wallet,
} from "lucide-react";
import { useEffect, useState } from "react";
import { GlobalFilterBar } from "@/components/founder/global-filter-bar";
import { PipelineStatusBanner } from "@/components/founder/pipeline-status-banner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
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
import { useStabilizedDashboard } from "@/hooks/use-stabilized-dashboard";
import { formatCurrency } from "@/lib/utils";
import { useFilterStore } from "@/stores/founder/filter-store";

export default function FinancePage() {
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

	const fetcher = async (signal: AbortSignal) => {
		const params = new URLSearchParams();
		if (startDate) params.set("startDate", startDate);
		if (endDate) params.set("endDate", endDate);
		if (store !== "ALL") params.set("store", store);
		if (category !== "All Categories") params.set("category", category);
		if (brand !== "All Brands") params.set("brand", brand);
		if (sku) params.set("sku", sku);

		const res = await fetch(`/api/finance/summary?${params.toString()}`, {
			signal,
		});
		const json = await res.json();
		if (json.success) {
			return json.data;
		}
		return null;
	};

	const { data, isInitialLoading, refetch } = useStabilizedDashboard({
		fetcher,
		dependencies: [startDate, endDate, store, category, brand, sku],
	});

	const formattedDate = format(new Date(), "EEEE, do MMMM yyyy");

	if (!data && isInitialLoading) {
		return (
			<div className="flex flex-col gap-6 p-4 md:p-8 pt-4">
				<Skeleton className="h-14 w-full rounded-xl" />
				<div className="grid grid-cols-1 md:grid-cols-4 gap-4">
					<Skeleton className="h-32 rounded-xl" />
					<Skeleton className="h-32 rounded-xl" />
					<Skeleton className="h-32 rounded-xl" />
					<Skeleton className="h-32 rounded-xl" />
				</div>
				<Skeleton className="h-96 w-full rounded-xl" />
			</div>
		);
	}

	const {
		totalRevenue = 0,
		totalPurchaseSpend = 0,
		grossMargin = 0,
		grossMarginPercent = null,
		hasPurchaseData = false,
		openPurchaseOrdersCount = 0,
		openPurchaseOrdersValue = 0,
		recentPurchaseOrders = [],
		vendorBreakdown = [],
	} = data;

	return (
		<div className="flex flex-col gap-6 p-4 md:p-8 pt-4">
			<PipelineStatusBanner />

			<div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
				<div className="flex flex-col gap-1">
					<h1 className="text-3xl leading-none tracking-tight font-bold">
						Finance & Purchase Orders
					</h1>
					<p className="text-muted-foreground text-sm">{formattedDate}</p>
				</div>

				<div className="flex items-center gap-3">
					<Button variant="outline" size="sm" onClick={() => refetch()}>
						<RefreshCw className="mr-2 size-4" />
						Refresh Financials
					</Button>
				</div>
			</div>

			<GlobalFilterBar
				availableStores={status?.availableStores || []}
				availableCategories={status?.availableCategories || []}
				availableBrands={status?.availableBrands || []}
				categoryBrandMap={status?.categoryBrandMap || {}}
			/>

			{/* Financial KPI Cards */}
			<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
				<Card className="relative overflow-hidden bg-gradient-to-br from-card to-emerald-500/5">
					<CardContent className="p-5 flex flex-col gap-2">
						<div className="flex items-center justify-between">
							<span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
								Sales Revenue
							</span>
							<div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
								<DollarSign className="size-4" />
							</div>
						</div>
						<div className="text-2xl font-bold font-mono tracking-tight">
							{formatCurrency(totalRevenue)}
						</div>
						<div className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
							<ArrowUpRight className="size-3.5" />
							<span>Sales Fact Verified</span>
						</div>
					</CardContent>
				</Card>

				<Card className="relative overflow-hidden bg-gradient-to-br from-card to-blue-500/5">
					<CardContent className="p-5 flex flex-col gap-2">
						<div className="flex items-center justify-between">
							<span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
								Purchase Order Spend
							</span>
							<div className="p-2 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
								<Receipt className="size-4" />
							</div>
						</div>
						<div className="text-2xl font-bold font-mono tracking-tight">
							{formatCurrency(totalPurchaseSpend)}
						</div>
						<div className="flex items-center gap-1 text-xs text-muted-foreground">
							<span>{openPurchaseOrdersCount} Open POs (</span>
							<span className="font-mono">
								{formatCurrency(openPurchaseOrdersValue)}
							</span>
							<span>)</span>
						</div>
					</CardContent>
				</Card>

				<Card className="relative overflow-hidden bg-gradient-to-br from-card to-purple-500/5">
					<CardContent className="p-5 flex flex-col gap-2">
						<div className="flex items-center justify-between">
							<span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
								Gross Contribution Margin
							</span>
							<div className="p-2 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400">
								<TrendingUp className="size-4" />
							</div>
						</div>
						<div className="text-2xl font-bold font-mono tracking-tight">
							{hasPurchaseData ? formatCurrency(grossMargin) : "N/A"}
						</div>
						<div className="flex items-center gap-1 text-xs text-purple-600 dark:text-purple-400 font-medium">
							{hasPurchaseData && grossMarginPercent !== null ? (
								<span>{grossMarginPercent.toFixed(1)}% Net Margin</span>
							) : (
								<span className="text-muted-foreground">
									No purchase order data recorded yet
								</span>
							)}
						</div>
					</CardContent>
				</Card>

				<Card className="relative overflow-hidden bg-gradient-to-br from-card to-amber-500/5">
					<CardContent className="p-5 flex flex-col gap-2">
						<div className="flex items-center justify-between">
							<span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
								Odoo Purchase Status
							</span>
							<div className="p-2 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
								<Wallet className="size-4" />
							</div>
						</div>
						<div className="text-2xl font-bold font-mono tracking-tight">
							Active Sync
						</div>
						<div className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 font-medium">
							<CheckCircle2 className="size-3.5" />
							<span>GRN & Invoice Matching</span>
						</div>
					</CardContent>
				</Card>
			</div>

			<div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
				{/* Recent Purchase Orders */}
				<Card className="lg:col-span-8">
					<CardHeader>
						<CardTitle className="leading-none flex items-center justify-between">
							<span>Recent Purchase Orders</span>
							<Badge
								variant="outline"
								className="font-mono text-xs font-normal"
							>
								Odoo Integration
							</Badge>
						</CardTitle>
						<CardDescription>
							Track goods received, vendor bills, and procurement status.
						</CardDescription>
					</CardHeader>
					<CardContent className="px-0">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>PO Number</TableHead>
									<TableHead>Vendor</TableHead>
									<TableHead>Order Date</TableHead>
									<TableHead>State</TableHead>
									<TableHead className="text-right">Total Amount</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{recentPurchaseOrders.length > 0 ? (
									recentPurchaseOrders.map((po: any) => (
										<TableRow key={po.id}>
											<TableCell className="font-mono font-semibold text-xs">
												{po.poNumber}
											</TableCell>
											<TableCell>
												<div className="flex items-center gap-2">
													<Building2 className="size-3.5 text-muted-foreground shrink-0" />
													<span className="font-medium text-xs">
														{po.vendorName}
													</span>
												</div>
											</TableCell>
											<TableCell className="text-xs text-muted-foreground">
												{po.orderDate}
											</TableCell>
											<TableCell>
												<Badge
													variant="outline"
													className={`text-[10px] px-2 py-0.5 uppercase ${
														po.state === "purchase" || po.state === "done"
															? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
															: "bg-amber-500/10 text-amber-600 border-amber-500/30"
													}`}
												>
													{po.state}
												</Badge>
											</TableCell>
											<TableCell className="text-right font-mono font-semibold text-xs">
												{formatCurrency(po.amountTotal)}
											</TableCell>
										</TableRow>
									))
								) : (
									<TableRow>
										<TableCell
											colSpan={5}
											className="h-32 text-center text-muted-foreground"
										>
											No purchase orders recorded yet. Webhooks will
											automatically populate POs from Odoo.
										</TableCell>
									</TableRow>
								)}
							</TableBody>
						</Table>
					</CardContent>
				</Card>

				{/* Vendor Spend Breakdown */}
				<Card className="lg:col-span-4">
					<CardHeader>
						<CardTitle className="leading-none">Top Vendor Spend</CardTitle>
						<CardDescription>
							Procurement breakdown across top suppliers.
						</CardDescription>
					</CardHeader>
					<CardContent className="flex flex-col gap-4">
						{vendorBreakdown.length > 0 ? (
							vendorBreakdown.map((item: any, idx: number) => {
								const percentage =
									totalPurchaseSpend > 0
										? Math.round((item.totalSpend / totalPurchaseSpend) * 100)
										: 0;

								return (
									<div
										key={item.vendor || idx}
										className="flex flex-col gap-1.5"
									>
										<div className="flex items-center justify-between text-xs">
											<span className="font-semibold text-foreground truncate">
												{item.vendor}
											</span>
											<span className="font-mono font-semibold">
												{formatCurrency(item.totalSpend)}
											</span>
										</div>
										<Progress value={percentage} className="h-2" />
										<div className="flex items-center justify-between text-[11px] text-muted-foreground">
											<span>{item.poCount} Orders</span>
											<span>{percentage}% of Total</span>
										</div>
									</div>
								);
							})
						) : (
							<div className="flex flex-col items-center justify-center h-44 text-center text-muted-foreground text-xs">
								Vendor analytics populate as purchase orders are ingested.
							</div>
						)}
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
