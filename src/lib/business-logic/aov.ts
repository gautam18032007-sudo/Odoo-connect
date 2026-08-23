import type { NeonQueryFunction } from "@neondatabase/serverless";
import type { DashboardFilters } from "@/lib/founder/types";
import { type ComparisonPeriods, growthPct } from "./comparison";
import { FOOD_CATEGORIES } from "./filter-sql";
import { METRICS } from "./metrics";

type FounderSql = NeonQueryFunction<false, false>;
function n(v: unknown) {
	return Number.isFinite(Number(v ?? 0)) ? Number(v ?? 0) : 0;
}
function retailFilter(f: DashboardFilters) {
	return f.categoryScope === "retail" ? [...FOOD_CATEGORIES] : null;
}

export async function getCategoryBillCuts(
	db: FounderSql,
	periods: ComparisonPeriods,
	filters: DashboardFilters,
) {
	const food = retailFilter(filters);
	const queryString = `
    WITH curr AS (SELECT category, ${METRICS.bills} AS bill_cuts, SUM(quantity) AS units FROM sales_fact_v
      WHERE sale_date BETWEEN $1::date AND $2::date
        AND ($3::text IS NULL OR billed_by = $3) AND category IS NOT NULL
        AND ($4::text[] IS NULL OR category <> ALL($4::text[]))
        AND ($7::text IS NULL OR category = $7)
        AND ($8::text IS NULL OR brand = $8)
        AND ($9::text IS NULL OR (sku_code ILIKE '%' || $9 || '%' OR item_name ILIKE '%' || $9 || '%'))
        GROUP BY category),
    prev AS (SELECT category, ${METRICS.bills} AS bill_cuts, SUM(quantity) AS units FROM sales_fact_v
      WHERE sale_date BETWEEN $5::date AND $6::date
        AND ($3::text IS NULL OR billed_by = $3) AND category IS NOT NULL
        AND ($4::text[] IS NULL OR category <> ALL($4::text[]))
        AND ($7::text IS NULL OR category = $7)
        AND ($8::text IS NULL OR brand = $8)
        AND ($9::text IS NULL OR (sku_code ILIKE '%' || $9 || '%' OR item_name ILIKE '%' || $9 || '%'))
        GROUP BY category),
    all_categories AS (SELECT DISTINCT category FROM sales_fact_v WHERE category IS NOT NULL
        AND ($4::text[] IS NULL OR category <> ALL($4::text[]))
        AND ($7::text IS NULL OR category = $7))
    SELECT ac.category, COALESCE(c.bill_cuts,0) AS current_bill_cuts, COALESCE(c.units,0) AS current_units,
      COALESCE(p.bill_cuts,0) AS prev_bill_cuts, COALESCE(p.units,0) AS prev_units
    FROM all_categories ac LEFT JOIN curr c USING (category) LEFT JOIN prev p USING (category)
    ORDER BY current_bill_cuts DESC`;
	const result = await (db as any).query(queryString, [
		periods.currentStart,
		periods.currentEnd,
		filters.store ?? null,
		food ?? null,
		periods.previousStart,
		periods.previousEnd,
		filters.category ?? null,
		filters.brand ?? null,
		filters.sku ?? null,
	]);
	return result.map((row: any) => ({
		category: String(row.category),
		currentBillCuts: n(row.current_bill_cuts),
		currentUnits: n(row.current_units),
		prevBillCuts: n(row.prev_bill_cuts),
		prevUnits: n(row.prev_units),
		billCutsGrowthPct: growthPct(
			n(row.current_bill_cuts),
			n(row.prev_bill_cuts),
		),
		unitsGrowthPct: growthPct(n(row.current_units), n(row.prev_units)),
	}));
}

export async function getCategoryAov(
	db: FounderSql,
	periods: ComparisonPeriods,
	filters: DashboardFilters,
) {
	const food = retailFilter(filters);
	const queryString = `
    WITH curr AS (SELECT category, ${METRICS.revenue} AS revenue, ${METRICS.bills} AS bill_cuts,
      ROUND(${METRICS.revenue}::numeric/NULLIF(${METRICS.bills},0),2) AS aov FROM sales_fact_v
      WHERE sale_date BETWEEN $1::date AND $2::date
        AND ($3::text IS NULL OR billed_by = $3) AND category IS NOT NULL
        AND ($4::text[] IS NULL OR category <> ALL($4::text[]))
        AND ($7::text IS NULL OR category = $7)
        AND ($8::text IS NULL OR brand = $8)
        AND ($9::text IS NULL OR (sku_code ILIKE '%' || $9 || '%' OR item_name ILIKE '%' || $9 || '%'))
        GROUP BY category),
    prev AS (SELECT category, ROUND(${METRICS.revenue}::numeric/NULLIF(${METRICS.bills},0),2) AS aov FROM sales_fact_v
      WHERE sale_date BETWEEN $5::date AND $6::date
        AND ($3::text IS NULL OR billed_by = $3) AND category IS NOT NULL
        AND ($4::text[] IS NULL OR category <> ALL($4::text[]))
        AND ($7::text IS NULL OR category = $7)
        AND ($8::text IS NULL OR brand = $8)
        AND ($9::text IS NULL OR (sku_code ILIKE '%' || $9 || '%' OR item_name ILIKE '%' || $9 || '%'))
        GROUP BY category)
    SELECT COALESCE(c.category,p.category) AS category, COALESCE(c.aov,0) AS current_aov,
      COALESCE(c.revenue,0) AS current_revenue, COALESCE(c.bill_cuts,0) AS current_bill_cuts, COALESCE(p.aov,0) AS prev_aov
    FROM curr c FULL OUTER JOIN prev p USING (category) ORDER BY current_aov DESC`;
	const result = await (db as any).query(queryString, [
		periods.currentStart,
		periods.currentEnd,
		filters.store ?? null,
		food ?? null,
		periods.previousStart,
		periods.previousEnd,
		filters.category ?? null,
		filters.brand ?? null,
		filters.sku ?? null,
	]);
	return result.map((row: any) => ({
		category: String(row.category || "Unknown"),
		currentAov: n(row.current_aov),
		currentRevenue: n(row.current_revenue),
		currentBillCuts: n(row.current_bill_cuts),
		prevAov: n(row.prev_aov),
		aovGrowthPct: growthPct(n(row.current_aov), n(row.prev_aov)),
	}));
}

export const getAovKpi = getCategoryAov;
