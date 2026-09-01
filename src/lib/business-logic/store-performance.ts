import type { NeonQueryFunction } from "@neondatabase/serverless";
import type { DashboardFilters } from "@/lib/founder/types";
import { getWorkingDaysInRange } from "./calendar";
import { type ComparisonPeriods, getMirrorPeriod } from "./comparison";
import { FOOD_CATEGORIES } from "./filter-sql";
import { diagnoseStoreAovBills } from "./store-diagnosis";

type FounderSql = NeonQueryFunction<false, false>;

export interface StorePerformanceMetric {
	current: number;
	previous: number;
	growth: number | "NEW STORE";
}

export interface StorePerformanceRow {
	name: string;
	billedBy: string;
	performance: {
		revenue: StorePerformanceMetric;
		billCuts: StorePerformanceMetric;
		aov: StorePerformanceMetric;
		units: StorePerformanceMetric;
	};
	contributionPercent: number;
	// Future-ready COGS, Purchases, and Margin placeholders
	purchaseAmount?: {
		current: number;
		previous: number;
	};
	cogsAmount?: {
		current: number;
		previous: number;
	};
	marginPercent?: {
		current: number;
		previous: number;
	};
}

function numberValue(value: unknown) {
	const parsed = Number(value ?? 0);
	return Number.isFinite(parsed) ? parsed : 0;
}

function retailFilter(filters: DashboardFilters) {
	return filters.categoryScope === "retail" ? [...FOOD_CATEGORIES] : null;
}

function calculateMetricGrowth(
	current: number,
	previous: number,
	storeAgeDays: number | null,
): number | "NEW STORE" {
	if (previous === 0) {
		// A store is only "established" when it has a real opened_date in
		// store_dimension. A missing opened_date must NOT be silently treated
		// as mature — that would misclassify undocumented stores.
		if (storeAgeDays !== null) {
			return 0; // Established stores don't show "NEW STORE"
		}
		return "NEW STORE";
	}
	return Math.round(((current - previous) / previous) * 1000) / 10;
}

