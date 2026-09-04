import { invalidateDashboardCache } from "../cache/revalidate";
import { sql } from "../db";
import {
	type OdooCustomer,
	type OdooInventory,
	type OdooProduct,
	type OdooSalesLine,
	type OdooSalesOrder,
	upsertCustomers,
	upsertInventory,
	upsertProducts,
	upsertSalesLines,
	upsertSalesOrders,
} from "../repositories/odoo.repository";
import {
	getKnownLocationIds,
	type OdooCategoryDimension,
	type OdooPosConfigDimension,
	upsertCategories,
	upsertPosConfigs,
} from "../repositories/odoo-dimensions.repository";
import { OdooClient } from "./client";
import { syncLocationDimension } from "./sync/syncDimensions";

/**
 * Models the canonical real-time webhook path (syncSingleRecord) actually
 * knows how to process. The webhook route rejects anything outside this
 * list before it is even enqueued into webhook_events — an unsupported
 * model must never be silently accepted or written anywhere.
 *
 * Same business-final states the batch path (syncSales.ts) uses for
 * pos.order — kept as one shared constant so the real-time and batch
 * paths can never drift apart on what counts as a dashboard-valid sale.
 */
export const SUPPORTED_ODOO_MODELS = [
	"pos.order",
	"sale.order",
	"res.partner",
	"product.product",
	"product.category",
	"stock.quant",
	"pos.config",
] as const;

