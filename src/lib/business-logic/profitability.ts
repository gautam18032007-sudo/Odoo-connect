import type { NeonQueryFunction } from "@neondatabase/serverless";
import type { DashboardFilters } from "@/lib/founder/types";
import type { ComparisonPeriods } from "./comparison";
import { FOOD_CATEGORIES } from "./filter-sql";
import {
	buildProfitability,
	type ProfitabilityBlock,
	profitPerBill,
	toNumber,
} from "./margin";
import { getPurchaseSummary, hasPurchaseData } from "./purchase";

type FounderSql = NeonQueryFunction<false, false>;

/**
 * Tax-adjusted per-line COGS from the cost master (single source of truth).
 * `pm.purchase_price` is tax-INCLUSIVE, so divide by the line's tax multiplier
 * (1 + tax/net) to get ex-tax unit cost, then × quantity. Join is on the
 * normalized `sku_code` (the product code), never the composite product_key.
 */
const COGS_LINE_SQL = `(pm.purchase_price / (1 + CASE WHEN s.net_amount > 0 THEN s.tax_amount / s.net_amount ELSE 0 END)) * s.quantity`;

/**
 * Cost-master aggregates for a `sales_fact_v s LEFT JOIN product_master pm`:
 * matched (tax-adjusted) COGS, matched taxable revenue, and unmatched counts.
 * Drops the old silent COALESCE(...,0) — unmatched lines are tracked, not zeroed.
 */
const COST_MASTER_AGG_SQL = `
      COALESCE(SUM(${COGS_LINE_SQL}) FILTER (WHERE pm.purchase_price IS NOT NULL), 0) AS estimated_cogs,
      COALESCE(SUM(s.net_amount) FILTER (WHERE pm.purchase_price IS NOT NULL), 0) AS matched_net_sales,
      COUNT(*) FILTER (WHERE pm.purchase_price IS NULL)::int AS unmatched_lines,
      COUNT(*)::int AS total_lines`;

function retailFilter(filters: DashboardFilters) {
	return filters.categoryScope === "retail" ? [...FOOD_CATEGORIES] : null;
}

/** Shared filter params in the standard sales-filter order used across the app. */
function salesParams(periods: ComparisonPeriods, filters: DashboardFilters) {
	return [
		periods.currentStart,
		periods.currentEnd,
		filters.store ?? null,
		filters.category ?? null,
		filters.brand ?? null,
		filters.sku ?? null,
		retailFilter(filters) ?? null,
	];
}

/** Top-line profitability for the current period under active filters. */
export async function getProfitability(
	db: FounderSql,
	periods: ComparisonPeriods,
	filters: DashboardFilters,
): Promise<
	ProfitabilityBlock & { billCuts: number; profitPerBill: number | null }
> {
	const food = retailFilter(filters);

	const [salesRow] = await (db as any).query(
		`SELECT
      COALESCE(SUM(s.net_amount), 0) AS net_sales,
      COUNT(DISTINCT s.order_id) AS bill_cuts,
      ${COST_MASTER_AGG_SQL}
    FROM sales_fact_v s
    LEFT JOIN product_master pm ON s.sku_code = pm.sku_code
    WHERE s.sale_date >= $1::date AND s.sale_date <= $2::date
      AND ($3::text IS NULL OR s.billed_by = $3)
      AND ($4::text IS NULL OR s.category = $4)
      AND ($5::text IS NULL OR s.brand = $5)
      AND ($6::text IS NULL OR (s.sku_code ILIKE '%' || $6 || '%' OR s.item_name ILIKE '%' || $6 || '%'))
      AND ($7::text[] IS NULL OR s.category <> ALL($7::text[]))`,
		[
			periods.currentStart,
			periods.currentEnd,
			filters.store ?? null,
			filters.category ?? null,
			filters.brand ?? null,
			filters.sku ?? null,
			food ?? null,
		],
	);

	const purchase = await getPurchaseSummary(db, periods, filters);
	const netSales = toNumber(salesRow?.net_sales);
	const billCuts = toNumber(salesRow?.bill_cuts);
	const estimatedCogs = toNumber(salesRow?.estimated_cogs);
	// COGS authority is product_master; margin uses cost-matched revenue only.
	const block = buildProfitability(
		netSales,
		estimatedCogs,
		purchase.netPurchase,
		estimatedCogs > 0,
		{
			matchedNetSales: salesRow?.matched_net_sales,
			unmatchedLines: salesRow?.unmatched_lines,
			totalLines: salesRow?.total_lines,
		},
	);

	return {
		...block,
		billCuts,
		profitPerBill: block.hasPurchase
			? profitPerBill(block.grossProfit, billCuts)
			: null,
	};
}

