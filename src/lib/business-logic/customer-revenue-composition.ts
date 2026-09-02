import type { NeonQueryFunction } from "@neondatabase/serverless";

import type { DashboardFilters } from "@/lib/founder/types";
import type {
	RevenueCompositionCard,
	RevenueCompositionResult,
} from "@/types/customer-intelligence";

import { type ComparisonPeriods, growthPct } from "./comparison";
import {
	CUSTOMER_IDENTITY_KEY_SQL,
	IS_IDENTIFIED_SQL,
} from "./customer-identity";
import { FOOD_CATEGORIES } from "./filter-sql";
import { check, report } from "./reconciliation";
import { safeDiv, sharePct, toNum } from "./safe-math";

type FounderSql = NeonQueryFunction<false, false>;

function retailFilter(f: DashboardFilters) {
	return f.categoryScope === "retail" ? [...FOOD_CATEGORIES] : null;
}

interface SegmentTotals {
	revenue: number;
	bills: number;
	customers: number;
}

interface CompositionRow {
	revenue: number;
	bills: number;
	customers: number;
	new_revenue: number;
	new_bills: number;
	new_customers: number;
	repeat_revenue: number;
	repeat_bills: number;
	repeat_customers: number;
	identified_revenue: number;
	identified_bills: number;
	identified_customers: number;
	anon_revenue: number;
	anon_bills: number;
	anon_customers: number;
}

/**
 * Aggregate revenue composition for one [start, end] window.
 *
 * New vs Repeat is decided by each customer's first-ever purchase (within the
 * filtered scope, across all history): New = first purchase falls inside the
 * window; Repeat = first purchase predates the window. Identified vs Anonymous
 * splits by whether a mobile/name is present. Both splits reconcile to the total.
 */
async function fetchWindow(
	db: FounderSql,
	startDate: string,
	endDate: string,
	filters: DashboardFilters,
): Promise<CompositionRow> {
	const food = retailFilter(filters);

	const queryString = `
    WITH scoped AS (
      SELECT
        (${CUSTOMER_IDENTITY_KEY_SQL}) AS ck,
        (${IS_IDENTIFIED_SQL}) AS is_identified,
        sale_date,
        order_id,
        net_amount
      FROM sales_fact_v
      WHERE ($3::text IS NULL OR billed_by = $3)
        AND ($4::text IS NULL OR category = $4)
        AND ($5::text IS NULL OR brand = $5)
        AND ($6::text[] IS NULL OR category <> ALL($6::text[]))
    ),
    first_purchase AS (
      SELECT ck, MIN(sale_date) AS first_date
      FROM scoped
      GROUP BY ck
    ),
    period AS (
      SELECT s.ck, s.is_identified, s.order_id, s.net_amount, fp.first_date
      FROM scoped s
      JOIN first_purchase fp ON fp.ck = s.ck
      WHERE s.sale_date BETWEEN $1::date AND $2::date
    )
    SELECT
      COALESCE(SUM(net_amount), 0) AS revenue,
      COUNT(DISTINCT order_id) AS bills,
      COUNT(DISTINCT ck) AS customers,

      COALESCE(SUM(net_amount) FILTER (WHERE first_date BETWEEN $1::date AND $2::date), 0) AS new_revenue,
      COUNT(DISTINCT order_id) FILTER (WHERE first_date BETWEEN $1::date AND $2::date) AS new_bills,
      COUNT(DISTINCT ck) FILTER (WHERE first_date BETWEEN $1::date AND $2::date) AS new_customers,

      COALESCE(SUM(net_amount) FILTER (WHERE first_date < $1::date), 0) AS repeat_revenue,
      COUNT(DISTINCT order_id) FILTER (WHERE first_date < $1::date) AS repeat_bills,
      COUNT(DISTINCT ck) FILTER (WHERE first_date < $1::date) AS repeat_customers,

      COALESCE(SUM(net_amount) FILTER (WHERE is_identified), 0) AS identified_revenue,
      COUNT(DISTINCT order_id) FILTER (WHERE is_identified) AS identified_bills,
      COUNT(DISTINCT ck) FILTER (WHERE is_identified) AS identified_customers,

      COALESCE(SUM(net_amount) FILTER (WHERE NOT is_identified), 0) AS anon_revenue,
      COUNT(DISTINCT order_id) FILTER (WHERE NOT is_identified) AS anon_bills,
      COUNT(DISTINCT ck) FILTER (WHERE NOT is_identified) AS anon_customers
    FROM period`;

	const [row] = await (db as any).query(queryString, [
		startDate,
		endDate,
		filters.store ?? null,
		filters.category ?? null,
		filters.brand ?? null,
		food ?? null,
	]);

	return (row ?? {}) as CompositionRow;
}

