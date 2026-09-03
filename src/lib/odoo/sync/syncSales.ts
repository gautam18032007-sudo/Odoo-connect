import { sql } from "../../db";
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
import {
	backfillStoreSourceFields,
	type OdooCategoryDimension,
	type OdooPosConfigDimension,
	upsertCategories,
	upsertPosConfigs,
	upsertProductCategoryLinks,
} from "../../repositories/odoo-dimensions.repository";
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
				domain: [
					["id", "in", productIds],
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
					"is_storable",
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
				isStorable: Boolean(rec.is_storable),
			}));
			await upsertProducts(productsToUpsert);

			try {
				const categoriesSeen = new Map<number, string>();
				const links: { productId: number; categoryId: number }[] = [];
				for (const rec of records) {
					if (!Array.isArray(rec.categ_id)) continue;
					const categoryId = Number(rec.categ_id[0]);
					categoriesSeen.set(categoryId, String(rec.categ_id[1]));
					links.push({ productId: Number(rec.id), categoryId });
				}
				if (categoriesSeen.size > 0) {
					const categoryDimensions: OdooCategoryDimension[] = [
						...categoriesSeen.entries(),
					].map(([id, rawName]) => ({ id, rawName, parentCategoryId: null }));
					await upsertCategories(categoryDimensions);
				}
				if (links.length > 0) await upsertProductCategoryLinks(links);
			} catch (categErr: any) {
				console.warn(
					"[syncSales] category_id linkage failed for auto-recovered products (non-fatal):",
					categErr.message,
				);
			}
		}
	} catch (err: any) {
		console.error(
			"[syncSales] Failed to auto-recover missing products:",
			err.message,
		);
	}
}

/**
 * Odoo's price_subtotal/price_subtotal_incl are NOT reliably signed for
 * refund lines — a forensic audit found 58 refund orders where
 * price_subtotal came back positive despite the parent order's
 * amount_total being correctly negative. qty IS reliably signed (negative
 * for a return line), so it drives the sign here instead of trusting the
 * raw amount fields — matches the previously-proven-exact formula from
 * this engagement's earlier audit work. See
 * docs/ODOO_SOURCE_OF_TRUTH_AUDIT.md §P.
 *
 * Pure function — no DB/Odoo access, safe to unit test directly.
 */
