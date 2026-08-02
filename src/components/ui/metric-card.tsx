import { ArrowDownRight, ArrowUpRight, type LucideIcon } from "lucide-react";
import type * as React from "react";
import { cn } from "@/lib/utils";

interface MetricCardProps extends React.ComponentProps<"div"> {
	title: string;
	value: string | number;
	growth?: number | null;
	comparisonLabel?: string;
	icon?: LucideIcon;
	suffix?: string;
}

export function MetricCard({
	title,
	value,
	growth,
	comparisonLabel,
	icon: Icon,
	suffix,
	className,
	...props
}: MetricCardProps) {
	const isPositive = growth !== undefined && growth !== null && growth >= 0;
	const isNegative = growth !== undefined && growth !== null && growth < 0;

	return (
		<div
			className={cn(
				"relative flex flex-col justify-between h-full min-h-[135px] p-6 rounded-2xl bg-card text-card-foreground ring-1 ring-foreground/10 backdrop-blur-xl transition-all duration-300 hover:ring-foreground/20 hover:shadow-lg hover:-translate-y-0.5",
				className,
			)}
			{...props}
		>
			<div className="flex items-center justify-between gap-2">
				<span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
					{title}
				</span>
				{Icon && (
					<div className="p-2 rounded-xl bg-muted ring-1 ring-foreground/10 text-foreground">
						<Icon className="size-4 shrink-0" />
					</div>
				)}
			</div>

			<div className="my-2 flex items-baseline gap-1.5">
				<span className="text-3xl font-bold tracking-tight text-card-foreground font-mono">
					{value}
				</span>
				{suffix && (
					<span className="text-xs font-medium text-muted-foreground">
						{suffix}
					</span>
				)}
			</div>

			{growth !== undefined && growth !== null ? (
				<div className="flex items-center gap-2 text-xs">
					<span
						className={cn(
							"inline-flex items-center font-bold gap-0.5 rounded-md px-2 py-0.5 text-xs",
							isPositive &&
								"bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20",
							isNegative &&
								"bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20",
							growth === 0 &&
								"bg-muted text-muted-foreground border border-foreground/10",
						)}
					>
						{isPositive && <ArrowUpRight className="size-3.5 shrink-0" />}
						{isNegative && <ArrowDownRight className="size-3.5 shrink-0" />}
						{growth >= 0 ? `+${Math.abs(growth)}%` : `-${Math.abs(growth)}%`}
					</span>
					{comparisonLabel && (
						<span className="text-xs text-muted-foreground truncate">
							{comparisonLabel}
						</span>
					)}
				</div>
			) : (
				comparisonLabel && (
					<span className="text-xs text-muted-foreground truncate block mt-1">
						{comparisonLabel}
					</span>
				)
			)}
		</div>
	);
}