export const POS_ORDER_FINAL_STATES = ["paid", "done", "invoiced"] as const;

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
		const orderState = String(rec.state);

		// Mirror the batch path's own business-final-state filter exactly
		// (syncSales.ts) — a draft/cancelled order must never become a
		// dashboard-valid sale via the real-time path when the batch path
		// would never have admitted it either. This does not delete or
		// alter any already-synced row; it only skips inserting/updating
		// this one as if it were a final sale.
		if (!(POS_ORDER_FINAL_STATES as readonly string[]).includes(orderState)) {
			console.log(
				`[incrementalSync] pos.order #${recordId} has state "${orderState}" (not in ${POS_ORDER_FINAL_STATES.join("/")}) — excluded, matching existing batch-path business rules.`,
			);
			return {
				success: true,
				model,
				recordId,
				message: `pos.order #${recordId} excluded (state="${orderState}" is not a final sale state)`,
			};
		}

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
					"phone",
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
		// Matches syncCustomers.ts's field list exactly — this Odoo instance
		// rejects "mobile" as an invalid res.partner field (confirmed via a
		// live RPC error during the 2026-09 real-time sync implementation);
		// "phone" is what the working batch path has always actually used.
		const customer: OdooCustomer = {
			id: Number(rec.id),
			name: String(rec.name),
			email: rec.email ? String(rec.email) : undefined,
			mobile: rec.phone ? String(rec.phone) : undefined,
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

	if (model === "product.category") {
		const categories = await odooClient.callKw<any[]>(
			"product.category",
			"search_read",
			[],
			{
				domain: [["id", "=", recordId]],
				fields: ["id", "name", "parent_id"],
			},
		);

		if (!categories || categories.length === 0) {
			return {
				success: false,
				model,
				recordId,
				message: `product.category #${recordId} not found`,
			};
		}

		const rec = categories[0];
		const category: OdooCategoryDimension = {
			id: Number(rec.id),
			rawName: String(rec.name),
			parentCategoryId: Array.isArray(rec.parent_id)
				? Number(rec.parent_id[0])
				: null,
		};

		await upsertCategories([category]);
		await invalidateDashboardCache({
			tags: ["inventory", "sales", "dashboard"],
		});
		return {
			success: true,
			model,
			recordId,
			message: `Synced product.category #${recordId}`,
		};
	}

	if (model === "stock.quant") {
		const quants = await odooClient.callKw<any[]>(
			"stock.quant",
			"search_read",
			[],
			{
				domain: [["id", "=", recordId]],
				fields: ["product_id", "location_id", "quantity", "reserved_quantity"],
			},
		);

		if (!quants || quants.length === 0) {
			return {
				success: false,
				model,
				recordId,
				message: `stock.quant #${recordId} not found`,
			};
		}

		const rec = quants[0];
		const productId = Array.isArray(rec.product_id)
			? Number(rec.product_id[0])
			: null;
		const locationId = Array.isArray(rec.location_id)
			? Number(rec.location_id[0])
			: null;
		const locationName = Array.isArray(rec.location_id)
			? String(rec.location_id[1])
			: undefined;

		if (!productId || !locationId) {
			return {
				success: true,
				model,
				recordId,
				message: `stock.quant #${recordId} has no resolvable product/location — skipped`,
			};
		}

		// Same authoritative-state semantics as the batch path (syncInventory.ts):
		// stock.quant.quantity is already Odoo's current absolute stock level,
		// never a delta — re-reading and upserting it is correct, not a blind
		// increment. Same fail-safe location resolution as the batch path: a
		// location Odoo has just introduced may not be in dim_locations yet, so
		// attempt one dimension refresh before skipping (never fabricating).
		let knownLocationIds = await getKnownLocationIds();
		if (!knownLocationIds.has(locationId)) {
			try {
				await syncLocationDimension(odooClient);
				knownLocationIds = await getKnownLocationIds();
			} catch (refreshErr: any) {
				console.warn(
					"[incrementalSync] Location dimension refresh failed (non-fatal):",
					refreshErr.message,
				);
			}
		}
		if (!knownLocationIds.has(locationId)) {
			return {
				success: true,
				model,
				recordId,
				message: `stock.quant #${recordId} references unresolved location_id ${locationId} (${locationName ?? "unknown"}) — skipped (fail-safe, not fabricated)`,
			};
		}

		const inventoryRecord: OdooInventory = {
			productId,
			locationId,
			locationName,
			quantity: Number(rec.quantity || 0),
			reservedQuantity: Number(rec.reserved_quantity || 0),
		};

		const result = await upsertInventory([inventoryRecord]);
		await invalidateDashboardCache({ tags: ["inventory"] });
		return {
			success: true,
			model,
			recordId,
			message:
				result.inserted > 0
					? `Synced stock.quant #${recordId}`
					: `stock.quant #${recordId} skipped (product not yet in dim_products, fail-safe)`,
		};
	}

	if (model === "pos.config") {
		const configs = await odooClient.callKw<any[]>(
			"pos.config",
			"search_read",
			[],
			{
				domain: [["id", "=", recordId]],
				fields: [
					"id",
					"name",
					"company_id",
					"warehouse_id",
					"picking_type_id",
					"active",
				],
			},
		);

		if (!configs || configs.length === 0) {
			return {
				success: false,
				model,
				recordId,
				message: `pos.config #${recordId} not found`,
			};
		}

		const rec = configs[0];
		const warehouseId = Array.isArray(rec.warehouse_id)
			? Number(rec.warehouse_id[0])
			: null;

		// Store identity comes entirely from Odoo's own IDs/metadata — no
		// store-name special-casing here, matching the dynamic pos.config
		// discovery already used by the batch dimension sync.
		let warehouseCode: string | null = null;
		if (warehouseId) {
			const warehouses = await odooClient.callKw<any[]>(
				"stock.warehouse",
				"search_read",
				[],
				{ domain: [["id", "=", warehouseId]], fields: ["id", "code"] },
			);
			warehouseCode = warehouses?.[0]?.code ? String(warehouses[0].code) : null;
		}

		const posConfig: OdooPosConfigDimension = {
			id: Number(rec.id),
			name: String(rec.name),
			companyId: Array.isArray(rec.company_id)
				? Number(rec.company_id[0])
				: null,
			warehouseId,
			warehouseCode,
			pickingTypeId: Array.isArray(rec.picking_type_id)
				? Number(rec.picking_type_id[0])
				: null,
			active: rec.active !== false,
		};

		await upsertPosConfigs([posConfig]);
		await invalidateDashboardCache({ tags: ["store", "dashboard"] });
		return {
			success: true,
			model,
			recordId,
			message: `Synced pos.config #${recordId}`,
		};
	}

	return {
		success: false,
		model,
		recordId,
		message: `Unsupported model: ${model}`,
	};
}
