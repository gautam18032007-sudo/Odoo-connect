import type { NeonQueryFunction } from "@neondatabase/serverless";
import {
	type ComparisonPeriods,
	growthPct,
} from "@/lib/business-logic/comparison";
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

export async function getCacMetrics(
	db: FounderSql,
	periods: ComparisonPeriods,
	filters: DashboardFilters,
) {
	const food = retailFilter(filters);
	const store = filters.store ?? null;

	const start = new Date(periods.currentStart);
	const end = new Date(periods.currentEnd);
	const days = Math.max(
		1,
		Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1,
	);

	// dim_marketing_spend has no real business data source configured yet —
	// this used to hardcode ₹200,000 / ₹150,000 / ₹50,000 by store name,
	// fabricating CAC/LTV:CAC/payback figures from numbers with no source.
	// "No spend data" must render as unavailable, not an invented spend.
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

	const currentSpend = Math.round((monthlySpend / 30) * days);

	const prevStart = new Date(periods.previousStart);
	const prevEnd = new Date(periods.previousEnd);
	const prevDays = Math.max(
		1,
		Math.ceil(
			(prevEnd.getTime() - prevStart.getTime()) / (1000 * 60 * 60 * 24),
		) + 1,
	);
	const prevSpend = Math.round((monthlySpend / 30) * prevDays);

	const newCustomersQuery = `
    SELECT 
      COUNT(DISTINCT sf.customer_mobile)::integer AS count,
      COALESCE(SUM(sf.net_amount), 0)::numeric AS revenue,
      COUNT(DISTINCT sf.order_id)::integer AS orders
    FROM sales_fact_v sf
    JOIN customer_metrics cm ON sf.customer_mobile = cm.customer_mobile
    WHERE cm.first_purchase_date BETWEEN $1::date AND $2::date
      AND ($3::text IS NULL OR sf.billed_by = $3)
      AND ($4::text[] IS NULL OR sf.category <> ALL($4::text[]))
  `;

	const [currNewRes, prevNewRes] = await Promise.all([
		(db as any).query(newCustomersQuery, [
			periods.currentStart,
			periods.currentEnd,
			store,
			food,
		]),
		(db as any).query(newCustomersQuery, [
			periods.previousStart,
			periods.previousEnd,
			store,
			food,
		]),
	]);

	const currNew = Math.max(1, n(currNewRes[0]?.count));
	const prevNew = Math.max(1, n(prevNewRes[0]?.count));

	const currRevenue = n(currNewRes[0]?.revenue);
	const prevRevenue = n(prevNewRes[0]?.revenue);
	const currOrders = n(currNewRes[0]?.orders);

	const currLtv = currNew > 0 ? currRevenue / currNew : 0;
	const prevLtv = prevNew > 0 ? prevRevenue / prevNew : 0;

	const currCac = hasMarketingSpendData ? currentSpend / currNew : null;
	const prevCac = hasMarketingSpendData ? prevSpend / prevNew : null;

	const ltvCacRatio =
		currCac !== null && currCac > 0 ? currLtv / currCac : null;
	const prevLtvCacRatio =
		prevCac !== null && prevCac > 0 ? prevLtv / prevCac : null;

	const aov = currOrders > 0 ? currRevenue / currOrders : 150;
	const monthlyGrossProfitPerCustomer = aov * 0.26 * 1.5;
	const paybackMonths =
		currCac === null
			? null
			: currCac / Math.max(1, monthlyGrossProfitPerCustomer);

	return {
		hasMarketingSpendData,
		totalSpend: hasMarketingSpendData
			? {
					current: currentSpend,
					previous: prevSpend,
					growth: growthPct(currentSpend, prevSpend),
				}
			: { current: null, previous: null, growth: null },
		newCustomers: {
			current: currNew,
			previous: prevNew,
			growth: growthPct(currNew, prevNew),
		},
		cac: hasMarketingSpendData
			? {
					current: Math.round(currCac as number),
					previous: Math.round(prevCac as number),
					growth: growthPct(currCac as number, prevCac as number),
				}
			: { current: null, previous: null, growth: null },
		ltvCacRatio:
			ltvCacRatio !== null
				? {
						current: Math.round(ltvCacRatio * 10) / 10,
						previous: Math.round((prevLtvCacRatio ?? 0) * 10) / 10,
						growth: growthPct(ltvCacRatio, prevLtvCacRatio ?? 0),
					}
				: { current: null, previous: null, growth: null },
		paybackPeriod: {
			current:
				paybackMonths === null ? null : Math.round(paybackMonths * 10) / 10,
		},
	};
}

