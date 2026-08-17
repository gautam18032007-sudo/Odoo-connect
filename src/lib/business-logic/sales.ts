import type { NeonQueryFunction } from "@neondatabase/serverless";
import type { DashboardFilters } from "@/lib/founder/types";
import {
	type ComparisonPeriods,
	calculateGrowth,
	growthPct,
} from "./comparison";
import { FOOD_CATEGORIES } from "./filter-sql";
import { METRICS } from "./metrics";

type FounderSql = NeonQueryFunction<false, false>;

function numberValue(value: unknown) {
	const parsed = Number(value ?? 0);
	return Number.isFinite(parsed) ? parsed : 0;
}

function retailFilter(filters: DashboardFilters) {
	return filters.categoryScope === "retail" ? [...FOOD_CATEGORIES] : null;
}

export async function getDailyHealthMetrics(
	db: FounderSql,
	periods: ComparisonPeriods,
	filters: DashboardFilters,
) {
	const foodCategories = retailFilter(filters);

	const [current, previous, repeatCustomers] = await Promise.all([
		(db as any).query(
			`SELECT
        COALESCE(${METRICS.revenue}, 0) AS revenue,
        ${METRICS.bills} AS bill_cuts,
        COALESCE(SUM(quantity), 0) AS units,
        COALESCE(${METRICS.discount}, 0) AS discount,
        COALESCE(${METRICS.collection}, 0) AS collection,
        COALESCE(${METRICS.gst}, 0) AS gst,
        COALESCE(${METRICS.mrp}, 0) AS mrp,
        COUNT(DISTINCT customer_mobile) FILTER (WHERE customer_mobile IS NOT NULL AND customer_mobile <> '') AS customers
      FROM sales_fact_v
      WHERE sale_date >= $1::date
        AND sale_date <= $2::date
        AND ($3::text IS NULL OR billed_by = $3)
        AND ($4::text IS NULL OR category = $4)
        AND ($5::text IS NULL OR brand = $5)
        AND ($6::text IS NULL OR (sku_code ILIKE '%' || $6 || '%' OR item_name ILIKE '%' || $6 || '%'))
        AND ($7::text[] IS NULL OR category <> ALL($7::text[]))`,
			[
				periods.currentStart,
				periods.currentEnd,
				filters.store ?? null,
				filters.category ?? null,
				filters.brand ?? null,
				filters.sku ?? null,
				foodCategories ?? null,
			],
		),
		(db as any).query(
			`SELECT
        COALESCE(${METRICS.revenue}, 0) AS revenue,
        ${METRICS.bills} AS bill_cuts,
        COALESCE(SUM(quantity), 0) AS units,
        COALESCE(${METRICS.discount}, 0) AS discount,
        COALESCE(${METRICS.collection}, 0) AS collection,
        COALESCE(${METRICS.gst}, 0) AS gst,
        COALESCE(${METRICS.mrp}, 0) AS mrp,
        COUNT(DISTINCT customer_mobile) FILTER (WHERE customer_mobile IS NOT NULL AND customer_mobile <> '') AS customers
      FROM sales_fact_v
      WHERE sale_date >= $1::date
        AND sale_date <= $2::date
        AND ($3::text IS NULL OR billed_by = $3)
        AND ($4::text IS NULL OR category = $4)
        AND ($5::text IS NULL OR brand = $5)
        AND ($6::text IS NULL OR (sku_code ILIKE '%' || $6 || '%' OR item_name ILIKE '%' || $6 || '%'))
        AND ($7::text[] IS NULL OR category <> ALL($7::text[]))`,
			[
				periods.previousStart,
				periods.previousEnd,
				filters.store ?? null,
				filters.category ?? null,
				filters.brand ?? null,
				filters.sku ?? null,
				foodCategories ?? null,
			],
		),
		(db as any).query(
			`SELECT COUNT(*)::integer AS repeat_customers
      FROM (
        SELECT customer_mobile
        FROM sales_fact_v
        WHERE sale_date >= $1::date
          AND sale_date <= $2::date
          AND customer_mobile IS NOT NULL
          AND customer_mobile <> ''
          AND ($3::text IS NULL OR billed_by = $3)
          AND ($4::text IS NULL OR category = $4)
          AND ($5::text IS NULL OR brand = $5)
          AND ($6::text IS NULL OR (sku_code ILIKE '%' || $6 || '%' OR item_name ILIKE '%' || $6 || '%'))
          AND ($7::text[] IS NULL OR category <> ALL($7::text[]))
        GROUP BY customer_mobile
        HAVING COUNT(DISTINCT bill_no) > 1
      ) repeat_mobiles`,
			[
				periods.currentStart,
				periods.currentEnd,
				filters.store ?? null,
				filters.category ?? null,
				filters.brand ?? null,
				filters.sku ?? null,
				foodCategories ?? null,
			],
		),
	]);

	const currentRow = current[0] ?? {};
	const previousRow = previous[0] ?? {};

	const currentRevenue = numberValue(currentRow.revenue);
	const previousRevenue = numberValue(previousRow.revenue);
	const currentBillCuts = numberValue(currentRow.bill_cuts);
	const previousBillCuts = numberValue(previousRow.bill_cuts);
	const currentUnits = numberValue(currentRow.units);
	const previousUnits = numberValue(previousRow.units);
	const currentDiscount = numberValue(currentRow.discount);
	const previousDiscount = numberValue(previousRow.discount);
	const currentCollection = numberValue(currentRow.collection);
	const previousCollection = numberValue(previousRow.collection);
	const currentGst = numberValue(currentRow.gst);
	const previousGst = numberValue(previousRow.gst);
	const currentMrp = numberValue(currentRow.mrp);
	const previousMrp = numberValue(previousRow.mrp);
	const currentCustomers = numberValue(currentRow.customers);
	const previousCustomers = numberValue(previousRow.customers);
	const currentAov = currentBillCuts > 0 ? currentRevenue / currentBillCuts : 0;
	const previousAov =
		previousBillCuts > 0 ? previousRevenue / previousBillCuts : 0;
	const repeatCustomersCount = numberValue(
		repeatCustomers[0]?.repeat_customers,
	);

	const metrics = [
		{
			metric: "Sales",
			current: currentCollection,
			previous: previousCollection,
			growth: growthPct(currentCollection, previousCollection),
		},
		{
			metric: "Net Revenue",
			current: currentRevenue,
			previous: previousRevenue,
			growth: growthPct(currentRevenue, previousRevenue),
		},
		{
			metric: "Orders",
			current: currentBillCuts,
			previous: previousBillCuts,
			growth: growthPct(currentBillCuts, previousBillCuts),
		},
		{
			metric: "AOV",
			current: currentAov,
			previous: previousAov,
			growth: growthPct(currentAov, previousAov),
		},
		{
			metric: "Units",
			current: currentUnits,
			previous: previousUnits,
			growth: growthPct(currentUnits, previousUnits),
		},
		{
			metric: "Customers",
			current: currentCustomers,
			previous: previousCustomers,
			growth: growthPct(currentCustomers, previousCustomers),
		},
		{
			metric: "Repeat Customers",
			current: repeatCustomersCount,
			previous: null,
			growth: null,
			footnote: "Based on customers who provided a phone number.",
		},
	];

	return {
		metrics,
		salesKpis: {
			revenue: {
				current: currentRevenue,
				previous: previousRevenue,
				growth: calculateGrowth(currentRevenue, previousRevenue),
			},
			billCuts: {
				current: currentBillCuts,
				previous: previousBillCuts,
				growth: calculateGrowth(currentBillCuts, previousBillCuts),
			},
			unitsSold: {
				current: currentUnits,
				previous: previousUnits,
				growth: calculateGrowth(currentUnits, previousUnits),
			},
			discount: {
				current: currentDiscount,
				previous: previousDiscount,
				growth: calculateGrowth(currentDiscount, previousDiscount),
			},
			collection: {
				current: currentCollection,
				previous: previousCollection,
				growth: calculateGrowth(currentCollection, previousCollection),
			},
			gst: {
				current: currentGst,
				previous: previousGst,
				growth: calculateGrowth(currentGst, previousGst),
			},
			mrp: {
				current: currentMrp,
				previous: previousMrp,
				growth: calculateGrowth(currentMrp, previousMrp),
			},
		},
		aovKpi: {
			current: currentAov,
			previous: previousAov,
			growth: calculateGrowth(currentAov, previousAov),
		},
	};
}

