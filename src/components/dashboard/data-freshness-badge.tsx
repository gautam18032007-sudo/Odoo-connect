"use client";

import { format } from "date-fns";
import { CheckCircle2, TriangleAlert } from "lucide-react";
import { memo, useEffect, useState } from "react";

interface FreshnessData {
	latestSaleDate: string | null;
	lastUploadedAt: string | null;
	dataAgeDays: number | null;
	totalRows: number;
	totalBills: number;
}

/**
 * Compact data-freshness header chip: last upload, row count, and a Fresh/stale
 * status. Presentation only — reads /api/data-freshness. Reusable on any dashboard.
 */
export const DataFreshnessBadge = memo(function DataFreshnessBadge() {
	const [data, setData] = useState<FreshnessData | null>(null);

	useEffect(() => {
		fetch("/api/data-freshness")
			.then((r) => r.json())
			.then((j) => {
				if (j.success) setData(j.data);
			})
			.catch(() => {});
	}, []);

	if (!data) return null;

	const stale = data.dataAgeDays !== null && data.dataAgeDays >= 1;
	const uploaded = data.lastUploadedAt ? new Date(data.lastUploadedAt) : null;

	return (
		<div className="inline-flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border bg-muted/30 px-2.5 py-1 text-xs">
			<span className="text-muted-foreground">
				Last upload{" "}
				<span className="font-medium text-foreground">
					{uploaded ? format(uploaded, "dd MMM yyyy, h:mm a") : "—"}
				</span>
			</span>
			<span className="text-muted-foreground">
				Rows{" "}
				<span className="font-medium text-foreground">
					{data.totalRows.toLocaleString("en-IN")}
				</span>
			</span>
			<span
				className={`inline-flex items-center gap-1 font-medium ${
					stale
						? "text-amber-600 dark:text-amber-400"
						: "text-emerald-600 dark:text-emerald-400"
				}`}
			>
				{stale ? (
					<>
						<TriangleAlert className="size-3" />
						Data {data.dataAgeDays}d old
					</>
				) : (
					<>
						<CheckCircle2 className="size-3" />
						Fresh
					</>
				)}
			</span>
		</div>
	);
});