export async function getCacReportData(
	db: FounderSql,
	startDate: string,
	endDate: string,
	storeName: string | null,
) {
	const start = new Date(startDate);
	const end = new Date(endDate);
	const days = Math.max(
		1,
		Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1,
	);

	// dim_marketing_spend has no real business data source configured yet —
	// this used to hardcode ₹200,000 / ₹150,000 / ₹50,000 by store name,
	// fabricating CAC/payback figures from numbers with no source. "No
	// spend data" must render as unavailable, not an invented spend.
	const getSpendForStore = async (
		store: string | null,
		daysCount: number,
	): Promise<{ spend: number; hasData: boolean }> => {
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
		if (spendRows.length === 0) return { spend: 0, hasData: false };
		const monthlySpend = Number(spendRows[0].monthly_spend);
		return {
			spend: Math.round((monthlySpend / 30) * daysCount),
			hasData: true,
		};
	};

	const { spend: currentSpend, hasData: hasMarketingSpendData } =
		await getSpendForStore(storeName, days);
	const newCustomersCount = await customerRepository.getNewCustomersCount(
		startDate,
		endDate,
		storeName,
	);
	const newCustomers = Math.max(1, newCustomersCount);
	const cac = hasMarketingSpendData ? currentSpend / newCustomers : null;

	const aovMetrics = await customerRepository.getAovMetrics(
		startDate,
		endDate,
		storeName,
	);
	const aov = aovMetrics.bills > 0 ? aovMetrics.revenue / aovMetrics.bills : 0;

	const avgMonthlyMargin = aov * 0.26 * 1.5;
	const paybackMonths =
		cac !== null && avgMonthlyMargin > 0 ? cac / avgMonthlyMargin : null;

	const storeOptions = [
		{ name: "Smart Works Noida", key: "SmartworksNoida Noida" },
		{ name: "KLJ Store", key: "Klj store" },
		{ name: "Overall", key: null },
	];

	const paybackTable = await Promise.all(
		storeOptions.map(async (opt) => {
			const { spend: sSpend, hasData: sHasData } = await getSpendForStore(
				opt.key,
				days,
			);
			const sNewCount = await customerRepository.getNewCustomersCount(
				startDate,
				endDate,
				opt.key,
			);
			const sNew = Math.max(1, sNewCount);
			const sCac = sHasData ? sSpend / sNew : null;
			const sAovMetrics = await customerRepository.getAovMetrics(
				startDate,
				endDate,
				opt.key,
			);
			const sAov =
				sAovMetrics.bills > 0 ? sAovMetrics.revenue / sAovMetrics.bills : 0;
			const sMargin = sAov * 0.26 * 1.5;
			const sPayback = sCac !== null && sMargin > 0 ? sCac / sMargin : null;

			return {
				storeName: opt.name,
				hasMarketingSpendData: sHasData,
				spend: sHasData ? sSpend : null,
				newCustomers: sNewCount,
				cac: sCac === null ? null : Math.round(sCac),
				aov: Math.round(sAov),
				margin: Math.round(sMargin),
				payback: sPayback === null ? null : Math.round(sPayback * 10) / 10,
			};
		}),
	);

	return {
		hasMarketingSpendData,
		spend: hasMarketingSpendData ? currentSpend : null,
		newCustomers: newCustomersCount,
		cac: cac === null ? null : Math.round(cac),
		aov: Math.round(aov),
		paybackMonths:
			paybackMonths === null ? null : Math.round(paybackMonths * 10) / 10,
		paybackTable,
	};
}
