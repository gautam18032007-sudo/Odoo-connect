import { sql } from "../db";

export interface OdooStore {
	id: number;
	name: string;
	code?: string;
}

export interface OdooProduct {
	id: number;
	name: string;
	defaultCode?: string;
	barcode?: string;
	listPrice?: number;
	costPrice?: number;
	qtyAvailable?: number;
	freeQty?: number;
	active: boolean;
	category?: string;
}

export interface OdooCustomer {
	id: number;
	name: string;
	email?: string;
	mobile?: string;
	city?: string;
	customerRank?: number;
	active: boolean;
}

export interface OdooSalesOrder {
	id: string; // prefixed: sale_{id} or pos_{id}
	name: string;
	dateOrder: string; // ISO string
	partnerId?: number | null;
	storeId?: number | null;
	amountTotal: number;
	amountUntaxed: number;
	state: string;
	orderType: "sale" | "pos";
}

export interface OdooSalesLine {
	id: string; // prefixed: sale_line_{id} or pos_line_{id}
	orderId: string;
	productId: number;
	priceUnit: number;
	discount: number;
	qty: number;
	priceSubtotal: number;
	taxAmount?: number;
}

export interface OdooInventory {
	productId: number;
	locationId: number;
	locationName?: string;
	quantity: number;
	reservedQuantity: number;
}

/**
 * Repository layer for Canonical Odoo Sync tables.
 * Contains all raw SQL database operations.
 */

export async function upsertStores(stores: OdooStore[]): Promise<void> {
	if (stores.length === 0) return;
	for (const store of stores) {
		await sql`
			INSERT INTO dim_stores (id, name, code)
			VALUES (${store.id}, ${store.name}, ${store.code || null})
			ON CONFLICT (id) DO UPDATE SET
				name = EXCLUDED.name,
				code = EXCLUDED.code,
				updated_at = NOW()
		`;
	}
}

export async function upsertProducts(products: OdooProduct[]): Promise<void> {
	if (products.length === 0) return;
	for (const prod of products) {
		await sql`
			INSERT INTO dim_products (
				id, name, default_code, barcode, list_price, cost_price, qty_available, free_qty, active, category
			) VALUES (
				${prod.id}, ${prod.name}, ${prod.defaultCode || null}, ${prod.barcode || null},
				${Number(prod.listPrice || 0)}, ${Number(prod.costPrice || 0)},
				${Number(prod.qtyAvailable || 0)}, ${Number(prod.freeQty || 0)},
				${prod.active}, ${prod.category || null}
			)
			ON CONFLICT (id) DO UPDATE SET
				name = EXCLUDED.name,
				default_code = EXCLUDED.default_code,
				barcode = EXCLUDED.barcode,
				list_price = EXCLUDED.list_price,
				cost_price = EXCLUDED.cost_price,
				qty_available = EXCLUDED.qty_available,
				free_qty = EXCLUDED.free_qty,
				active = EXCLUDED.active,
				category = EXCLUDED.category,
				updated_at = NOW()
		`;
	}
}

export async function upsertCustomers(
	customers: OdooCustomer[],
): Promise<void> {
	if (customers.length === 0) return;
	for (const cust of customers) {
		await sql`
			INSERT INTO dim_customers (
				id, name, email, mobile, city, customer_rank, active
			) VALUES (
				${cust.id}, ${cust.name}, ${cust.email || null}, ${cust.mobile || null},
				${cust.city || null}, ${Number(cust.customerRank || 0)}, ${cust.active}
			)
			ON CONFLICT (id) DO UPDATE SET
				name = EXCLUDED.name,
				email = EXCLUDED.email,
				mobile = EXCLUDED.mobile,
				city = EXCLUDED.city,
				customer_rank = EXCLUDED.customer_rank,
				active = EXCLUDED.active,
				updated_at = NOW()
		`;
	}
}

