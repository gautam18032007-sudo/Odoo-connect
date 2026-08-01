"use client";

import { format } from "date-fns";
import { FileSpreadsheet, Upload, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CustomerConcentrationCard } from "@/components/customer-intelligence/CustomerConcentrationCard";
import { CustomerHealthCard } from "@/components/customer-intelligence/CustomerHealthCard";
import { CustomerInsightsCard } from "@/components/customer-intelligence/CustomerInsightsCard";
import { CustomerValueDistributionTable } from "@/components/customer-intelligence/CustomerValueDistributionTable";
import { IdentityConfidenceCard } from "@/components/customer-intelligence/IdentityConfidenceCard";
import { ReconciliationBanner } from "@/components/customer-intelligence/ReconciliationBanner";
import { RetentionCohortTable } from "@/components/customer-intelligence/RetentionCohortTable";
import { RevenueCompositionCards } from "@/components/customer-intelligence/RevenueCompositionCards";
import { DataFreshnessBadge } from "@/components/dashboard/data-freshness-badge";
import { GlobalFilterBar } from "@/components/founder/global-filter-bar";
import { ErrorBoundary } from "@/components/shared/error-boundary";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { exportCustomerIntelligenceExcel } from "@/lib/customer-intelligence-export";
import { useFilterStore } from "@/stores/founder/filter-store";
import { tokens } from "@/styles/tokens";
import type {
	CustomerIntelligenceData,
	CustomerIntelligenceResponse,
} from "@/types/customer-intelligence";

interface StatusData {
	hasData: boolean;
	availableCategories?: string[];
	availableBrands?: string[];
}

import { useStabilizedDashboard } from "@/hooks/use-stabilized-dashboard";

export default function Page() {
	const router = useRouter();
	const [status, setStatus] = useState<StatusData | null>(null);

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
				if (json.success) setStatus(json.data);
			} catch (err) {
				console.error("Failed to fetch status", err);
			}
		};
		fetchStatus();
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

		const res = await fetch(`/api/customer-intelligence?${params.toString()}`, {
			signal,
		});
		if (res.status === 401) {
			window.location.href = "/login";
			return null;
		}
		const json: CustomerIntelligenceResponse = await res.json();
		if (json.success && json.data) {
			return json.data;
		}
		return null;
	};

	const { data, isInitialLoading, isRefreshing } = useStabilizedDashboard({
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
				<Skeleton className="h-[400px] w-full animate-pulse" />
			</div>
		);
	}

	if (!status.hasData) {
		return (
			<div className="flex min-h-[60vh] flex-col items-center justify-center space-y-6 p-4 text-center">
				<div className="rounded-full bg-muted/30 p-8">
					<Users className="size-20 text-muted-foreground" />
				</div>
				<div className="max-w-md space-y-2">
					<h2 className="text-2xl font-bold">Customer Intelligence</h2>
					<p className="text-muted-foreground">
						No data has been uploaded yet. Upload your sales sheets to unlock
						retention, revenue composition, and lifetime value insights.
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

	const handleExport = () => {
		if (!data) {
			toast.error("No customer intelligence data available to export");
			return;
		}
		try {
			const dateStr = isDateFiltered ? `${startDate}_to_${endDate}` : "AllTime";
			const fileName = exportCustomerIntelligenceExcel(data, store, dateStr);
			toast.success(`Exported ${fileName} successfully!`);
		} catch (err) {
			console.error("Export failed:", err);
			toast.error("Failed to export Excel file");
		}
	};

	return (
		<ErrorBoundary fallbackTitle="Customer Intelligence Module">
			<div className={tokens.layout.dashboardPadding}>
				<div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
					<div className="flex flex-col gap-2">
						<div className="flex flex-col gap-1">
							<h1 className={tokens.typography.titleExecutive}>
								Customer Intelligence
							</h1>
							<p className={tokens.typography.subtitleExecutive}>
								{formattedDate}
							</p>
						</div>
						<DataFreshnessBadge />
					</div>
					<div className="flex items-center gap-3">
						<Button
							variant="outline"
							onClick={handleExport}
							disabled={!data}
							className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20 transition-all"
						>
							<FileSpreadsheet className="mr-2 size-4" />
							Export Excel
						</Button>
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

				{!data ? (
					<div className="mt-2 grid grid-cols-12 gap-6">
						<Skeleton className="col-span-12 h-[360px] rounded-xl xl:col-span-4" />
						<Skeleton className="col-span-12 h-[360px] rounded-xl xl:col-span-8" />
						<Skeleton className="col-span-12 h-[220px] rounded-xl" />
						<Skeleton className="col-span-12 h-[360px] rounded-xl xl:col-span-7" />
						<Skeleton className="col-span-12 h-[360px] rounded-xl xl:col-span-5" />
					</div>
				) : (
					<>
						<ReconciliationBanner report={data.reconciliation} />

						<div className="mt-2 grid grid-cols-12 gap-6">
							{/* Decision-first: Customer Health + automated diagnosis */}
							<div className="col-span-12 xl:col-span-4">
								<CustomerHealthCard quality={data.qualityScore} />
							</div>
							<div className="col-span-12 xl:col-span-8">
								<CustomerInsightsCard insights={data.insights} />
							</div>

							{/* Section 2 — Revenue Composition (full width) */}
							<div className="col-span-12">
								<RevenueCompositionCards
									composition={data.revenueComposition}
									comparisonLabel={data.comparisonLabel}
								/>
							</div>

							{/* Section 1 — Retention Cohort */}
							<div className="col-span-12 xl:col-span-7">
								<RetentionCohortTable cohort={data.retentionCohort} />
							</div>

							{/* Section 3 — Customer Value Distribution */}
							<div className="col-span-12 xl:col-span-5">
								<CustomerValueDistributionTable
									distribution={data.valueDistribution}
								/>
							</div>

							{/* Concentration / Revenue at Risk + Identity confidence */}
							<div className="col-span-12 xl:col-span-6">
								<CustomerConcentrationCard concentration={data.concentration} />
							</div>
							<div className="col-span-12 xl:col-span-6">
								<IdentityConfidenceCard identity={data.identityConfidence} />
							</div>
						</div>
					</>
				)}
			</div>
		</ErrorBoundary>
	);
}