export async function getBrandPerformance(
	db: FounderSql,
	periods: ComparisonPeriods,
	filters: DashboardFilters,
) {
	const foodCategories = retailFilter(filters);

	const result = await (db as any).query(
		`WITH curr AS (
      SELECT brand, SUM(quantity) AS units, ${METRICS.revenue} AS revenue
      FROM sales_fact_v
      WHERE sale_date >= $1::date
        AND sale_date <= $2::date
        AND ($3::text IS NULL OR billed_by = $3)
        AND ($4::text IS NULL OR category = $4)
        AND brand IS NOT NULL
        AND ($5::text[] IS NULL OR category <> ALL($5::text[]))
      GROUP BY brand
    ),
    prev AS (
      SELECT brand, SUM(quantity) AS units, ${METRICS.revenue} AS revenue
      FROM sales_fact_v
      WHERE sale_date >= $6::date
        AND sale_date <= $7::date
        AND ($3::text IS NULL OR billed_by = $3)
        AND ($4::text IS NULL OR category = $4)
        AND brand IS NOT NULL
        AND ($5::text[] IS NULL OR category <> ALL($5::text[]))
      GROUP BY brand
    )
    SELECT
      COALESCE(c.brand, p.brand) AS brand,
      COALESCE(c.units, 0) AS current_units,
      COALESCE(c.revenue, 0) AS current_revenue,
      COALESCE(p.units, 0) AS prev_units,
      COALESCE(p.revenue, 0) AS prev_revenue
    FROM curr c
    FULL OUTER JOIN prev p USING (brand)
    ORDER BY ABS(COALESCE(c.units, 0) - COALESCE(p.units, 0)) DESC NULLS LAST`,
		[
			periods.currentStart,
			periods.currentEnd,
			filters.store ?? null,
			filters.category ?? null,
			foodCategories ?? null,
			periods.previousStart,
			periods.previousEnd,
		],
	);

	return result.map((row: any) => {
		const currentUnits = numberValue(row.current_units);
		const prevUnits = numberValue(row.prev_units);
		return {
			brand: String(row.brand || "Unknown"),
			currentUnits,
			currentRevenue: numberValue(row.current_revenue),
			prevUnits,
			prevRevenue: numberValue(row.prev_revenue),
			unitsGrowthPct: growthPct(currentUnits, prevUnits),
		};
	});
}

