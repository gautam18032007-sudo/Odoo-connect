import type { NeonQueryFunction } from "@neondatabase/serverless";
import { FOOD_CATEGORIES } from "@/lib/business-logic/filter-sql";
import type { DashboardFilters } from "@/lib/founder/types";
import { customerRepository } from "@/lib/repositories/customer.repository";

type FounderSql = NeonQueryFunction<false, false>;

function n(v: unknown) {
	return Number.isFinite(Number(v ?? 0)) ? Number(v ?? 0) : 0;
}

function retailFilter(f: DashboardFilters) {
	return f.categoryScope === "retail" ? [...FOOD_CATEGORIES] : null;
}

export async function getLtvDistribution(
	db: FounderSql,
	filters: DashboardFilters,
) {
	const food = retailFilter(filters);
	const store = filters.store ?? null;

	const query = `
    WITH customer_revenue AS (
      SELECT customer_mobile, SUM(net_amount) AS ltv_revenue
      FROM sales_fact_v
      WHERE customer_mobile IS NOT NULL AND customer_mobile <> ''
        AND ($1::text IS NULL OR billed_by = $1)
        AND ($2::text[] IS NULL OR category <> ALL($2::text[]))
      GROUP BY customer_mobile
    )
    SELECT
      CASE
        WHEN ltv_revenue <= 1000 THEN '0-1000'
        WHEN ltv_revenue <= 5000 THEN '1000-5000'
        WHEN ltv_revenue <= 10000 THEN '5000-10000'
        ELSE '10000+'
      END AS range,
      COUNT(*)::integer AS count
    FROM customer_revenue
    GROUP BY range
  `;

	const rows = await (db as any).query(query, [store, food]);

	const ranges = ["0-1000", "1000-5000", "5000-10000", "10000+"];
	const distribution = ranges.map((r) => ({
		range: r,
		count: n(rows.find((row: any) => row.range === r)?.count),
	}));

	return distribution;
}

export async function getTopCustomers(
	db: FounderSql,
	filters: DashboardFilters,
) {
	const food = retailFilter(filters);
	const store = filters.store ?? null;
	const endDate = filters.endDate;

	const query = `
    SELECT
      customer_mobile AS "customerMobile",
      COALESCE(customer_name, 'Valued Customer') AS "customerName",
      COUNT(DISTINCT order_id)::integer AS orders,
      SUM(net_amount)::numeric AS revenue,
      (SUM(net_amount) / NULLIF(COUNT(DISTINCT order_id), 0))::numeric AS aov,
      SUM(net_amount)::numeric AS ltv,
      ROUND(LEAST(100, (COUNT(DISTINCT order_id) * 10) + (100 / (1 + (CURRENT_DATE - MAX(sale_date))))))::integer AS "retentionScore",
      ($3::date - MAX(sale_date))::integer AS "lastPurchaseDays",
      MIN(sale_date)::text AS "firstPurchaseDate",
      COALESCE(SUM(CASE WHEN sale_date >= $3::date - 30 THEN net_amount END) / NULLIF(COUNT(DISTINCT CASE WHEN sale_date >= $3::date - 30 THEN order_id END), 0), 0)::numeric AS aov_m0,
      COALESCE(SUM(CASE WHEN sale_date >= $3::date - 60 AND sale_date < $3::date - 30 THEN net_amount END) / NULLIF(COUNT(DISTINCT CASE WHEN sale_date >= $3::date - 60 AND sale_date < $3::date - 30 THEN order_id END), 0), 0)::numeric AS aov_m1,
      COALESCE(SUM(CASE WHEN sale_date >= $3::date - 90 AND sale_date < $3::date - 60 THEN net_amount END) / NULLIF(COUNT(DISTINCT CASE WHEN sale_date >= $3::date - 90 AND sale_date < $3::date - 60 THEN order_id END), 0), 0)::numeric AS aov_m2
    FROM sales_fact_v
    WHERE customer_mobile IS NOT NULL AND customer_mobile <> ''
      AND ($1::text IS NULL OR billed_by = $1)
      AND ($2::text[] IS NULL OR category <> ALL($2::text[]))
    GROUP BY customer_mobile, customer_name
    ORDER BY ltv DESC
    LIMIT 200
  `;

	const rows = await (db as any).query(query, [store, food, endDate]);
	return rows.map((row: any) => {
		const firstPurchaseDate = row.firstPurchaseDate;
		const lastPurchaseDays =
			row.lastPurchaseDays !== null ? n(row.lastPurchaseDays) : 999;
		const customerAge = Math.round(
			(new Date(endDate).getTime() - new Date(firstPurchaseDate).getTime()) /
				(1000 * 3600 * 24),
		);
		const customerType =
			n(row.orders) === 1 || customerAge <= 30 ? "New" : "Existing";

		const m0 = n(row.aov_m0);
		const m1 = n(row.aov_m1);
		const m2 = n(row.aov_m2);
		const nonZero = [m2, m1, m0].filter((v) => v > 0);
		let aovStability = "Stable";
		if (nonZero.length >= 2) {
			if (m0 > m1 && m1 > m2) {
				aovStability = "Increasing";
			} else if (m0 < m1 && m1 < m2) {
				aovStability = "Decreasing";
			} else {
				const max = Math.max(...nonZero);
				const min = Math.min(...nonZero);
				if (max - min < 150 || (max - min) / max < 0.15) {
					aovStability = "Stable";
				} else if (m0 > m2) {
					aovStability = "Increasing";
				} else if (m0 < m2) {
					aovStability = "Decreasing";
				} else {
					aovStability = "Stable";
				}
			}
		}

		return {
			customerMobile: row.customerMobile,
			customerName: row.customerName,
			orders: n(row.orders),
			revenue: Math.round(n(row.revenue)),
			aov: Math.round(n(row.aov)),
			ltv: Math.round(n(row.ltv)),
			retentionScore: n(row.retentionScore),
			lastPurchaseDays,
			customerType,
			aovStability,
			firstPurchaseDate,
		};
	});
}

