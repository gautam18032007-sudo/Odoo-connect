import type { NeonQueryFunction } from "@neondatabase/serverless";
import { CUSTOMER_IDENTITY_KEY_SQL } from "@/lib/business-logic/customer-identity";
import { FOOD_CATEGORIES } from "@/lib/business-logic/filter-sql";
import type { DashboardFilters } from "@/lib/founder/types";

type FounderSql = NeonQueryFunction<false, false>;

function n(v: unknown) {
	return Number.isFinite(Number(v ?? 0)) ? Number(v ?? 0) : 0;
}

function retailFilter(f: DashboardFilters) {
	return f.categoryScope === "retail" ? [...FOOD_CATEGORIES] : null;
}

export async function getCohortMetrics(
	db: FounderSql,
	filters: DashboardFilters & {
		customerType?: string;
		billRange?: string;
	},
) {
	const food = retailFilter(filters);
	const store = filters.store ?? null;
	const customerType = filters.customerType ?? "all";
	const billRange = filters.billRange ?? "all";

	const query = `
    WITH customer_first_bill AS (
      SELECT
        (${CUSTOMER_IDENTITY_KEY_SQL}) AS customer_key,
        MIN(sale_date) AS first_date,
        MIN(bill_no) AS first_bill_no,
        COUNT(DISTINCT bill_no) AS total_orders
      FROM sales_fact_v
      WHERE (${CUSTOMER_IDENTITY_KEY_SQL}) NOT LIKE 'ANON_%'
        AND ($1::text IS NULL OR billed_by = $1)
        AND ($2::text[] IS NULL OR category <> ALL($2::text[]))
      GROUP BY (${CUSTOMER_IDENTITY_KEY_SQL})
    ),
    first_bill_amounts AS (
      SELECT
        fb.customer_key,
        fb.total_orders,
        SUM(sf.net_amount) AS first_bill_amount
      FROM customer_first_bill fb
      JOIN sales_fact_v sf ON (${CUSTOMER_IDENTITY_KEY_SQL}) = fb.customer_key AND fb.first_bill_no = sf.bill_no
      GROUP BY fb.customer_key, fb.total_orders
    ),
    customer_cohort AS (
      SELECT
        fba.customer_key,
        DATE_TRUNC('month', fb.first_date)::date AS cohort_month
      FROM first_bill_amounts fba
      JOIN customer_first_bill fb ON fba.customer_key = fb.customer_key
      WHERE (
        $3::text = 'all'
        OR ($3::text = 'new' AND (fba.total_orders = 1 OR (CURRENT_DATE - fb.first_date) <= 30))
        OR ($3::text = 'existing' AND (fba.total_orders > 1 OR (CURRENT_DATE - fb.first_date) > 30))
      )
      AND (
        $4::text = 'all'
        OR ($4::text = '0-500' AND fba.first_bill_amount <= 500)
        OR ($4::text = '500-1000' AND fba.first_bill_amount > 500 AND fba.first_bill_amount <= 1000)
        OR ($4::text = '1000-2000' AND fba.first_bill_amount > 1000 AND fba.first_bill_amount <= 2000)
        OR ($4::text = '2000-5000' AND fba.first_bill_amount > 2000 AND fba.first_bill_amount <= 5000)
        OR ($4::text = '5000+' AND fba.first_bill_amount > 5000)
      )
    ),
    customer_activity AS (
      SELECT
        (${CUSTOMER_IDENTITY_KEY_SQL}) AS customer_key,
        DATE_TRUNC('month', sf.sale_date)::date AS activity_month,
        SUM(sf.net_amount) AS revenue,
        COUNT(DISTINCT sf.bill_no) AS bills,
        SUM(sf.quantity) AS units
      FROM sales_fact_v sf
      WHERE (${CUSTOMER_IDENTITY_KEY_SQL}) NOT LIKE 'ANON_%'
        AND ($1::text IS NULL OR sf.billed_by = $1)
        AND ($2::text[] IS NULL OR sf.category <> ALL($2::text[]))
      GROUP BY (${CUSTOMER_IDENTITY_KEY_SQL}), activity_month
    ),
    cohort_size AS (
      SELECT
        cohort_month,
        COUNT(DISTINCT customer_key) AS cohort_customers
      FROM customer_cohort
      GROUP BY cohort_month
    )
    SELECT
      to_char(cc.cohort_month, 'YYYY-MM-DD') AS cohort_month,
      cs.cohort_customers::integer AS cohort_customers,
      ((EXTRACT(YEAR FROM age(ca.activity_month, cc.cohort_month)) * 12) + EXTRACT(MONTH FROM age(ca.activity_month, cc.cohort_month)))::integer AS month_index,
      COUNT(DISTINCT ca.customer_key)::integer AS active_customers,
      SUM(ca.revenue)::numeric AS revenue,
      SUM(ca.bills)::integer AS bills,
      SUM(ca.units)::integer AS units
    FROM customer_cohort cc
    JOIN customer_activity ca ON cc.customer_key = ca.customer_key
    JOIN cohort_size cs ON cc.cohort_month = cs.cohort_month
    WHERE ca.activity_month >= cc.cohort_month
    GROUP BY cc.cohort_month, cs.cohort_customers, month_index
    ORDER BY cc.cohort_month ASC, month_index ASC
  `;

	const rows = await (db as any).query(query, [
		store,
		food,
		customerType,
		billRange,
	]);

	const cohortsMap: Record<
		string,
		{
			cohortMonth: string;
			cohortCustomers: number;
			months: Record<
				number,
				{
					activeCustomers: number;
					retentionPct: number;
					revenue: number;
					aov: number;
					billCuts: number;
				}
			>;
		}
	> = {};

	for (const row of rows) {
		const monthKey = row.cohort_month;
		const size = row.cohort_customers;
		const idx = row.month_index;

		if (!cohortsMap[monthKey]) {
			cohortsMap[monthKey] = {
				cohortMonth: monthKey,
				cohortCustomers: size,
				months: {},
			};
		}

		const active = row.active_customers;
		const rev = n(row.revenue);
		const bills = n(row.bills);
		const retentionPct = size > 0 ? (active / size) * 100 : 0;
		const aov = bills > 0 ? rev / bills : 0;
		const billCuts = active > 0 ? bills / active : 0;

		cohortsMap[monthKey].months[idx] = {
			activeCustomers: active,
			retentionPct: Math.round(retentionPct * 10) / 10,
			revenue: Math.round(rev),
			aov: Math.round(aov),
			billCuts: Math.round(billCuts * 10) / 10,
		};
	}

	const monthsList = [
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
	const formattedCohorts = Object.entries(cohortsMap)
		.map(([rawDate, data]) => {
			const [yearStr, monthStr] = rawDate.split("-");
			const year = Number.parseInt(yearStr || "2026", 10);
			const monthIdx = Number.parseInt(monthStr || "01", 10) - 1;
			const cohortLabel = `${monthsList[monthIdx] || "Jan"} ${year}`;

			const monthValues = Array.from({ length: 6 }, (_, i) => {
				const mData = data.months[i];
				return {
					monthIndex: i,
					activeCustomers: mData ? mData.activeCustomers : 0,
					retentionPct: mData ? mData.retentionPct : 0,
					revenue: mData ? mData.revenue : 0,
					aov: mData ? mData.aov : 0,
					billCuts: mData ? mData.billCuts : 0,
				};
			});

			return {
				cohortMonth: rawDate,
				cohortLabel,
				cohortCustomers: data.cohortCustomers,
				months: monthValues,
			};
		})
		.sort((a, b) => a.cohortMonth.localeCompare(b.cohortMonth));

	return formattedCohorts;
}

export async function getBillCutCohorts(
	db: FounderSql,
	filters: DashboardFilters,
) {
	const food = retailFilter(filters);
	const store = filters.store ?? null;

	const query = `
    WITH customer_first_bill AS (
      SELECT
        (${CUSTOMER_IDENTITY_KEY_SQL}) AS customer_key,
        MIN(sale_date) AS first_date,
        MIN(bill_no) AS first_bill_no,
        COUNT(DISTINCT bill_no) AS total_orders
      FROM sales_fact_v
      WHERE (${CUSTOMER_IDENTITY_KEY_SQL}) NOT LIKE 'ANON_%'
        AND ($1::text IS NULL OR billed_by = $1)
        AND ($2::text[] IS NULL OR category <> ALL($2::text[]))
      GROUP BY (${CUSTOMER_IDENTITY_KEY_SQL})
    ),
    first_bill_amounts AS (
      SELECT
        fb.customer_key,
        fb.total_orders,
        SUM(sf.net_amount) AS first_bill_amount
      FROM customer_first_bill fb
      JOIN sales_fact_v sf ON (${CUSTOMER_IDENTITY_KEY_SQL}) = fb.customer_key AND fb.first_bill_no = sf.bill_no
      GROUP BY fb.customer_key, fb.total_orders
    ),
    customer_bill_cut AS (
      SELECT
        customer_key,
        total_orders,
        CASE
          WHEN first_bill_amount <= 500 THEN '0-500'
          WHEN first_bill_amount <= 1000 THEN '500-1000'
          WHEN first_bill_amount <= 2000 THEN '1000-2000'
          WHEN first_bill_amount <= 5000 THEN '2000-5000'
          ELSE '5000+'
        END AS bill_range,
        first_bill_amount
      FROM first_bill_amounts
    )
    SELECT
      bill_range AS "billRange",
      COUNT(*)::integer AS "totalCustomers",
      COUNT(DISTINCT customer_key) FILTER (WHERE total_orders > 1)::integer AS "repeatCustomers",
      ROUND(COUNT(DISTINCT customer_key) FILTER (WHERE total_orders > 1) * 100.0 / NULLIF(COUNT(*), 0))::integer AS "retentionPct",
      MIN(first_bill_amount) AS min_amt
    FROM customer_bill_cut
    GROUP BY bill_range
    ORDER BY min_amt ASC
  `;

	const rows = await (db as any).query(query, [store, food]);
	return rows.map((row: any) => ({
		billRange: row.billRange,
		totalCustomers: n(row.totalCustomers),
		repeatCustomers: n(row.repeatCustomers),
		retentionPct: n(row.retentionPct),
	}));
}
