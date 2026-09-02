export const METRICS = {
	revenue: "SUM(net_amount)",
	collection: "SUM(gross_amount)",
	gst: "SUM(tax_amount)",
	discount: "SUM(discount_amount)",
	// bill_no (Odoo pos.order.name) is NOT globally unique — Odoo's
	// per-session numbering legitimately repeats across distinct real
	// orders. order_id (sales_fact_v's stable per-order identity column,
	// added for this fix) is the correct bill/transaction count.
	bills: "COUNT(DISTINCT order_id)",
	mrp: "SUM(mrp_amount)",
} as const;
