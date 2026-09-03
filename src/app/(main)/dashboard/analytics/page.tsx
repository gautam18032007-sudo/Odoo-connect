"use client";

import { format } from "date-fns";
import { BarChart3, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { GlobalFilterBar } from "@/components/founder/global-filter-bar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useFilterStore } from "@/stores/founder/filter-store";

import { AnalyticsKpiStrip } from "./_components/analytics-kpi-strip";
import { AnalyticsToolbar } from "./_components/analytics-toolbar";
import { TopPages } from "./_components/top-pages";
import { TrafficQuality } from "./_components/traffic-quality";

// Import flag icons styling
import "@/styles/flag-icons/flags.css";

import { useStabilizedDashboard } from "@/hooks/use-stabilized-dashboard";

export default function Page() {
	const router = useRouter();
	// biome-ignore lint/suspicious/noExplicitAny: Status data from API has dynamic shape
	const [status, setStatus] = useState<any>(null);

	const { startDate, endDate, store, category, brand, sku, categoryScope } =
		useFilterStore();

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

	const fetcher = async (signal: AbortSignal) => {
		const params = new URLSearchParams({ startDate, endDate });
		if (store !== "ALL") params.set("store", store);
		if (category !== "All Categories") params.set("category", category);
		if (brand !== "All Brands") params.set("brand", brand);
		if (sku) params.set("sku", sku);
		if (categoryScope !== "all") params.set("categoryScope", categoryScope);

		const res = await fetch(
			`/api/sales/dashboard-extended?${params.toString()}`,
			{
				signal,
			},
		);
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
			store,
			category,
			brand,
			sku,
			categoryScope,
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

	return (
		<div className="flex flex-col gap-4 p-4 md:p-8 pt-4">
			<div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
				<div className="flex flex-col gap-1">
					<h1 className="text-3xl leading-none tracking-tight font-bold">
						Traffic & Analytics
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

			{!data && isInitialLoading ? (
				<div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-12 mt-2">
					<Skeleton className="h-[120px] xl:col-span-12 rounded-xl animate-pulse" />
					<Skeleton className="h-[250px] xl:col-span-7 rounded-xl animate-pulse" />
					<Skeleton className="h-[250px] xl:col-span-5 rounded-xl animate-pulse" />
				</div>
			) : (
				<Tabs defaultValue="overview" className="flex flex-col gap-4">
					<div className="flex flex-wrap items-center justify-between gap-3">
						<TabsList className="gap-1">
							<TabsTrigger value="overview">Overview</TabsTrigger>
							<TabsTrigger value="audience">Audience</TabsTrigger>
							<TabsTrigger value="acquisition">Acquisition</TabsTrigger>
							<TabsTrigger value="engagement">Engagement</TabsTrigger>
							<TabsTrigger value="conversions">Conversions</TabsTrigger>
						</TabsList>

						<AnalyticsToolbar />
					</div>

					<TabsContent value="overview" className="flex flex-col gap-4">
						<AnalyticsKpiStrip data={data} />

						<TrafficQuality data={data} />

						<TopPages data={data} />
					</TabsContent>

					<TabsContent value="audience">
						<div className="flex h-64 items-center justify-center rounded-xl border border-border border-dashed text-muted-foreground">
							Audience view coming soon.
						</div>
					</TabsContent>

					<TabsContent value="acquisition">
						<div className="flex h-64 items-center justify-center rounded-xl border border-border border-dashed text-muted-foreground">
							Acquisition view coming soon.
						</div>
					</TabsContent>

					<TabsContent value="engagement">
						<div className="flex h-64 items-center justify-center rounded-xl border border-border border-dashed text-muted-foreground">
							Engagement view coming soon.
						</div>
					</TabsContent>

					<TabsContent value="conversions">
						<div className="flex h-64 items-center justify-center rounded-xl border border-border border-dashed text-muted-foreground">
							Conversions view coming soon.
						</div>
					</TabsContent>
				</Tabs>
			)}
		</div>
	);
}
