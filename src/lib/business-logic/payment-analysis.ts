import type { NeonQueryFunction } from "@neondatabase/serverless";
import type { DashboardFilters } from "@/lib/founder/types";
import type { ComparisonPeriods } from "./comparison";
import { FOOD_CATEGORIES } from "./filter-sql";
import { METRICS } from "./metrics";

type FounderSql = NeonQueryFunction<false, false>;
function n(v: unknown) {
	return Number.isFinite(Number(v ?? 0)) ? Number(v ?? 0) : 0;
}
function retailFilter(f: DashboardFilters) {
	return f.categoryScope === "retail" ? [...FOOD_CATEGORIES] : null;
}

export async function getPaymentAnalysis(
	db: FounderSql,
	periods: ComparisonPeriods,
	filters: DashboardFilters,
) {
	const food = retailFilter(filters);

	const overallQueryString = `
    SELECT COALESCE(payment_method,'Unknown') AS payment_method, ${METRICS.revenue} AS revenue, ${METRICS.bills} AS bill_cuts
    FROM sales_fact_v WHERE sale_date BETWEEN $1::date AND $2::date
      AND ($3::text IS NULL OR billed_by = $3)
      AND ($4::text IS NULL OR category = $4)
      AND ($5::text IS NULL OR brand = $5)
      AND ($6::text[] IS NULL OR category <> ALL($6::text[]))
      AND ($7::text IS NULL OR (sku_code ILIKE '%' || $7 || '%' OR item_name ILIKE '%' || $7 || '%'))
    GROUP BY payment_method ORDER BY revenue DESC`;

	const byStoreQueryString = `
    SELECT store_display_name, COALESCE(payment_method,'Unknown') AS payment_method, ${METRICS.revenue} AS revenue, ${METRICS.bills} AS bill_cuts
    FROM sales_fact_v WHERE sale_date BETWEEN $1::date AND $2::date
      AND ($3::text[] IS NULL OR category <> ALL($3::text[]))
    GROUP BY store_display_name, payment_method ORDER BY store_display_name, revenue DESC`;

	const [overall, byStore] = await Promise.all([
		(db as any).query(overallQueryString, [
			periods.currentStart,
			periods.currentEnd,
			filters.store ?? null,
			filters.category ?? null,
			filters.brand ?? null,
			food ?? null,
			filters.sku ?? null,
		]),
		(db as any).query(byStoreQueryString, [
			periods.currentStart,
			periods.currentEnd,
			food ?? null,
		]),
	]);

	const totalRevenue = overall.reduce(
		(s: number, row: any) => s + n(row.revenue),
		0,
	);

	return {
		methods: overall.map((row: any) => ({
			paymentMethod: String(row.payment_method),
			revenue: n(row.revenue),
			billCuts: n(row.bill_cuts),
			revenueSharePct:
				totalRevenue > 0
					? Math.round((n(row.revenue) / totalRevenue) * 1000) / 10
					: 0,
		})),
		byStore: byStore.map((row: any) => ({
			storeDisplayName: String(row.store_display_name),
			paymentMethod: String(row.payment_method),
			revenue: n(row.revenue),
			billCuts: n(row.bill_cuts),
		})),
	};
}