function segment(
	row: CompositionRow,
	prefix: "" | "new_" | "repeat_" | "identified_" | "anon_",
): SegmentTotals {
	if (prefix === "") {
		return {
			revenue: toNum(row.revenue),
			bills: toNum(row.bills),
			customers: toNum(row.customers),
		};
	}
	return {
		revenue: toNum((row as any)[`${prefix}revenue`]),
		bills: toNum((row as any)[`${prefix}bills`]),
		customers: toNum((row as any)[`${prefix}customers`]),
	};
}

/**
 * Revenue Composition — where revenue came from in the current period, compared
 * against the previous (mirror) period. Returns founder-facing segment cards.
 */
export async function getRevenueComposition(
	db: FounderSql,
	periods: ComparisonPeriods,
	filters: DashboardFilters,
): Promise<RevenueCompositionResult> {
	const [current, previous] = await Promise.all([
		fetchWindow(db, periods.currentStart, periods.currentEnd, filters),
		fetchWindow(db, periods.previousStart, periods.previousEnd, filters),
	]);

	const total = segment(current, "");
	const newSeg = segment(current, "new_");
	const repeatSeg = segment(current, "repeat_");
	const identifiedSeg = segment(current, "identified_");
	const anonSeg = segment(current, "anon_");

	// Non-negotiable: partitions of the same period rows must reconcile to Total.
	const reconciliation = report([
		check(
			"Repeat + New Revenue = Total Revenue",
			total.revenue,
			repeatSeg.revenue + newSeg.revenue,
		),
		check(
			"Identified + Anonymous Revenue = Total Revenue",
			total.revenue,
			identifiedSeg.revenue + anonSeg.revenue,
		),
		check(
			"Identified + Anonymous Bills = Total Bills",
			total.bills,
			identifiedSeg.bills + anonSeg.bills,
			0,
		),
	]);

	const spec: Array<{
		key: RevenueCompositionCard["key"];
		label: string;
		prefix: "" | "new_" | "repeat_" | "identified_" | "anon_";
	}> = [
		{ key: "total", label: "Total Revenue", prefix: "" },
		{ key: "repeat", label: "Repeat Customer Revenue", prefix: "repeat_" },
		{ key: "new", label: "New Customer Revenue", prefix: "new_" },
		{ key: "identified", label: "Identified Revenue", prefix: "identified_" },
		{ key: "anonymous", label: "Anonymous Revenue", prefix: "anon_" },
	];

	const cards: RevenueCompositionCard[] = spec.map(({ key, label, prefix }) => {
		const cur = segment(current, prefix);
		const prev = segment(previous, prefix);
		return {
			key,
			label,
			revenue: cur.revenue,
			revenuePct: key === "total" ? 100 : sharePct(cur.revenue, total.revenue),
			customers: cur.customers,
			customerPct:
				key === "total" ? 100 : sharePct(cur.customers, total.customers),
			bills: cur.bills,
			billsPct: key === "total" ? 100 : sharePct(cur.bills, total.bills),
			aov: Math.round(safeDiv(cur.revenue, cur.bills)),
			revenueGrowthPct: growthPct(cur.revenue, prev.revenue),
		};
	});

	return {
		cards,
		totals: {
			revenue: total.revenue,
			customers: total.customers,
			bills: total.bills,
			aov: Math.round(safeDiv(total.revenue, total.bills)),
		},
		reconciliation,
	};
}
