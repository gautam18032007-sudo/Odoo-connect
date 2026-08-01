"use client";

import { format } from "date-fns";
import { AlertTriangle, BarChart3, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { GlobalFilterBar } from "@/components/founder/global-filter-bar";
import { AovBillCutsAnalysis } from "@/components/store-overview/AovBillCutsAnalysis";
import { DiagnosisCard } from "@/components/store-overview/DiagnosisCard";
import { ForecastCard } from "@/components/store-overview/ForecastCard";
import { StorePerformanceTable } from "@/components/store-overview/StorePerformanceTable";
import { TrendChart } from "@/components/store-overview/TrendChart";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useStabilizedDashboard } from "@/hooks/use-stabilized-dashboard";
import { useFilterStore } from "@/stores/founder/filter-store";

export default function Page() {
	const router = useRouter();
	const [status, setStatus] = useState<any>(null);
	const [health, setHealth] = useState<any>(null);

	const {
		startDate,
		endDate,
		isDateFiltered,
		store,
		category,
		brand,
		sku,
		categoryScope,
		compareMode,
		compareStartDate,
		compareEndDate,
	} = useFilterStore();

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

		const fetchHealth = async () => {
			try {
				const res = await fetch("/api/data-health");
				const json = await res.json();
				if (json.success) {
					setHealth(json.data);
				}
			} catch (err) {
				console.error("Failed to fetch data health", err);
			}
		};

		fetchStatus();
		fetchHealth();
	}, []);

	const fetcher = async (signal: AbortSignal) => {
		const params = new URLSearchParams();
		if (isDateFiltered) {
			params.set("startDate", startDate);
			params.set("endDate", endDate);
			params.set("compareMode", compareMode);
			if (compareMode === "custom") {
				params.set("compareStartDate", compareStartDate);
				params.set("compareEndDate", compareEndDate);
			}
		}
		if (store !== "ALL") params.set("store", store);
		if (category !== "All Categories") params.set("category", category);
		if (brand !== "All Brands") params.set("brand", brand);
		if (sku) params.set("sku", sku);
		if (categoryScope !== "all") params.set("categoryScope", categoryScope);

		const res = await fetch(`/api/sales/store-overview?${params.toString()}`, {
			signal,
		});
		const json = await res.json();
		if (json.success) {
			return json.data;
		}
		return null;
	};

	const { data, isInitialLoading } = useStabilizedDashboard({
		fetcher,
		enabled: Boolean(status?.hasData),
		dependencies: [
			status?.hasData,
			startDate,
			endDate,
			isDateFiltered,
			store,
			category,
			brand,
			sku,
			categoryScope,
			compareMode,
			compareStartDate,
			compareEndDate,
		],
	});

	if (!status) {
		return (
			<div className="p-8">
				<Skeleton className="h-[400px] w-full" />
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
					<h2 className="text-2xl font-bold">Store Command Center</h2>
					<p className="text-muted-foreground">
						No data has been uploaded yet. Upload your sales data to unlock
						per-store revenue, AOV, bill cuts, and forecast insights.
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

	if (!data && isInitialLoading) {
		return (
			<div className="flex flex-col gap-4 p-4 md:p-8 pt-4">
				<div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
					<div className="flex flex-col gap-2">
						<div className="flex flex-col gap-1">
							<h1 className="text-3xl leading-none tracking-tight font-bold">
								Store Command Center
							</h1>
							<p className="text-muted-foreground text-sm">{formattedDate}</p>
						</div>
						<Skeleton className="h-6 w-[280px] rounded-md" />
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

				<div className="grid gap-4 grid-cols-12 mt-2">
					<Skeleton className="h-[380px] col-span-12 xl:col-span-8 rounded-xl" />
					<Skeleton className="h-[380px] col-span-12 xl:col-span-4 rounded-xl" />
					<Skeleton className="h-[320px] col-span-12 xl:col-span-8 rounded-xl" />
					<Skeleton className="h-[320px] col-span-12 xl:col-span-4 rounded-xl" />
				</div>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-4 p-4 md:p-8 pt-4">
			<div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
				<div className="flex flex-col gap-2">
					<div className="flex flex-col gap-1">
						<h1 className="text-3xl leading-none tracking-tight font-bold">
							Store Command Center
						</h1>
						<p className="text-muted-foreground text-sm">{formattedDate}</p>
					</div>
					{data?.context && (
						<Badge
							variant="outline"
							className="h-auto w-fit flex-wrap gap-2 px-2.5 py-1 text-xs font-semibold text-muted-foreground"
						>
							<span className="font-bold text-foreground">
								{data.context.title.split(" vs ")[0]}
							</span>
							<span className="text-muted-foreground font-normal">
								({data.context.current})
							</span>
							<span className="text-muted-foreground/60 font-normal px-0.5">
								Compared with
							</span>
							<span className="font-semibold text-foreground">
								{data.context.title.split(" vs ")[1]}
							</span>
							<span className="text-muted-foreground font-normal">
								({data.context.previous})
							</span>
						</Badge>
					)}
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

			{health && !health.isHealthy && (
				<Alert className="mb-2 border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400">
					<AlertTriangle className="size-4 shrink-0" />
					<AlertTitle className="font-bold">
						Database Integrity Warnings Detected
					</AlertTitle>
					<AlertDescription className="text-amber-600 dark:text-amber-400">
						<ul className="list-disc list-inside pl-1 space-y-1 text-xs">
							{health.invalidStoresCount > 0 && (
								<li>
									<strong>Invalid Stores:</strong> Detected{" "}
									{health.invalidStoresCount} rows from unauthorized stores (
									{health.invalidStores.map((s: any) => s.name).join(", ")}).
								</li>
							)}
							{health.duplicateBillsCount > 0 && (
								<li>
									<strong>Duplicate Bills:</strong> Detected{" "}
									{health.duplicateBillsCount} duplicate invoice conflicts (same
									bill number across different stores on the same date).
								</li>
							)}
							{health.missingDatesCount > 0 && (
								<li>
									<strong>Data Gaps:</strong> Missing sales data for{" "}
									{health.missingDatesCount} dates in active range (
									{health.missingDates.slice(0, 5).join(", ")}...).
								</li>
							)}
						</ul>
					</AlertDescription>
				</Alert>
			)}

			<GlobalFilterBar
				availableCategories={status.availableCategories || []}
				availableBrands={status.availableBrands || []}
			/>

			<div className="grid grid-cols-12 gap-4 mt-2">
				{/* Section 1 — Store Performance Overview (8 cols) */}
				<div className="col-span-12 xl:col-span-8">
					<StorePerformanceTable
						stores={data.stores}
						comparisonLabel={data.comparisonLabel}
					/>
				</div>

				{/* Section 2 — Expected Month End Closing Forecast (4 cols) */}
				<div className="col-span-12 xl:col-span-4">
					<ForecastCard stores={data.stores} />
				</div>

				{/* Section 3 — AOV & Bill Cuts Intelligence Console (12 cols) */}
				<div className="col-span-12">
					<AovBillCutsAnalysis stores={data.stores} />
				</div>

				{/* Section 4 — Revenue Momentum Trend (8 cols) */}
				<div className="col-span-12 xl:col-span-8">
					<TrendChart trends={data.trends} />
				</div>

				{/* Section 5 — Store Diagnosis Engine (4 cols) */}
				<div className="col-span-12 xl:col-span-4">
					<DiagnosisCard stores={data.stores} />
				</div>
			</div>
		</div>
	);
}
