"use client";

import { Activity, CheckCircle2, Clock, RefreshCw, Zap } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function PipelineStatusBanner() {
	const [status, setStatus] = useState<any>(null);
	const [isRefreshing, setIsRefreshing] = useState(false);

	const fetchStatus = useCallback(async () => {
		setIsRefreshing(true);
		try {
			const res = await fetch("/api/sales/status");
			const json = await res.json();
			if (json.success) {
				setStatus(json.data);
			}
		} catch (err) {
			console.error("Failed to fetch pipeline status", err);
		} finally {
			setIsRefreshing(false);
		}
	}, []);

	useEffect(() => {
		fetchStatus();
	}, [fetchStatus]);

	return (
		<div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/80 bg-card/60 backdrop-blur p-3.5 shadow-xs transition-all">
			<div className="flex flex-wrap items-center gap-3">
				<div className="flex items-center gap-2 font-semibold text-xs tracking-wide uppercase text-foreground">
					<Zap className="size-4 text-emerald-500 animate-pulse" />
					<span>Pipeline Sync:</span>
				</div>

				<Badge
					variant="outline"
					className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 gap-1.5 py-0.5 text-xs"
				>
					<CheckCircle2 className="size-3.5" />
					Odoo Webhooks Active
				</Badge>

				<Badge
					variant="outline"
					className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20 gap-1.5 py-0.5 text-xs"
				>
					<Activity className="size-3.5" />
					Staging-to-Fact Validated
				</Badge>

				{status?.dateRange?.end && (
					<div className="flex items-center gap-1.5 text-xs text-muted-foreground">
						<Clock className="size-3.5" />
						<span>
							Latest Sale: <strong>{status.dateRange.end}</strong>
						</span>
					</div>
				)}
			</div>

			<div className="flex items-center gap-2">
				{status?.totalRows !== undefined && (
					<span className="text-xs text-muted-foreground font-mono">
						{status.totalRows.toLocaleString()} fact rows
					</span>
				)}
				<Button
					variant="ghost"
					size="icon-xs"
					onClick={fetchStatus}
					disabled={isRefreshing}
					className="text-muted-foreground hover:text-foreground"
					title="Refresh pipeline status"
				>
					<RefreshCw
						className={`size-3.5 ${isRefreshing ? "animate-spin" : ""}`}
					/>
				</Button>
			</div>
		</div>
	);
}
