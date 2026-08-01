import Link from "next/link";
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
import {
	ComparisonBadge,
	StatusBadge,
	StoreMetricCell,
} from "./presentation-helpers";

export interface StorePerformanceTableProps {
	stores: Array<{
		name: string;
		billedBy: string;
		performance: {
			revenue: {
				current: number;
				previous: number;
				growth: number | "NEW STORE";
			};
			billCuts: {
				current: number;
				previous: number;
				growth: number | "NEW STORE";
			};
			aov: { current: number; previous: number; growth: number | "NEW STORE" };
			units: {
				current: number;
				previous: number;
				growth: number | "NEW STORE";
			};
		};
		contributionPercent: number;
	}>;
	comparisonLabel: string;
}

export function StorePerformanceTable({
	stores,
	comparisonLabel,
}: StorePerformanceTableProps) {
	const getStoreStatus = (
		growth: number | "NEW STORE",
	): "healthy" | "attention" | "critical" => {
		if (growth === "NEW STORE") return "healthy";
		if (growth >= 0) return "healthy";
		if (growth >= -15) return "attention";
		return "critical";
	};

	return (
		<Card className="h-full">
			<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
				<div className="flex flex-col gap-1">
					<CardTitle className="text-lg font-bold">
						Store Performance Overview
					</CardTitle>
					<CardDescription className="text-xs text-muted-foreground">
						Comparative analytics across all operational locations.
					</CardDescription>
				</div>
				<ComparisonBadge label={comparisonLabel} />
			</CardHeader>
			<CardContent className="p-0">
				<div className="overflow-x-auto">
					<Table>
						<TableHeader>
							<TableRow className="bg-muted/40 hover:bg-muted/40">
								<TableHead className="py-2.5 font-semibold text-xs">
									Store
								</TableHead>
								<TableHead className="py-2.5 font-semibold text-xs">
									Revenue
								</TableHead>
								<TableHead className="py-2.5 font-semibold text-xs text-right">
									Contribution
								</TableHead>
								<TableHead className="py-2.5 font-semibold text-xs">
									Customer Transactions
								</TableHead>
								<TableHead className="py-2.5 font-semibold text-xs">
									AOV
								</TableHead>
								<TableHead className="py-2.5 font-semibold text-xs">
									Units
								</TableHead>
								<TableHead className="py-2.5 font-semibold text-xs">
									Status
								</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{stores.length === 0 ? (
								<TableRow>
									<TableCell
										colSpan={7}
										className="h-24 text-center text-muted-foreground text-xs"
									>
										No sales data available.
									</TableCell>
								</TableRow>
							) : (
								stores.map((store) => {
									const status = getStoreStatus(
										store.performance.revenue.growth,
									);
									return (
										<TableRow
											key={store.billedBy}
											className="hover:bg-muted/20"
										>
											<TableCell className="py-3 font-semibold text-foreground text-xs whitespace-nowrap">
												<Link
													href={`/dashboard/store/${encodeURIComponent(store.billedBy)}`}
													className="text-primary hover:underline"
												>
													{store.name}
												</Link>
											</TableCell>
											<TableCell className="py-3">
												<StoreMetricCell
													value={store.performance.revenue.current}
													previous={store.performance.revenue.previous}
													growth={store.performance.revenue.growth}
													isCurrency
												/>
											</TableCell>
											<TableCell className="py-3 font-medium text-xs text-right tabular-nums">
												{store.contributionPercent}%
											</TableCell>
											<TableCell className="py-3">
												<StoreMetricCell
													value={store.performance.billCuts.current}
													previous={store.performance.billCuts.previous}
													growth={store.performance.billCuts.growth}
												/>
											</TableCell>
											<TableCell className="py-3">
												<StoreMetricCell
													value={store.performance.aov.current}
													previous={store.performance.aov.previous}
													growth={store.performance.aov.growth}
													isCurrency
												/>
											</TableCell>
											<TableCell className="py-3">
												<StoreMetricCell
													value={store.performance.units.current}
													previous={store.performance.units.previous}
													growth={store.performance.units.growth}
												/>
											</TableCell>
											<TableCell className="py-3">
												<StatusBadge status={status} />
											</TableCell>
										</TableRow>
									);
								})
							)}
						</TableBody>
					</Table>
				</div>
			</CardContent>
		</Card>
	);
}