export interface StoreProfitabilityRow {
	billedBy: string;
	storeDisplayName: string;
	netSales: number;
	netPurchase: number;
	grossProfit: number;
	marginPercent: number | null;
	units: number;
	billCuts: number;
	hasPurchase: boolean;
}

export async function getStoreProfitability(
	db: FounderSql,
	periods: ComparisonPeriods,
	filters: DashboardFilters,
): Promise<StoreProfitabilityRow[]> {
	const _food = retailFilter(filters);
	const hasPurchase = await hasPurchaseData(db);

	const salesRows = await (db as any).query(
		`SELECT s.billed_by, MAX(s.store_display_name) AS store_display_name,
      SUM(s.net_amount) AS net_sales, SUM(s.quantity) AS units, COUNT(DISTINCT s.order_id) AS bill_cuts,
      ${COST_MASTER_AGG_SQL}
    FROM sales_fact_v s
    LEFT JOIN product_master pm ON s.sku_code = pm.sku_code
    WHERE s.sale_date >= $1::date AND s.sale_date <= $2::date
      AND ($3::text IS NULL OR s.billed_by = $3)
      AND ($4::text IS NULL OR s.category = $4)
      AND ($5::text IS NULL OR s.brand = $5)
      AND ($6::text IS NULL OR (s.sku_code ILIKE '%' || $6 || '%' OR s.item_name ILIKE '%' || $6 || '%'))
      AND ($7::text[] IS NULL OR s.category <> ALL($7::text[]))
    GROUP BY s.billed_by`,
		salesParams(periods, filters),
	);

	const purchaseRows = hasPurchase
		? await (db as any).query(
				`SELECT billed_by, SUM(net_purchase_amount) AS net_purchase
        FROM purchase_fact_v
        WHERE purchase_date >= $1::date AND purchase_date <= $2::date
          AND ($3::text IS NULL OR billed_by = $3)
          AND ($4::text IS NULL OR category = $4)
          AND ($5::text IS NULL OR brand = $5)
          AND ($6::text IS NULL OR (sku_code ILIKE '%' || $6 || '%' OR item_name ILIKE '%' || $6 || '%'))
          AND ($7::text[] IS NULL OR category <> ALL($7::text[]))
        GROUP BY billed_by`,
				salesParams(periods, filters),
			)
		: [];

	const purchaseMap = new Map<string, number>();
	for (const p of purchaseRows) {
		purchaseMap.set(String(p.billed_by), toNumber(p.net_purchase));
	}

	return salesRows
		.map((s: any): StoreProfitabilityRow => {
			const netPurchase = purchaseMap.get(String(s.billed_by)) ?? 0;
			const block = buildProfitability(
				s.net_sales,
				s.estimated_cogs,
				netPurchase,
				toNumber(s.estimated_cogs) > 0,
				{
					matchedNetSales: s.matched_net_sales,
					unmatchedLines: s.unmatched_lines,
					totalLines: s.total_lines,
				},
			);
			return {
				billedBy: String(s.billed_by),
				storeDisplayName: String(s.store_display_name || s.billed_by),
				netSales: block.netSales,
				netPurchase: block.estimatedCogs, // display COGS from cost master (purchase_fact is audit-only)
				grossProfit: block.grossProfit,
				marginPercent: block.marginPercent,
				units: toNumber(s.units),
				billCuts: toNumber(s.bill_cuts),
				hasPurchase: block.hasPurchase,
			};
		})
		.sort(
			(a: StoreProfitabilityRow, b: StoreProfitabilityRow) =>
				b.grossProfit - a.grossProfit,
		);
}

export interface BrandProfitabilityRow {
	brand: string;
	netSales: number;
	netPurchase: number;
	grossProfit: number;
	marginPercent: number | null;
	units: number;
	hasPurchase: boolean;
}

