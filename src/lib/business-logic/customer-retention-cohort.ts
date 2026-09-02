import type { NeonQueryFunction } from "@neondatabase/serverless";

import type { DashboardFilters } from "@/lib/founder/types";
import type {
	RetentionCohortCell,
	RetentionCohortResult,
	RetentionCohortRow,
} from "@/types/customer-intelligence";

import type { ComparisonPeriods } from "./comparison";
import {
	CUSTOMER_IDENTITY_KEY_SQL,
	IS_IDENTIFIED_SQL,
} from "./customer-identity";
import { FOOD_CATEGORIES } from "./filter-sql";
import { roundTo, safeDiv, sharePct, toNum } from "./safe-math";

type FounderSql = NeonQueryFunction<false, false>;

function retailFilter(f: DashboardFilters) {
	return f.categoryScope === "retail" ? [...FOOD_CATEGORIES] : null;
}

/** ISO month "YYYY-MM" from a DATE column value. */
function toMonthKey(value: unknown): string {
	const s = String(value ?? "");
	return s.slice(0, 7);
}

interface CohortActivityRow {
	cohort_month: string;
	activity_month: string;
	month_offset: number;
	active_customers: number;
	revenue: number;
	bills: number;
}

/**
 * Monthly customer retention cohorts.
 *
 * Rows = acquisition month (first identified purchase). Columns = months since
 * acquisition. Only *identified* customers participate — anonymous customers
 * (per-bill keys) never influence retention. History is scanned up to the
 * selected period's end date (as-of cutoff); store/category/brand filters apply.
 *
 * One optimized query (CTEs + window-free grouping); no N+1.
 */
export async function getRetentionCohort(
	db: FounderSql,
	periods: ComparisonPeriods,
	filters: DashboardFilters,
): Promise<RetentionCohortResult> {
	const food = retailFilter(filters);

	const queryString = `
    WITH base AS (
      SELECT
        (${CUSTOMER_IDENTITY_KEY_SQL}) AS ck,
        date_trunc('month', sale_date)::date AS m,
        order_id,
        net_amount
      FROM sales_fact_v
      WHERE sale_date <= $1::date
        AND ($2::text IS NULL OR billed_by = $2)
        AND ($3::text IS NULL OR category = $3)
        AND ($4::text IS NULL OR brand = $4)
        AND ($5::text[] IS NULL OR category <> ALL($5::text[]))
        AND ${IS_IDENTIFIED_SQL}
    ),
    cohort AS (
      SELECT ck, MIN(m) AS cohort_month
      FROM base
      GROUP BY ck
    ),
    activity AS (
      SELECT
        c.cohort_month,
        b.m AS activity_month,
        COUNT(DISTINCT b.ck) AS active_customers,
        SUM(b.net_amount) AS revenue,
        COUNT(DISTINCT b.order_id) AS bills
      FROM base b
      JOIN cohort c ON c.ck = b.ck
      GROUP BY c.cohort_month, b.m
    )
    SELECT
      to_char(cohort_month, 'YYYY-MM') AS cohort_month,
      to_char(activity_month, 'YYYY-MM') AS activity_month,
      active_customers,
      revenue,
      bills,
      ((EXTRACT(YEAR FROM activity_month) - EXTRACT(YEAR FROM cohort_month)) * 12
        + (EXTRACT(MONTH FROM activity_month) - EXTRACT(MONTH FROM cohort_month)))::integer AS month_offset
    FROM activity
    ORDER BY cohort_month, month_offset`;

	const rows: CohortActivityRow[] = await (db as any).query(queryString, [
		periods.currentEnd,
		filters.store ?? null,
		filters.category ?? null,
		filters.brand ?? null,
		food ?? null,
	]);

	// Group activity rows by cohort month.
	const byCohort = new Map<string, CohortActivityRow[]>();
	for (const row of rows) {
		const key = toMonthKey(row.cohort_month);
		const list = byCohort.get(key) ?? [];
		list.push(row);
		byCohort.set(key, list);
	}

	const offsetSet = new Set<number>();
	const cohorts: RetentionCohortRow[] = [];

	for (const [cohortMonth, activity] of [...byCohort.entries()].sort(
		([a], [b]) => a.localeCompare(b),
	)) {
		const zero = activity.find((a) => toNum(a.month_offset) === 0);
		const cohortSize = toNum(zero?.active_customers);
		const cohortRevenue = toNum(zero?.revenue);

		const cells: RetentionCohortCell[] = activity
			.slice()
			.sort((a, b) => toNum(a.month_offset) - toNum(b.month_offset))
			.map((a) => {
				const offset = toNum(a.month_offset);
				offsetSet.add(offset);
				const revenue = toNum(a.revenue);
				const bills = toNum(a.bills);
				const active = toNum(a.active_customers);
				return {
					monthOffset: offset,
					month: toMonthKey(a.activity_month),
					activeCustomers: active,
					retentionPct: roundTo(safeDiv(active, cohortSize) * 100, 1),
					revenue,
					revenuePct:
						cohortRevenue > 0 ? sharePct(revenue, cohortRevenue) : null,
					bills,
					aov: Math.round(safeDiv(revenue, bills)),
				};
			});

		cohorts.push({ cohortMonth, cohortSize, cohortRevenue, cells });
	}

	// Each identity belongs to exactly one cohort (its first month), so total
	// identified customers is the sum of cohort sizes.
	const identifiedCustomers = cohorts.reduce((sum, c) => sum + c.cohortSize, 0);

	return {
		cohorts,
		monthOffsets: [...offsetSet].sort((a, b) => a - b),
		identifiedCustomers,
	};
}