export async function getLtvAovCacTrend(
	db: FounderSql,
	filters: DashboardFilters,
) {
	const food = retailFilter(filters);
	const store = filters.store ?? null;

	const query = `
    WITH monthly_sales AS (
      SELECT
        DATE_TRUNC('month', sale_date)::date AS m_date,
        SUM(net_amount) AS revenue,
        COUNT(DISTINCT order_id) AS orders,
        COUNT(DISTINCT customer_mobile) AS active_customers
      FROM sales_fact_v
      WHERE customer_mobile IS NOT NULL AND customer_mobile <> ''
        AND ($1::text IS NULL OR billed_by = $1)
        AND ($2::text[] IS NULL OR category <> ALL($2::text[]))
      GROUP BY m_date
    ),
    monthly_new AS (
      SELECT
        DATE_TRUNC('month', first_purchase_date)::date AS m_date,
        COUNT(DISTINCT customer_mobile) AS new_customers
      FROM customer_metrics
      WHERE customer_mobile IN (
        SELECT DISTINCT customer_mobile FROM sales_fact_v
        WHERE ($1::text IS NULL OR billed_by = $1)
          AND ($2::text[] IS NULL OR category <> ALL($2::text[]))
      )
      GROUP BY m_date
    )
    SELECT
      s.m_date::text AS month_raw,
      s.revenue,
      s.orders,
      s.active_customers,
      COALESCE(n.new_customers, 0)::integer AS new_customers
    FROM monthly_sales s
    LEFT JOIN monthly_new n ON s.m_date = n.m_date
    ORDER BY s.m_date ASC
  `;

	const rows = await (db as any).query(query, [store, food]);

	// dim_marketing_spend has no real business data source configured yet —
	// this used to hardcode ₹200,000 / ₹150,000 / ₹50,000 by store name,
	// which fabricated a CAC/LTV:CAC trend from numbers with no source.
	// "No spend data" must render as unavailable, not as an invented spend
	// figure (same data-truth fix already applied to getRetentionOverview()
	// and getCustomerSegments() in retention.service.ts).
	const targetStore = store || "All Stores";
	let spendRows: Record<string, unknown>[] = [];
	try {
		spendRows = await db`
			SELECT monthly_spend
			FROM dim_marketing_spend
			WHERE store_display_name ILIKE ${`%${targetStore}%`}
			LIMIT 1
		`;
	} catch {
		spendRows = [];
	}
	const hasMarketingSpendData = spendRows.length > 0;
	const monthlySpend = hasMarketingSpendData
		? Number(spendRows[0].monthly_spend)
		: 0;

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

	return rows.map((row: any) => {
		const dateObj = new Date(row.month_raw);
		const monthLabel = `${monthsList[dateObj.getUTCMonth()]} ${dateObj.getUTCFullYear()}`;
		const activeCusts = n(row.active_customers);
		const newCusts = Math.max(1, n(row.new_customers));
		const ordersCount = n(row.orders);
		const rev = n(row.revenue);

		const aov = ordersCount > 0 ? rev / ordersCount : 0;
		const ltv = activeCusts > 0 ? rev / activeCusts : 0;
		const cac = hasMarketingSpendData ? monthlySpend / newCusts : null;

		return {
			monthRaw: row.month_raw,
			monthLabel,
			ltv: Math.round(ltv),
			aov: Math.round(aov),
			cac: cac === null ? null : Math.round(cac),
			hasMarketingSpendData,
		};
	});
}

export async function getLtvReportData(storeName: string | null) {
	const ltv = await customerRepository.getLtvValue(storeName);
	const aovExpansionData = await customerRepository.getAovExpansion(storeName);
	const cohortLtv = await customerRepository.getCohortLtvGrowth(storeName);
	const aovByOrder = await customerRepository.getAovByOrderNumber(storeName);

	return {
		ltv,
		firstOrderAov: aovExpansionData.firstOrderAov,
		latestOrderAov: aovExpansionData.latestOrderAov,
		aovExpansionPct:
			aovExpansionData.firstOrderAov > 0
				? ((aovExpansionData.latestOrderAov - aovExpansionData.firstOrderAov) /
						aovExpansionData.firstOrderAov) *
					100
				: 0,
		cohortLtv,
		aovByOrder,
	};
}
