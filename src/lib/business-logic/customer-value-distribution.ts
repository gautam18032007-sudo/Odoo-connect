import type { NeonQueryFunction } from "@neondatabase/serverless";

import type { DashboardFilters } from "@/lib/founder/types";
import type {
	ValueDistributionResult,
	ValueDistributionRow,
} from "@/types/customer-intelligence";

import type { ComparisonPeriods } from "./comparison";
import { CUSTOMER_IDENTITY_KEY_SQL } from "./customer-identity";
import { FOOD_CATEGORIES } from "./filter-sql";
import { check, report } from "./reconciliation";
import { roundTo, safeDiv, sharePct, toNum } from "./safe-math";

type FounderSql = NeonQueryFunction<false, false>;

/** Top visit bucket: customers with this many visits or more are grouped as "N+". */
const TOP_BUCKET = 5;

function retailFilter(f: DashboardFilters) {
	return f.categoryScope === "retail" ? [...FOOD_CATEGORIES] : null;
}

interface BucketRow {
	bucket_min: number;
	customers: number;
	revenue: number;
	bills: number;
}

/**
 * Customer Value Distribution — lifetime visit-frequency ladder.
 *
 * Every customer (identified or anonymous; anonymous keyed per bill) is bucketed
 * by lifetime distinct-bill count (1, 2, 3, 4, 5+) up to the selected end date.
 * Includes all customers so bucket revenue reconciles to total net revenue.
 */
export async function getValueDistribution(
	db: FounderSql,
	periods: ComparisonPeriods,
	filters: DashboardFilters,
	useMv = false,
): Promise<ValueDistributionResult> {
	const food = retailFilter(filters);

	// Fast path: read the materialized lifetime layer. Only reached when the gate
	// (shouldUseCustomerMv) has confirmed no category/brand/sku filter and an
	// as-of-latest window — the exact range where MV↔live parity is proven.
	const mvQueryString = `
    WITH per_customer AS (
      SELECT identity_key AS ck, SUM(visit_count) AS visits, SUM(lifetime_revenue) AS revenue
      FROM mv_customer_identity
      WHERE ($1::text IS NULL OR billed_by = $1)
      GROUP BY identity_key
    )
    SELECT
      LEAST(visits, ${TOP_BUCKET})::integer AS bucket_min,
      COUNT(*)::integer AS customers,
      COALESCE(SUM(revenue), 0) AS revenue,
      COALESCE(SUM(visits), 0)::integer AS bills
    FROM per_customer
    GROUP BY LEAST(visits, ${TOP_BUCKET})
    ORDER BY bucket_min`;
	const mvTotalsQueryString = `
    SELECT COALESCE(SUM(lifetime_revenue), 0) AS revenue,
      COALESCE(SUM(visit_count), 0)::integer AS bills,
      COUNT(DISTINCT identity_key)::integer AS customers
    FROM mv_customer_identity
    WHERE ($1::text IS NULL OR billed_by = $1)`;

	const queryString = `
    WITH base AS (
      SELECT
        (${CUSTOMER_IDENTITY_KEY_SQL}) AS ck,
        order_id,
        net_amount
      FROM sales_fact_v
      WHERE sale_date <= $1::date
        AND ($2::text IS NULL OR billed_by = $2)
        AND ($3::text IS NULL OR category = $3)
        AND ($4::text IS NULL OR brand = $4)
        AND ($5::text[] IS NULL OR category <> ALL($5::text[]))
    ),
    per_customer AS (
      SELECT
        ck,
        COUNT(DISTINCT order_id) AS visits,
        SUM(net_amount) AS revenue
      FROM base
      GROUP BY ck
    )
    SELECT
      LEAST(visits, ${TOP_BUCKET})::integer AS bucket_min,
      COUNT(*)::integer AS customers,
      COALESCE(SUM(revenue), 0) AS revenue,
      COALESCE(SUM(visits), 0)::integer AS bills
    FROM per_customer
    GROUP BY LEAST(visits, ${TOP_BUCKET})
    ORDER BY bucket_min`;

	// Independent totals over the same filtered base — used to reconcile against
	// the bucketed sums so a bucketing bug can never silently drop revenue.
	const totalsQueryString = `
    WITH base AS (
      SELECT (${CUSTOMER_IDENTITY_KEY_SQL}) AS ck, order_id, net_amount
      FROM sales_fact_v
      WHERE sale_date <= $1::date
        AND ($2::text IS NULL OR billed_by = $2)
        AND ($3::text IS NULL OR category = $3)
        AND ($4::text IS NULL OR brand = $4)
        AND ($5::text[] IS NULL OR category <> ALL($5::text[]))
    )
    SELECT
      COALESCE(SUM(net_amount), 0) AS revenue,
      COUNT(DISTINCT order_id)::integer AS bills,
      COUNT(DISTINCT ck)::integer AS customers
    FROM base`;

	const liveParams = [
		periods.currentEnd,
		filters.store ?? null,
		filters.category ?? null,
		filters.brand ?? null,
		food ?? null,
	];

	const [rawRows, totalsRows]: [
		BucketRow[],
		Array<{ revenue: unknown; bills: unknown; customers: unknown }>,
	] = await Promise.all([
		(db as any).query(
			useMv ? mvQueryString : queryString,
			useMv ? [filters.store ?? null] : liveParams,
		),
		(db as any).query(
			useMv ? mvTotalsQueryString : totalsQueryString,
			useMv ? [filters.store ?? null] : liveParams,
		),
	]);

	const totalCustomers = rawRows.reduce((s, r) => s + toNum(r.customers), 0);
	const totalRevenue = rawRows.reduce((s, r) => s + toNum(r.revenue), 0);
	const totalBills = rawRows.reduce((s, r) => s + toNum(r.bills), 0);

	const independent = totalsRows[0] ?? { revenue: 0, bills: 0, customers: 0 };
	const reconciliation = report([
		check(
			"Visit-bucket Revenue Sum = Total Revenue",
			toNum(independent.revenue),
			totalRevenue,
		),
		check(
			"Visit-bucket Customer Sum = Total Customers",
			toNum(independent.customers),
			totalCustomers,
			0,
		),
	]);

	const rows: ValueDistributionRow[] = rawRows.map((r) => {
		const minVisits = toNum(r.bucket_min);
		const isOpenEnded = minVisits >= TOP_BUCKET;
		const customers = toNum(r.customers);
		const revenue = toNum(r.revenue);
		const bills = toNum(r.bills);
		const ltv = Math.round(safeDiv(revenue, customers));
		return {
			bucket: isOpenEnded ? `${TOP_BUCKET}+` : String(minVisits),
			minVisits,
			isOpenEnded,
			customers,
			revenue,
			bills,
			aov: Math.round(safeDiv(revenue, bills)),
			ltv,
			revenueSharePct: sharePct(revenue, totalRevenue),
			customerSharePct: sharePct(customers, totalCustomers),
			averageSpend: ltv,
		};
	});

	return {
		rows,
		totals: {
			customers: totalCustomers,
			revenue: totalRevenue,
			bills: totalBills,
		},
		insights: buildInsights(rows),
		reconciliation,
	};
}

