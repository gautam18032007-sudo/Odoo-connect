import {
	type OdooProduct,
	type OdooSalesLine,
	type OdooSalesOrder,
	type OdooStore,
	upsertProducts,
	upsertSalesLines,
	upsertSalesOrders,
	upsertStores,
} from "../../repositories/odoo.repository";
import { formatDateTimeForOdoo, type OdooClient } from "../client";

async function fetchAndUpsertMissingProducts(
	client: OdooClient,
	productIds: number[],
) {
	if (productIds.length === 0) return;
	console.log(
		`[syncSales] Auto-recovering ${productIds.length} missing products from Odoo API:`,
		productIds,
	);
	try {
		const records = await client.callKw<any[]>(
			"product.product",
			"search_read",
			[],
			{
				domain: [["id", "in", productIds]],
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
	} catch (err: any) {
		console.error(
			"[syncSales] Failed to auto-recover missing products:",
			err.message,
		);
	}
}

/**
 * Synchronizes Odoo stores (pos.config), Sales Orders (sale.order),
 * and Point of Sale orders (pos.order) incrementally.
 */
export async function syncSales(
	client: OdooClient,
	lastSync: string | null,
): Promise<number> {
	console.log(
		`[syncSales] Starting sales sync. Last sync: ${lastSync || "never"}`,
	);

	// 1. Sync Store configs (pos.config) if available
	try {
		console.log("[syncSales] Querying POS configs to populate stores...");
		const configs = await client.callKw<any[]>(
			"pos.config",
			"search_read",
			[],
			{
				fields: ["id", "name"],
			},
		);

		if (configs && configs.length > 0) {
			const storesToUpsert: OdooStore[] = configs.map((c) => {
				let code = "STORE";
				const nameLower = c.name.toLowerCase();
				if (nameLower.includes("zenzebra")) code = "ZZ";
				else if (nameLower.includes("klj")) code = "KLJ";
				else if (nameLower.includes("swn") || nameLower.includes("smartworks"))
					code = "SWN";

				return {
					id: Number(c.id),
					name: String(c.name),
					code,
				};
			});
			await upsertStores(storesToUpsert);
			console.log(
				`[syncSales] Successfully synced ${storesToUpsert.length} stores.`,
			);
		} else {
			console.log(
				"[syncSales] No POS configurations found. Defaulting store mappings.",
			);
			const defaultStores: OdooStore[] = [
				{ id: 1, name: "ZenZebra (Flagship Store)", code: "ZZ" },
				{ id: 2, name: "KLJ Noida Store", code: "KLJ" },
				{ id: 3, name: "Smartworks Noida Store", code: "SWN" },
			];
			await upsertStores(defaultStores);
		}
	} catch (err: any) {
		console.warn(
			"[syncSales] POS module config check failed or not installed. Defaulting store mappings. Error:",
			err.message,
		);

		// Fallback to inserting default ZenZebra stores to ensure foreign keys satisfy POS orders
		const defaultStores: OdooStore[] = [
			{ id: 1, name: "ZenZebra (Flagship Store)", code: "ZZ" },
			{ id: 2, name: "KLJ Noida Store", code: "KLJ" },
			{ id: 3, name: "Smartworks Noida Store", code: "SWN" },
		];
		await upsertStores(defaultStores);
	}

	let totalOrdersSynced = 0;

	// 2. Sync Standard Sales Orders (sale.order)
	try {
		console.log("[syncSales] Synchronizing standard sales orders...");
		totalOrdersSynced += await syncStandardSales(client, lastSync);
	} catch (err: any) {
		console.error(
			"[syncSales] Error syncing standard sales orders:",
			err.message,
		);
	}

	// 3. Sync POS Orders (pos.order)
	try {
		console.log("[syncSales] Synchronizing POS sales orders...");
		totalOrdersSynced += await syncPosSales(client, lastSync);
	} catch (err: any) {
		console.warn(
			"[syncSales] POS sales sync failed or POS is not installed. Error:",
			err.message,
		);
	}

	console.log(
		`[syncSales] Finished sales synchronization. Total orders processed: ${totalOrdersSynced}`,
	);
	return totalOrdersSynced;
}

/**
 * Syncs standard sale.order records.
 */
async function syncStandardSales(
	client: OdooClient,
	lastSync: string | null,
): Promise<number> {
	const fields = [
		"id",
		"name",
		"date_order",
		"partner_id",
		"amount_total",
		"amount_untaxed",
		"state",
		"order_line",
		"write_date",
	];

	const domain: any[] = [["state", "in", ["sale", "done"]]];
	if (lastSync) {
		const formattedDate = formatDateTimeForOdoo(lastSync);
		domain.push(["write_date", ">=", formattedDate]);
	}

	let offset = 0;
	const limit = 100;
	let orderCount = 0;
	let hasMore = true;

	while (hasMore) {
		const records = await client.fetchBatch(
			"sale.order",
			fields,
			domain,
			"write_date desc",
			limit,
			offset,
		);

		if (records.length === 0) {
			hasMore = false;
			break;
		}

		console.log(
			`[syncSales] Standard SO batch fetched: ${records.length} records.`,
		);

		// Map Sales Orders
		const salesOrders: OdooSalesOrder[] = records.map((rec: any) => {
			const partnerId = Array.isArray(rec.partner_id)
				? Number(rec.partner_id[0])
				: null;
			return {
				id: `sale_${rec.id}`,
				name: String(rec.name),
				dateOrder: new Date(rec.date_order || Date.now()).toISOString(),
				partnerId,
				storeId: null, // Standard orders don't have pos config stores
				amountTotal: Number(rec.amount_total || 0),
				amountUntaxed: Number(rec.amount_untaxed || 0),
				state: String(rec.state),
				orderType: "sale",
			};
		});

		// Upsert Orders first to fulfill foreign key constraint for lines
		await upsertSalesOrders(salesOrders);

		// Extract all line IDs to fetch in a single batch
		const orderLineIds = records
			.flatMap((rec: any) => rec.order_line || [])
			.map((id: any) => Number(id));

		if (orderLineIds.length > 0) {
			const lines = await client.callKw<any[]>(
				"sale.order.line",
				"search_read",
				[],
				{
					domain: [["id", "in", orderLineIds]],
					fields: [
						"id",
						"order_id",
						"product_id",
						"price_unit",
						"discount",
						"product_uom_qty",
						"price_subtotal",
						"price_total",
					],
				},
			);

			const salesLines: OdooSalesLine[] = lines.map((line: any) => {
				const orderId = Array.isArray(line.order_id)
					? `sale_${line.order_id[0]}`
					: "";
				const productId = Array.isArray(line.product_id)
					? Number(line.product_id[0])
					: 0;
				const priceSubtotal = Number(line.price_subtotal || 0);
				// price_total is tax-inclusive; price_subtotal is not — the difference is the tax.
				const taxAmount = Number(line.price_total || 0) - priceSubtotal;
				return {
					id: `sale_line_${line.id}`,
					orderId,
					productId,
					priceUnit: Number(line.price_unit || 0),
					discount: Number(line.discount || 0),
					qty: Number(line.product_uom_qty || 0),
					priceSubtotal,
					taxAmount,
				};
			});

			let missingProductIds = await upsertSalesLines(salesLines);
			if (missingProductIds.length > 0) {
				await fetchAndUpsertMissingProducts(client, missingProductIds);
				await upsertSalesLines(salesLines);
			}
		}

		orderCount += salesOrders.length;

		if (records.length < limit) {
			hasMore = false;
		} else {
			offset += limit;
		}
	}

	return orderCount;
}

/**
 * Syncs POS pos.order records.
 */
async function syncPosSales(
	client: OdooClient,
	lastSync: string | null,
): Promise<number> {
	const fields = [
		"id",
		"name",
		"date_order",
		"partner_id",
		"amount_total",
		"amount_tax",
		"state",
		"config_id",
		"lines",
		"write_date",
	];

	// Sync closed/invoiced/paid orders
	const domain: any[] = [["state", "in", ["paid", "done", "invoiced"]]];
	if (lastSync) {
		const formattedDate = formatDateTimeForOdoo(lastSync);
		domain.push(["write_date", ">=", formattedDate]);
	}

	let offset = 0;
	const limit = 100;
	let orderCount = 0;
	let hasMore = true;

	while (hasMore) {
		const records = await client.fetchBatch(
			"pos.order",
			fields,
			domain,
			"write_date desc",
			limit,
			offset,
		);

		if (records.length === 0) {
			hasMore = false;
			break;
		}

		console.log(
			`[syncSales] POS Order batch fetched: ${records.length} records.`,
		);

		// Map POS Orders (handles returns where amount_total < 0)
		const posOrders: OdooSalesOrder[] = records.map((rec: any) => {
			const partnerId = Array.isArray(rec.partner_id)
				? Number(rec.partner_id[0])
				: null;
			const storeId = Array.isArray(rec.config_id)
				? Number(rec.config_id[0])
				: null;

			const totalAmount = Number(rec.amount_total || 0);
			const taxAmount = Number(rec.amount_tax || 0);
			const untaxedAmount = totalAmount - taxAmount;

			return {
				id: `pos_${rec.id}`,
				name: String(rec.name),
				dateOrder: new Date(rec.date_order || Date.now()).toISOString(),
				partnerId,
				storeId,
				amountTotal: totalAmount,
				amountUntaxed: untaxedAmount,
				state: String(rec.state),
				orderType: "pos",
			};
		});

		// Upsert Orders
		await upsertSalesOrders(posOrders);

		// Extract all POS line IDs
		const posLineIds = records
			.flatMap((rec: any) => rec.lines || [])
			.map((id: any) => Number(id));

		if (posLineIds.length > 0) {
			const lines = await client.callKw<any[]>(
				"pos.order.line",
				"search_read",
				[],
				{
					domain: [["id", "in", posLineIds]],
					fields: [
						"id",
						"order_id",
						"product_id",
						"price_unit",
						"discount",
						"qty",
						"price_subtotal",
						"price_subtotal_incl",
					],
				},
			);

			const salesLines: OdooSalesLine[] = lines.map((line: any) => {
				const orderId = Array.isArray(line.order_id)
					? `pos_${line.order_id[0]}`
					: "";
				const productId = Array.isArray(line.product_id)
					? Number(line.product_id[0])
					: 0;
				const priceSubtotal = Number(line.price_subtotal || 0); // Negative if return line
				// price_subtotal_incl is tax-inclusive; price_subtotal is not — the difference is the tax.
				const taxAmount = Number(line.price_subtotal_incl || 0) - priceSubtotal;

				return {
					id: `pos_line_${line.id}`,
					orderId,
					productId,
					priceUnit: Number(line.price_unit || 0),
					discount: Number(line.discount || 0),
					qty: Number(line.qty || 0), // Negative if return line
					priceSubtotal,
					taxAmount,
				};
			});

			let missingProductIds = await upsertSalesLines(salesLines);
			if (missingProductIds.length > 0) {
				await fetchAndUpsertMissingProducts(client, missingProductIds);
				await upsertSalesLines(salesLines);
			}
		}

		orderCount += posOrders.length;

		if (records.length < limit) {
			hasMore = false;
		} else {
			offset += limit;
		}
	}

	return orderCount;
}
