/**
 * Claude tool implementations — the only functions Claude can trigger,
 * and each one is a plain read-only query against the same canonical
 * tables the rest of this dashboard reads (`sales_fact_v`, `dim_products`,
 * `dim_customers`). No Odoo credential, database password, or other
 * secret is ever passed to or through Claude — these functions return
 * only the aggregated business data needed to answer a question.
 *
 * Framework-agnostic on purpose: this module has no Anthropic-specific
 * types, so the same functions can be registered as tools for a different
 * provider (e.g. Gemini) later without any change here.
 */
import { sql } from "@/lib/db";

export interface ToolResult {
	success: boolean;
	data?: unknown;
	error?: string;
}

function isValidDate(value: unknown): value is string {
	return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** Today's revenue/orders/AOV/tax — mirrors the logic already proven in ai/briefing/route.ts. */
export async function getTodaySales(): Promise<ToolResult> {
	try {
		const [row] = await sql`
			SELECT
				COALESCE(SUM(net_amount), 0)::numeric AS revenue,
				COALESCE(SUM(gross_amount), 0)::numeric AS collection,
				COALESCE(SUM(tax_amount), 0)::numeric AS gst,
				COUNT(DISTINCT order_id)::int AS orders,
				ROUND(COALESCE(SUM(net_amount) / NULLIF(COUNT(DISTINCT order_id), 0), 0)::numeric, 2) AS aov
			FROM sales_fact_v
			WHERE sale_date = CURRENT_DATE
		`;
		return {
			success: true,
			data: {
				date: new Date().toISOString().split("T")[0],
				revenue: Number(row.revenue),
				collection: Number(row.collection),
				gst: Number(row.gst),
				orders: Number(row.orders),
				aov: Number(row.aov),
			},
		};
	} catch (err: any) {
		return { success: false, error: "Failed to retrieve today's sales data." };
	}
}

/** Sales for an explicit date range (inclusive). */
export async function getSalesByDate(args: {
	startDate: string;
	endDate: string;
}): Promise<ToolResult> {
	if (!isValidDate(args.startDate) || !isValidDate(args.endDate)) {
		return {
			success: false,
			error: "startDate and endDate must be YYYY-MM-DD.",
		};
	}
	try {
		const [row] = await sql`
			SELECT
				COALESCE(SUM(net_amount), 0)::numeric AS revenue,
				COALESCE(SUM(gross_amount), 0)::numeric AS collection,
				COALESCE(SUM(tax_amount), 0)::numeric AS gst,
				COUNT(DISTINCT order_id)::int AS orders,
				ROUND(COALESCE(SUM(net_amount) / NULLIF(COUNT(DISTINCT order_id), 0), 0)::numeric, 2) AS aov
			FROM sales_fact_v
			WHERE sale_date >= ${args.startDate}::date AND sale_date <= ${args.endDate}::date
		`;
		return {
			success: true,
			data: {
				startDate: args.startDate,
				endDate: args.endDate,
				revenue: Number(row.revenue),
				collection: Number(row.collection),
				gst: Number(row.gst),
				orders: Number(row.orders),
				aov: Number(row.aov),
			},
		};
	} catch {
		return {
			success: false,
			error: "Failed to retrieve sales data for that date range.",
		};
	}
}

/** Per-store revenue breakdown, optionally scoped to a date range (defaults to last 30 days). */
export async function getSalesByStore(args: {
	startDate?: string;
	endDate?: string;
}): Promise<ToolResult> {
	const startDate = isValidDate(args.startDate) ? args.startDate : null;
	const endDate = isValidDate(args.endDate) ? args.endDate : null;
	try {
		const rows = await sql`
			SELECT
				billed_by AS store,
				COALESCE(SUM(net_amount), 0)::numeric AS revenue,
				COUNT(DISTINCT order_id)::int AS orders,
				ROUND(COALESCE(SUM(net_amount) / NULLIF(COUNT(DISTINCT order_id), 0), 0)::numeric, 2) AS aov
			FROM sales_fact_v
			WHERE (${startDate}::date IS NULL OR sale_date >= ${startDate}::date)
				AND (${endDate}::date IS NULL OR sale_date <= ${endDate}::date)
				AND (${startDate}::date IS NOT NULL OR ${endDate}::date IS NOT NULL OR sale_date >= CURRENT_DATE - INTERVAL '30 days')
			GROUP BY billed_by
			ORDER BY revenue DESC
		`;
		return {
			success: true,
			data: rows.map((r) => ({
				store: r.store,
				revenue: Number(r.revenue),
				orders: Number(r.orders),
				aov: Number(r.aov),
			})),
		};
	} catch {
		return {
			success: false,
			error: "Failed to retrieve store-level sales data.",
		};
	}
}

/** Top-selling products by net revenue, optionally scoped to a date range (defaults to last 30 days). */
export async function getTopProducts(args: {
	limit?: number;
	startDate?: string;
	endDate?: string;
}): Promise<ToolResult> {
	const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 50);
	const startDate = isValidDate(args.startDate) ? args.startDate : null;
	const endDate = isValidDate(args.endDate) ? args.endDate : null;
	try {
		const rows = await sql`
			SELECT
				item_name AS product,
				sku_code AS sku,
				SUM(quantity)::int AS units_sold,
				COALESCE(SUM(net_amount), 0)::numeric AS revenue
			FROM sales_fact_v
			WHERE (${startDate}::date IS NULL OR sale_date >= ${startDate}::date)
				AND (${endDate}::date IS NULL OR sale_date <= ${endDate}::date)
				AND (${startDate}::date IS NOT NULL OR ${endDate}::date IS NOT NULL OR sale_date >= CURRENT_DATE - INTERVAL '30 days')
			GROUP BY item_name, sku_code
			ORDER BY revenue DESC
			LIMIT ${limit}
		`;
		return {
			success: true,
			data: rows.map((r) => ({
				product: r.product,
				sku: r.sku,
				unitsSold: Number(r.units_sold),
				revenue: Number(r.revenue),
			})),
		};
	} catch {
		return { success: false, error: "Failed to retrieve top products." };
	}
}