export function deriveSignedLineAmounts(
	rawSubtotal: number,
	rawSubtotalIncl: number,
	qty: number,
): { priceSubtotal: number; taxAmount: number } {
	const sign = qty < 0 ? -1 : 1;
	const priceSubtotal = sign * Math.abs(rawSubtotal);
	// price_subtotal_incl is tax-inclusive; price_subtotal is not — the
	// difference is the tax, sign-corrected the same way so a refund's tax
	// moves in the same direction as its subtotal.
	const taxAmount = sign * Math.abs(rawSubtotalIncl - rawSubtotal);
	return { priceSubtotal, taxAmount };
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
				fields: ["id", "name", "picking_type_id", "company_id", "warehouse_id"],
			},
		);

		if (configs && configs.length > 0) {
			// Resolve each store's stock.location ID via its picking type's
			// default source location — pos.config IDs and stock.location IDs
			// are different Odoo ID spaces, so fact_inventory (keyed on
			// stock.location) can't be joined to dim_stores.id directly.
			const pickingTypeIds = [
				...new Set(
					configs
						.map((c) =>
							Array.isArray(c.picking_type_id)
								? Number(c.picking_type_id[0])
								: null,
						)
						.filter((id): id is number => id !== null),
				),
			];

			const pickingTypeToLocation = new Map<number, number>();
			if (pickingTypeIds.length > 0) {
				const pickingTypes = await client.callKw<any[]>(
					"stock.picking.type",
					"search_read",
					[],
					{
						domain: [["id", "in", pickingTypeIds]],
						fields: ["id", "default_location_src_id"],
					},
				);
				for (const pt of pickingTypes) {
					if (Array.isArray(pt.default_location_src_id)) {
						pickingTypeToLocation.set(
							Number(pt.id),
							Number(pt.default_location_src_id[0]),
						);
					}
				}
			}

			const storesToUpsert: OdooStore[] = configs.map((c) => {
				// Legacy fallback code, kept only for the initial INSERT so a
				// brand-new store still satisfies the dim_stores/fact_sales_orders
				// FK before dimension data exists for it. Immediately corrected
				// below via backfillStoreSourceFields(), which sources the real
				// code/company/location from dim_pos_configs + dim_locations —
				// see docs/ODOO_SOURCE_OF_TRUTH_AUDIT.md Phase 2 §5, Phase 3.
				let code = "STORE";
				const nameLower = c.name.toLowerCase();
				if (nameLower.includes("zenzebra")) code = "ZZ";
				else if (nameLower.includes("klj")) code = "KLJ";
				else if (nameLower.includes("swn") || nameLower.includes("smartworks"))
					code = "SWN";

				const pickingTypeId = Array.isArray(c.picking_type_id)
					? Number(c.picking_type_id[0])
					: null;
				const locationId = pickingTypeId
					? pickingTypeToLocation.get(pickingTypeId)
					: undefined;

				return {
					id: Number(c.id),
					name: String(c.name),
					code,
					locationId,
				};
			});
			await upsertStores(storesToUpsert);
			console.log(
				`[syncSales] Successfully synced ${storesToUpsert.length} stores.`,
			);

			// Persist pos.config as its own canonical dimension (Phase 3/4) and
			// immediately correct dim_stores.company_id/code/location_id from it
			// plus dim_locations — replaces the substring-matched `code` above
			// with the real stock.warehouse.code, and sets company_id, without
			// ever fabricating a store row.
			try {
				const warehouseIds = [
					...new Set(
						configs
							.map((c) =>
								Array.isArray(c.warehouse_id)
									? Number(c.warehouse_id[0])
									: null,
							)
							.filter((id): id is number => id !== null),
					),
				];
				const warehouseCodeById = new Map<number, string>();
				if (warehouseIds.length > 0) {
					const warehouses = await client.callKw<any[]>(
						"stock.warehouse",
						"search_read",
						[],
						{ domain: [["id", "in", warehouseIds]], fields: ["id", "code"] },
					);
					for (const wh of warehouses) {
						if (wh.code) warehouseCodeById.set(Number(wh.id), String(wh.code));
					}
				}

				const posConfigDimensions: OdooPosConfigDimension[] = configs.map(
					(c) => {
						const warehouseId = Array.isArray(c.warehouse_id)
							? Number(c.warehouse_id[0])
							: null;
						return {
							id: Number(c.id),
							name: String(c.name),
							companyId: Array.isArray(c.company_id)
								? Number(c.company_id[0])
								: null,
							warehouseId,
							warehouseCode: warehouseId
								? (warehouseCodeById.get(warehouseId) ?? null)
								: null,
							pickingTypeId: Array.isArray(c.picking_type_id)
								? Number(c.picking_type_id[0])
								: null,
							active: c.active !== false,
						};
					},
				);
				await upsertPosConfigs(posConfigDimensions);
			} catch (dimErr: any) {
				// Canonical dimension refresh failing must never break the store/
				// order sync that already succeeded above — log and move on.
				console.warn(
					"[syncSales] dim_pos_configs canonical refresh failed (non-fatal):",
					dimErr.message,
				);
			}

			// Store-identity reliability fix (multi-store scalability audit): this
			// backfill only reads whatever dim_pos_configs already has — it does
			// NOT depend on the warehouse-code lookup or upsertPosConfigs() above
			// succeeding this cycle, so it gets its own try/catch. Previously this
			// was chained after upsertPosConfigs() inside one try block, so a
			// transient failure in the extra stock.warehouse Odoo API call (or
			// anything else in that block) silently skipped this backfill too —
			// observed in production as dim_pos_configs staying stale for 33+
			// hours while a real store (HQ27GGN) stayed stuck on the generic
			// "STORE" placeholder code the whole time.
			try {
				await backfillStoreSourceFields();
			} catch (backfillErr: any) {
				console.warn(
					"[syncSales] dim_stores source-field backfill failed (non-fatal):",
					backfillErr.message,
				);
			}
		} else {
			// No POS configs returned — do NOT fabricate default stores with
			// invented Odoo IDs (that would silently misattribute future orders
			// to the wrong store). Fail safe: leave dim_stores exactly as it is;
			// whatever stores are already known remain known.
			console.error(
				"[syncSales] No POS configurations found in Odoo. Skipping store sync this cycle — existing dim_stores rows left untouched (no fabricated defaults).",
			);
		}
	} catch (err: any) {
		// Same fail-safe as above: an Odoo API failure must not fabricate
		// store rows with invented IDs. Existing dim_stores rows (and the
		// orders that reference them) remain valid; this cycle's store
		// refresh is simply skipped and retried on the next sync tick.
		console.error(
			"[syncSales] POS config query failed — skipping store sync this cycle (no fabricated defaults). Error:",
			err.message,
		);
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

	const LOOKBACK_MS = 10 * 60 * 1000; // 10-minute safety lookback window
	const effectiveLastSync = lastSync
		? new Date(
				Math.max(0, new Date(lastSync).getTime() - LOOKBACK_MS),
			).toISOString()
		: null;

	const domain: any[] = [["state", "in", ["sale", "done"]]];
	if (effectiveLastSync) {
		const formattedDate = formatDateTimeForOdoo(effectiveLastSync);
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
			const rawDate = String(rec.date_order || "");
			const utcDateStr = rawDate
				? rawDate.includes("T")
					? rawDate
					: `${rawDate.replace(" ", "T")}Z`
				: new Date().toISOString();
			return {
				id: `sale_${rec.id}`,
				name: String(rec.name),
				dateOrder: new Date(utcDateStr).toISOString(),
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

			const missingProductIds = await upsertSalesLines(salesLines);
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

const POS_ORDER_FIELDS = [
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

/**
 * Maps a batch of raw pos.order records (with their `lines` id array) and
 * upserts both the orders and their line items via the existing idempotent
 * repository functions. Shared by the normal incremental sync and the
 * bounded historical reconciliation pass below — a single insertion path,
 * not two parallel ones.
 */
async function upsertPosOrderBatch(
	client: OdooClient,
	records: any[],
): Promise<void> {
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

		const rawDate = String(rec.date_order || "");
		const utcDateStr = rawDate
			? rawDate.includes("T")
				? rawDate
				: `${rawDate.replace(" ", "T")}Z`
			: new Date().toISOString();

		return {
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
	});

	await upsertSalesOrders(posOrders);

	const posLineIds = records
		.flatMap((rec: any) => rec.lines || [])
		.map((id: any) => Number(id));

	if (posLineIds.length === 0) return;

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
		const qty = Number(line.qty || 0);
		const { priceSubtotal, taxAmount } = deriveSignedLineAmounts(
			Number(line.price_subtotal || 0),
			Number(line.price_subtotal_incl || 0),
			qty,
		);

		return {
			id: `pos_line_${line.id}`,
			orderId,
			productId,
			priceUnit: Number(line.price_unit || 0),
			discount: Number(line.discount || 0),
			qty, // Negative if return line
			priceSubtotal,
			taxAmount,
		};
	});

	const missingProductIds = await upsertSalesLines(salesLines);
	if (missingProductIds.length > 0) {
		await fetchAndUpsertMissingProducts(client, missingProductIds);
		await upsertSalesLines(salesLines);
	}
}

/**
 * Syncs POS pos.order records.
 */
async function syncPosSales(
	client: OdooClient,
	lastSync: string | null,
): Promise<number> {
	const fields = POS_ORDER_FIELDS;

	const LOOKBACK_MS = 10 * 60 * 1000; // 10-minute safety lookback window
	const effectiveLastSync = lastSync
		? new Date(
				Math.max(0, new Date(lastSync).getTime() - LOOKBACK_MS),
			).toISOString()
		: null;

	// Sync closed/invoiced/paid orders with 10-minute safety lookback window
	const domain: any[] = [["state", "in", ["paid", "done", "invoiced"]]];
	if (effectiveLastSync) {
		const formattedDate = formatDateTimeForOdoo(effectiveLastSync);
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

		await upsertPosOrderBatch(client, records);
		orderCount += records.length;

		if (records.length < limit) {
			hasMore = false;
		} else {
			offset += limit;
		}
	}

	return orderCount;
}

/**
 * Bounded historical reconciliation for pos.order records (F-2 fix).
 *
 * syncPosSales() above filters by `write_date >= lastSync`, which can
 * permanently miss an order whose `date_order` falls inside the required
 * business period but whose `write_date` fell behind the incremental
 * cursor (e.g. from how an earlier backfill assigned timestamps) — proven
 * in production: 339 July orders and a further 193 August orders were
 * silently and permanently skipped this way, invisible to the incremental
 * sync's forward-only cursor.
 *
 * This function does NOT replace the incremental sync — it is a separate,
 * bounded (trailing `windowDays`, default 45) safety net keyed on
 * `date_order` instead of `write_date`. It diffs the fetched Odoo IDs
 * against Neon and only upserts genuinely missing ones (via the same
 * `upsertPosOrderBatch` path used above — one insertion system, not two),
 * so a normal run where nothing is missing costs one Odoo fetch plus one
 * Neon existence check, not a rewrite of already-correct rows.
 *
 * Callers are expected to throttle invocation (see
 * shouldRunHistoricalReconciliation()) — this function itself does not
 * rate-limit, so calling it directly bypasses that safety.
 */
export async function reconcileHistoricalPosSales(
	client: OdooClient,
	windowDays = 45,
): Promise<{ ordersRepaired: number; skippedLines: number }> {
	const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
	const domain: any[] = [
		["date_order", ">=", formatDateTimeForOdoo(since)],
		["state", "in", ["paid", "done", "invoiced"]],
	];

	let offset = 0;
	const limit = 200;
	let totalRepaired = 0;
	let hasMore = true;

	while (hasMore) {
		const records = await client.fetchBatch(
			"pos.order",
			POS_ORDER_FIELDS,
			domain,
			"date_order asc",
			limit,
			offset,
		);

		if (records.length === 0) {
			hasMore = false;
			break;
		}

		const posIds = records.map((rec: any) => `pos_${rec.id}`);
		const existing = await sql`
			SELECT id FROM fact_sales_orders WHERE id = ANY(${posIds})
		`;
		const existingSet = new Set(existing.map((r: any) => r.id as string));
		const missingRecords = records.filter(
			(rec: any) => !existingSet.has(`pos_${rec.id}`),
		);

		if (missingRecords.length > 0) {
			console.log(
				`[reconcileHistoricalPosSales] Found ${missingRecords.length} orders missed by incremental sync in this batch — repairing.`,
			);
			await upsertPosOrderBatch(client, missingRecords);
			totalRepaired += missingRecords.length;
		}

		if (records.length < limit) {
			hasMore = false;
		} else {
			offset += limit;
		}
	}

	if (totalRepaired > 0) {
		console.log(
			`[reconcileHistoricalPosSales] Repaired ${totalRepaired} historically-missed order(s) within the trailing ${windowDays}-day window.`,
		);
	}

	return { ordersRepaired: totalRepaired, skippedLines: 0 };
}

/**
 * Throttle for reconcileHistoricalPosSales(): the trailing-window scan
 * touches every order in the window (thousands at current volume), so it
 * must not run on every 5-minute cron/worker tick. Runs at most once per
 * `minIntervalHours` (default 24h) after a *successful* run, tracked via
 * sync_telemetry the same way every other sync type already is — no new
 * table. Distinguishes outcome, not just recency (F-2-1 fix — a prior
 * version blocked retries for the full window even after a failed attempt):
 *
 *   no prior row       -> run
 *   status = 'syncing' -> block, UNLESS stuck longer than STUCK_THRESHOLD_MS
 *                         (a crashed run must not permanently wedge this)
 *   status = 'failed'  -> always allow an immediate retry
 *   status = 'success' -> normal `minIntervalHours` throttle applies
 */
const RECONCILIATION_STUCK_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

export async function shouldRunHistoricalReconciliation(
	minIntervalHours = 24,
): Promise<boolean> {
	const rows = await sql`
		SELECT status, started_at FROM sync_telemetry
		WHERE entity = 'sales_reconciliation'
		ORDER BY started_at DESC LIMIT 1
	`;
	if (rows.length === 0) return true;

	const { status, started_at } = rows[0] as {
		status: string;
		started_at: string;
	};
	const ageMs = Date.now() - new Date(started_at).getTime();

	if (status === "syncing") {
		return ageMs > RECONCILIATION_STUCK_THRESHOLD_MS;
	}
	if (status === "failed") {
		return true;
	}
	return ageMs >= minIntervalHours * 60 * 60 * 1000;
}
