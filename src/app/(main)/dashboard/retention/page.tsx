"use client";

import { format } from "date-fns";
import { BarChart3, Upload } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { GlobalFilterBar } from "@/components/founder/global-filter-bar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CohortsTab } from "./_components/cohorts-tab";
import { LtvCacAovTab } from "./_components/ltv-cac-aov-tab";
import { OverviewTab } from "./_components/overview-tab";
import { SegmentsHealthTab } from "./_components/segments-health-tab";

// Forced page reload trigger comments
function RetentionDashboardContent() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const [status, setStatus] = useState<any>(null);

	const activeTab = searchParams.get("tab") || "overview";

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
	const hasData = status.hasData;

	const handleTabChange = (val: string) => {
		const params = new URLSearchParams(searchParams.toString());
		params.set("tab", val);
		router.push(`/dashboard/retention?${params.toString()}`);
	};

	return (
		<div className="flex flex-col gap-6 p-4 md:p-8 pt-4">
			{/* Title Section */}
			<div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
				<div className="flex flex-col gap-1">
					<h1 className="text-3xl font-bold leading-none tracking-tight">
						Customer Value Analytics
					</h1>
					<p className="text-muted-foreground text-sm">
						{formattedDate} • AOV, LTV and CAC in one view
					</p>
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
				availableStores={status.availableStores || []}
				availableCategories={status.availableCategories || []}
				availableBrands={status.availableBrands || []}
				categoryBrandMap={status.categoryBrandMap || {}}
				dataBounds={
					status.minDate && status.maxDate
						? { minDate: status.minDate, maxDate: status.maxDate }
						: null
				}
				skuDisabledReason={
					activeTab === "cohorts"
						? "SKU-level filtering isn't supported for Cohort Analysis — cohorts are defined by a customer's first purchase across all products, not a single SKU."
						: undefined
				}
			/>

			{/* Main Tabs Navigation */}
			<Tabs
				value={activeTab}
				onValueChange={handleTabChange}
				className="space-y-6"
			>
				<TabsList className="bg-zinc-950 border-[0.5px] border-zinc-800 p-1 rounded-xl w-full lg:w-auto flex flex-wrap h-auto gap-1">
					<TabsTrigger
						value="overview"
						className="text-xs py-2 px-3 rounded-lg"
					>
						Overview
					</TabsTrigger>
					<TabsTrigger value="cohorts" className="text-xs py-2 px-3 rounded-lg">
						Cohorts
					</TabsTrigger>
					<TabsTrigger
						value="segments"
						className="text-xs py-2 px-3 rounded-lg"
					>
						Segments &amp; Health
					</TabsTrigger>
					<TabsTrigger
						value="ltv-cac-aov"
						className="text-xs py-2 px-3 rounded-lg font-mono"
					>
						LTV, CAC, AOV
					</TabsTrigger>
				</TabsList>

				<TabsContent value="overview" className="outline-none">
					<OverviewTab hasData={hasData} />
				</TabsContent>

				<TabsContent value="cohorts" className="outline-none">
					<CohortsTab hasData={hasData} />
				</TabsContent>

				<TabsContent value="segments" className="outline-none">
					<SegmentsHealthTab hasData={hasData} />
				</TabsContent>

				<TabsContent value="ltv-cac-aov" className="outline-none">
					<LtvCacAovTab />
				</TabsContent>
			</Tabs>
		</div>
	);
}

export default function RetentionDashboardPage() {
	return (
		<Suspense
			fallback={
				<div className="p-8">
					<Skeleton className="h-[400px] w-full animate-pulse" />
				</div>
			}
		>
			<RetentionDashboardContent />
		</Suspense>
	);
}