/** Products at or below a low-stock threshold — same table/columns as ai/briefing/route.ts. */
export async function getLowStockProducts(args: {
	threshold?: number;
	limit?: number;
}): Promise<ToolResult> {
	const threshold = Math.max(Number(args.threshold) || 5, 0);
	const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 50);
	try {
		const rows = await sql`
			SELECT name, default_code AS sku, qty_available, free_qty
			FROM dim_products
			WHERE qty_available <= ${threshold} AND active = true
			ORDER BY qty_available ASC
			LIMIT ${limit}
		`;
		return {
			success: true,
			data: rows.map((r) => ({
				product: r.name,
				sku: r.sku || "N/A",
				onHand: Number(r.qty_available),
				freeQty: Number(r.free_qty),
			})),
		};
	} catch {
		return { success: false, error: "Failed to retrieve low-stock products." };
	}
}

/** Highest lifetime-spend customers, derived from sales_fact_v (no stored LTV column exists). */
export async function getTopCustomers(args: {
	limit?: number;
}): Promise<ToolResult> {
	const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 50);
	try {
		const rows = await sql`
			SELECT
				MAX(customer_name) AS name,
				customer_mobile AS mobile,
				COUNT(DISTINCT order_id)::int AS orders,
				COALESCE(SUM(net_amount), 0)::numeric AS lifetime_spend
			FROM sales_fact_v
			WHERE customer_mobile IS NOT NULL AND customer_mobile <> ''
			GROUP BY customer_mobile
			ORDER BY lifetime_spend DESC
			LIMIT ${limit}
		`;
		return {
			success: true,
			data: rows.map((r) => ({
				name: r.name || "Unknown",
				mobile: r.mobile,
				orders: Number(r.orders),
				lifetimeSpend: Number(r.lifetime_spend),
			})),
		};
	} catch {
		return { success: false, error: "Failed to retrieve top customers." };
	}
}

/** A single combined snapshot: today's sales + best-performing store + any low-stock items. */
export async function getDashboardSummary(): Promise<ToolResult> {
	const [today, byStore, lowStock] = await Promise.all([
		getTodaySales(),
		getSalesByStore({}),
		getLowStockProducts({ threshold: 5, limit: 5 }),
	]);
	if (!today.success) {
		return { success: false, error: "Failed to retrieve dashboard summary." };
	}
	return {
		success: true,
		data: {
			today: today.data,
			topStore:
				byStore.success &&
				Array.isArray(byStore.data) &&
				byStore.data.length > 0
					? byStore.data[0]
					: null,
			lowStockCount:
				lowStock.success && Array.isArray(lowStock.data)
					? lowStock.data.length
					: null,
		},
	};
}
