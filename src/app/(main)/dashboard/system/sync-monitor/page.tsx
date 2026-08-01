"use client";

import {
	Activity,
	AlertCircle,
	Boxes,
	Clock,
	Layers,
	RefreshCw,
	Server,
	ShieldCheck,
	Zap,
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

interface SyncMonitorData {
	worker: {
		isRunning: boolean;
		currentIntervalMs: number;
		lastSyncTimestamp: string | null;
		consecutiveErrors: number;
		totalRecordsSynced: number;
		activeJobCount: number;
		deadLetterCount: number;
		lastStatus: string;
	};
	memory: {
		rssMb: number;
		heapTotalMb: number;
		heapUsedMb: number;
	};
	entitySummary: Array<{
		entity: string;
		totalBatches: number;
		totalRecords: number;
		lastSyncAt: string | null;
	}>;
	recentLogs: Array<{
		id: number;
		traceId: string;
		syncType: string;
		recordsProcessed: number;
		status: string;
		startedAt: string;
		completedAt: string | null;
		durationMs: number;
		odooResponseMs: number;
		databaseWriteMs: number;
		writeDateCursor: string;
		errorMessage: string | null;
	}>;
}

export default function SyncMonitorPage() {
	const [data, setData] = useState<SyncMonitorData | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const fetchMonitor = useCallback(async () => {
		try {
			const res = await fetch("/api/system/sync-monitor");
			const json = await res.json();
			if (json.success) {
				setData(json.data);
				setError(null);
			} else {
				setError(json.error || "Failed to load monitor data");
			}
		} catch (err: unknown) {
			setError(err instanceof Error ? err.message : "Network error");
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		fetchMonitor();
		const interval = setInterval(fetchMonitor, 3000); // 3-second live refresh
		return () => clearInterval(interval);
	}, [fetchMonitor]);

	if (loading) {
		return (
			<div className="flex flex-col gap-6 p-4 pt-4 md:p-8">
				<Skeleton className="h-8 w-64" />
				<div className="grid gap-4 md:grid-cols-4">
					{[1, 2, 3, 4].map((i) => (
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
				<h2 className="text-xl font-bold">Monitor Data Error</h2>
				<p className="text-muted-foreground text-sm max-w-md">{error}</p>
				<Button onClick={fetchMonitor}>Retry</Button>
			</div>
		);
	}

	const { worker, memory, entitySummary, recentLogs } = data;

	return (
		<div className="flex flex-col gap-6 p-4 pt-4 md:p-8">
			{/* ── Header ────────────────────────────────────────── */}
			<div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
				<div>
					<div className="flex items-center gap-2">
						<h1 className="text-3xl font-bold tracking-tight">
							Production Sync Monitor
						</h1>
						<Badge
							variant="outline"
							className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 gap-1"
						>
							<Zap className="size-3 fill-emerald-500" />
							Real-Time Observability
						</Badge>
					</div>
					<p className="text-muted-foreground mt-1">
						Live Worker Telemetry, Entity Queues & End-to-End Latency Metrics
					</p>
				</div>
				<Button
					variant="outline"
					size="sm"
					onClick={fetchMonitor}
					className="gap-2"
				>
					<RefreshCw className="size-4" />
					Refresh
				</Button>
			</div>

			{/* ── Status Cards ──────────────────────────────────── */}
			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
				<Card className="border-l-4 border-l-emerald-500">
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">Worker State</CardTitle>
						<Activity className="size-4 text-emerald-500" />
					</CardHeader>
					<CardContent>
						<div className="flex items-center gap-2">
							<Badge className="bg-emerald-500 text-white">
								{worker.isRunning ? "RUNNING" : "STOPPED"}
							</Badge>
							<span className="text-xs text-muted-foreground">
								{worker.currentIntervalMs / 1000}s interval
							</span>
						</div>
						<p className="text-xs text-muted-foreground mt-2">
							Total Synced: {worker.totalRecordsSynced.toLocaleString()} records
						</p>
					</CardContent>
				</Card>

				<Card className="border-l-4 border-l-blue-500">
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">
							Queue & Retries
						</CardTitle>
						<Layers className="size-4 text-blue-500" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">
							{worker.activeJobCount} pending
						</div>
						<p className="text-xs text-muted-foreground mt-1">
							Dead-Letter Queue: {worker.deadLetterCount} jobs
						</p>
					</CardContent>
				</Card>

				<Card className="border-l-4 border-l-violet-500">
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">Server Memory</CardTitle>
						<Server className="size-4 text-violet-500" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">{memory.heapUsedMb} MB</div>
						<p className="text-xs text-muted-foreground mt-1">
							Heap Total: {memory.heapTotalMb} MB • RSS: {memory.rssMb} MB
						</p>
					</CardContent>
				</Card>

				<Card className="border-l-4 border-l-amber-500">
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">Health Status</CardTitle>
						<ShieldCheck className="size-4 text-amber-500" />
					</CardHeader>
					<CardContent>
						<div className="flex items-center gap-2">
							<Badge
								variant="outline"
								className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
							>
								HEALTHY
							</Badge>
						</div>
						<p className="text-xs text-muted-foreground mt-2">
							Consecutive Errors: {worker.consecutiveErrors}
						</p>
					</CardContent>
				</Card>
			</div>

			{/* ── Entity Sync Breakdown & Live Logs ─────────────── */}
			<div className="grid gap-6 md:grid-cols-2">
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Boxes className="size-5 text-primary" />
							Entity Sync Breakdown
						</CardTitle>
						<CardDescription>
							Processed batches and lifetime record counts per entity
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						{entitySummary.map((ent) => (
							<div
								key={ent.entity}
								className="flex items-center justify-between border-b pb-3 last:border-0 last:pb-0"
							>
								<div>
									<p className="font-semibold text-sm capitalize">
										{ent.entity.replace("_", " ")}
									</p>
									<p className="text-xs text-muted-foreground">
										{ent.totalBatches} batches processed
									</p>
								</div>
								<div className="text-right">
									<p className="font-mono text-sm font-bold">
										{ent.totalRecords.toLocaleString()} recs
									</p>
									<span className="text-[10px] text-muted-foreground font-mono">
										{ent.lastSyncAt
											? new Date(ent.lastSyncAt).toLocaleTimeString()
											: "N/A"}
									</span>
								</div>
							</div>
						))}
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Clock className="size-5 text-blue-500" />
							Live Telemetry Trace Logs
						</CardTitle>
						<CardDescription>
							End-to-end trace IDs and latency metrics for recent sync runs
						</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="space-y-3 max-h-[340px] overflow-y-auto pr-1">
							{recentLogs.map((log) => (
								<div
									key={log.id}
									className="p-3 border rounded-lg bg-muted/20 text-xs space-y-1"
								>
									<div className="flex items-center justify-between font-mono font-semibold">
										<span className="text-primary">{log.traceId}</span>
										<Badge
											variant="outline"
											className={
												log.status === "success"
													? "border-emerald-500/30 text-emerald-600"
													: "border-destructive/30 text-destructive"
											}
										>
											{log.status.toUpperCase()}
										</Badge>
									</div>
									<div className="flex justify-between text-muted-foreground">
										<span className="capitalize">
											{log.syncType} • {log.recordsProcessed} recs
										</span>
										<span>Duration: {log.durationMs}ms</span>
									</div>
								</div>
							))}
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
