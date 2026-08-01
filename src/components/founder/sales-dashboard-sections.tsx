"use client";

import { Download, Loader2 } from "lucide-react";
import { memo, useState } from "react";
import { formatStoreName } from "@/components/founder/global-filter-bar";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	DATE_PRESETS,
	type DatePresetValue,
	getPresetRange,
} from "@/lib/date-presets";
import { exportDashboardWorkbook, exportToExcel } from "@/lib/export-excel";
import { STORE_WHITELIST } from "@/lib/founder/types";
import { formatCurrency } from "@/lib/utils";
import { useFilterStore } from "@/stores/founder/filter-store";

interface ExportColumn<T> {
	header: string;
	accessor: (row: T, rank: number) => string | number | null;
}

type ExportDataset =
	| "customers"
	| "skus"
	| "brands"
	| "payments"
	| "bill-cuts"
	| "aov";

/**
 * Export button for every dashboard card: opens a small dialog to confirm/override
 * the Store and Time Period for this export specifically (defaults to whatever the
 * dashboard is currently filtered to), then fetches the COMPLETE matching dataset
 * from the backend — never just the Top N rows shown on screen.
 */
function DatasetExportButton<T>({
	dashboardName,
	dataset,
	columns,
	sortBy,
}: {
	dashboardName: string;
	dataset: ExportDataset;
	columns: ExportColumn<T>[];
	sortBy: (row: T) => number;
}) {
	const globalStartDate = useFilterStore((state) => state.startDate);
	const globalEndDate = useFilterStore((state) => state.endDate);
	const globalStore = useFilterStore((state) => state.store);
	const category = useFilterStore((state) => state.category);
	const brand = useFilterStore((state) => state.brand);
	const sku = useFilterStore((state) => state.sku);
	const categoryScope = useFilterStore((state) => state.categoryScope);
	const compareMode = useFilterStore((state) => state.compareMode);
	const compareStartDate = useFilterStore((state) => state.compareStartDate);
	const compareEndDate = useFilterStore((state) => state.compareEndDate);

	const [open, setOpen] = useState(false);
	const [store, setStore] = useState(globalStore);
	const [preset, setPreset] = useState<DatePresetValue>("custom");
	const [startDate, setStartDate] = useState(globalStartDate);
	const [endDate, setEndDate] = useState(globalEndDate);
	const [isExporting, setIsExporting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const openDialog = () => {
		// Re-seed from the dashboard's current filters each time it's opened.
		setStore(globalStore);
		setPreset("custom");
		setStartDate(globalStartDate);
		setEndDate(globalEndDate);
		setError(null);
		setOpen(true);
	};

	const handlePresetChange = (value: string) => {
		setPreset(value as DatePresetValue);
		const range = getPresetRange(value);
		if (range) {
			setStartDate(range.startDate);
			setEndDate(range.endDate);
		}
	};

	const handleExport = async () => {
		setIsExporting(true);
		setError(null);
		try {
			const params = new URLSearchParams({ dataset, startDate, endDate });
			if (store !== "ALL") params.set("store", store);
			if (category !== "All Categories") params.set("category", category);
			if (brand !== "All Brands") params.set("brand", brand);
			if (sku) params.set("sku", sku);
			if (categoryScope !== "all") params.set("categoryScope", categoryScope);
			params.set("compareMode", compareMode);
			if (compareMode === "custom") {
				params.set("compareStartDate", compareStartDate);
				params.set("compareEndDate", compareEndDate);
			}

			const res = await fetch(`/api/sales/export?${params.toString()}`);
			const json = await res.json();
			if (!json.success) {
				throw new Error(json.error ?? "Export failed");
			}

			exportDashboardWorkbook({
				dashboardName,
				store,
				startDate,
				endDate,
				rows: json.data.rows as T[],
				columns,
				sortBy,
			});
			setOpen(false);
		} catch (err) {
			console.error(`Failed to export ${dataset}`, err);
			setError(err instanceof Error ? err.message : "Export failed");
		} finally {
			setIsExporting(false);
		}
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => (next ? openDialog() : setOpen(next))}
		>
			<DialogTrigger asChild>
				<Button
					variant="outline"
					size="sm"
					className="h-8 gap-1.5 text-xs shadow-sm hover:bg-accent"
				>
					<Download className="h-3.5 w-3.5" />
					Export Excel
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Export {dashboardName.replace(/_/g, " ")}</DialogTitle>
					<DialogDescription>
						Choose the store and time period for this export. All matching
						records are included, sorted highest to lowest — not just what's
						shown on screen.
					</DialogDescription>
				</DialogHeader>
				<div className="grid gap-4 py-2">
					<div className="grid gap-1.5">
						<span className="text-xs font-medium text-muted-foreground">
							Store
						</span>
						<Select value={store} onValueChange={setStore}>
							<SelectTrigger className="h-9 w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="ALL">All Stores</SelectItem>
								{STORE_WHITELIST.map((storeName) => (
									<SelectItem key={storeName} value={storeName}>
										{formatStoreName(storeName)}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<div className="grid gap-1.5">
						<span className="text-xs font-medium text-muted-foreground">
							Time Period
						</span>
						<Select value={preset} onValueChange={handlePresetChange}>
							<SelectTrigger className="h-9 w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{DATE_PRESETS.map((p) => (
									<SelectItem key={p.value} value={p.value}>
										{p.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						{preset === "custom" && (
							<div className="flex items-center gap-2 pt-1">
								<input
									type="date"
									value={startDate}
									onChange={(e) => setStartDate(e.target.value)}
									className="h-9 flex-1 rounded-md border bg-background px-2 text-sm"
								/>
								<span className="text-muted-foreground text-xs">to</span>
								<input
									type="date"
									value={endDate}
									onChange={(e) => setEndDate(e.target.value)}
									className="h-9 flex-1 rounded-md border bg-background px-2 text-sm"
								/>
							</div>
						)}
					</div>
					{error && <p className="text-xs text-destructive">{error}</p>}
				</div>
				<DialogFooter>
					<Button onClick={handleExport} disabled={isExporting}>
						{isExporting ? (
							<Loader2 className="h-3.5 w-3.5 animate-spin" />
						) : (
							<Download className="h-3.5 w-3.5" />
						)}
						Export
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function GrowthText({ value }: { value: number | null }) {
	if (value === null) return <span className="text-muted-foreground">—</span>;
	const formatted =
		value >= 0 ? `+${value.toFixed(1)}%` : `${value.toFixed(1)}%`;
	const colorClass =
		value > 0
			? "text-status-on-track font-semibold"
			: value < 0
				? "text-status-delayed font-semibold"
				: "text-muted-foreground";
	return <span className={colorClass}>{formatted}</span>;
}

function ExportButton({
	data,
	filename,
	sheetName,
}: {
	data: Array<any>;
	filename: string;
	sheetName: string;
}) {
	return (
		<Button
			variant="outline"
			size="sm"
			className="h-8 gap-1.5 text-xs shadow-sm hover:bg-accent"
			onClick={() => exportToExcel(data, filename, sheetName)}
		>
			<Download className="h-3.5 w-3.5" />
			Export Excel
		</Button>
	);
}

export const DailyHealthTable = memo(function DailyHealthTable({
	metrics,
	comparisonLabel,
}: {
	metrics: Array<{
		metric: string;
		current: number;
		previous: number | null;
		growth: number | null;
		footnote?: string;
	}>;
	comparisonLabel?: string;
}) {
	const rows = metrics.map((m) => ({
		Metric: m.metric,
		Current:
			m.metric === "AOV" || m.metric === "Sales"
				? formatCurrency(m.current)
				: m.current.toLocaleString(),
		Previous:
			m.previous == null
				? "—"
				: m.metric === "AOV" || m.metric === "Sales"
					? formatCurrency(m.previous)
					: m.previous.toLocaleString(),
		Growth: m.growth,
		footnote: m.footnote,
	}));

	// Prepare clean export structure
	const exportData = metrics.map((m) => ({
		Metric: m.metric,
		Current: m.current,
		Previous: m.previous,
		"Growth (%)": m.growth,
	}));

	const footnote = metrics.find((m) => m.footnote)?.footnote;

	return (
		<Card>
			<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
				<div>
					<CardTitle>Daily Business Health</CardTitle>
					<CardDescription>
						<span>Current vs previous period — mirror comparison</span>
						{comparisonLabel && (
							<span className="block text-xs text-muted-foreground/80 mt-0.5">
								Compared: {comparisonLabel}
							</span>
						)}
					</CardDescription>
				</div>
				<ExportButton
					data={exportData}
					filename="Daily_Business_Health"
					sheetName="Daily Health"
				/>
			</CardHeader>
			<CardContent>
				<table className="w-full text-sm">
					<thead className="text-xs text-muted-foreground uppercase border-b">
						<tr>
							<th className="px-3 py-2 text-left">Metric</th>
							<th className="px-3 py-2 text-right">Current</th>
							<th className="px-3 py-2 text-right">Previous</th>
							<th className="px-3 py-2 text-right">Growth</th>
						</tr>
					</thead>
					<tbody>
						{rows.map((row) => (
							<tr
								key={row.Metric}
								className="border-b last:border-0 hover:bg-muted/10 transition-colors"
							>
								<td className="px-3 py-2 font-medium">{row.Metric}</td>
								<td className="px-3 py-2 text-right">{row.Current}</td>
								<td className="px-3 py-2 text-right">{row.Previous}</td>
								<td className="px-3 py-2 text-right">
									<GrowthText value={row.Growth} />
								</td>
							</tr>
						))}
					</tbody>
				</table>
				{footnote && (
					<p className="text-xs text-muted-foreground mt-3">{footnote}</p>
				)}
			</CardContent>
		</Card>
	);
});

export const BrandPerformanceTable = memo(function BrandPerformanceTable({
	data,
	comparisonLabel,
}: {
	data: Array<{
		brand: string;
		currentUnits: number;
		currentRevenue: number;
		unitsGrowthPct: number | null;
	}>;
	comparisonLabel?: string;
}) {
	return (
		<Card>
			<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
				<div>
					<CardTitle>Brand Performance</CardTitle>
					<CardDescription>
						<span>Top brands by volume and revenue shift</span>
						{comparisonLabel && (
							<span className="block text-xs text-muted-foreground/80 mt-0.5">
								Compared: {comparisonLabel}
							</span>
						)}
					</CardDescription>
				</div>
				<DatasetExportButton<{
					brand: string;
					currentUnits: number;
					currentRevenue: number;
					unitsGrowthPct: number | null;
				}>
					dashboardName="Brand_Performance"
					dataset="brands"
					sortBy={(row) => row.currentRevenue}
					columns={[
						{ header: "Rank", accessor: (_row, rank) => rank },
						{ header: "Brand", accessor: (row) => row.brand },
						{ header: "Units", accessor: (row) => row.currentUnits },
						{ header: "Revenue", accessor: (row) => row.currentRevenue },
						{
							header: "Growth (%)",
							accessor: (row) => row.unitsGrowthPct,
						},
					]}
				/>
			</CardHeader>
			<CardContent className="overflow-x-auto">
				<table className="w-full text-sm">
					<thead className="text-xs text-muted-foreground uppercase border-b">
						<tr>
							<th className="px-3 py-2 text-left">Brand</th>
							<th className="px-3 py-2 text-right">Units</th>
							<th className="px-3 py-2 text-right">Revenue</th>
							<th className="px-3 py-2 text-right">Growth</th>
						</tr>
					</thead>
					<tbody>
						{data.slice(0, 10).map((row) => (
							<tr
								key={row.brand}
								className="border-b hover:bg-muted/10 transition-colors"
							>
								<td className="px-3 py-2 font-medium">{row.brand}</td>
								<td className="px-3 py-2 text-right">
									{row.currentUnits.toLocaleString()}
								</td>
								<td className="px-3 py-2 text-right">
									{formatCurrency(row.currentRevenue)}
								</td>
								<td className="px-3 py-2 text-right">
									<GrowthText value={row.unitsGrowthPct} />
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</CardContent>
		</Card>
	);
});

export const SkuPerformanceTable = memo(function SkuPerformanceTable({
	data,
	comparisonLabel,
}: {
	data: Array<{
		skuCode: string | null;
		itemName: string;
		currentUnits: number;
		currentRevenue: number;
		unitsGrowthPct: number | null;
	}>;
	comparisonLabel?: string;
}) {
	return (
		<Card>
			<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
				<div>
					<CardTitle>Product (SKU) Performance</CardTitle>
					<CardDescription>
						<span>Movers by absolute growth and unit volume</span>
						{comparisonLabel && (
							<span className="block text-xs text-muted-foreground/80 mt-0.5">
								Compared: {comparisonLabel}
							</span>
						)}
					</CardDescription>
				</div>
				<DatasetExportButton<{
					skuCode: string | null;
					itemName: string;
					currentUnits: number;
					currentRevenue: number;
					unitsGrowthPct: number | null;
				}>
					dashboardName="SKU_Performance"
					dataset="skus"
					sortBy={(row) => row.currentRevenue}
					columns={[
						{ header: "Rank", accessor: (_row, rank) => rank },
						{ header: "SKU", accessor: (row) => row.skuCode ?? "—" },
						{ header: "Item", accessor: (row) => row.itemName },
						{ header: "Units", accessor: (row) => row.currentUnits },
						{ header: "Revenue", accessor: (row) => row.currentRevenue },
						{
							header: "Growth (%)",
							accessor: (row) => row.unitsGrowthPct,
						},
					]}
				/>
			</CardHeader>
			<CardContent className="overflow-x-auto">
				<table className="w-full text-sm">
					<thead className="text-xs text-muted-foreground uppercase border-b">
						<tr>
							<th className="px-3 py-2 text-left">SKU</th>
							<th className="px-3 py-2 text-left">Item</th>
							<th className="px-3 py-2 text-right">Units</th>
							<th className="px-3 py-2 text-right">Revenue</th>
							<th className="px-3 py-2 text-right">Growth</th>
						</tr>
					</thead>
					<tbody>
						{data.slice(0, 10).map((row) => (
							<tr
								key={`${row.skuCode ?? "missing-sku"}-${row.itemName}-${row.currentRevenue}`}
								className="border-b hover:bg-muted/10 transition-colors"
							>
								<td className="px-3 py-2 font-mono text-xs">
									{row.skuCode ?? "—"}
								</td>
								<td className="px-3 py-2 font-medium">{row.itemName}</td>
								<td className="px-3 py-2 text-right">
									{row.currentUnits.toLocaleString()}
								</td>
								<td className="px-3 py-2 text-right">
									{formatCurrency(row.currentRevenue)}
								</td>
								<td className="px-3 py-2 text-right">
									<GrowthText value={row.unitsGrowthPct} />
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</CardContent>
		</Card>
	);
});

export const BillCutAnalysisTable = memo(function BillCutAnalysisTable({
	data,
	comparisonLabel,
}: {
	data: Array<{
		category: string;
		currentBillCuts: number;
		billCutsGrowthPct: number | null;
	}>;
	comparisonLabel?: string;
}) {
	return (
		<Card>
			<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
				<div>
					<CardTitle>Bill Cut Analysis by Category</CardTitle>
					<CardDescription>
						<span>Transaction volume contribution by category</span>
						{comparisonLabel && (
							<span className="block text-xs text-muted-foreground/80 mt-0.5">
								Compared: {comparisonLabel}
							</span>
						)}
					</CardDescription>
				</div>
				<DatasetExportButton<{
					category: string;
					currentBillCuts: number;
					billCutsGrowthPct: number | null;
				}>
					dashboardName="Bill_Cut_Analysis"
					dataset="bill-cuts"
					sortBy={(row) => row.currentBillCuts}
					columns={[
						{ header: "Rank", accessor: (_row, rank) => rank },
						{ header: "Category", accessor: (row) => row.category },
						{ header: "Bill Cuts", accessor: (row) => row.currentBillCuts },
						{
							header: "Growth (%)",
							accessor: (row) => row.billCutsGrowthPct,
						},
					]}
				/>
			</CardHeader>
			<CardContent className="overflow-x-auto">
				<table className="w-full text-sm">
					<thead className="text-xs text-muted-foreground uppercase border-b">
						<tr>
							<th className="px-3 py-2 text-left">Category</th>
							<th className="px-3 py-2 text-right">Bill Cuts</th>
							<th className="px-3 py-2 text-right">Growth</th>
						</tr>
					</thead>
					<tbody>
						{data.slice(0, 15).map((row) => (
							<tr
								key={row.category}
								className="border-b hover:bg-muted/10 transition-colors"
							>
								<td className="px-3 py-2 font-medium">{row.category}</td>
								<td className="px-3 py-2 text-right">
									{row.currentBillCuts.toLocaleString()}
								</td>
								<td className="px-3 py-2 text-right">
									<GrowthText value={row.billCutsGrowthPct} />
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</CardContent>
		</Card>
	);
});

export const AovAnalysisTable = memo(function AovAnalysisTable({
	data,
	comparisonLabel,
}: {
	data: Array<{
		category: string;
		currentAov: number;
		aovGrowthPct: number | null;
	}>;
	comparisonLabel?: string;
}) {
	return (
		<Card>
			<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
				<div>
					<CardTitle>AOV Analysis by Category</CardTitle>
					<CardDescription>
						<span>Basket value size shift by category</span>
						{comparisonLabel && (
							<span className="block text-xs text-muted-foreground/80 mt-0.5">
								Compared: {comparisonLabel}
							</span>
						)}
					</CardDescription>
				</div>
				<DatasetExportButton<{
					category: string;
					currentAov: number;
					aovGrowthPct: number | null;
				}>
					dashboardName="AOV_Analysis"
					dataset="aov"
					sortBy={(row) => row.currentAov}
					columns={[
						{ header: "Rank", accessor: (_row, rank) => rank },
						{ header: "Category", accessor: (row) => row.category },
						{ header: "AOV", accessor: (row) => row.currentAov },
						{
							header: "Growth (%)",
							accessor: (row) => row.aovGrowthPct,
						},
					]}
				/>
			</CardHeader>
			<CardContent className="overflow-x-auto">
				<table className="w-full text-sm">
					<thead className="text-xs text-muted-foreground uppercase border-b">
						<tr>
							<th className="px-3 py-2 text-left">Category</th>
							<th className="px-3 py-2 text-right">AOV</th>
							<th className="px-3 py-2 text-right">Growth</th>
						</tr>
					</thead>
					<tbody>
						{data.slice(0, 15).map((row) => (
							<tr
								key={row.category}
								className="border-b hover:bg-muted/10 transition-colors"
							>
								<td className="px-3 py-2 font-medium">{row.category}</td>
								<td className="px-3 py-2 text-right">
									{formatCurrency(row.currentAov)}
								</td>
								<td className="px-3 py-2 text-right">
									<GrowthText value={row.aovGrowthPct} />
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</CardContent>
		</Card>
	);
});

export const CustomerIntelligenceCard = memo(function CustomerIntelligenceCard({
	data,
	comparisonLabel,
}: {
	data: {
		totalCustomers: number;
		repeatCustomers: number;
		newCustomers: number;
		repeatCustomersNote: string;
		topCustomers: Array<{
			customerName: string | null;
			customerMobile: string;
			billCount: number;
			revenue: number;
		}>;
	};
	comparisonLabel?: string;
}) {
	return (
		<Card>
			<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
				<div>
					<CardTitle>Customer Intelligence</CardTitle>
					<CardDescription>
						<span>{data.repeatCustomersNote}</span>
						{comparisonLabel && (
							<span className="block text-xs text-muted-foreground/80 mt-0.5">
								Compared: {comparisonLabel}
							</span>
						)}
					</CardDescription>
				</div>
				<DatasetExportButton<{
					customerName: string | null;
					customerMobile: string;
					billCount: number;
					revenue: number;
				}>
					dashboardName="Customer_Intelligence"
					dataset="customers"
					sortBy={(row) => row.revenue}
					columns={[
						{ header: "Rank", accessor: (_row, rank) => rank },
						{
							header: "Customer",
							accessor: (row) => row.customerName ?? row.customerMobile,
						},
						{ header: "Mobile", accessor: (row) => row.customerMobile },
						{ header: "Bills", accessor: (row) => row.billCount },
						{ header: "Revenue", accessor: (row) => row.revenue },
					]}
				/>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="grid grid-cols-3 gap-3">
					<div className="rounded-lg border p-3">
						<p className="text-xs text-muted-foreground">Total Customers</p>
						<p className="text-xl font-bold">
							{data.totalCustomers.toLocaleString()}
						</p>
					</div>
					<div className="rounded-lg border p-3">
						<p className="text-xs text-muted-foreground">Repeat Customers</p>
						<p className="text-xl font-bold">
							{data.repeatCustomers.toLocaleString()}
						</p>
					</div>
					<div className="rounded-lg border p-3">
						<p className="text-xs text-muted-foreground">New Customers</p>
						<p className="text-xl font-bold">
							{data.newCustomers.toLocaleString()}
						</p>
					</div>
				</div>
				<table className="w-full text-sm">
					<thead className="text-xs text-muted-foreground uppercase border-b">
						<tr>
							<th className="px-3 py-2 text-left">Customer</th>
							<th className="px-3 py-2 text-right">Bills</th>
							<th className="px-3 py-2 text-right">Revenue</th>
						</tr>
					</thead>
					<tbody>
						{data.topCustomers.map((c) => (
							<tr
								key={c.customerMobile}
								className="border-b hover:bg-muted/10 transition-colors"
							>
								<td className="px-3 py-2 font-medium">
									{c.customerName ?? c.customerMobile}
								</td>
								<td className="px-3 py-2 text-right">{c.billCount}</td>
								<td className="px-3 py-2 text-right font-semibold">
									{formatCurrency(c.revenue)}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</CardContent>
		</Card>
	);
});

export const PaymentAnalysisCard = memo(function PaymentAnalysisCard({
	data,
	comparisonLabel,
}: {
	data: {
		methods: Array<{
			paymentMethod: string;
			revenue: number;
			billCuts: number;
			revenueSharePct: number;
		}>;
	};
	comparisonLabel?: string;
}) {
	return (
		<Card>
			<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
				<div>
					<CardTitle>Payment Analysis</CardTitle>
					<CardDescription>
						<span>Revenue and transaction count by payment channel</span>
						{comparisonLabel && (
							<span className="block text-xs text-muted-foreground/80 mt-0.5">
								Compared: {comparisonLabel}
							</span>
						)}
					</CardDescription>
				</div>
				<DatasetExportButton<{
					paymentMethod: string;
					revenue: number;
					billCuts: number;
					revenueSharePct: number;
				}>
					dashboardName="Payment_Analysis"
					dataset="payments"
					sortBy={(row) => row.revenue}
					columns={[
						{ header: "Rank", accessor: (_row, rank) => rank },
						{
							header: "Payment Method",
							accessor: (row) => row.paymentMethod,
						},
						{ header: "Revenue", accessor: (row) => row.revenue },
						{ header: "Bill Cuts", accessor: (row) => row.billCuts },
						{ header: "Share (%)", accessor: (row) => row.revenueSharePct },
					]}
				/>
			</CardHeader>
			<CardContent className="overflow-x-auto">
				<table className="w-full text-sm">
					<thead className="text-xs text-muted-foreground uppercase border-b">
						<tr>
							<th className="px-3 py-2 text-left">Method</th>
							<th className="px-3 py-2 text-right">Revenue</th>
							<th className="px-3 py-2 text-right">Bills</th>
							<th className="px-3 py-2 text-right">Share</th>
						</tr>
					</thead>
					<tbody>
						{data.methods.map((row) => (
							<tr
								key={row.paymentMethod}
								className="border-b hover:bg-muted/10 transition-colors"
							>
								<td className="px-3 py-2 font-medium">{row.paymentMethod}</td>
								<td className="px-3 py-2 text-right font-semibold">
									{formatCurrency(row.revenue)}
								</td>
								<td className="px-3 py-2 text-right">
									{row.billCuts.toLocaleString()}
								</td>
								<td className="px-3 py-2 text-right">{row.revenueSharePct}%</td>
							</tr>
						))}
					</tbody>
				</table>
			</CardContent>
		</Card>
	);
});
