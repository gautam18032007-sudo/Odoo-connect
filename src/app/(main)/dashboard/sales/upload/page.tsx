"use client";

import {
	AlertCircle,
	CheckCircle2,
	FileType,
	Loader2,
	UploadCloud,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

export default function FounderUploadPage() {
	const router = useRouter();
	const [file, setFile] = useState<File | null>(null);
	const [isProcessing, setIsProcessing] = useState(false);
	const [progress, setProgress] = useState(0);
	const [validationResult, setValidationResult] = useState<any>(null);
	const [uploadType, setUploadType] = useState<"full_replace" | "incremental">(
		"incremental",
	);
	const [preflight, setPreflight] = useState<{
		hasExistingData: boolean;
		existingRowCount: number;
		existingDateRange: { start: string; end: string } | null;
	} | null>(null);

	const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		if (e.target.files && e.target.files.length > 0) {
			const selected = e.target.files[0];
			setFile(selected);
			setValidationResult(null);
			setPreflight(null);
		}
	};

	const processFile = async () => {
		if (!file) return;

		setIsProcessing(true);
		setProgress(10);
		setValidationResult(null);

		try {
			const formData = new FormData();
			formData.append("file", file);
			setProgress(40);

			const res = await fetch("/api/sales/imports?mode=validate", {
				method: "POST",
				body: formData,
			});

			setProgress(80);
			const data = await res.json();

			if (res.ok && data.success) {
				setValidationResult(data.data);

				// Run preflight check if we have a valid date range
				if (data.data?.dateRange?.start && data.data?.dateRange?.end) {
					try {
						const pfRes = await fetch(
							`/api/sales/imports/preflight?startDate=${data.data.dateRange.start}&endDate=${data.data.dateRange.end}`,
						);
						const pfData = await pfRes.json();
						if (pfData.success) setPreflight(pfData.data);
					} catch (_) {
						// preflight failure is non-blocking
					}
				}
			} else {
				toast.error(data.error || "Validation failed");
				setValidationResult({
					errors: [
						{ row: 0, field: "system", error: data.error || "Unknown error" },
					],
				});
			}
		} catch (err: any) {
			console.error(err);
			toast.error(`Failed to parse file: ${err.message}`);
		} finally {
			setProgress(100);
			setIsProcessing(false);
		}
	};

	const handleCommit = async () => {
		if (!validationResult || !file) return;

		if (uploadType === "full_replace") {
			const confirmed = window.confirm(
				"WARNING: You are about to perform a Full Replace Upload. This will backup and wipe all existing historical data in the sales_fact table. Are you sure you want to proceed?",
			);
			if (!confirmed) return;
		}

		setIsProcessing(true);

		try {
			const formData = new FormData();
			formData.append("file", file);
			formData.append("uploadType", uploadType);

			const res = await fetch("/api/sales/imports?mode=commit", {
				method: "POST",
				body: formData,
			});

			const data = await res.json();

			if (res.ok && data.success) {
				toast.success(`Successfully imported ${data.data.rowsInserted} rows!`);
				router.push("/dashboard/sales");
			} else {
				toast.error(data.error || "Failed to commit data");
			}
		} catch (err: any) {
			toast.error(`Upload failed: ${err.message}`);
		} finally {
			setIsProcessing(false);
		}
	};

	return (
		<div className="flex-1 space-y-6 p-4 md:p-8 pt-6">
			<div className="flex items-center justify-between">
				<div>
					<h2 className="text-3xl font-bold tracking-tight">
						Upload Sales Data
					</h2>
					<p className="text-muted-foreground mt-1">
						Upload your daily sales sheet to update the Sales Dashboard.
					</p>
				</div>
				<Button
					variant="outline"
					onClick={() => router.push("/dashboard/sales")}
				>
					Back to Dashboard
				</Button>
			</div>

			<div className="grid gap-6 md:grid-cols-2">
				<Card>
					<CardHeader>
						<CardTitle>Select File</CardTitle>
						<CardDescription>
							Upload an Excel (.xlsx) or CSV file matching the canonical schema.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<Select
							value={uploadType}
							onValueChange={(v) =>
								setUploadType(v as "full_replace" | "incremental")
							}
						>
							<SelectTrigger>
								<SelectValue placeholder="Upload type" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="full_replace">
									Full replace (morning file)
								</SelectItem>
								<SelectItem value="incremental">
									Incremental (today only)
								</SelectItem>
							</SelectContent>
						</Select>
						<label
							htmlFor="file-upload"
							className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-muted/20 p-10 text-center transition-colors hover:bg-muted/40"
						>
							<input
								id="file-upload"
								type="file"
								accept=".xlsx, .xls, .csv"
								className="hidden"
								onChange={handleFileChange}
							/>
							<UploadCloud className="size-10 text-muted-foreground mb-4" />
							<h3 className="font-semibold text-lg">Click to select file</h3>
							<p className="text-sm text-muted-foreground mt-1">
								or drag and drop your file here
							</p>

							{file && (
								<div className="mt-6 flex items-center p-3 bg-background border rounded-md shadow-sm">
									<FileType className="size-5 text-blue-500 mr-3" />
									<div className="text-left">
										<p className="text-sm font-medium">{file.name}</p>
										<p className="text-xs text-muted-foreground">
											{(file.size / 1024).toFixed(2)} KB
										</p>
									</div>
								</div>
							)}
						</label>

						{isProcessing && (
							<div className="space-y-2 mt-4">
								<div className="flex justify-between text-sm">
									<span>Processing...</span>
									<span>{progress}%</span>
								</div>
								<Progress value={progress} />
							</div>
						)}
					</CardContent>
					<CardFooter>
						<Button
							className="w-full"
							onClick={processFile}
							disabled={!file || isProcessing}
						>
							{isProcessing && <Loader2 className="mr-2 size-4 animate-spin" />}
							Validate Data
						</Button>
					</CardFooter>
				</Card>

				{validationResult && (
					<Card
						className={
							validationResult.isValid
								? "border-green-500/50"
								: "border-red-500/50"
						}
					>
						<CardHeader>
							<CardTitle className="flex items-center">
								Validation Results
								{validationResult.isValid ? (
									<Badge
										variant="outline"
										className="ml-2 bg-green-500/10 text-green-600 border-green-500/20"
									>
										<CheckCircle2 className="mr-1 size-3" /> Ready
									</Badge>
								) : (
									<Badge
										variant="outline"
										className="ml-2 bg-red-500/10 text-red-600 border-red-500/20"
									>
										<AlertCircle className="mr-1 size-3" /> Failed
									</Badge>
								)}
							</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="space-y-4">
								<div className="grid grid-cols-2 gap-4">
									<div className="bg-muted/50 p-4 rounded-lg">
										<p className="text-sm text-muted-foreground mb-1">
											Total Rows Processed
										</p>
										<p className="text-2xl font-bold">
											{validationResult.totalRows || 0}
										</p>
									</div>
									<div className="bg-muted/50 p-4 rounded-lg">
										<p className="text-sm text-muted-foreground mb-1">
											Valid Rows
										</p>
										<p className="text-2xl font-bold text-green-600">
											{validationResult.validRows || 0}
										</p>
									</div>
								</div>
								{validationResult.dateRange?.start &&
									validationResult.dateRange?.end && (
										<div className="bg-muted/50 p-4 rounded-lg">
											<p className="text-sm text-muted-foreground mb-1">
												Date Range
											</p>
											<p className="font-medium">
												{validationResult.dateRange.start} to{" "}
												{validationResult.dateRange.end}
											</p>
										</div>
									)}

								{validationResult.errors?.length > 0 && (
									<div className="mt-4">
										<h4 className="font-medium text-sm text-amber-600 mb-2 flex items-center">
											<AlertCircle className="mr-2 size-4" />
											Quarantined Rows (first 10)
										</h4>
										<div className="bg-amber-500/5 border border-amber-500/20 rounded-md p-3 max-h-60 overflow-y-auto">
											<ul className="text-sm space-y-2">
												{validationResult.errors
													.slice(0, 10)
													.map((err: any) => (
														<li
															key={`${err.rowNumber}-${err.errors?.join("|")}`}
															className="text-amber-700"
														>
															<strong>Row {err.rowNumber}:</strong>{" "}
															{err.errors?.join(", ")}
														</li>
													))}
												{validationResult.errors.length > 10 && (
													<li className="text-muted-foreground text-xs pt-2">
														...and {validationResult.errors.length - 10} more
														errors
													</li>
												)}
											</ul>
										</div>
									</div>
								)}

								{validationResult.normalizationReport && (
									<div className="mt-4 border-t pt-4">
										<h4 className="font-semibold text-sm mb-3">
											Store Ingestion Mapping Report
										</h4>
										<div className="space-y-3">
											{Object.entries(validationResult.normalizationReport).map(
												([canonicalName, info]: [string, any]) => (
													<div
														key={canonicalName}
														className="bg-muted/30 p-3 rounded-lg border border-border/50 text-sm"
													>
														<div className="flex justify-between items-center mb-1">
															<span className="font-medium">
																{info.displayName}
															</span>
															<Badge
																variant="secondary"
																className="font-semibold"
															>
																{info.totalRows.toLocaleString()} rows
															</Badge>
														</div>
														<p className="text-xs text-muted-foreground mb-2">
															Canonical Store: {canonicalName}
														</p>
														<div className="pl-2 border-l-2 border-border space-y-1">
															{Object.entries(info.rawSourcesCount).map(
																([rawSource, count]: [string, any]) => (
																	<div
																		key={rawSource}
																		className="flex justify-between text-xs text-muted-foreground"
																	>
																		<span>&ldquo;{rawSource}&rdquo;</span>
																		<span>{count.toLocaleString()} rows</span>
																	</div>
																),
															)}
														</div>
													</div>
												),
											)}
										</div>
									</div>
								)}
							</div>
						</CardContent>
						<CardFooter className="flex flex-col gap-3">
							{/* Preflight conflict warning */}
							{preflight && (
								<div
									className={`w-full p-4 rounded-lg border flex items-start gap-3 ${
										preflight.hasExistingData
											? "bg-amber-500/10 border-amber-500/30 text-amber-800 dark:text-amber-200"
											: "bg-green-500/10 border-green-500/30 text-green-800 dark:text-green-200"
									}`}
								>
									<div className="mt-0.5 shrink-0">
										{preflight.hasExistingData ? (
											<AlertCircle className="size-5 text-amber-500" />
										) : (
											<CheckCircle2 className="size-5 text-green-500" />
										)}
									</div>
									<div className="text-sm">
										{preflight.hasExistingData ? (
											<>
												<p className="font-semibold">
													⚠️ Existing data found for{" "}
													{preflight.existingDateRange?.start} →{" "}
													{preflight.existingDateRange?.end}
												</p>
												<p className="mt-1 opacity-90">
													Committing will <strong>update</strong>{" "}
													{preflight.existingRowCount.toLocaleString()} existing
													records and insert new ones. No data will be
													permanently deleted.
												</p>
											</>
										) : (
											<p className="font-semibold">
												✅ No existing data for this date range — safe to
												commit.
											</p>
										)}
									</div>
								</div>
							)}

							<Button
								className="w-full"
								variant={validationResult.isValid ? "default" : "destructive"}
								disabled={!validationResult.isValid || isProcessing}
								onClick={handleCommit}
							>
								{isProcessing && (
									<Loader2 className="mr-2 size-4 animate-spin" />
								)}
								{validationResult.isValid
									? "Commit Valid Rows"
									: "No Valid Rows to Commit"}
							</Button>
						</CardFooter>
					</Card>
				)}
			</div>
		</div>
	);
}
