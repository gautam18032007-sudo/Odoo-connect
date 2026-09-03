"use client";

import { useMemo } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";

export function TopPages({ data }: { data: any }) {
	const productPerformance = data?.productPerformance || [];

	const products = useMemo(() => {
		return productPerformance
			.slice()
			.sort(
				(a: any, b: any) =>
					Number(b.currentUnits || 0) - Number(a.currentUnits || 0),
			)
			.slice(0, 5);
	}, [productPerformance]);

	return (
		<Card className="h-full gap-2">
			<CardHeader>
				<CardTitle className="font-normal text-muted-foreground text-sm">
					Top Products by Units Sold
				</CardTitle>
			</CardHeader>

			<CardContent className="px-0">
				{products.length === 0 ? (
					<div className="flex h-32 items-center justify-center text-muted-foreground text-sm">
						No product sales in the selected period.
					</div>
				) : (
					<div className="overflow-x-auto">
						<Table className="[&_td:first-child]:pl-4 [&_td:last-child]:pr-4 [&_th:first-child]:pl-4 [&_th:last-child]:pr-4">
							<TableHeader className="[&_tr]:border-border/50">
								<TableRow className="hover:bg-transparent">
									<TableHead className="h-8">Product</TableHead>
									<TableHead className="h-8 w-24 text-right font-normal">
										Units Sold
									</TableHead>
									<TableHead className="h-8 w-28 text-right font-normal">
										Revenue
									</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody className="[&_tr]:border-border/50">
								{products.map((prod: any) => (
									<TableRow
										className="hover:bg-muted/10"
										key={prod.skuCode ?? prod.itemName}
									>
										<TableCell className="max-w-[200px] truncate py-4 font-medium">
											<div>
												<div className="truncate text-sm">{prod.itemName}</div>
												{prod.skuCode ? (
													<div className="truncate text-muted-foreground text-xs">
														{prod.skuCode}
													</div>
												) : null}
											</div>
										</TableCell>
										<TableCell className="text-right tabular-nums font-mono">
											{Number(prod.currentUnits || 0).toLocaleString()}
										</TableCell>
										<TableCell className="text-right text-muted-foreground tabular-nums font-mono">
											{formatCurrency(Number(prod.currentRevenue || 0))}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
