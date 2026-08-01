import type * as React from "react";
import { cn } from "@/lib/utils";
import { tokens } from "@/styles/tokens";

export type HealthStatus =
	| "excellent"
	| "healthy"
	| "warning"
	| "critical"
	| "neutral";

interface HealthBadgeProps extends React.ComponentProps<"span"> {
	status: HealthStatus;
	label?: string;
}

export function HealthBadge({
	status,
	label,
	className,
	...props
}: HealthBadgeProps) {
	const config = {
		excellent: {
			defaultLabel: "Excellent",
			classes: tokens.colors.status.positive,
		},
		healthy: {
			defaultLabel: "Healthy",
			classes: tokens.colors.status.positive,
		},
		warning: {
			defaultLabel: "Watchlist",
			classes: tokens.colors.status.warning,
		},
		critical: {
			defaultLabel: "Critical",
			classes: tokens.colors.status.negative,
		},
		neutral: {
			defaultLabel: "Stable",
			classes: tokens.colors.status.neutral,
		},
	}[status];

	return (
		<span
			className={cn(
				"inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold border",
				config.classes.bg,
				config.classes.text,
				config.classes.border,
				className,
			)}
			{...props}
		>
			<span className="size-1.5 rounded-full bg-current" />
			{label || config.defaultLabel}
		</span>
	);
}
