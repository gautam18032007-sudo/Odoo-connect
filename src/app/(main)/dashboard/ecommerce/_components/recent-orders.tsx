"use client";

import { ArrowUpRight, Download, MoreHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
	Card,
	CardAction,
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
import { formatCurrency } from "@/lib/utils";

export function RecentOrders({ data }: { data: any }) {
	const recentOrders = data?.recentOrders || [];

	return (
		<Card>
			<CardHeader>
				<CardTitle className="font-normal text-muted-foreground text-sm">
					Recent Transactions
				</CardTitle>
				<CardDescription className="text-foreground text-xl tabular-nums leading-none tracking-tight">
					{recentOrders.length} transactions in this period
				</CardDescription>
				<CardAction className="flex items-center gap-1">
					<Button aria-label="Open orders" size="icon-sm" variant="outline">
						<ArrowUpRight />
					</Button>
					<Button aria-label="Download orders" size="icon-sm" variant="outline">
						<Download />
					</Button>
					<Button size="icon-sm" variant="outline">
						<MoreHorizontal />
					</Button>
				</CardAction>
			</CardHeader>

			<CardContent className="flex flex-col gap-4 px-0">
				<div className="overflow-x-auto">
					<Table className="**:data-[slot='table-cell']:px-4.5 **:data-[slot='table-head']:px-4.5">
						<TableHeader className="border-t **:data-[slot='table-head']:h-11 **:data-[slot='table-head']:font-normal **:data-[slot='table-head']:text-foreground **:data-[slot='table-head']:text-sm">
							<TableRow>
								<TableHead>Bill No</TableHead>
								<TableHead>Date</TableHead>
								<TableHead>Store</TableHead>
								<TableHead>Customer</TableHead>
								<TableHead>Product</TableHead>
								<TableHead className="text-right">Qty</TableHead>
								<TableHead className="text-right">Amount</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody className="**:data-[slot='table-row']:border-border/50 **:data-[slot='table-cell']:px-4 **:data-[slot='table-cell']:py-3 **:data-[slot='table-row']:hover:bg-muted/10">
							{recentOrders.length > 0 ? (
								recentOrders.map((order: any) => (
									<TableRow key={order.id}>
										<TableCell className="font-mono font-medium">
											{order.billNo}
										</TableCell>
										<TableCell>{order.saleDate}</TableCell>
										<TableCell>
											<span
												className={`px-2 py-0.5 rounded text-xs font-semibold ${
													order.store === "KLJ"
														? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
														: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
												}`}
											>
												{order.store}
											</span>
										</TableCell>
										<TableCell className="font-mono text-xs">
											{order.customerId}
										</TableCell>
										<TableCell className="max-w-[200px] truncate">
											{order.productName}
										</TableCell>
										<TableCell className="text-right font-mono">
											{order.quantity}
										</TableCell>
										<TableCell className="text-right font-semibold font-mono">
											{formatCurrency(order.netAmount)}
										</TableCell>
									</TableRow>
								))
							) : (
								<TableRow>
									<TableCell className="h-24 text-center" colSpan={7}>
										No transactions found in this period.
									</TableCell>
								</TableRow>
							)}
						</TableBody>
					</Table>
				</div>
			</CardContent>
		</Card>
	);
}
