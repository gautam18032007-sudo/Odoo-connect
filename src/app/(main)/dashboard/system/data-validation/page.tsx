"use client";

import {
	AlertCircle,
	CheckCircle2,
	FileCheck,
	RefreshCw,
	XCircle,
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
import { formatCurrency } from "@/lib/utils";

interface ValidationData {
	overallPassed: boolean;
	validations: Array<{
		metric: string;
		canonicalValue: number;
		expectedValue: number;
		variance: number;
		status: "MATCH" | "MISMATCH";
		equation: string;
	}>;
	summary: {
		mrp: number;
		discount: number;
		collection: number;
		gst: number;
		revenue: number;
		bills: number;
		units: number;
		customers: number;
		inventorySoh: number;
	};
}

export default function GroundTruthValidationPage() {
	const [data, setData] = useState<ValidationData | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const fetchValidation = useCallback(async () => {
		try {
			const res = await fetch("/api/system/data-validation");
			const json = await res.json();
			if (json.success) {
				setData(json.data);
				setError(null);
			} else {
				setError(json.error || "Failed to validate ground truth metrics");
			}
		} catch (err: unknown) {
			setError(err instanceof Error ? err.message : "Network error");
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		fetchValidation();
	}, [fetchValidation]);

	if (loading) {
		return (
			<div className="flex flex-col gap-6 p-4 pt-4 md:p-8">
				<Skeleton className="h-8 w-64" />
				<Skeleton className="h-96 rounded-xl" />
			</div>
		);
	}

	if (error || !data) {
		return (
			<div className="flex flex-col items-center justify-center min-h-[60vh] p-4 text-center space-y-4">
				<AlertCircle className="size-16 text-destructive" />
				<h2 className="text-xl font-bold">Validation Failed</h2>
				<p className="text-muted-foreground text-sm max-w-md">{error}</p>
				<Button onClick={fetchValidation}>Retry Validation</Button>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-6 p-4 pt-4 md:p-8">
			{/* ── Header ────────────────────────────────────────── */}
			<div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
				<div>
					<div className="flex items-center gap-2">
						<h1 className="text-3xl font-bold tracking-tight">
							Ground Truth Data Validator
						</h1>
						<Badge
							variant="outline"
							className={
								data.overallPassed
									? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
									: "bg-destructive/10 text-destructive border-destructive/20"
							}
						>
							{data.overallPassed
								? "100% RECONCILED MATCH"
								: "VARIANCE MISMATCH"}
						</Badge>
					</div>
					<p className="text-muted-foreground mt-1">
						Automated verification of canonical PostgreSQL metrics against
						Master Equations
					</p>
				</div>
				<Button
					variant="outline"
					size="sm"
					onClick={fetchValidation}
					className="gap-2"
				>
					<RefreshCw className="size-4" />
					Run Re-Validation
				</Button>
			</div>

			{/* ── Summary Financial Cards ───────────────────────── */}
			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">
							{formatCurrency(data.summary.revenue)}
						</div>
						<p className="text-xs text-muted-foreground mt-1">
							SUM(net_amount)
						</p>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="text-sm font-medium">
							Gross Collection
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">
							{formatCurrency(data.summary.collection)}
						</div>
						<p className="text-xs text-muted-foreground mt-1">MRP - Discount</p>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="text-sm font-medium">
							Total Discount
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">
							{formatCurrency(data.summary.discount)}
						</div>
						<p className="text-xs text-muted-foreground mt-1">
							Total Promotional Discount
						</p>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="text-sm font-medium">GST Liability</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">
							{formatCurrency(data.summary.gst)}
						</div>
						<p className="text-xs text-muted-foreground mt-1">
							Collection - Revenue
						</p>
					</CardContent>
				</Card>
			</div>

			{/* ── Reconciled Metrics Table ──────────────────────── */}
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<FileCheck className="size-5 text-emerald-500" />
						Reconciliation Validation Audit Matrix
					</CardTitle>
					<CardDescription>
						Every KPI must match the exact mathematical equation with zero
						variance
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="rounded-md border">
						<div className="grid grid-cols-12 bg-muted/40 p-3 text-xs font-semibold text-muted-foreground border-b">
							<div className="col-span-4">METRIC / EQUATION</div>
							<div className="col-span-3 text-right">CANONICAL VALUE</div>
							<div className="col-span-3 text-right">EXPECTED VALUE</div>
							<div className="col-span-2 text-center">STATUS</div>
						</div>
						{data.validations.map((v, i) => (
							<div
								// biome-ignore lint/suspicious/noArrayIndexKey: stable static validation list
								key={i}
								className="grid grid-cols-12 p-3 text-sm border-b last:border-0 items-center"
							>
								<div className="col-span-4">
									<p className="font-semibold">{v.metric}</p>
									<p className="text-xs text-muted-foreground font-mono">
										{v.equation}
									</p>
								</div>
								<div className="col-span-3 text-right font-mono font-bold">
									{typeof v.canonicalValue === "number" &&
									v.canonicalValue > 1000
										? formatCurrency(v.canonicalValue)
										: v.canonicalValue.toLocaleString()}
								</div>
								<div className="col-span-3 text-right font-mono text-muted-foreground">
									{typeof v.expectedValue === "number" && v.expectedValue > 1000
										? formatCurrency(v.expectedValue)
										: v.expectedValue.toLocaleString()}
								</div>
								<div className="col-span-2 text-center">
									<Badge
										className={
											v.status === "MATCH"
												? "bg-emerald-500 text-white gap-1"
												: "bg-destructive text-white gap-1"
										}
									>
										{v.status === "MATCH" ? (
											<CheckCircle2 className="size-3" />
										) : (
											<XCircle className="size-3" />
										)}
										{v.status}
									</Badge>
								</div>
							</div>
						))}
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
