export function growthTextClass(value: number | null | undefined) {
	if (value == null || !Number.isFinite(Number(value))) {
		return "text-muted-foreground";
	}

	return Number(value) >= 0
		? "text-green-700 dark:text-green-300"
		: "text-destructive";
}

export function growthFillClass(value: number | null | undefined) {
	if (value == null || !Number.isFinite(Number(value))) {
		return "fill-muted-foreground";
	}

	return Number(value) >= 0
		? "fill-green-700 dark:fill-green-300"
		: "fill-destructive";
}

export function formatSignedPercent(value: number | null | undefined) {
	if (value == null || !Number.isFinite(Number(value))) {
		return "—";
	}

	return `${Number(value) >= 0 ? "+" : ""}${Number(value).toFixed(1)}%`;
}