/**
 * Founder-facing interpretation of the value ladder. Generated in the business
 * layer (never in React). Explains who creates the business.
 */
function buildInsights(rows: ValueDistributionRow[]): string[] {
	if (rows.length === 0) return [];

	const insights: string[] = [];

	const onceRow = rows.find((r) => r.minVisits === 1 && !r.isOpenEnded);
	if (onceRow && onceRow.customerSharePct > 0) {
		insights.push(
			`${onceRow.customerSharePct}% of customers purchase only once, yet contribute ${onceRow.revenueSharePct}% of revenue.`,
		);
	}

	const repeatRows = rows.filter((r) => r.minVisits >= 2);
	const repeatCustomerPct = roundTo(
		repeatRows.reduce((s, r) => s + r.customerSharePct, 0),
		1,
	);
	const repeatRevenuePct = roundTo(
		repeatRows.reduce((s, r) => s + r.revenueSharePct, 0),
		1,
	);
	if (repeatCustomerPct > 0) {
		insights.push(
			`Repeat customers (2+ visits) are ${repeatCustomerPct}% of customers but drive ${repeatRevenuePct}% of revenue.`,
		);
	}

	const topRow = rows.find((r) => r.isOpenEnded);
	if (topRow && topRow.customers > 0) {
		insights.push(
			`Your most loyal ${topRow.customerSharePct}% (${topRow.bucket} visits) generate ${topRow.revenueSharePct}% of revenue at ₹${topRow.ltv.toLocaleString("en-IN")} lifetime value each.`,
		);
	}

	return insights;
}