export async function getSkuPerformance(
	db: FounderSql,
	periods: ComparisonPeriods,
	filters: DashboardFilters,
	limit = 20,
) {
	const foodCategories = retailFilter(filters);

	const result = await (db as any).query(
		`WITH curr AS (
      SELECT 
        product_key, 
        MAX(item_name) AS item_name, 
        MAX(brand) AS brand, 
        MAX(category) AS category, 
        SUM(quantity) AS units, 
        ${METRICS.revenue} AS revenue
      FROM sales_fact_v
      WHERE sale_date >= $1::date
        AND sale_date <= $2::date
        AND ($3::text IS NULL OR billed_by = $3)
        AND ($4::text IS NULL OR category = $4)
        AND ($5::text IS NULL OR brand = $5)
        AND ($6::text[] IS NULL OR category <> ALL($6::text[]))
      GROUP BY product_key
    ),
    prev AS (
      SELECT 
        product_key, 
        MAX(item_name) AS item_name, 
        MAX(brand) AS brand, 
        MAX(category) AS category, 
        SUM(quantity) AS units, 
        ${METRICS.revenue} AS revenue
      FROM sales_fact_v
      WHERE sale_date >= $7::date
        AND sale_date <= $8::date
        AND ($3::text IS NULL OR billed_by = $3)
        AND ($4::text IS NULL OR category = $4)
        AND ($5::text IS NULL OR brand = $5)
        AND ($6::text[] IS NULL OR category <> ALL($6::text[]))
      GROUP BY product_key
    )
    SELECT
      COALESCE(c.product_key, p.product_key) AS product_key,
      COALESCE(c.item_name, p.item_name, 'Unknown product') AS item_name,
      COALESCE(c.brand, p.brand) AS brand,
      COALESCE(c.category, p.category) AS category,
      COALESCE(c.units, 0) AS current_units,
      COALESCE(c.revenue, 0) AS current_revenue,
      COALESCE(p.units, 0) AS prev_units,
      ABS(COALESCE(c.units, 0) - COALESCE(p.units, 0)) AS abs_unit_change
    FROM curr c
    FULL OUTER JOIN prev p USING (product_key)
    ORDER BY abs_unit_change DESC NULLS LAST
    LIMIT $9::int`,
		[
			periods.currentStart,
			periods.currentEnd,
			filters.store ?? null,
			filters.category ?? null,
			filters.brand ?? null,
			foodCategories ?? null,
			periods.previousStart,
			periods.previousEnd,
			limit,
		],
	);

	return result.map((row: any) => {
		const currentUnits = numberValue(row.current_units);
		const prevUnits = numberValue(row.prev_units);
		return {
			skuCode: row.product_key ? String(row.product_key) : null,
			itemName: String(row.item_name),
			brand: row.brand ? String(row.brand) : null,
			category: row.category ? String(row.category) : null,
			currentUnits,
			currentRevenue: numberValue(row.current_revenue),
			prevUnits,
			unitsGrowthPct: growthPct(currentUnits, prevUnits),
		};
	});
}

/** @deprecated Use getDailyHealthMetrics */
export const getSalesKpis = getDailyHealthMetrics;
/** @deprecated Use getSkuPerformance */
export const getProductPerformance = getSkuPerformance;
