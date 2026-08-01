import { HelpCircle, Minus, TrendingDown, TrendingUp } from "lucide-react";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";

export interface AovBillCutsPeriod {
	label: string;
	bills: number;
	revenue: number;
	aov: number;
	workingDays: number;
	billsPerDay: number;
}

export interface AovBillCutsStore {
	billedBy: string;
	name: string;
	aovBills?: {
		periods: AovBillCutsPeriod[];
		diagnosis: {
			type: string;
			owner: string;
			message: string;
			affectedCategories: string[];
		};
		momentum: {
			billCutsTrend: string;
			aovTrend: string;
		};
		revenueDriver: string;
	};
}

interface AovBillCutsAnalysisProps {
	stores: AovBillCutsStore[];
}

export function AovBillCutsAnalysis({ stores }: AovBillCutsAnalysisProps) {
	if (!stores || stores.length === 0) return null;

	// Extract period labels from the first store that has history
	const firstStore = stores.find(
		(s) => s.aovBills?.periods && s.aovBills.periods.length > 0,
	);
	const labels = {
		current: firstStore?.aovBills?.periods[0]?.label || "Current",
		previous: firstStore?.aovBills?.periods[1]?.label || "Previous",
		prevPrev: firstStore?.aovBills?.periods[2]?.label || "2 Months Ago",
	};

	const getTrendIcon = (trend: string) => {
		switch (trend) {
			case "improving":
			case "recovering":
				return (
					<TrendingUp className="size-3.5 text-emerald-500 mr-1 shrink-0" />
				);
			case "declining":
			case "weakening":
			case "softening":
				return (
					<TrendingDown className="size-3.5 text-rose-500 mr-1 shrink-0" />
				);
			case "stable":
				return (
					<Minus className="size-3.5 text-muted-foreground mr-1 shrink-0" />
				);
			default:
				return (
					<HelpCircle className="size-3.5 text-muted-foreground mr-1 shrink-0" />
				);
		}
	};

	const getTrendBadgeColor = (trend: string) => {
		switch (trend) {
			case "improving":
				return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20";
			case "recovering":
				return "bg-teal-500/10 text-teal-700 dark:text-teal-400 border-teal-500/20";
			case "declining":
			case "weakening":
				return "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20";
			case "softening":
				return "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20";
			case "stable":
				return "bg-slate-500/10 text-slate-700 dark:text-slate-400 border-slate-500/20";
			default:
				return "bg-slate-500/10 text-slate-700 dark:text-slate-400 border-slate-500/20";
		}
	};

	const getDiagnosisBadge = (type: string, owner: string) => {
		if (type === "RAMP_UP") {
			return (
				<Badge
					variant="outline"
					className="bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20 font-semibold uppercase text-[10px] tracking-wider"
				>
					Ramp-up (Store Ops)
				</Badge>
			);
		}
		if (type === "HEALTHY") {
			return (
				<Badge
					variant="outline"
					className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20 font-semibold uppercase text-[10px] tracking-wider"
				>
					Healthy (Store Ops)
				</Badge>
			);
		}
		if (type === "FOOTFALL") {
			return (
				<Badge
					variant="outline"
					className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20 font-semibold uppercase text-[10px] tracking-wider"
				>
					Footfall Alert ({owner})
				</Badge>
			);
		}
		if (type === "CURATION") {
			return (
				<Badge
					variant="outline"
					className="bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-500/20 font-semibold uppercase text-[10px] tracking-wider"
				>
					Curation Alert ({owner})
				</Badge>
			);
		}
		if (type === "MIX_SHIFT") {
			return (
				<Badge
					variant="outline"
					className="bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20 font-semibold uppercase text-[10px] tracking-wider"
				>
					Mix Shift ({owner})
				</Badge>
			);
		}
		return (
			<Badge
				variant="outline"
				className="bg-slate-500/10 text-slate-700 dark:text-slate-400 border-slate-500/20 font-semibold uppercase text-[10px] tracking-wider"
			>
				Stable
			</Badge>
		);
	};

	return (
		<Card className="w-full">
			<CardHeader className="pb-3 border-b">
				<div className="space-y-1">
					<div className="flex items-center gap-2 flex-wrap">
						<CardTitle className="text-lg font-bold">
							AOV &amp; Bill Cuts Intelligence Console
						</CardTitle>
						{firstStore && (
							<Badge
								variant="outline"
								className="bg-primary/5 text-primary border-primary/20 text-[10px] py-0.5 px-2 font-medium rounded-full"
							>
								{labels.current} vs {labels.previous} vs {labels.prevPrev}
							</Badge>
						)}
					</div>
					<CardDescription className="text-xs text-muted-foreground">
						3-Month rolling performance analysis to decompose footfall velocity
						vs basket quality curation.
					</CardDescription>
				</div>
			</CardHeader>
			<CardContent className="p-0">
				<div className="overflow-x-auto">
					<Table>
						<TableHeader>
							<TableRow className="bg-muted/40 hover:bg-muted/40">
								<TableHead className="font-semibold text-xs py-2.5">
									Store
								</TableHead>
								<TableHead className="font-semibold text-xs py-2.5">
									Metric
								</TableHead>
								<TableHead className="font-semibold text-xs py-2.5">
									{labels.current}
								</TableHead>
								<TableHead className="font-semibold text-xs py-2.5">
									{labels.previous}
								</TableHead>
								<TableHead className="font-semibold text-xs py-2.5">
									{labels.prevPrev}
								</TableHead>
								<TableHead className="font-semibold text-xs py-2.5">
									3-Month Momentum
								</TableHead>
								<TableHead className="font-semibold text-xs py-2.5">
									Operational Diagnosis
								</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{stores.map((store) => {
								const aovBills = store.aovBills || {
									periods: [],
									diagnosis: {
										type: "STABLE",
										owner: "STORE_OPS",
										message: "Data stable",
										affectedCategories: [],
									},
									momentum: { billCutsTrend: "stable", aovTrend: "stable" },
									revenueDriver: "Stable performance",
								};

								const curr = aovBills.periods[0] || {
									bills: 0,
									aov: 0,
									billsPerDay: 0,
								};
								const prev = aovBills.periods[1] || {
									bills: 0,
									aov: 0,
									billsPerDay: 0,
								};
								const prevPrev = aovBills.periods[2] || {
									bills: 0,
									aov: 0,
									billsPerDay: 0,
								};

								const isRampUp = aovBills.diagnosis.type === "RAMP_UP";

								return (
									<React.Fragment key={store.billedBy}>
										{/* Row 1: Bills */}
										<TableRow className="hover:bg-muted/5 border-t-2 border-border/80">
											<TableCell
												rowSpan={3}
												className="font-bold text-foreground text-xs align-middle border-r bg-muted/10 w-[20%]"
											>
												<div className="space-y-1">
													<p className="text-sm font-bold text-primary">
														{store.name}
													</p>
													<p className="text-[10px] text-muted-foreground font-normal tracking-wide">
														ID: {store.billedBy}
													</p>
												</div>
											</TableCell>
											<TableCell className="font-semibold text-xs text-foreground py-2 bg-muted/5">
												Customer Bills
											</TableCell>
											<TableCell className="py-2 font-medium text-xs tabular-nums">
												<div className="flex flex-col">
													<span>{curr.bills.toLocaleString()}</span>
													<span className="text-[10px] text-muted-foreground">
														{curr.billsPerDay} / working day
													</span>
												</div>
											</TableCell>
											<TableCell className="py-2 font-medium text-xs text-muted-foreground/80 tabular-nums">
												<div className="flex flex-col">
													<span>{prev.bills.toLocaleString()}</span>
													<span className="text-[10px] text-muted-foreground/60">
														{prev.billsPerDay} / day
													</span>
												</div>
											</TableCell>
											<TableCell className="py-2 font-medium text-xs text-muted-foreground/70 tabular-nums">
												<div className="flex flex-col">
													<span>{prevPrev.bills.toLocaleString()}</span>
													<span className="text-[10px] text-muted-foreground/50">
														{prevPrev.billsPerDay} / day
													</span>
												</div>
											</TableCell>
											<TableCell className="py-2">
												<Badge
													variant="outline"
													className={`flex items-center w-fit py-0.5 capitalize text-[10px] ${getTrendBadgeColor(aovBills.momentum.billCutsTrend)}`}
												>
													{getTrendIcon(aovBills.momentum.billCutsTrend)}
													{aovBills.momentum.billCutsTrend}
												</Badge>
											</TableCell>
											<TableCell className="py-2">
												{getDiagnosisBadge(
													aovBills.diagnosis.type,
													aovBills.diagnosis.owner,
												)}
											</TableCell>
										</TableRow>

										{/* Row 2: AOV */}
										<TableRow className="hover:bg-muted/5">
											<TableCell className="font-semibold text-xs text-foreground py-2 bg-muted/5">
												Average Order Value (AOV)
											</TableCell>
											<TableCell className="py-2 font-semibold text-xs tabular-nums text-primary">
												₹{curr.aov.toLocaleString()}
											</TableCell>
											<TableCell className="py-2 font-medium text-xs text-muted-foreground/80 tabular-nums">
												₹{prev.aov.toLocaleString()}
											</TableCell>
											<TableCell className="py-2 font-medium text-xs text-muted-foreground/70 tabular-nums">
												₹{prevPrev.aov.toLocaleString()}
											</TableCell>
											<TableCell className="py-2">
												<Badge
													variant="outline"
													className={`flex items-center w-fit py-0.5 capitalize text-[10px] ${getTrendBadgeColor(aovBills.momentum.aovTrend)}`}
												>
													{getTrendIcon(aovBills.momentum.aovTrend)}
													{aovBills.momentum.aovTrend}
												</Badge>
											</TableCell>
											<TableCell className="py-2 text-xs text-muted-foreground font-medium max-w-[280px]">
												{isRampUp ? (
													<span className="text-muted-foreground italic text-xs">
														AOV baseline tracking
													</span>
												) : (
													<span>{aovBills.diagnosis.message}</span>
												)}
											</TableCell>
										</TableRow>

										{/* Row 3: Revenue Driver & Affected Categories */}
										<TableRow className="hover:bg-muted/5 bg-muted/10">
											<TableCell
												colSpan={6}
												className="py-2.5 text-xs text-foreground font-medium"
											>
												<div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
													<div className="flex items-center gap-1.5 text-muted-foreground">
														<Badge
															variant="outline"
															className="text-muted-foreground/80 font-bold text-[10px] tracking-wider uppercase rounded shrink-0"
														>
															Revenue Decomposition
														</Badge>
														<span className="text-foreground font-medium italic">
															&ldquo;{aovBills.revenueDriver}&rdquo;
														</span>
													</div>
													{!isRampUp &&
														aovBills.diagnosis.affectedCategories &&
														aovBills.diagnosis.affectedCategories.length >
															0 && (
															<Badge
																variant="outline"
																className="bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-500/20 gap-1 text-[11px] font-normal normal-case"
															>
																<span className="font-semibold shrink-0">
																	Category focus:
																</span>
																<span className="italic">
																	{aovBills.diagnosis.affectedCategories.join(
																		", ",
																	)}
																</span>
															</Badge>
														)}
												</div>
											</TableCell>
										</TableRow>
									</React.Fragment>
								);
							})}
						</TableBody>
					</Table>
				</div>
			</CardContent>
		</Card>
	);
}
