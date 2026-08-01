import { AlertCircle, Calendar, TrendingDown, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";

export interface ForecastStore {
	name: string;
	billedBy: string;
	forecast: {
		workingDaysPassed: number;
		remainingWorkingDays: number;
		runRate: number;
		expectedClosing: number | null;
		previousMonthClosing: number;
		growthVsPrevMonth: number | "NEW STORE" | null;
		confidence: "HIGH" | "LOW";
		reason: string;
	};
}

export interface ForecastCardProps {
	stores: ForecastStore[];
}

export function ForecastCard({ stores }: ForecastCardProps) {
	if (stores.length === 0) return null;

	// Use calendar stats from the first store's forecast to show the month stats
	const sampleForecast = stores[0].forecast;
	const totalDays =
		sampleForecast.workingDaysPassed + sampleForecast.remainingWorkingDays;

	// Get current month name
	const currentMonthName = new Date().toLocaleDateString("en-US", {
		month: "long",
	});
	const currentYear = new Date().getFullYear();

	return (
		<Card className="h-full">
			<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
				<div className="flex flex-col gap-1">
					<CardTitle className="text-lg font-bold">
						Expected Month End Closing
					</CardTitle>
					<CardDescription className="text-xs text-muted-foreground">
						Run-rate predictions for the current operational month.
					</CardDescription>
				</div>
				<div className="flex items-center gap-1.5 text-muted-foreground text-xs font-medium">
					<Calendar className="size-4" />
					<span>
						{currentMonthName} {currentYear}
					</span>
				</div>
			</CardHeader>
			<CardContent className="space-y-4">
				{/* Working Days Banner */}
				<div className="bg-muted/40 grid grid-cols-3 gap-2 rounded-md p-3 text-center">
					<div>
						<div className="text-muted-foreground text-[10px] uppercase font-bold tracking-wider">
							Total
						</div>
						<div className="font-bold text-base text-foreground tabular-nums">
							{totalDays}d
						</div>
					</div>
					<div className="border-border border-x">
						<div className="text-muted-foreground text-[10px] uppercase font-bold tracking-wider">
							Completed
						</div>
						<div className="font-bold text-base text-foreground tabular-nums">
							{sampleForecast.workingDaysPassed}d
						</div>
					</div>
					<div>
						<div className="text-muted-foreground text-[10px] uppercase font-bold tracking-wider">
							Remaining
						</div>
						<div className="font-bold text-base text-foreground tabular-nums">
							{sampleForecast.remainingWorkingDays}d
						</div>
					</div>
				</div>

				<div className="divide-y divide-border">
					{stores.map((store) => {
						const fc = store.forecast;
						const isLowConfidence = fc.confidence === "LOW";

						return (
							<div key={store.billedBy} className="py-3 first:pt-0 last:pb-0">
								<div className="flex items-center justify-between mb-2">
									<span className="font-semibold text-foreground text-sm">
										{store.name}
									</span>
									{isLowConfidence ? (
										<Badge
											variant="secondary"
											className="bg-amber-500/10 text-amber-600 hover:bg-amber-500/10 border-none px-1.5 py-0.5 rounded-sm text-[10px]"
										>
											Low Confidence
										</Badge>
									) : (
										<Badge
											variant="secondary"
											className="bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/10 border-none px-1.5 py-0.5 rounded-sm text-[10px]"
										>
											High Confidence
										</Badge>
									)}
								</div>

								{fc.expectedClosing === null ? (
									<div className="bg-muted/20 border-muted-foreground/10 flex items-center gap-2 rounded-md border p-2.5 text-xs text-muted-foreground">
										<AlertCircle className="size-4 text-amber-500 shrink-0" />
										<span>{fc.reason}</span>
									</div>
								) : (
									<div className="grid grid-cols-2 gap-4">
										<div>
											<div className="text-muted-foreground text-[10px] font-medium">
												Daily Run Rate
											</div>
											<div className="font-semibold text-foreground text-sm tabular-nums">
												{formatCurrency(fc.runRate, { noDecimals: true })}
											</div>
										</div>
										<div>
											<div className="text-muted-foreground text-[10px] font-medium flex items-center justify-between">
												<span>Expected Closing</span>
												{fc.growthVsPrevMonth !== null &&
													fc.growthVsPrevMonth !== "NEW STORE" && (
														<span className="text-[10px] font-semibold flex items-center">
															{fc.growthVsPrevMonth >= 0 ? (
																<span className="text-emerald-500 flex items-center">
																	<TrendingUp className="mr-0.5 size-3" />+
																	{fc.growthVsPrevMonth}%
																</span>
															) : (
																<span className="text-rose-500 flex items-center">
																	<TrendingDown className="mr-0.5 size-3" />
																	{fc.growthVsPrevMonth}%
																</span>
															)}
														</span>
													)}
											</div>
											<div className="font-bold text-base text-foreground tabular-nums">
												{formatCurrency(fc.expectedClosing, {
													noDecimals: true,
												})}
											</div>
										</div>
									</div>
								)}

								{isLowConfidence && fc.expectedClosing !== null && (
									<div className="mt-2 flex items-center gap-1.5 text-muted-foreground text-[10px]">
										<AlertCircle className="size-3 text-amber-500 shrink-0" />
										<span>Ramp period: {fc.reason}</span>
									</div>
								)}
							</div>
						);
					})}
				</div>
			</CardContent>
		</Card>
	);
}
