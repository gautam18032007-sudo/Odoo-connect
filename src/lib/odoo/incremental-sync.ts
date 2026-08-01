import { invalidateDashboardCache } from "../cache/revalidate";
import { sql } from "../db";
import {
	type OdooCustomer,
	type OdooProduct,
	type OdooSalesLine,
	type OdooSalesOrder,
	upsertCustomers,
	upsertProducts,
	upsertSalesLines,
	upsertSalesOrders,
} from "../repositories/odoo.repository";
import { OdooClient } from "./client";

/**
 * Auto-recovers missing or archived products referenced in an order.
 */
async function ensureProductsExist(
	client: OdooClient,
	productIds: number[],
): Promise<void> {
	if (productIds.length === 0) return;
	const uniqueIds = Array.from(new Set(productIds));

	try {
		const records = await client.callKw<any[]>(
			"product.product",
			"search_read",
			[],
			{
				domain: [
					["id", "in", uniqueIds],
					["active", "in", [true, false]],
				],
				fields: [
					"id",
					"name",
					"default_code",
					"barcode",
					"list_price",
					"standard_price",
					"qty_available",
					"free_qty",
					"active",
					"categ_id",
				],
			},
		);

		if (records && records.length > 0) {
			const productsToUpsert: OdooProduct[] = records.map((rec: any) => ({
				id: Number(rec.id),
				name: String(rec.name),
				defaultCode: rec.default_code ? String(rec.default_code) : undefined,
				barcode: rec.barcode ? String(rec.barcode) : undefined,
				listPrice: rec.list_price ? Number(rec.list_price) : 0,
				costPrice: rec.standard_price ? Number(rec.standard_price) : 0,
				qtyAvailable: rec.qty_available ? Number(rec.qty_available) : 0,
				freeQty: rec.free_qty ? Number(rec.free_qty) : 0,
				active: Boolean(rec.active !== false),
				category: Array.isArray(rec.categ_id)
					? String(rec.categ_id[1])
					: undefined,
			}));
			await upsertProducts(productsToUpsert);
		}
	} catch (err) {
		console.warn("[incrementalSync] Product auto-recovery warning:", err);
	}
}

/**
 * Refreshes affected materialized views safely.
 */
async function refreshAffectedMaterializedViews(model: string): Promise<void> {
	if (
		model === "pos.order" ||
		model === "sale.order" ||
		model === "res.partner"
	) {
		try {
			await sql`REFRESH MATERIALIZED VIEW CONCURRENTLY mv_customer_identity;`;
			console.log(
				`[incrementalSync] Refreshed mv_customer_identity for ${model}`,
			);
		} catch (_err) {
			// Fallback non-concurrently if fails
			try {
				await sql`REFRESH MATERIALIZED VIEW mv_customer_identity;`;
			} catch (fallbackErr) {
				console.warn(
					"[incrementalSync] Materialized view refresh warning:",
					fallbackErr,
				);
			}
		}
	}
}

/**
 * Performs target single-record incremental sync from Odoo SaaS to Neon DB.
 */
