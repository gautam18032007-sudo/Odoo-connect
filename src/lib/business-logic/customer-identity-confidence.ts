import type { NeonQueryFunction } from "@neondatabase/serverless";

import type { DashboardFilters } from "@/lib/founder/types";
import type {
	IdentityConfidenceResult,
	IdentityConfidenceRow,
	IdentitySource,
} from "@/types/customer-intelligence";

import type { ComparisonPeriods } from "./comparison";
import {
	CUSTOMER_IDENTITY_KEY_SQL,
	MOBILE_PRESENT_SQL,
	NAME_PRESENT_SQL,
} from "./customer-identity";
import { FOOD_CATEGORIES } from "./filter-sql";
import { sharePct, toNum } from "./safe-math";

type FounderSql = NeonQueryFunction<false, false>;

function retailFilter(f: DashboardFilters) {
	return f.categoryScope === "retail" ? [...FOOD_CATEGORIES] : null;
}

const SOURCE_LABEL: Record<IdentitySource, string> = {
	mobile: "Mobile",
	name: "Name fallback",
	anonymous: "Anonymous",
};

const SOURCE_ORDER: IdentitySource[] = ["mobile", "name", "anonymous"];

interface SourceRow {
	source: string;
	customers: number;
	revenue: number;
	bills: number;
}

/**
 * Identity confidence — how customers (and revenue) split across identity
 * sources: Mobile (highest confidence), Name fallback, Anonymous. Surfaces the
 * operational KPI "we need better mobile collection". Period-scoped.
 */
export async function getIdentityConfidence(
	db: FounderSql,
	periods: ComparisonPeriods,
	filters: DashboardFilters,
): Promise<IdentityConfidenceResult> {
	const food = retailFilter(filters);

	const queryString = `
    WITH scoped AS (
      SELECT
        (${CUSTOMER_IDENTITY_KEY_SQL}) AS ck,
        CASE
          WHEN ${MOBILE_PRESENT_SQL} THEN 'mobile'
          WHEN ${NAME_PRESENT_SQL} THEN 'name'
          ELSE 'anonymous'
        END AS source,
        order_id,
        net_amount
      FROM sales_fact_v
      WHERE sale_date BETWEEN $1::date AND $2::date
        AND ($3::text IS NULL OR billed_by = $3)
        AND ($4::text IS NULL OR category = $4)
        AND ($5::text IS NULL OR brand = $5)
        AND ($6::text[] IS NULL OR category <> ALL($6::text[]))
    )
    SELECT
      source,
      COUNT(DISTINCT ck)::integer AS customers,
      COALESCE(SUM(net_amount), 0) AS revenue,
      COUNT(DISTINCT order_id)::integer AS bills
    FROM scoped
    GROUP BY source`;

	const rows: SourceRow[] = await (db as any).query(queryString, [
		periods.currentStart,
		periods.currentEnd,
		filters.store ?? null,
		filters.category ?? null,
		filters.brand ?? null,
		food ?? null,
	]);

	const bySource = new Map<string, SourceRow>();
	for (const r of rows) bySource.set(String(r.source), r);

	const totalCustomers = rows.reduce((s, r) => s + toNum(r.customers), 0);
	const totalRevenue = rows.reduce((s, r) => s + toNum(r.revenue), 0);
	const totalBills = rows.reduce((s, r) => s + toNum(r.bills), 0);

	const resultRows: IdentityConfidenceRow[] = SOURCE_ORDER.map((source) => {
		const r = bySource.get(source);
		const customers = toNum(r?.customers);
		const revenue = toNum(r?.revenue);
		const bills = toNum(r?.bills);
		return {
			source,
			label: SOURCE_LABEL[source],
			customers,
			customerPct: sharePct(customers, totalCustomers),
			revenue,
			revenuePct: sharePct(revenue, totalRevenue),
			bills,
		};
	});

	const anon = resultRows.find((r) => r.source === "anonymous");
	const insight =
		anon && anon.revenuePct >= 15
			? `${anon.revenuePct}% of revenue is anonymous — capture mobile numbers at billing to strengthen customer intelligence.`
			: null;

	return {
		rows: resultRows,
		totals: {
			customers: totalCustomers,
			revenue: totalRevenue,
			bills: totalBills,
		},
		insight,
	};
}
