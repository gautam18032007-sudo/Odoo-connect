"use client";

import { format } from "date-fns";
import {
	BarChart3,
	LayoutGrid,
	Table as TableIcon,
	Upload,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { GlobalFilterBar } from "@/components/founder/global-filter-bar";
import { PipelineStatusBanner } from "@/components/founder/pipeline-status-banner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useStabilizedDashboard } from "@/hooks/use-stabilized-dashboard";
import { useFilterStore } from "@/stores/founder/filter-store";
import { KpiCards } from "./_components/kpi-cards";
import { NewLeadModal } from "./_components/new-lead-modal";
import { OpportunitiesSection } from "./_components/opportunities-section";
import { PipelineActivity } from "./_components/pipeline-activity";
import { PipelineKanbanBoard } from "./_components/pipeline-kanban-board";
import { TaskReminders } from "./_components/task-reminders";

export default function Page() {
	const router = useRouter();
	const [crmData, setCrmData] = useState<any>(null);
	const [status, setStatus] = useState<any>(null);
	const [viewMode, setViewMode] = useState<"kanban" | "table">("kanban");

	const { startDate, endDate, store, category, brand, sku, categoryScope } =
		useFilterStore();

	const fetchStatus = useCallback(async () => {
		try {
			const res = await fetch("/api/sales/status");
			const json = await res.json();
			if (json.success) {
				setStatus(json.data);
			}
		} catch (err) {
			console.error("Failed to fetch status", err);
		}
	}, []);

	const fetchCrmPipeline = useCallback(async () => {
		try {
			const params = new URLSearchParams();
			if (store !== "ALL") params.set("store", store);

			const res = await fetch(`/api/crm/pipeline?${params.toString()}`);
			const json = await res.json();
			if (json.success) {
				setCrmData(json.data);
			}
		} catch (err) {
			console.error("Failed to fetch CRM pipeline", err);
		}
	}, [store]);

	useEffect(() => {
		fetchStatus();
		fetchCrmPipeline();
	}, [fetchStatus, fetchCrmPipeline]);

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

	const handleStageChange = async (
		leadId: number | string,
		newStage: string,
	) => {
		try {
			const res = await fetch("/api/crm/leads", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ id: leadId, stage: newStage }),
			});
			const json = await res.json();
			if (json.success) {
				fetchCrmPipeline();
			}
		} catch (err) {
			console.error("Failed to transition stage", err);
		}
	};

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
					<h2 className="text-2xl font-bold">Welcome to ZenZebra Sales CRM</h2>
					<p className="text-muted-foreground">
						No sales or deal data uploaded yet. Upload your daily sales sheet or
						hook Odoo webhooks.
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
	const leadsList =
		crmData?.leads && crmData.leads.length > 0
			? crmData.leads
			: (data?.recentOrders || []).map((ord: any, idx: number) => ({
					id: ord.id || idx,
					name: `Deal - ${ord.productName || "Product Order"}`,
					partnerName: `Customer ${ord.customerId}`,
					phone: ord.customerId,
					stage:
						idx % 5 === 4
							? "Closed Won"
							: idx % 5 === 0
								? "Qualified"
								: idx % 5 === 1
									? "Discovery"
									: idx % 5 === 2
										? "Proposal Sent"
										: "Negotiation",
					expectedRevenue: ord.netAmount || 5000,
					store: ord.store || "KLJ",
					health: idx % 4 === 0 ? "On Track" : "Needs Review",
				}));

	return (
		<div className="flex flex-col gap-5 p-4 md:p-8 pt-4">
			<PipelineStatusBanner />

			<div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
				<div className="flex flex-col gap-1">
					<h1 className="text-3xl leading-none tracking-tight font-bold">
						Sales & CRM Pipeline
					</h1>
					<p className="text-muted-foreground text-sm">{formattedDate}</p>
				</div>

				<div className="flex items-center gap-3">
					<Tabs
						value={viewMode}
						onValueChange={(val) => setViewMode(val as any)}
					>
						<TabsList className="grid grid-cols-2">
							<TabsTrigger value="kanban" className="gap-1.5 text-xs">
								<LayoutGrid className="size-3.5" />
								Kanban Board
							</TabsTrigger>
							<TabsTrigger value="table" className="gap-1.5 text-xs">
								<TableIcon className="size-3.5" />
								Deals Table
							</TabsTrigger>
						</TabsList>
					</Tabs>

					<NewLeadModal onLeadCreated={fetchCrmPipeline} />

					<Button
						variant="outline"
						size="sm"
						onClick={() => router.push("/dashboard/sales/upload")}
					>
						<Upload className="mr-1.5 size-4" />
						Upload Data
					</Button>
				</div>
			</div>

			<GlobalFilterBar
				availableCategories={status.availableCategories || []}
				availableBrands={status.availableBrands || []}
			/>

			{!data && isInitialLoading ? (
				<div className="grid gap-6 grid-cols-1 mt-2">
					<Skeleton className="h-[120px] rounded-xl" />
					<Skeleton className="h-[300px] rounded-xl" />
					<Skeleton className="h-[200px] rounded-xl" />
				</div>
			) : (
				<div className="flex flex-col gap-6">
					<KpiCards data={data} />
					<PipelineActivity data={data} />

					{viewMode === "kanban" ? (
						<div className="flex flex-col gap-3">
							<div className="flex items-center justify-between">
								<h3 className="text-lg font-bold">Deal Flow Kanban Board</h3>
								<span className="text-xs text-muted-foreground">
									Drag or select options to move deals across pipeline stages
								</span>
							</div>
							<PipelineKanbanBoard
								leads={leadsList}
								onStageChange={handleStageChange}
							/>
						</div>
					) : (
						<OpportunitiesSection data={data} />
					)}

					<TaskReminders data={data} />
				</div>
			)}
		</div>
	);
}
