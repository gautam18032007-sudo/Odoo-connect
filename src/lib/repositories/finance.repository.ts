import { sql } from "@/lib/db";

export interface PurchaseOrder {
	id: number;
	odooPoId?: number;
	poNumber: string;
	vendorName: string;
	vendorEmail?: string;
	orderDate: string;
	scheduledDate?: string;
	state: string;
	amountUntaxed: number;
	amountTax: number;
	amountTotal: number;
	currency: string;
	createdAt?: string;
}

export interface FinanceSummary {
	totalRevenue: number;
	totalPurchaseSpend: number;
	grossMargin: number;
	grossMarginPercent: number;
	openPurchaseOrdersCount: number;
	openPurchaseOrdersValue: number;
	recentPurchaseOrders: PurchaseOrder[];
	vendorBreakdown: Array<{
		vendor: string;
		totalSpend: number;
		poCount: number;
	}>;
}

export async function getFinanceSummary(filters?: {
	store?: string;
	category?: string;
	brand?: string;
	startDate?: string;
	endDate?: string;
}): Promise<FinanceSummary> {
	try {
		const storeFilter =
			filters?.store && filters.store !== "All Stores" ? filters.store : null;
		const categoryFilter =
			filters?.category && filters.category !== "All Categories"
				? filters.category
				: null;
		const brandFilter =
			filters?.brand && filters.brand !== "All Brands" ? filters.brand : null;
		const startDate = filters?.startDate || null;
		const endDate = filters?.endDate || null;

		// Calculate sales revenue from sales_fact_v with global filters
		const salesRes = await sql`
			SELECT COALESCE(SUM(net_amount), 0)::FLOAT AS "totalRevenue"
			FROM sales_fact_v
			WHERE (${storeFilter}::TEXT IS NULL OR store_display_name = ${storeFilter})
			  AND (${categoryFilter}::TEXT IS NULL OR category = ${categoryFilter})
			  AND (${brandFilter}::TEXT IS NULL OR brand = ${brandFilter})
			  AND (${startDate}::DATE IS NULL OR sale_date >= ${startDate}::DATE)
			  AND (${endDate}::DATE IS NULL OR sale_date <= ${endDate}::DATE);
		`;

		const totalRevenue = Number(salesRes[0]?.totalRevenue || 0);

		// Calculate purchase order spend
		const poRes = await sql`
			SELECT 
				COALESCE(SUM(amount_total), 0)::FLOAT AS "totalPurchaseSpend",
				COUNT(*)::INT AS "totalOrders",
				COUNT(*) FILTER (WHERE state IN ('draft', 'sent', 'to approve'))::INT AS "openCount",
				COALESCE(SUM(amount_total) FILTER (WHERE state IN ('draft', 'sent', 'to approve')), 0)::FLOAT AS "openValue"
			FROM purchase_orders;
		`;

		const poStat = poRes[0] || {};
		const totalPurchaseSpend = Number(poStat.totalPurchaseSpend || 0);
		const openPurchaseOrdersCount = Number(poStat.openCount || 0);
		const openPurchaseOrdersValue = Number(poStat.openValue || 0);

		const grossMargin = totalRevenue - totalPurchaseSpend;
		const grossMarginPercent =
			totalRevenue > 0 ? (grossMargin / totalRevenue) * 100 : 0;

		// Fetch recent POs
		const recentPOs = await sql`
			SELECT 
				id,
				odoo_po_id AS "odooPoId",
				po_number AS "poNumber",
				vendor_name AS "vendorName",
				vendor_email AS "vendorEmail",
				order_date::TEXT AS "orderDate",
				scheduled_date::TEXT AS "scheduledDate",
				state,
				COALESCE(amount_untaxed, 0)::FLOAT AS "amountUntaxed",
				COALESCE(amount_tax, 0)::FLOAT AS "amountTax",
				COALESCE(amount_total, 0)::FLOAT AS "amountTotal",
				currency,
				created_at AS "createdAt"
			FROM purchase_orders
			ORDER BY order_date DESC
			LIMIT 10;
		`;

		// Vendor breakdown
		const vendorRows = await sql`
			SELECT 
				vendor_name AS vendor,
				COALESCE(SUM(amount_total), 0)::FLOAT AS "totalSpend",
				COUNT(*)::INT AS "poCount"
			FROM purchase_orders
			GROUP BY vendor_name
			ORDER BY "totalSpend" DESC
			LIMIT 5;
		`;

		return {
			totalRevenue,
			totalPurchaseSpend,
			grossMargin,
			grossMarginPercent,
			openPurchaseOrdersCount,
			openPurchaseOrdersValue,
			recentPurchaseOrders: recentPOs as PurchaseOrder[],
			vendorBreakdown: vendorRows.map((v) => ({
				vendor: String(v.vendor),
				totalSpend: Number(v.totalSpend),
				poCount: Number(v.poCount),
			})),
		};
	} catch (err) {
		console.warn("DB query for finance summary failed:", err);
		return {
			totalRevenue: 0,
			totalPurchaseSpend: 0,
			grossMargin: 0,
			grossMarginPercent: 0,
			openPurchaseOrdersCount: 0,
			openPurchaseOrdersValue: 0,
			recentPurchaseOrders: [],
			vendorBreakdown: [],
		};
	}
}
