import { marginPercent as computeMarginPercent } from "@/lib/business-logic/margin";
import { sql } from "@/lib/db";
import { calculateRepeatPurchaseRate } from "@/lib/metrics/engine";

export interface StoreScorecard {
	store: string;
	grossRevenue: number;
	orderCount: number;
	aov: number;
	/** Null when the store has no customers with an identifiable mobile
	 * number to compute repeat behavior from — never a fabricated baseline. */
	repeatRate: number | null;
	/** Null when product_master has no cost-matched lines for this store
	 * (no real COGS data to compute margin from) — never a fabricated %. */
	marginPercent: number | null;
	/** No canonical per-store health formula exists yet in this codebase
	 * (health.ts computes founder-level, not store-level, health) — rather
	 * than invent a second, conflicting scoring formula, this is always
	 * null until a real one is designed and approved. */
	healthScore: number | null;
}

export async function getStoreScorecards(): Promise<StoreScorecard[]> {
	try {
		const rows = await sql`
			SELECT
				billed_by AS store,
				COALESCE(SUM(net_amount), 0)::FLOAT AS "grossRevenue",
				COUNT(DISTINCT order_id)::INT AS "orderCount",
				COALESCE(SUM(net_amount) / NULLIF(COUNT(DISTINCT order_id), 0), 0)::FLOAT AS aov
			FROM sales_fact_v
			GROUP BY billed_by;
		`;

		// Real repeat-purchase-rate per store: customers (by mobile) with more
		// than one distinct order in this store, over all identifiable
		// customers in this store — same definition as calculateRepeatPurchaseRate.
		const repeatRows = await sql`
			SELECT
				billed_by AS store,
				COUNT(*) FILTER (WHERE order_count > 1)::INT AS "repeatCustomers",
				COUNT(*)::INT AS "totalCustomers"
			FROM (
				SELECT billed_by, customer_mobile, COUNT(DISTINCT order_id) AS order_count
				FROM sales_fact_v
				WHERE customer_mobile IS NOT NULL
				GROUP BY billed_by, customer_mobile
			) per_customer
			GROUP BY billed_by;
		`;
		const repeatByStore = new Map(
			repeatRows.map((r) => [
				String(r.store),
				calculateRepeatPurchaseRate(
					Number(r.repeatCustomers),
					Number(r.totalCustomers),
				),
			]),
		);

		// Real margin per store: same product_master COGS cross-reference
		// already used by /api/net-purchase/comparison — never a fabricated %.
		let marginByStore = new Map<string, number | null>();
		try {
			const marginRows = await sql`
				SELECT
					sf.billed_by AS store,
					COALESCE(SUM(sf.net_amount), 0)::FLOAT AS "matchedNetSales",
					COALESCE(SUM(sf.quantity * pm.purchase_price), 0)::FLOAT AS "estimatedCogs"
				FROM sales_fact_v sf
				JOIN product_master pm ON sf.sku_code = pm.sku_code
				GROUP BY sf.billed_by;
			`;
			marginByStore = new Map(
				marginRows.map((r) => [
					String(r.store),
					computeMarginPercent(
						Number(r.matchedNetSales),
						Number(r.estimatedCogs),
						true,
					),
				]),
			);
		} catch (err) {
			console.warn(
				"Store margin cross-reference unavailable (product_master):",
				err,
			);
		}

		return rows.map((row) => {
			const store = String(row.store);
			return {
				store,
				grossRevenue: Number(row.grossRevenue),
				orderCount: Number(row.orderCount),
				aov: Number(row.aov),
				repeatRate: repeatByStore.get(store) ?? null,
				marginPercent: marginByStore.get(store) ?? null,
				healthScore: null,
			};
		});
	} catch (err) {
		console.warn("DB query for store scorecards failed:", err);
		return [];
	}
}

export async function getCommercialBrandBreakdown(): Promise<
	Array<{ brand: string; revenue: number; orderCount: number }>
> {
	try {
		const rows = await sql`
			SELECT 
				brand,
				COALESCE(SUM(net_amount), 0)::FLOAT AS revenue,
				COUNT(DISTINCT order_id)::INT AS "orderCount"
			FROM sales_fact_v
			GROUP BY brand
			ORDER BY revenue DESC
			LIMIT 5;
		`;
		return rows.map((r) => ({
			brand: String(r.brand),
			revenue: Number(r.revenue),
			orderCount: Number(r.orderCount),
		}));
	} catch (err) {
		console.warn("DB query for commercial brand breakdown failed:", err);
		return [];
	}
}