export async function upsertSalesOrders(
	orders: OdooSalesOrder[],
): Promise<void> {
	if (orders.length === 0) return;
	for (const order of orders) {
		if (order.partnerId) {
			const existsResult = await sql`
				SELECT 1 FROM dim_customers WHERE id = ${order.partnerId} LIMIT 1
			`;
			if (existsResult.length === 0) {
				await sql`
					INSERT INTO dim_customers (id, name, active)
					VALUES (${order.partnerId}, ${`Odoo Customer ${order.partnerId}`}, true)
					ON CONFLICT (id) DO NOTHING
				`;
			}
		}

		await sql`
			INSERT INTO fact_sales_orders (
				id, name, date_order, partner_id, store_id, amount_total, amount_untaxed, state, order_type
			) VALUES (
				${order.id}, ${order.name}, ${order.dateOrder}, ${order.partnerId || null},
				${order.storeId || null}, ${Number(order.amountTotal || 0)}, ${Number(order.amountUntaxed || 0)},
				${order.state}, ${order.orderType}
			)
			ON CONFLICT (id) DO UPDATE SET
				name = EXCLUDED.name,
				date_order = EXCLUDED.date_order,
				partner_id = EXCLUDED.partner_id,
				store_id = EXCLUDED.store_id,
				amount_total = EXCLUDED.amount_total,
				amount_untaxed = EXCLUDED.amount_untaxed,
				state = EXCLUDED.state,
				order_type = EXCLUDED.order_type,
				updated_at = NOW()
		`;
	}
}

export async function upsertSalesLines(
	lines: OdooSalesLine[],
): Promise<number[]> {
	if (lines.length === 0) return [];

	// Batch the FK-existence check into one query instead of one per line —
	// cuts Neon round-trips roughly in half, which matters under concurrent
	// load (this HTTP-based driver has no connection pool and can fail with
	// "fetch failed" when hammered with hundreds of rapid sequential calls).
	const productIds = [...new Set(lines.map((l) => l.productId))];
	const existingRows = await sql`
		SELECT id FROM dim_products WHERE id = ANY(${productIds})
	`;
	const existingProductIds = new Set(existingRows.map((r) => r.id));
	const missingProductIds: number[] = [];

	for (const line of lines) {
		if (!existingProductIds.has(line.productId)) {
			missingProductIds.push(line.productId);
			continue;
		}

		await sql`
			INSERT INTO fact_sales_lines (
				id, order_id, product_id, price_unit, discount, qty, price_subtotal, tax_amount
			) VALUES (
				${line.id}, ${line.orderId}, ${line.productId}, ${Number(line.priceUnit || 0)},
				${Number(line.discount || 0)}, ${Number(line.qty || 0)}, ${Number(line.priceSubtotal || 0)},
				${Number(line.taxAmount || 0)}
			)
			ON CONFLICT (id) DO UPDATE SET
				order_id = EXCLUDED.order_id,
				product_id = EXCLUDED.product_id,
				price_unit = EXCLUDED.price_unit,
				discount = EXCLUDED.discount,
				qty = EXCLUDED.qty,
				price_subtotal = EXCLUDED.price_subtotal,
				tax_amount = EXCLUDED.tax_amount,
				updated_at = NOW()
		`;
	}

	return [...new Set(missingProductIds)];
}

export async function upsertInventory(records: OdooInventory[]): Promise<void> {
	if (records.length === 0) return;

	// Batched existence check — see upsertSalesLines for why this matters.
	const productIds = [...new Set(records.map((r) => r.productId))];
	const existingRows = await sql`
		SELECT id FROM dim_products WHERE id = ANY(${productIds})
	`;
	const existingProductIds = new Set(existingRows.map((r) => r.id));

	for (const rec of records) {
		if (!existingProductIds.has(rec.productId)) {
			continue;
		}

		await sql`
			INSERT INTO fact_inventory (
				product_id, location_id, location_name, quantity, reserved_quantity
			) VALUES (
				${rec.productId}, ${rec.locationId}, ${rec.locationName || null},
				${Number(rec.quantity || 0)}, ${Number(rec.reservedQuantity || 0)}
			)
			ON CONFLICT (product_id, location_id) DO UPDATE SET
				location_name = EXCLUDED.location_name,
				quantity = EXCLUDED.quantity,
				reserved_quantity = EXCLUDED.reserved_quantity,
				updated_at = NOW()
		`;
	}
}

export async function getLastSyncTime(
	syncType: string,
): Promise<string | null> {
	const result = await sql`
		SELECT completed_at::text 
		FROM sync_telemetry 
		WHERE sync_type = ${syncType} AND status = 'success'
		ORDER BY completed_at DESC 
		LIMIT 1
	`;
	return result[0]?.completed_at || null;
}

export interface Phase3TelemetryExtra {
	traceId?: string;
	workerId?: string;
	durationMs?: number;
	pollIntervalMs?: number;
	rowsFetched?: number;
	rowsInserted?: number;
	rowsUpdated?: number;
	rowsSkipped?: number;
	writeDateCursor?: string;
	odooResponseMs?: number;
	databaseWriteMs?: number;
	processingMs?: number;
}