export async function getStorePerformance(
	db: FounderSql,
	periods: ComparisonPeriods,
	filters: DashboardFilters,
): Promise<StorePerformanceRow[]> {
	const foodCategories = retailFilter(filters);

	// FULL OUTER JOIN ensures that if a store exists only in the current or previous period, it is not dropped.
	// Filter by global filters (store, category, brand, sku) dynamically.
	const queryString = `
    WITH curr AS (
      SELECT store_display_name, billed_by, SUM(net_amount) AS revenue,
        COUNT(DISTINCT bill_no) AS bill_cuts, SUM(quantity) AS units
      FROM sales_fact_v
      WHERE sale_date >= $1::date AND sale_date <= $2::date
        AND ($3::text IS NULL OR billed_by = $3)
        AND ($4::text IS NULL OR category = $4)
        AND ($5::text IS NULL OR brand = $5)
        AND ($6::text IS NULL OR (sku_code ILIKE '%' || $6 || '%' OR item_name ILIKE '%' || $6 || '%'))
        AND ($7::text[] IS NULL OR category <> ALL($7::text[]))
      GROUP BY store_display_name, billed_by
    ),
    prev AS (
      SELECT store_display_name, billed_by, SUM(net_amount) AS revenue,
        COUNT(DISTINCT bill_no) AS bill_cuts, SUM(quantity) AS units
      FROM sales_fact_v
      WHERE sale_date >= $8::date AND sale_date <= $9::date
        AND ($3::text IS NULL OR billed_by = $3)
        AND ($4::text IS NULL OR category = $4)
        AND ($5::text IS NULL OR brand = $5)
        AND ($6::text IS NULL OR (sku_code ILIKE '%' || $6 || '%' OR item_name ILIKE '%' || $6 || '%'))
        AND ($7::text[] IS NULL OR category <> ALL($7::text[]))
      GROUP BY store_display_name, billed_by
    ),
    total_curr AS (SELECT SUM(revenue) AS total_rev FROM curr)
    SELECT
      COALESCE(c.store_display_name, p.store_display_name) AS store_display_name,
      COALESCE(c.billed_by, p.billed_by) AS billed_by,
      sd.opened_date::text AS opened_date,
      c.revenue AS current_revenue,
      c.bill_cuts AS current_bill_cuts,
      c.units AS current_units,
      p.revenue AS prev_revenue,
      p.bill_cuts AS prev_bill_cuts,
      p.units AS prev_units,
      t.total_rev
    FROM curr c
    FULL OUTER JOIN prev p ON c.billed_by = p.billed_by
    LEFT JOIN store_dimension sd ON COALESCE(c.billed_by, p.billed_by) = sd.store_name
    CROSS JOIN total_curr t
    ORDER BY COALESCE(c.revenue, 0) DESC
  `;

	// Bind parameters securely to prevent SQL injection
	const result = await (db as any).query(queryString, [
		periods.currentStart,
		periods.currentEnd,
		filters.store ?? null,
		filters.category ?? null,
		filters.brand ?? null,
		filters.sku ?? null,
		foodCategories ?? null,
		periods.previousStart,
		periods.previousEnd,
	]);

	return result.map((row: any) => {
		const storeName = String(row.store_display_name || "Unknown");
		const billedBy = String(row.billed_by || "Unknown");
		// null (no store_dimension.opened_date) must stay null here — it is
		// the signal calculateMetricGrowth uses to flag "NEW STORE" rather
		// than silently assuming the store is mature (see getStoreAgeInDays'
		// own null -> 999 fallback, which exists for a different diagnosis
		// feature and is deliberately NOT reused for this decision).
		const storeAgeDays = row.opened_date
			? getStoreAgeInDays(row.opened_date, periods.currentEnd)
			: null;

		const currentRevenue = numberValue(row.current_revenue);
		const prevRevenue = numberValue(row.prev_revenue);

		const currentBills = numberValue(row.current_bill_cuts);
		const prevBills = numberValue(row.prev_bill_cuts);

		const currentUnits = numberValue(row.current_units);
		const prevUnits = numberValue(row.prev_units);

		const currentAov = currentBills > 0 ? currentRevenue / currentBills : 0;
		const prevAov = prevBills > 0 ? prevRevenue / prevBills : 0;

		const totalRev = numberValue(row.total_rev);

		return {
			name: storeName,
			billedBy,
			performance: {
				revenue: {
					current: currentRevenue,
					previous: prevRevenue,
					growth: calculateMetricGrowth(
						currentRevenue,
						prevRevenue,
						storeAgeDays,
					),
				},
				billCuts: {
					current: currentBills,
					previous: prevBills,
					growth: calculateMetricGrowth(currentBills, prevBills, storeAgeDays),
				},
				aov: {
					current: Math.round(currentAov * 100) / 100,
					previous: Math.round(prevAov * 100) / 100,
					growth: calculateMetricGrowth(currentAov, prevAov, storeAgeDays),
				},
				units: {
					current: currentUnits,
					previous: prevUnits,
					growth: calculateMetricGrowth(currentUnits, prevUnits, storeAgeDays),
				},
			},
			contributionPercent:
				totalRev > 0 ? Math.round((currentRevenue / totalRev) * 1000) / 10 : 0,
			// Stubs for future Odoo purchasing integration
			purchaseAmount: { current: 0, previous: 0 },
			cogsAmount: { current: 0, previous: 0 },
			marginPercent: { current: 0, previous: 0 },
		};
	});
}

