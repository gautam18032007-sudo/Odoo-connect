"use client";

import { ArrowDownRight, ArrowUpRight, Ellipsis } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
	Card,
	CardAction,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";

export function AnalyticsKpiStrip({ data }: { data: any }) {
	const customers = data?.customers || { current: 0, previous: 0, growth: 0 };

	return (
		<div className="overflow-hidden rounded-xl bg-card shadow-xs ring-1 ring-foreground/10">
			<div className="grid divide-y *:data-[slot=card]:rounded-none *:data-[slot=card]:ring-0 md:grid-cols-2 md:divide-x md:divide-y-0">
				<Card>
					<CardHeader>
						<CardTitle className="font-normal text-sm">Customers</CardTitle>
						<CardAction>
							<Ellipsis className="size-4" />
						</CardAction>
					</CardHeader>
					<CardContent className="flex flex-col gap-4">
						<div className="flex items-center justify-between gap-4">
							<div className="text-2xl leading-none tracking-tight font-bold font-mono">
								{customers.current.toLocaleString()}
							</div>
							<Badge
								className={`border-transparent ${customers.growth >= 0 ? "bg-green-500/10 text-green-700 dark:bg-green-500/15 dark:text-green-300" : "bg-destructive/10 text-destructive"}`}
							>
								{customers.growth >= 0 ? (
									<ArrowUpRight className="mr-0.5 size-3" />
								) : (
									<ArrowDownRight className="mr-0.5 size-3" />
								)}
								{Math.abs(customers.growth).toFixed(1)}%
							</Badge>
						</div>

						<div className="flex items-center gap-2 text-muted-foreground text-xs font-semibold">
							<span>
								from{" "}
								<span className="text-foreground font-mono">
									{customers.previous.toLocaleString()}
								</span>
							</span>
							<span>•</span>
							<span>prev period</span>
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
