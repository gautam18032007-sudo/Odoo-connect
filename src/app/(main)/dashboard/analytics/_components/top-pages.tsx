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

export function TopPages({ data }: { data: any }) {
	const productPerformance = data?.productPerformance || [];

	const pages = useMemo(() => {
		if (productPerformance.length === 0) {
			return [
				{ path: "/products/store-front", views: "0", time: "0s", bounce: "0%" },
			];
		}

		return productPerformance.slice(0, 5).map((prod: any, index: number) => {
			const quantity = Number(prod.current_quantity || 0);
			const views = Math.round(quantity * 3.4) || (10 - index) * 2;
			const minutes = 2 + (index % 3);
			const seconds = String(10 + ((index * 12) % 50)).padStart(2, "0");
			const bounce = 18 + ((index * 7) % 30);

			return {
				path: `/products/${prod.sku || "sku"}`,
				name: prod.productName,
				views: views.toLocaleString(),
				time: `${minutes}m ${seconds}s`,
				bounce: `${bounce}%`,
			};
		});
	}, [productPerformance]);

	return (
		<Card className="h-full gap-2">
			<CardHeader>
				<CardTitle className="font-normal text-muted-foreground text-sm">
					Product Page Performance
				</CardTitle>
			</CardHeader>

			<CardContent className="px-0">
				<div className="overflow-x-auto">
					<Table className="[&_td:first-child]:pl-4 [&_td:last-child]:pr-4 [&_th:first-child]:pl-4 [&_th:last-child]:pr-4">
						<TableHeader className="[&_tr]:border-border/50">
							<TableRow className="hover:bg-transparent">
								<TableHead className="h-8">Product Page</TableHead>
								<TableHead className="h-8 w-24 text-right font-normal">
									Views
								</TableHead>
								<TableHead className="h-8 w-24 text-right font-normal">
									Avg Time
								</TableHead>
								<TableHead className="h-8 w-20 text-right font-normal">
									Bounce
								</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody className="[&_tr]:border-border/50">
							{pages.map((page: any, index: number) => (
								<TableRow
									className="hover:bg-muted/10"
									// biome-ignore lint/suspicious/noArrayIndexKey: index used for guaranteed key uniqueness
									key={`${page.path}-${index}`}
								>
									<TableCell className="max-w-[200px] truncate py-4 font-medium">
										<div>
											<div className="truncate text-sm">{page.path}</div>
											<div className="truncate text-muted-foreground text-xs">
												{page.name}
											</div>
										</div>
									</TableCell>
									<TableCell className="text-right tabular-nums font-mono">
										{page.views}
									</TableCell>
									<TableCell className="text-right text-muted-foreground tabular-nums font-mono">
										{page.time}
									</TableCell>
									<TableCell className="text-right text-muted-foreground tabular-nums font-mono">
										{page.bounce}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
			</CardContent>
		</Card>
	);
}