function getStoreAgeInDays(
	openedDateStr: string | null,
	endDateStr: string,
): number {
	if (!openedDateStr) return 999; // Fallback: assume mature store
	const start = new Date(`${openedDateStr}T00:00:00.000Z`);
	const end = new Date(`${endDateStr}T00:00:00.000Z`);
	if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 999;
	const diffTime = end.getTime() - start.getTime();
	return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

function calculate3MonthTrend(
	curr: number,
	prev: number,
	prevPrev: number,
):
	| "improving"
	| "declining"
	| "recovering"
	| "softening"
	| "stable"
	| "volatile" {
	if (prev === 0 || prevPrev === 0) return "stable";

	const growth1 = ((curr - prev) / prev) * 100;
	const growth2 = ((prev - prevPrev) / prevPrev) * 100;

	// Stable: if both periods are within ±5% change
	if (Math.abs(growth1) <= 5 && Math.abs(growth2) <= 5) {
		return "stable";
	}

	if (curr > prev && prev > prevPrev) {
		return "improving";
	}

	if (curr < prev && prev < prevPrev) {
		return "declining";
	}

	if (curr > prev && prev < prevPrev) {
		return "recovering";
	}

	if (curr < prev && prev > prevPrev) {
		return "softening";
	}

	return "volatile";
}

function calculateRevenueDriver(
	revGrowth: number,
	billGrowth: number,
	aovGrowth: number,
): string {
	if (revGrowth > 5) {
		if (billGrowth > 5 && aovGrowth < -5) {
			return "Growth driven by higher footfall (transaction count) despite lower average basket value (curation).";
		}
		if (billGrowth < -5 && aovGrowth > 5) {
			return "Growth driven by premium basket value (curation) despite declining customer visits.";
		}
		if (billGrowth > 5 && aovGrowth > 5) {
			return "Healthy revenue expansion driven by both higher customer visits and premium basket value.";
		}
		return "Revenue grew with overall stable transaction metrics.";
	}

	if (revGrowth < -5) {
		if (billGrowth < -5 && Math.abs(aovGrowth) <= 5) {
			return "Revenue pressure driven by declining footfall (fewer customer visits).";
		}
		if (Math.abs(billGrowth) <= 5 && aovGrowth < -5) {
			return "Revenue pressure driven by declining average ticket size (curation bottleneck).";
		}
		if (billGrowth < -5 && aovGrowth < -5) {
			return "Revenue pressure driven by drops in both footfall and basket curation.";
		}
		return "Revenue pressure due to operational variances.";
	}

	return "Stable revenue performance with normal daily variances.";
}

export async function getStoreAovBillsHistory(
	db: FounderSql,
	periods: ComparisonPeriods,
	filters: DashboardFilters,
) {
	const foodCategories = retailFilter(filters);

	const prev1 = getMirrorPeriod(periods.currentStart, periods.currentEnd);
	const prev2 = getMirrorPeriod(
		prev1.previous.startDate,
		prev1.previous.endDate,
	);

	const currentStart = periods.currentStart;
	const currentEnd = periods.currentEnd;
	const prevStart = prev1.previous.startDate;
	const prevEnd = prev1.previous.endDate;
	const prevPrevStart = prev2.previous.startDate;
	const prevPrevEnd = prev2.previous.endDate;

	const getMonthLabel = (dateStr: string) => {
		try {
			const [y, m] = dateStr.split("-");
			const months = [
				"January",
				"February",
				"March",
				"April",
				"May",
				"June",
				"July",
				"August",
				"September",
				"October",
				"November",
				"December",
			];
			const monthName = months[parseInt(m, 10) - 1];
			return `${monthName} ${y}`;
		} catch (_e) {
			return dateStr;
		}
	};

	const labels = {
		current: getMonthLabel(currentStart),
		previous: getMonthLabel(prevStart),
		prevPrev: getMonthLabel(prevPrevStart),
	};

	const currentWorkingDays = await getWorkingDaysInRange(
		db,
		currentStart,
		currentEnd,
		filters.store,
	);
	const prevWorkingDays = await getWorkingDaysInRange(
		db,
		prevStart,
		prevEnd,
		filters.store,
	);
	const prevPrevWorkingDays = await getWorkingDaysInRange(
		db,
		prevPrevStart,
		prevPrevEnd,
		filters.store,
	);

	const queryString = `
		WITH curr AS (
			SELECT billed_by, SUM(net_amount) AS revenue, COUNT(DISTINCT bill_no) AS bills
			FROM sales_fact_v
			WHERE sale_date >= $1::date AND sale_date <= $2::date
				AND ($7::text IS NULL OR billed_by = $7)
				AND ($8::text IS NULL OR category = $8)
				AND ($9::text IS NULL OR brand = $9)
				AND ($10::text IS NULL OR (sku_code ILIKE '%' || $10 || '%' OR item_name ILIKE '%' || $10 || '%'))
				AND ($11::text[] IS NULL OR category <> ALL($11::text[]))
			GROUP BY billed_by
		),
		prev AS (
			SELECT billed_by, SUM(net_amount) AS revenue, COUNT(DISTINCT bill_no) AS bills
			FROM sales_fact_v
			WHERE sale_date >= $3::date AND sale_date <= $4::date
				AND ($7::text IS NULL OR billed_by = $7)
				AND ($8::text IS NULL OR category = $8)
				AND ($9::text IS NULL OR brand = $9)
				AND ($10::text IS NULL OR (sku_code ILIKE '%' || $10 || '%' OR item_name ILIKE '%' || $10 || '%'))
				AND ($11::text[] IS NULL OR category <> ALL($11::text[]))
			GROUP BY billed_by
		),
		prev_prev AS (
			SELECT billed_by, SUM(net_amount) AS revenue, COUNT(DISTINCT bill_no) AS bills
			FROM sales_fact_v
			WHERE sale_date >= $5::date AND sale_date <= $6::date
				AND ($7::text IS NULL OR billed_by = $7)
				AND ($8::text IS NULL OR category = $8)
				AND ($9::text IS NULL OR brand = $9)
				AND ($10::text IS NULL OR (sku_code ILIKE '%' || $10 || '%' OR item_name ILIKE '%' || $10 || '%'))
				AND ($11::text[] IS NULL OR category <> ALL($11::text[]))
			GROUP BY billed_by
		),
		all_stores AS (
			SELECT DISTINCT billed_by FROM sales_fact_v
			WHERE ($7::text IS NULL OR billed_by = $7)
		)
		SELECT 
			as_s.billed_by,
			COALESCE(sd.display_name, as_s.billed_by) AS name,
			sd.opened_date::text AS opened_date,
			COALESCE(c.revenue, 0) AS curr_revenue,
			COALESCE(c.bills, 0) AS curr_bills,
			COALESCE(p.revenue, 0) AS prev_revenue,
			COALESCE(p.bills, 0) AS prev_bills,
			COALESCE(pp.revenue, 0) AS prev_prev_revenue,
			COALESCE(pp.bills, 0) AS prev_prev_bills
		FROM all_stores as_s
		LEFT JOIN store_dimension sd ON as_s.billed_by = sd.store_name
		LEFT JOIN curr c ON as_s.billed_by = c.billed_by
		LEFT JOIN prev p ON as_s.billed_by = p.billed_by
		LEFT JOIN prev_prev pp ON as_s.billed_by = pp.billed_by;
	`;

	const result = await (db as any).query(queryString, [
		currentStart,
		currentEnd,
		prevStart,
		prevEnd,
		prevPrevStart,
		prevPrevEnd,
		filters.store ?? null,
		filters.category ?? null,
		filters.brand ?? null,
		filters.sku ?? null,
		foodCategories ?? null,
	]);

	return result.map((row: any) => {
		const currRevenue = numberValue(row.curr_revenue);
		const currBills = numberValue(row.curr_bills);
		const prevRevenue = numberValue(row.prev_revenue);
		const prevBills = numberValue(row.prev_bills);
		const prevPrevRevenue = numberValue(row.prev_prev_revenue);
		const prevPrevBills = numberValue(row.prev_prev_bills);

		const currAov = currBills > 0 ? currRevenue / currBills : 0;
		const prevAov = prevBills > 0 ? prevRevenue / prevBills : 0;
		const prevPrevAov = prevPrevBills > 0 ? prevPrevRevenue / prevPrevBills : 0;

		const currBillsPerDay =
			currentWorkingDays > 0 ? currBills / currentWorkingDays : 0;
		const prevBillsPerDay =
			prevWorkingDays > 0 ? prevBills / prevWorkingDays : 0;
		const prevPrevBillsPerDay =
			prevPrevWorkingDays > 0 ? prevPrevBills / prevPrevWorkingDays : 0;

		// NEW-STORE detection must NOT use getStoreAgeInDays' own 999-day
		// "assume mature" fallback (that fallback exists for the diagnosis
		// feature below, storeAgeDays) — a missing opened_date has to stay
		// null here so calculateMetricGrowth can flag it as a new store.
		const newStoreAgeDays = row.opened_date
			? getStoreAgeInDays(row.opened_date, currentEnd)
			: null;

		const revGrowth = calculateMetricGrowth(
			currRevenue,
			prevRevenue,
			newStoreAgeDays,
		);
		const billGrowth = calculateMetricGrowth(
			currBills,
			prevBills,
			newStoreAgeDays,
		);
		const aovGrowth = calculateMetricGrowth(currAov, prevAov, newStoreAgeDays);

		const storeAgeDays = getStoreAgeInDays(row.opened_date, currentEnd);

		const diagnosis = diagnoseStoreAovBills({
			storeAgeDays,
			revenueGrowth: revGrowth,
			billsGrowth: billGrowth,
			aovGrowth: aovGrowth,
		});

		const billCutsTrend = calculate3MonthTrend(
			currBills,
			prevBills,
			prevPrevBills,
		);
		const aovTrend = calculate3MonthTrend(currAov, prevAov, prevPrevAov);

		const revenueDriver = calculateRevenueDriver(
			revGrowth === "NEW STORE" ? 0 : revGrowth,
			billGrowth === "NEW STORE" ? 0 : billGrowth,
			aovGrowth === "NEW STORE" ? 0 : aovGrowth,
		);

		return {
			billedBy: row.billed_by,
			name: row.name,
			periods: [
				{
					label: labels.current,
					bills: currBills,
					revenue: Math.round(currRevenue),
					aov: Math.round(currAov),
					workingDays: currentWorkingDays,
					billsPerDay: Math.round(currBillsPerDay * 10) / 10,
				},
				{
					label: labels.previous,
					bills: prevBills,
					revenue: Math.round(prevRevenue),
					aov: Math.round(prevAov),
					workingDays: prevWorkingDays,
					billsPerDay: Math.round(prevBillsPerDay * 10) / 10,
				},
				{
					label: labels.prevPrev,
					bills: prevPrevBills,
					revenue: Math.round(prevPrevRevenue),
					aov: Math.round(prevPrevAov),
					workingDays: prevPrevWorkingDays,
					billsPerDay: Math.round(prevPrevBillsPerDay * 10) / 10,
				},
			],
			diagnosis,
			momentum: {
				billCutsTrend,
				aovTrend: aovTrend === "declining" ? "weakening" : aovTrend,
			},
			revenueDriver,
		};
	});
}