export async function getBrandProfitability(
	db: FounderSql,
	periods: ComparisonPeriods,
	filters: DashboardFilters,
): Promise<BrandProfitabilityRow[]> {
	const hasPurchase = await hasPurchaseData(db);

	const salesRows = await (db as any).query(
		`SELECT s.brand, SUM(s.net_amount) AS net_sales, SUM(s.quantity) AS units,
      ${COST_MASTER_AGG_SQL}
    FROM sales_fact_v s
    LEFT JOIN product_master pm ON s.sku_code = pm.sku_code
    WHERE s.sale_date >= $1::date AND s.sale_date <= $2::date
      AND ($3::text IS NULL OR s.billed_by = $3)
      AND ($4::text IS NULL OR s.category = $4)
      AND ($5::text IS NULL OR s.brand = $5)
      AND ($6::text IS NULL OR (s.sku_code ILIKE '%' || $6 || '%' OR s.item_name ILIKE '%' || $6 || '%'))
      AND ($7::text[] IS NULL OR s.category <> ALL($7::text[]))
      AND s.brand IS NOT NULL
    GROUP BY s.brand`,
		salesParams(periods, filters),
	);

	const purchaseRows = hasPurchase
		? await (db as any).query(
				`SELECT brand, SUM(net_purchase_amount) AS net_purchase
        FROM purchase_fact_v
        WHERE purchase_date >= $1::date AND purchase_date <= $2::date
          AND ($3::text IS NULL OR billed_by = $3)
          AND ($4::text IS NULL OR category = $4)
          AND ($5::text IS NULL OR brand = $5)
          AND ($6::text IS NULL OR (sku_code ILIKE '%' || $6 || '%' OR item_name ILIKE '%' || $6 || '%'))
          AND ($7::text[] IS NULL OR category <> ALL($7::text[]))
          AND brand IS NOT NULL
        GROUP BY brand`,
				salesParams(periods, filters),
			)
		: [];

	const purchaseMap = new Map<string, number>();
	for (const p of purchaseRows) {
		purchaseMap.set(String(p.brand), toNumber(p.net_purchase));
	}

	return salesRows
		.map((s: any): BrandProfitabilityRow => {
			const netPurchase = purchaseMap.get(String(s.brand)) ?? 0;
			const block = buildProfitability(
				s.net_sales,
				s.estimated_cogs,
				netPurchase,
				toNumber(s.estimated_cogs) > 0,
				{
					matchedNetSales: s.matched_net_sales,
					unmatchedLines: s.unmatched_lines,
					totalLines: s.total_lines,
				},
			);
			return {
				brand: String(s.brand || "Unknown"),
				netSales: block.netSales,
				netPurchase: block.estimatedCogs, // display COGS from cost master (purchase_fact is audit-only)
				grossProfit: block.grossProfit,
				marginPercent: block.marginPercent,
				units: toNumber(s.units),
				hasPurchase: block.hasPurchase,
			};
		})
		.sort(
			(a: BrandProfitabilityRow, b: BrandProfitabilityRow) =>
				b.grossProfit - a.grossProfit,
		);
}

export interface SkuProfitabilityRow {
	productKey: string;
	skuCode: string | null;
	itemName: string;
	brand: string | null;
	category: string | null;
	netSales: number;
	cogs: number;
	grossProfit: number;
	marginPercent: number | null;
	units: number;
	hasPurchase: boolean;
}

export async function getSkuProfitability(
	db: FounderSql,
	periods: ComparisonPeriods,
	filters: DashboardFilters,
	limit = 20,
): Promise<SkuProfitabilityRow[]> {
	const hasPurchase = await hasPurchaseData(db);

	const salesRows = await (db as any).query(
		`SELECT s.product_key, MAX(s.item_name) AS item_name, MAX(s.sku_code) AS sku_code,
      MAX(s.brand) AS brand, MAX(s.category) AS category,
      SUM(s.net_amount) AS net_sales, SUM(s.quantity) AS units,
      ${COST_MASTER_AGG_SQL}
    FROM sales_fact_v s
    LEFT JOIN product_master pm ON s.sku_code = pm.sku_code
    WHERE s.sale_date >= $1::date AND s.sale_date <= $2::date
      AND ($3::text IS NULL OR s.billed_by = $3)
      AND ($4::text IS NULL OR s.category = $4)
      AND ($5::text IS NULL OR s.brand = $5)
      AND ($6::text IS NULL OR (s.sku_code ILIKE '%' || $6 || '%' OR s.item_name ILIKE '%' || $6 || '%'))
      AND ($7::text[] IS NULL OR s.category <> ALL($7::text[]))
    GROUP BY s.product_key`,
		salesParams(periods, filters),
	);

	const purchaseRows = hasPurchase
		? await (db as any).query(
				`SELECT product_key, SUM(net_purchase_amount) AS net_purchase
        FROM purchase_fact_v
        WHERE purchase_date >= $1::date AND purchase_date <= $2::date
          AND ($3::text IS NULL OR billed_by = $3)
          AND ($4::text IS NULL OR category = $4)
          AND ($5::text IS NULL OR brand = $5)
          AND ($6::text IS NULL OR (sku_code ILIKE '%' || $6 || '%' OR item_name ILIKE '%' || $6 || '%'))
          AND ($7::text[] IS NULL OR category <> ALL($7::text[]))
        GROUP BY product_key`,
				salesParams(periods, filters),
			)
		: [];

	const purchaseMap = new Map<string, number>();
	for (const p of purchaseRows) {
		purchaseMap.set(String(p.product_key), toNumber(p.net_purchase));
	}

	return (
		salesRows
			.map((s: any): SkuProfitabilityRow => {
				const netPurchase = purchaseMap.get(String(s.product_key)) ?? 0;
				const block = buildProfitability(
					s.net_sales,
					s.estimated_cogs,
					netPurchase,
					toNumber(s.estimated_cogs) > 0,
					{
						matchedNetSales: s.matched_net_sales,
						unmatchedLines: s.unmatched_lines,
						totalLines: s.total_lines,
					},
				);
				return {
					productKey: String(s.product_key),
					skuCode: s.sku_code ? String(s.sku_code) : null,
					itemName: String(s.item_name || "Unknown product"),
					brand: s.brand ? String(s.brand) : null,
					category: s.category ? String(s.category) : null,
					netSales: block.netSales,
					cogs: block.estimatedCogs,
					grossProfit: block.grossProfit,
					marginPercent: block.marginPercent,
					units: toNumber(s.units),
					hasPurchase: block.hasPurchase,
				};
			})
			// Ranking: profit descending (a low-revenue high-margin SKU outranks a
			// high-revenue thin-margin one).
			.sort(
				(a: SkuProfitabilityRow, b: SkuProfitabilityRow) =>
					b.grossProfit - a.grossProfit,
			)
			.slice(0, limit)
	);
}

