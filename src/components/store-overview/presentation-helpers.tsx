import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn, formatCurrency } from "@/lib/utils";

/**
 * Renders a metric value formatted as currency or integer, with a growth indicator.
 */
interface StoreMetricCellProps {
	value: number;
	previous: number;
	growth: number | "NEW STORE";
	isCurrency?: boolean;
}

export function StoreMetricCell({
	value,
	previous,
	growth,
	isCurrency = false,
}: StoreMetricCellProps) {
	const formattedValue = isCurrency
		? formatCurrency(value, { noDecimals: true })
		: value.toLocaleString("en-IN");

	const formattedPrev = isCurrency
		? formatCurrency(previous, { noDecimals: true })
		: previous.toLocaleString("en-IN");

	return (
		<div className="flex flex-col gap-0.5">
			<div className="flex items-baseline gap-2">
				<span className="font-semibold text-foreground text-sm tabular-nums">
					{formattedValue}
				</span>
				<GrowthIndicator growth={growth} size="sm" />
			</div>
			<span className="text-muted-foreground text-[10px] tabular-nums">
				Prev: {formattedPrev}
			</span>
		</div>
	);
}

/**
 * Standard growth percentage indicator with arrow. Handles new store token.
 */
interface GrowthIndicatorProps {
	growth: number | "NEW STORE";
	size?: "sm" | "default";
}

export function GrowthIndicator({
	growth,
	size = "default",
}: GrowthIndicatorProps) {
	if (growth === "NEW STORE") {
		return (
			<Badge
				variant="secondary"
				className={cn(
					"bg-blue-500/10 text-blue-600 hover:bg-blue-500/10 border-none font-medium rounded-sm",
					size === "sm" ? "px-1 text-[9px] h-3.5" : "px-1.5 py-0.5 text-xs h-5",
				)}
			>
				NEW
			</Badge>
		);
	}

	const num = Number(growth ?? 0);
	const isZero = num === 0;
	const isPositive = num > 0;

	if (isZero) {
		return (
			<span
				className={cn(
					"inline-flex items-center text-muted-foreground font-medium",
					size === "sm" ? "text-[10px]" : "text-xs",
				)}
			>
				<Minus className="mr-0.5 size-3" />
				0%
			</span>
		);
	}

	return (
		<span
			className={cn(
				"inline-flex items-center font-semibold",
				isPositive
					? "text-emerald-600 dark:text-emerald-500"
					: "text-rose-600 dark:text-rose-500",
				size === "sm" ? "text-[10px]" : "text-xs",
			)}
		>
			{isPositive ? (
				<ArrowUpRight className="mr-0.5 size-3 shrink-0" />
			) : (
				<ArrowDownRight className="mr-0.5 size-3 shrink-0" />
			)}
			{isPositive ? "+" : ""}
			{num.toFixed(1)}%
		</span>
	);
}

/**
 * Unified badge displaying comparison range context.
 */
export function ComparisonBadge({ label }: { label: string }) {
	if (!label) return null;
	return (
		<Badge
			variant="outline"
			className="border-muted text-muted-foreground font-normal text-[10px]"
		>
			{label}
		</Badge>
	);
}

/**
 * Displays dynamic operational health badges based on store status.
 */
export function StatusBadge({
	status,
}: {
	status: "healthy" | "attention" | "critical" | string;
}) {
	const normalized = status.toLowerCase();

	if (normalized === "healthy") {
		return (
			<Badge
				variant="secondary"
				className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10 border-none px-2 py-0.5 font-medium rounded-sm text-[10px]"
			>
				Healthy
			</Badge>
		);
	}

	if (normalized === "attention") {
		return (
			<Badge
				variant="secondary"
				className="bg-amber-500/10 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10 border-none px-2 py-0.5 font-medium rounded-sm text-[10px]"
			>
				Attention
			</Badge>
		);
	}

	return (
		<Badge
			variant="secondary"
			className="bg-rose-500/10 text-rose-700 dark:text-rose-400 hover:bg-rose-500/10 border-none px-2 py-0.5 font-medium rounded-sm text-[10px]"
		>
			Critical
		</Badge>
	);
}