export async function logSyncTelemetry(
	syncType: string,
	startedAt: string,
	completedAt: string | null,
	status: "success" | "failed" | "syncing",
	recordsProcessed: number,
	errorMessage: string | null,
	retryCount = 0,
	queueLength = 0,
	workerState = "active",
	extra?: Phase3TelemetryExtra,
): Promise<number> {
	const result = await sql`
		INSERT INTO sync_telemetry (
			sync_type, records_processed, status, started_at, completed_at, error_message,
			retry_count, queue_length, worker_state,
			trace_id, worker_id, duration_ms, poll_interval_ms, entity,
			rows_fetched, rows_inserted, rows_updated, rows_skipped, write_date_cursor,
			odoo_response_ms, database_write_ms, processing_ms
		) VALUES (
			${syncType}, ${recordsProcessed}, ${status}, ${startedAt}, 
			${completedAt || null}, ${errorMessage || null},
			${retryCount}, ${queueLength}, ${workerState},
			${extra?.traceId || `tr_${Date.now()}`}, ${extra?.workerId || "worker_main"},
			${extra?.durationMs || 0}, ${extra?.pollIntervalMs || 2000}, ${syncType},
			${extra?.rowsFetched || recordsProcessed}, ${extra?.rowsInserted || recordsProcessed},
			${extra?.rowsUpdated || 0}, ${extra?.rowsSkipped || 0}, ${extra?.writeDateCursor || null},
			${extra?.odooResponseMs || 0}, ${extra?.databaseWriteMs || 0}, ${extra?.processingMs || 0}
		)
		RETURNING id
	`;
	return Number(result[0]?.id || 0);
}

export interface EntityTelemetryStatus {
	syncType: string;
	lastSyncAt: string | null;
	recordsProcessed: number;
	status: string;
	errorMessage: string | null;
	secondsAgo: number | null;
	isStale: boolean; // > 60 seconds
}

export async function getLatestTelemetryStatus(): Promise<{
	overallStatus: "live" | "syncing" | "delayed" | "offline";
	lastSyncAt: string | null;
	maxSecondsAgo: number | null;
	entityStatuses: Record<string, EntityTelemetryStatus>;
}> {
	// Exclude 'heartbeat' rows — they're a liveness ping, not a real sync event
	// (always 0 records processed). Folding them into this query previously
	// masked real sync staleness, since a heartbeat written seconds ago would
	// dominate maxSecondsAgo/lastSyncAt even when the real data was hours stale.
	const result = await sql`
		SELECT DISTINCT ON (sync_type)
			sync_type, completed_at::text, records_processed, status, error_message,
			EXTRACT(EPOCH FROM (NOW() - completed_at))::int AS seconds_ago
		FROM sync_telemetry
		WHERE sync_type <> 'heartbeat'
		ORDER BY sync_type, completed_at DESC
	`;

	const entityStatuses: Record<string, EntityTelemetryStatus> = {};
	let maxSecondsAgo: number | null = null;
	let mostRecentCompletedAt: string | null = null;
	let hasSuccess = false;
	let hasSyncing = false;

	for (const row of result) {
		const seconds = row.seconds_ago !== null ? Number(row.seconds_ago) : null;
		const isStale = seconds === null || seconds > 60;

		entityStatuses[row.sync_type] = {
			syncType: row.sync_type,
			lastSyncAt: row.completed_at || null,
			recordsProcessed: Number(row.records_processed || 0),
			status: String(row.status),
			errorMessage: row.error_message || null,
			secondsAgo: seconds,
			isStale,
		};

		if (row.status === "syncing") hasSyncing = true;
		if (row.status === "success") hasSuccess = true;
		// Track the entity with the smallest secondsAgo — i.e. the single most
		// recently completed real sync — not result[0], which is only the
		// alphabetically-first sync_type (an unrelated, arbitrary ordering that
		// previously made `lastSyncAt` contradict `maxSecondsAgo`).
		if (
			seconds !== null &&
			(maxSecondsAgo === null || seconds < maxSecondsAgo)
		) {
			maxSecondsAgo = seconds;
			mostRecentCompletedAt = row.completed_at || null;
		}
	}

	let overallStatus: "live" | "syncing" | "delayed" | "offline" = "offline";
	if (hasSyncing) {
		overallStatus = "syncing";
	} else if (hasSuccess && maxSecondsAgo !== null && maxSecondsAgo <= 60) {
		overallStatus = "live";
	} else if (hasSuccess && maxSecondsAgo !== null && maxSecondsAgo > 60) {
		overallStatus = "delayed";
	}

	return {
		overallStatus,
		lastSyncAt: mostRecentCompletedAt,
		maxSecondsAgo,
		entityStatuses,
	};
}