export interface CategoryProfitabilityRow {
	category: string;
	netSales: number;
	netPurchase: number;
	grossProfit: number;
	marginPercent: number | null;
	billCuts: number;
	aov: number;
	profitPerBill: number | null;
	hasPurchase: boolean;
}

export async function getCategoryProfitability(
	db: FounderSql,
	periods: ComparisonPeriods,
	filters: DashboardFilters,
): Promise<CategoryProfitabilityRow[]> {
	const hasPurchase = await hasPurchaseData(db);

	const salesRows = await (db as any).query(
		`SELECT s.category, SUM(s.net_amount) AS net_sales, COUNT(DISTINCT s.order_id) AS bill_cuts,
      ${COST_MASTER_AGG_SQL}
    FROM sales_fact_v s
    LEFT JOIN product_master pm ON s.sku_code = pm.sku_code
    WHERE s.sale_date >= $1::date AND s.sale_date <= $2::date
      AND ($3::text IS NULL OR s.billed_by = $3)
      AND ($4::text IS NULL OR s.category = $4)
      AND ($5::text IS NULL OR s.brand = $5)
      AND ($6::text IS NULL OR (s.sku_code ILIKE '%' || $6 || '%' OR s.item_name ILIKE '%' || $6 || '%'))
      AND ($7::text[] IS NULL OR s.category <> ALL($7::text[]))
      AND s.category IS NOT NULL
    GROUP BY s.category`,
		salesParams(periods, filters),
	);

	const purchaseRows = hasPurchase
		? await (db as any).query(
				`SELECT category, SUM(net_purchase_amount) AS net_purchase
        FROM purchase_fact_v
        WHERE purchase_date >= $1::date AND purchase_date <= $2::date
          AND ($3::text IS NULL OR billed_by = $3)
          AND ($4::text IS NULL OR category = $4)
          AND ($5::text IS NULL OR brand = $5)
          AND ($6::text IS NULL OR (sku_code ILIKE '%' || $6 || '%' OR item_name ILIKE '%' || $6 || '%'))
          AND ($7::text[] IS NULL OR category <> ALL($7::text[]))
          AND category IS NOT NULL
        GROUP BY category`,
				salesParams(periods, filters),
			)
		: [];

	const purchaseMap = new Map<string, number>();
	for (const p of purchaseRows) {
		purchaseMap.set(String(p.category), toNumber(p.net_purchase));
	}

	return salesRows
		.map((s: any): CategoryProfitabilityRow => {
			const netPurchase = purchaseMap.get(String(s.category)) ?? 0;
			const block = buildProfitability(
				s.net_sales,
				s.estimated_cogs,
				netPurchase,
				toNumber(s.estimated_cogs) > 0,
				{
					matchedNetSales: s.matched_net_sales,
					unmatchedLines: s.unmatched_lines,
					totalLines: s.total_lines,
				},
			);
			const billCuts = toNumber(s.bill_cuts);
			const aov =
				billCuts > 0 ? Math.round((block.netSales / billCuts) * 100) / 100 : 0;
			return {
				category: String(s.category),
				netSales: block.netSales,
				netPurchase: block.estimatedCogs, // display COGS from cost master (purchase_fact is audit-only)
				grossProfit: block.grossProfit,
				marginPercent: block.marginPercent,
				billCuts,
				aov,
				profitPerBill: block.hasPurchase
					? profitPerBill(block.grossProfit, billCuts)
					: null,
				hasPurchase: block.hasPurchase,
			};
		})
		.sort(
			(a: CategoryProfitabilityRow, b: CategoryProfitabilityRow) =>
				b.grossProfit - a.grossProfit,
		);
}