export async function syncSingleRecord(
	model: string,
	recordId: number,
	client?: OdooClient,
): Promise<{
	success: boolean;
	model: string;
	recordId: number;
	message: string;
}> {
	const odooClient = client ?? new OdooClient();
	if (!client) {
		await odooClient.authenticate();
	}

	console.log(
		`[incrementalSync] Processing single target record: ${model} #${recordId}`,
	);

	if (model === "pos.order") {
		const orders = await odooClient.callKw<any[]>(
			"pos.order",
			"search_read",
			[],
			{
				domain: [["id", "=", recordId]],
				fields: [
					"id",
					"name",
					"date_order",
					"partner_id",
					"config_id",
					"amount_total",
					"amount_tax",
					"state",
					"lines",
				],
			},
		);

		if (!orders || orders.length === 0) {
			return {
				success: false,
				model,
				recordId,
				message: `pos.order #${recordId} not found`,
			};
		}

		const rec = orders[0];
		const partnerId = Array.isArray(rec.partner_id)
			? Number(rec.partner_id[0])
			: null;
		const storeId = Array.isArray(rec.config_id)
			? Number(rec.config_id[0])
			: null;
		const totalAmount = Number(rec.amount_total || 0);
		const taxAmount = Number(rec.amount_tax || 0);
		const untaxedAmount = totalAmount - taxAmount;

		const rawDate = String(rec.date_order || "");
		const utcDateStr = rawDate
			? rawDate.includes("T")
				? rawDate
				: `${rawDate.replace(" ", "T")}Z`
			: new Date().toISOString();

		const posOrder: OdooSalesOrder = {
			id: `pos_${rec.id}`,
			name: String(rec.name),
			dateOrder: new Date(utcDateStr).toISOString(),
			partnerId,
			storeId,
			amountTotal: totalAmount,
			amountUntaxed: untaxedAmount,
			state: String(rec.state),
			orderType: "pos",
		};

		await upsertSalesOrders([posOrder]);

		// Lines
		const lineIds: number[] = Array.isArray(rec.lines) ? rec.lines : [];
		if (lineIds.length > 0) {
			const lineRecords = await odooClient.callKw<any[]>(
				"pos.order.line",
				"search_read",
				[],
				{
					domain: [["id", "in", lineIds]],
					fields: [
						"id",
						"product_id",
						"price_unit",
						"discount",
						"qty",
						"price_subtotal",
						"price_subtotal_incl",
					],
				},
			);

			if (lineRecords && lineRecords.length > 0) {
				const productIds = lineRecords
					.map((l) => Number(Array.isArray(l.product_id) ? l.product_id[0] : 0))
					.filter(Boolean);
				await ensureProductsExist(odooClient, productIds);

				const posLines: OdooSalesLine[] = lineRecords.map((l) => {
					const prodId = Number(
						Array.isArray(l.product_id) ? l.product_id[0] : 0,
					);
					const subtotal = Number(l.price_subtotal || 0);
					const subtotalIncl = Number(l.price_subtotal_incl || subtotal);
					return {
						id: `pos_line_${l.id}`,
						orderId: `pos_${rec.id}`,
						productId: prodId,
						priceUnit: Number(l.price_unit || 0),
						discount: Number(l.discount || 0),
						qty: Number(l.qty || 0),
						priceSubtotal: subtotal,
						taxAmount: subtotalIncl - subtotal,
					};
				});

				await upsertSalesLines(posLines);
			}
		}

		await refreshAffectedMaterializedViews(model);
		await invalidateDashboardCache({ tags: ["dashboard", "sales", "store"] });
		return {
			success: true,
			model,
			recordId,
			message: `Synced pos.order #${recordId}`,
		};
	}

	if (model === "sale.order") {
		const orders = await odooClient.callKw<any[]>(
			"sale.order",
			"search_read",
			[],
			{
				domain: [["id", "=", recordId]],
				fields: [
					"id",
					"name",
					"date_order",
					"partner_id",
					"amount_total",
					"amount_tax",
					"amount_untaxed",
					"state",
					"order_line",
				],
			},
		);

		if (!orders || orders.length === 0) {
			return {
				success: false,
				model,
				recordId,
				message: `sale.order #${recordId} not found`,
			};
		}

		const rec = orders[0];
		const partnerId = Array.isArray(rec.partner_id)
			? Number(rec.partner_id[0])
			: null;
		const rawDate = String(rec.date_order || "");
		const utcDateStr = rawDate
			? rawDate.includes("T")
				? rawDate
				: `${rawDate.replace(" ", "T")}Z`
			: new Date().toISOString();

		const saleOrder: OdooSalesOrder = {
			id: `sale_${rec.id}`,
			name: String(rec.name),
			dateOrder: new Date(utcDateStr).toISOString(),
			partnerId,
			storeId: null,
			amountTotal: Number(rec.amount_total || 0),
			amountUntaxed: Number(rec.amount_untaxed || 0),
			state: String(rec.state),
			orderType: "sale",
		};

		await upsertSalesOrders([saleOrder]);

		const lineIds: number[] = Array.isArray(rec.order_line)
			? rec.order_line
			: [];
		if (lineIds.length > 0) {
			const lineRecords = await odooClient.callKw<any[]>(
				"sale.order.line",
				"search_read",
				[],
				{
					domain: [["id", "in", lineIds]],
					fields: [
						"id",
						"product_id",
						"price_unit",
						"discount",
						"product_uom_qty",
						"price_subtotal",
						"price_tax",
					],
				},
			);

			if (lineRecords && lineRecords.length > 0) {
				const productIds = lineRecords
					.map((l) => Number(Array.isArray(l.product_id) ? l.product_id[0] : 0))
					.filter(Boolean);
				await ensureProductsExist(odooClient, productIds);

				const saleLines: OdooSalesLine[] = lineRecords.map((l) => ({
					id: `sale_line_${l.id}`,
					orderId: `sale_${rec.id}`,
					productId: Number(Array.isArray(l.product_id) ? l.product_id[0] : 0),
					priceUnit: Number(l.price_unit || 0),
					discount: Number(l.discount || 0),
					qty: Number(l.product_uom_qty || 0),
					priceSubtotal: Number(l.price_subtotal || 0),
					taxAmount: Number(l.price_tax || 0),
				}));

				await upsertSalesLines(saleLines);
			}
		}

		await refreshAffectedMaterializedViews(model);
		await invalidateDashboardCache({ tags: ["dashboard", "sales"] });
		return {
			success: true,
			model,
			recordId,
			message: `Synced sale.order #${recordId}`,
		};
	}

	if (model === "res.partner") {
		const partners = await odooClient.callKw<any[]>(
			"res.partner",
			"search_read",
			[],
			{
				domain: [["id", "=", recordId]],
				fields: [
					"id",
					"name",
					"email",
					"mobile",
					"city",
					"customer_rank",
					"active",
				],
			},
		);

		if (!partners || partners.length === 0) {
			return {
				success: false,
				model,
				recordId,
				message: `res.partner #${recordId} not found`,
			};
		}

		const rec = partners[0];
		const customer: OdooCustomer = {
			id: Number(rec.id),
			name: String(rec.name),
			email: rec.email ? String(rec.email) : undefined,
			mobile: rec.mobile ? String(rec.mobile) : undefined,
			city: rec.city ? String(rec.city) : undefined,
			customerRank: rec.customer_rank ? Number(rec.customer_rank) : 0,
			active: Boolean(rec.active !== false),
		};

		await upsertCustomers([customer]);
		await refreshAffectedMaterializedViews(model);
		await invalidateDashboardCache({ tags: ["customer", "dashboard"] });
		return {
			success: true,
			model,
			recordId,
			message: `Synced res.partner #${recordId}`,
		};
	}

	if (model === "product.product") {
		await ensureProductsExist(odooClient, [recordId]);
		await invalidateDashboardCache({ tags: ["inventory", "sales"] });
		return {
			success: true,
			model,
			recordId,
			message: `Synced product.product #${recordId}`,
		};
	}

	return {
		success: false,
		model,
		recordId,
		message: `Unsupported model: ${model}`,
	};
}
