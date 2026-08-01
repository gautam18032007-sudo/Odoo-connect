import type { DashboardFilters } from "@/lib/founder/types";

import { FOOD_CATEGORIES } from "./filter-sql";

export interface ComparisonPeriods {
	currentStart: string;
	currentEnd: string;
	previousStart: string;
	previousEnd: string;
	label: string;
	comparisonLabel: string;
}

export interface ComparisonPeriod {
	current: { startDate: string; endDate: string };
	previous: { startDate: string; endDate: string };
}

function fmt(date: Date) {
	return date.toISOString().slice(0, 10);
}

function parseISODate(value: string) {
	const date = new Date(`${value}T00:00:00.000Z`);
	if (Number.isNaN(date.getTime())) {
		throw new Error(`Invalid date: ${value}`);
	}
	return date;
}

export function getPreviousMonthSameRange(
	startDate: string,
	endDate: string,
): ComparisonPeriod {
	const start = parseISODate(startDate);
	const end = parseISODate(endDate);

	const getSameDayLastMonth = (date: Date): string => {
		const year = date.getUTCFullYear();
		const month = date.getUTCMonth();
		const day = date.getUTCDate();

		let prevMonth = month - 1;
		let prevYear = year;
		if (prevMonth < 0) {
			prevMonth = 11;
			prevYear--;
		}

		const lastDayOfPrevMonth = new Date(
			Date.UTC(prevYear, prevMonth + 1, 0),
		).getUTCDate();
		const targetDay = Math.min(day, lastDayOfPrevMonth);

		const prevDate = new Date(Date.UTC(prevYear, prevMonth, targetDay));
		return fmt(prevDate);
	};

	return {
		current: { startDate, endDate },
		previous: {
			startDate: getSameDayLastMonth(start),
			endDate: getSameDayLastMonth(end),
		},
	};
}

export function getMirrorPeriod(
	startDate: string,
	endDate: string,
): ComparisonPeriod {
	return getPreviousMonthSameRange(startDate, endDate);
}

export function getDefaultPeriod(): ComparisonPeriod {
	const today = new Date();
	const end = fmt(today);
	const start = new Date(today);
	start.setUTCDate(start.getUTCDate() - 29);
	return getMirrorPeriod(fmt(start), end);
}

export function formatDateShort(dateStr: string): string {
	try {
		const months = [
			"Jan",
			"Feb",
			"Mar",
			"Apr",
			"May",
			"Jun",
			"Jul",
			"Aug",
			"Sep",
			"Oct",
			"Nov",
			"Dec",
		];
		const [y, m, d] = dateStr.split("-");
		const day = parseInt(d, 10);
		const month = months[parseInt(m, 10) - 1];
		return `${day} ${month} ${y}`;
	} catch (_e) {
		return dateStr;
	}
}

export function getComparisonPeriods(
	filters: DashboardFilters,
): ComparisonPeriods {
	const currentStartFormatted = formatDateShort(filters.startDate);
	const currentEndFormatted = formatDateShort(filters.endDate);

	if (
		filters.compareMode === "custom" &&
		filters.compareStartDate &&
		filters.compareEndDate
	) {
		const prevStartFormatted = formatDateShort(filters.compareStartDate);
		const prevEndFormatted = formatDateShort(filters.compareEndDate);
		return {
			currentStart: filters.startDate,
			currentEnd: filters.endDate,
			previousStart: filters.compareStartDate,
			previousEnd: filters.compareEndDate,
			label: `Current: ${currentStartFormatted} – ${currentEndFormatted} | Compared: vs ${prevStartFormatted} – ${prevEndFormatted}`,
			comparisonLabel: `vs ${prevStartFormatted} – ${prevEndFormatted}`,
		};
	}

	const mirror = getMirrorPeriod(filters.startDate, filters.endDate);
	const prevStartFormatted = formatDateShort(mirror.previous.startDate);
	const prevEndFormatted = formatDateShort(mirror.previous.endDate);

	return {
		currentStart: mirror.current.startDate,
		currentEnd: mirror.current.endDate,
		previousStart: mirror.previous.startDate,
		previousEnd: mirror.previous.endDate,
		label: `Current: ${currentStartFormatted} – ${currentEndFormatted} | Compared: vs ${prevStartFormatted} – ${prevEndFormatted}`,
		comparisonLabel: `vs ${prevStartFormatted} – ${prevEndFormatted}`,
	};
}

export function growthPct(current: number, previous: number): number | null {
	if (previous === 0) return null;
	return Math.round(((current - previous) / previous) * 1000) / 10;
}

export function calculateGrowth(
	current: number,
	previous: number,
): number | null {
	return growthPct(current, previous);
}

export function formatGrowth(pct: number | null): string {
	if (pct === null) return "—";
	return pct >= 0 ? `+${pct}%` : `${pct}%`;
}

export function cleanDashboardFilters(
	filters: DashboardFilters,
): DashboardFilters {
	const category = filters.category?.trim();
	const brand = filters.brand?.trim();

	return {
		startDate: filters.startDate,
		endDate: filters.endDate,
		store:
			filters.store?.trim() && filters.store.trim() !== "ALL"
				? filters.store.trim()
				: undefined,
		category: category && category !== "All Categories" ? category : undefined,
		brand: brand && brand !== "All Brands" ? brand : undefined,
		sku: filters.sku?.trim() || undefined,
		categoryScope: filters.categoryScope ?? "all",
		compareMode: filters.compareMode,
		compareStartDate: filters.compareStartDate,
		compareEndDate: filters.compareEndDate,
	};
}

export function isRetailScope(filters: DashboardFilters) {
	return filters.categoryScope === "retail";
}

export { FOOD_CATEGORIES };
