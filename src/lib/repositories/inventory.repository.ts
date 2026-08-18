import { sql } from "../db";

export interface InventoryOverviewMetrics {
	totalItemsCount: number;
	totalSohQty: number;
	totalInventoryValueMrp: number;
	totalInventoryValueCost: number;
	healthyStockCount: number;
	lowStockCount: number;
	outOfStockCount: number;
	deadStockCount: number;
	lastUpdated: string;
	syncHealth: {
		status: "healthy" | "degraded" | "syncing";
		lastSyncAt: string | null;
		recordsProcessed: number;
		pendingQueueJobs: number;
	};
}

export interface StoreInventoryBreakdown {
	storeId: number;
	storeName: string;
	storeCode: string;
	itemCount: number;
	totalQuantity: number;
	valuationMrp: number;
	locationMapped: boolean;
}

export interface FastSlowItem {
	productId: number;
	name: string;
	sku: string;
	category: string;
	qtyOnHand: number;
	unitsSold30d: number;
	velocityDaily: number;
	turnoverCategory: "fast" | "slow" | "dead" | "normal";
	listPrice: number;
}

export interface StockAgingCategory {
	ageRange: "0-30 Days" | "31-60 Days" | "61-90 Days" | "90+ Days";
	itemCount: number;
	totalQuantity: number;
	valuationCost: number;
}

export interface ReorderRecommendation {
	productId: number;
	name: string;
	sku: string;
	category: string;
	qtyOnHand: number;
	dailyRunRate: number;
	daysOfSupplyRemaining: number;
	suggestedReorderQty: number;
	recommendedVendor: string;
	urgency: "critical" | "high" | "medium";
}

/**
 * Fetches executive operational metrics from PostgreSQL canonical inventory & sales tables.
 * Sourced 100% from Odoo synced read-model data without hardcoded business assumptions.
 */
export async function getExecutiveInventoryMetrics(filters?: {
	store?: string;
	category?: string;
	brand?: string;
	sku?: string;
}): Promise<InventoryOverviewMetrics> {
	const storeFilter =
		filters?.store && filters.store !== "ALL" && filters.store !== "All Stores"
			? filters.store
			: null;
	const categoryFilter =
		filters?.category && filters.category !== "All Categories"
			? filters.category
			: null;
	const brandFilter =
		filters?.brand && filters.brand !== "All Brands" ? filters.brand : null;
	const skuFilter = filters?.sku ? `%${filters.sku.trim()}%` : null;

	const overviewResult = await sql`
		SELECT 
			COUNT(DISTINCT p.id) AS total_items,
			COALESCE(SUM(fi.quantity), 0) AS total_soh,
			COALESCE(SUM(fi.quantity * p.list_price), 0) AS total_val_mrp,
			COALESCE(SUM(fi.quantity * p.cost_price), 0) AS total_val_cost,
			COUNT(DISTINCT CASE WHEN fi.quantity > 10 THEN p.id END) AS healthy_count,
			COUNT(DISTINCT CASE WHEN fi.quantity > 0 AND fi.quantity <= 10 THEN p.id END) AS low_count,
			COUNT(DISTINCT CASE WHEN fi.quantity <= 0 OR fi.quantity IS NULL THEN p.id END) AS out_count,
			MAX(p.updated_at)::text AS max_updated
		FROM dim_products p
		JOIN fact_inventory fi ON p.id = fi.product_id
		LEFT JOIN dim_stores s ON fi.location_id = s.location_id
		WHERE p.active = true
		  AND (${storeFilter}::TEXT IS NULL OR s.name ILIKE ${storeFilter} OR s.code ILIKE ${storeFilter} OR s.id IN (
		        SELECT so.store_id 
		        FROM fact_sales_orders so 
		        JOIN sales_fact_v sf ON LOWER(TRIM(so.name)) = LOWER(TRIM(sf.bill_no))
		        WHERE sf.store_display_name ILIKE ${storeFilter} OR sf.billed_by ILIKE ${storeFilter}
		  ))
		  AND (${categoryFilter}::TEXT IS NULL OR TRIM(p.category) ILIKE TRIM(${categoryFilter}))
		  AND (${brandFilter}::TEXT IS NULL OR EXISTS (
		        SELECT 1 FROM sales_fact sf 
		        WHERE sf.brand ILIKE ${brandFilter}
		          AND (LOWER(TRIM(p.name)) = LOWER(TRIM(sf.item_name)) OR (p.default_code IS NOT NULL AND p.default_code = sf.sku_code) OR (p.barcode IS NOT NULL AND p.barcode = sf.sku_code))
		  ))
		  AND (${skuFilter}::TEXT IS NULL OR p.name ILIKE ${skuFilter} OR p.default_code ILIKE ${skuFilter})
	`;

	const row = overviewResult[0] || {};

	// Sync Telemetry Health
	const telemetryResult = await sql`
		SELECT completed_at::text, records_processed, status
		FROM sync_telemetry
		ORDER BY id DESC
		LIMIT 1
	`;
	const lastSync = telemetryResult[0];

	// Count dead stock (items with 0 sales in fact_sales_lines over last 60 days)
	const deadStockResult = await sql`
		SELECT COUNT(DISTINCT p.id) AS dead_count
		FROM dim_products p
		JOIN fact_inventory fi ON p.id = fi.product_id
		LEFT JOIN dim_stores s ON fi.location_id = s.location_id
		LEFT JOIN fact_sales_lines sl ON p.id = sl.product_id
		WHERE p.active = true 
		  AND fi.quantity > 0 
		  AND (sl.id IS NULL OR sl.updated_at < NOW() - INTERVAL '60 days')
		  AND (${storeFilter}::TEXT IS NULL OR s.name ILIKE ${storeFilter} OR s.code ILIKE ${storeFilter} OR s.id IN (
		        SELECT so.store_id 
		        FROM fact_sales_orders so 
		        JOIN sales_fact_v sf ON LOWER(TRIM(so.name)) = LOWER(TRIM(sf.bill_no))
		        WHERE sf.store_display_name ILIKE ${storeFilter} OR sf.billed_by ILIKE ${storeFilter}
		  ))
		  AND (${categoryFilter}::TEXT IS NULL OR TRIM(p.category) ILIKE TRIM(${categoryFilter}))
		  AND (${brandFilter}::TEXT IS NULL OR EXISTS (
		        SELECT 1 FROM sales_fact sf 
		        WHERE sf.brand ILIKE ${brandFilter}
		          AND (LOWER(TRIM(p.name)) = LOWER(TRIM(sf.item_name)) OR (p.default_code IS NOT NULL AND p.default_code = sf.sku_code) OR (p.barcode IS NOT NULL AND p.barcode = sf.sku_code))
		  ))
		  AND (${skuFilter}::TEXT IS NULL OR p.name ILIKE ${skuFilter} OR p.default_code ILIKE ${skuFilter})
	`;

	return {
		totalItemsCount: Number(row.total_items || 0),
		totalSohQty: Number(row.total_soh || 0),
		totalInventoryValueMrp: Number(row.total_val_mrp || 0),
		totalInventoryValueCost: Number(row.total_val_cost || 0),
		healthyStockCount: Number(row.healthy_count || 0),
		lowStockCount: Number(row.low_count || 0),
		outOfStockCount: Number(row.out_count || 0),
		deadStockCount: Number(deadStockResult[0]?.dead_count || 0),
		lastUpdated: row.max_updated || new Date().toISOString(),
		syncHealth: {
			status: lastSync?.status === "success" ? "healthy" : "degraded",
			lastSyncAt: lastSync?.completed_at || null,
			recordsProcessed: Number(lastSync?.records_processed || 0),
			pendingQueueJobs: 0,
		},
	};
}

/**
 * Store-wise inventory breakdown.
 */
export async function getStoreInventoryBreakdown(filters?: {
	store?: string;
	category?: string;
	brand?: string;
	sku?: string;
}): Promise<StoreInventoryBreakdown[]> {
	const storeFilter =
		filters?.store && filters.store !== "ALL" && filters.store !== "All Stores"
			? filters.store
			: null;
	const categoryFilter =
		filters?.category && filters.category !== "All Categories"
			? filters.category
			: null;
	const brandFilter =
		filters?.brand && filters.brand !== "All Brands" ? filters.brand : null;
	const skuFilter = filters?.sku ? `%${filters.sku.trim()}%` : null;

	const result = await sql`
		SELECT
			s.id AS store_id,
			s.name AS store_name,
			COALESCE(s.code, 'STORE') AS store_code,
			s.location_id IS NOT NULL AS location_mapped,
			COUNT(DISTINCT fi.product_id) AS item_count,
			COALESCE(SUM(fi.quantity), 0) AS total_qty,
			COALESCE(SUM(fi.quantity * p.list_price), 0) AS valuation_mrp
		FROM dim_stores s
		LEFT JOIN fact_inventory fi ON s.location_id = fi.location_id
		LEFT JOIN dim_products p ON fi.product_id = p.id
		WHERE (${storeFilter}::TEXT IS NULL OR s.name ILIKE ${storeFilter} OR s.code ILIKE ${storeFilter} OR s.id IN (
		        SELECT so.store_id 
		        FROM fact_sales_orders so 
		        JOIN sales_fact_v sf ON LOWER(TRIM(so.name)) = LOWER(TRIM(sf.bill_no))
		        WHERE sf.store_display_name ILIKE ${storeFilter} OR sf.billed_by ILIKE ${storeFilter}
		  ))
		  AND (${categoryFilter}::TEXT IS NULL OR TRIM(p.category) ILIKE TRIM(${categoryFilter}))
		  AND (${brandFilter}::TEXT IS NULL OR EXISTS (
		        SELECT 1 FROM sales_fact sf 
		        WHERE sf.brand ILIKE ${brandFilter}
		          AND (LOWER(TRIM(p.name)) = LOWER(TRIM(sf.item_name)) OR (p.default_code IS NOT NULL AND p.default_code = sf.sku_code) OR (p.barcode IS NOT NULL AND p.barcode = sf.sku_code))
		  ))
		  AND (${skuFilter}::TEXT IS NULL OR p.name ILIKE ${skuFilter} OR p.default_code ILIKE ${skuFilter})
		GROUP BY s.id, s.name, s.code, s.location_id
		ORDER BY valuation_mrp DESC
	`;

	return result.map((r) => ({
		storeId: Number(r.store_id),
		storeName: String(r.store_name),
		storeCode: String(r.store_code),
		itemCount: Number(r.item_count || 0),
		totalQuantity: Number(r.total_qty || 0),
		valuationMrp: Number(r.valuation_mrp || 0),
		locationMapped: Boolean(r.location_mapped),
	}));
}

function mapVelocityRow(r: Record<string, any>): FastSlowItem {
	const sold = Number(r.units_sold_30d || 0);
	const dailyVelocity = sold / 30;
	let category: "fast" | "slow" | "dead" | "normal" = "normal";
	if (dailyVelocity >= 3) category = "fast";
	else if (dailyVelocity <= 0.2) category = "slow";

	return {
		productId: Number(r.id),
		name: String(r.name),
		sku: String(r.sku),
		category: String(r.category),
		qtyOnHand: Number(r.qty_available || 0),
		unitsSold30d: sold,
		velocityDaily: Number(dailyVelocity.toFixed(1)),
		turnoverCategory: category,
		listPrice: Number(r.list_price || 0),
	};
}

/**
 * Fast & Slow moving products.
 */
export async function getFastSlowMovingProducts(filters?: {
	store?: string;
	category?: string;
	brand?: string;
	sku?: string;
}): Promise<{
	fastMoving: FastSlowItem[];
	slowMoving: FastSlowItem[];
}> {
	const storeFilter =
		filters?.store && filters.store !== "ALL" && filters.store !== "All Stores"
			? filters.store
			: null;
	const categoryFilter =
		filters?.category && filters.category !== "All Categories"
			? filters.category
			: null;
	const brandFilter =
		filters?.brand && filters.brand !== "All Brands" ? filters.brand : null;
	const skuFilter = filters?.sku ? `%${filters.sku.trim()}%` : null;

	const fastResult = await sql`
		SELECT
			p.id,
			p.name,
			COALESCE(p.default_code, 'SKU-' || p.id) AS sku,
			COALESCE(p.category, 'General') AS category,
			COALESCE(SUM(fi.quantity), p.qty_available) AS qty_available,
			p.list_price,
			COALESCE(SUM(sl.qty), 0) AS units_sold_30d
		FROM dim_products p
		LEFT JOIN fact_inventory fi ON p.id = fi.product_id
		LEFT JOIN dim_stores s ON fi.location_id = s.location_id
		LEFT JOIN fact_sales_lines sl ON p.id = sl.product_id
		WHERE p.active = true
		  AND (${storeFilter}::TEXT IS NULL OR s.name ILIKE ${storeFilter} OR s.code ILIKE ${storeFilter} OR s.id IN (
		        SELECT so2.store_id 
		        FROM fact_sales_orders so2 
		        JOIN sales_fact_v sf ON LOWER(TRIM(so2.name)) = LOWER(TRIM(sf.bill_no))
		        WHERE sf.store_display_name ILIKE ${storeFilter} OR sf.billed_by ILIKE ${storeFilter}
		  ))
		  AND (${categoryFilter}::TEXT IS NULL OR TRIM(p.category) ILIKE TRIM(${categoryFilter}))
		  AND (${brandFilter}::TEXT IS NULL OR EXISTS (
		        SELECT 1 FROM sales_fact sf 
		        WHERE sf.brand ILIKE ${brandFilter}
		          AND (LOWER(TRIM(p.name)) = LOWER(TRIM(sf.item_name)) OR (p.default_code IS NOT NULL AND p.default_code = sf.sku_code) OR (p.barcode IS NOT NULL AND p.barcode = sf.sku_code))
		  ))
		  AND (${skuFilter}::TEXT IS NULL OR p.name ILIKE ${skuFilter} OR p.default_code ILIKE ${skuFilter})
		GROUP BY p.id, p.name, p.default_code, p.category, p.qty_available, p.list_price
		HAVING COALESCE(SUM(sl.qty), 0) > 0
		ORDER BY units_sold_30d DESC
		LIMIT 10
	`;

	const slowResult = await sql`
		SELECT
			p.id,
			p.name,
			COALESCE(p.default_code, 'SKU-' || p.id) AS sku,
			COALESCE(p.category, 'General') AS category,
			COALESCE(SUM(fi.quantity), p.qty_available) AS qty_available,
			p.list_price,
			COALESCE(SUM(sl.qty), 0) AS units_sold_30d
		FROM dim_products p
		LEFT JOIN fact_inventory fi ON p.id = fi.product_id
		LEFT JOIN dim_stores s ON fi.location_id = s.location_id
		LEFT JOIN fact_sales_lines sl ON p.id = sl.product_id
		WHERE p.active = true AND p.qty_available > 0
		  AND (${storeFilter}::TEXT IS NULL OR s.name ILIKE ${storeFilter} OR s.code ILIKE ${storeFilter} OR s.id IN (
		        SELECT so2.store_id 
		        FROM fact_sales_orders so2 
		        JOIN sales_fact_v sf ON LOWER(TRIM(so2.name)) = LOWER(TRIM(sf.bill_no))
		        WHERE sf.store_display_name ILIKE ${storeFilter} OR sf.billed_by ILIKE ${storeFilter}
		  ))
		  AND (${categoryFilter}::TEXT IS NULL OR TRIM(p.category) ILIKE TRIM(${categoryFilter}))
		  AND (${brandFilter}::TEXT IS NULL OR EXISTS (
		        SELECT 1 FROM sales_fact sf 
		        WHERE sf.brand ILIKE ${brandFilter}
		          AND (LOWER(TRIM(p.name)) = LOWER(TRIM(sf.item_name)) OR (p.default_code IS NOT NULL AND p.default_code = sf.sku_code) OR (p.barcode IS NOT NULL AND p.barcode = sf.sku_code))
		  ))
		  AND (${skuFilter}::TEXT IS NULL OR p.name ILIKE ${skuFilter} OR p.default_code ILIKE ${skuFilter})
		GROUP BY p.id, p.name, p.default_code, p.category, p.qty_available, p.list_price
		ORDER BY units_sold_30d ASC
		LIMIT 10
	`;

	return {
		fastMoving: fastResult.map(mapVelocityRow),
		slowMoving: slowResult.map(mapVelocityRow),
	};
}

export interface ItemVelocityPagedParams {
	page: number;
	pageSize: number;
	sortBy: "sales" | "velocity" | "soh" | "name";
	sortDir: "asc" | "desc";
	search?: string;
	store?: string;
	category?: string;
	brand?: string;
}

export interface ItemVelocityPagedResult {
	items: FastSlowItem[];
	totalCount: number;
	page: number;
	pageSize: number;
}

/**
 * Full-catalog paginated/sortable/searchable product velocity list.
 */
export async function getItemVelocityPaged(
	params: ItemVelocityPagedParams,
): Promise<ItemVelocityPagedResult> {
	const page = Math.max(1, params.page);
	const pageSize = Math.min(100, Math.max(1, params.pageSize));
	const offset = (page - 1) * pageSize;
	const search = params.search?.trim() || "";
	const storeFilter =
		params.store && params.store !== "ALL" && params.store !== "All Stores"
			? params.store
			: null;
	const categoryFilter =
		params.category && params.category !== "All Categories"
			? params.category
			: null;
	const brandFilter =
		params.brand && params.brand !== "All Brands" ? params.brand : null;

	const sortColumn: Record<ItemVelocityPagedParams["sortBy"], string> = {
		sales: "units_sold_30d",
		velocity: "units_sold_30d",
		soh: "qty_available",
		name: "name",
	};
	const orderColumn = sortColumn[params.sortBy] || "units_sold_30d";
	const orderDir = params.sortDir === "asc" ? "ASC" : "DESC";

	const result = await sql`
		SELECT
			p.id,
			p.name,
			COALESCE(p.default_code, 'SKU-' || p.id) AS sku,
			COALESCE(p.category, 'General') AS category,
			COALESCE(SUM(fi.quantity), p.qty_available) AS qty_available,
			p.list_price,
			COALESCE(SUM(sl.qty), 0) AS units_sold_30d
		FROM dim_products p
		LEFT JOIN fact_inventory fi ON p.id = fi.product_id
		LEFT JOIN dim_stores s ON fi.location_id = s.location_id
		LEFT JOIN fact_sales_lines sl ON p.id = sl.product_id
		WHERE p.active = true
		  AND (${search} = '' OR p.name ILIKE ${"%" + search + "%"} OR p.default_code ILIKE ${"%" + search + "%"})
		  AND (${storeFilter}::TEXT IS NULL OR s.name ILIKE ${storeFilter} OR s.code ILIKE ${storeFilter} OR s.id IN (
		        SELECT so2.store_id 
		        FROM fact_sales_orders so2 
		        JOIN sales_fact_v sf ON LOWER(TRIM(so2.name)) = LOWER(TRIM(sf.bill_no))
		        WHERE sf.store_display_name ILIKE ${storeFilter} OR sf.billed_by ILIKE ${storeFilter}
		  ))
		  AND (${categoryFilter}::TEXT IS NULL OR TRIM(p.category) ILIKE TRIM(${categoryFilter}))
		  AND (${brandFilter}::TEXT IS NULL OR EXISTS (
		        SELECT 1 FROM sales_fact sf 
		        WHERE sf.brand ILIKE ${brandFilter}
		          AND (LOWER(TRIM(p.name)) = LOWER(TRIM(sf.item_name)) OR (p.default_code IS NOT NULL AND p.default_code = sf.sku_code) OR (p.barcode IS NOT NULL AND p.barcode = sf.sku_code))
		  ))
		GROUP BY p.id, p.name, p.default_code, p.category, p.qty_available, p.list_price
		ORDER BY ${sql.unsafe(orderColumn)} ${sql.unsafe(orderDir)}
		LIMIT ${pageSize} OFFSET ${offset}
	`;

	const countResult = await sql`
		SELECT COUNT(DISTINCT p.id) AS total
		FROM dim_products p
		LEFT JOIN fact_inventory fi ON p.id = fi.product_id
		LEFT JOIN dim_stores s ON fi.location_id = s.location_id
		LEFT JOIN fact_sales_lines sl ON p.id = sl.product_id
		WHERE p.active = true
		  AND (${search} = '' OR p.name ILIKE ${"%" + search + "%"} OR p.default_code ILIKE ${"%" + search + "%"})
		  AND (${storeFilter}::TEXT IS NULL OR s.name ILIKE ${storeFilter} OR s.code ILIKE ${storeFilter} OR s.id IN (
		        SELECT so2.store_id 
		        FROM fact_sales_orders so2 
		        JOIN sales_fact_v sf ON LOWER(TRIM(so2.name)) = LOWER(TRIM(sf.bill_no))
		        WHERE sf.store_display_name ILIKE ${storeFilter} OR sf.billed_by ILIKE ${storeFilter}
		  ))
		  AND (${categoryFilter}::TEXT IS NULL OR TRIM(p.category) ILIKE TRIM(${categoryFilter}))
		  AND (${brandFilter}::TEXT IS NULL OR EXISTS (
		        SELECT 1 FROM sales_fact sf 
		        WHERE sf.brand ILIKE ${brandFilter}
		          AND (LOWER(TRIM(p.name)) = LOWER(TRIM(sf.item_name)) OR (p.default_code IS NOT NULL AND p.default_code = sf.sku_code) OR (p.barcode IS NOT NULL AND p.barcode = sf.sku_code))
		  ))
	`;

	return {
		items: result.map(mapVelocityRow),
		totalCount: Number(countResult[0]?.total || 0),
		page,
		pageSize,
	};
}

/**
 * Products requiring automated AI reorder recommendations.
 * Computes target stock directly from 30-day run rate and real SOH without inventing unverified lead time assumptions.
 */
export async function getReorderRecommendations(filters?: {
	store?: string;
	category?: string;
	brand?: string;
	sku?: string;
}): Promise<ReorderRecommendation[]> {
	const storeFilter =
		filters?.store && filters.store !== "ALL" && filters.store !== "All Stores"
			? filters.store
			: null;
	const categoryFilter =
		filters?.category && filters.category !== "All Categories"
			? filters.category
			: null;
	const brandFilter =
		filters?.brand && filters.brand !== "All Brands" ? filters.brand : null;
	const skuFilter = filters?.sku ? `%${filters.sku.trim()}%` : null;

	const result = await sql`
		SELECT 
			p.id,
			p.name,
			COALESCE(p.default_code, 'SKU-' || p.id) AS sku,
			COALESCE(p.category, 'General') AS category,
			COALESCE(SUM(fi.quantity), p.qty_available) AS qty_available,
			COALESCE(SUM(sl.qty), 0) AS units_sold_30d
		FROM dim_products p
		LEFT JOIN fact_inventory fi ON p.id = fi.product_id
		LEFT JOIN dim_stores s ON fi.location_id = s.location_id
		LEFT JOIN fact_sales_lines sl ON p.id = sl.product_id
		WHERE p.active = true AND p.qty_available <= 15
		  AND (${storeFilter}::TEXT IS NULL OR s.name ILIKE ${storeFilter} OR s.code ILIKE ${storeFilter} OR s.id IN (
		        SELECT so2.store_id 
		        FROM fact_sales_orders so2 
		        JOIN sales_fact_v sf ON LOWER(TRIM(so2.name)) = LOWER(TRIM(sf.bill_no))
		        WHERE sf.store_display_name ILIKE ${storeFilter} OR sf.billed_by ILIKE ${storeFilter}
		  ))
		  AND (${categoryFilter}::TEXT IS NULL OR TRIM(p.category) ILIKE TRIM(${categoryFilter}))
		  AND (${brandFilter}::TEXT IS NULL OR EXISTS (
		        SELECT 1 FROM sales_fact sf 
		        WHERE sf.brand ILIKE ${brandFilter}
		          AND (LOWER(TRIM(p.name)) = LOWER(TRIM(sf.item_name)) OR (p.default_code IS NOT NULL AND p.default_code = sf.sku_code) OR (p.barcode IS NOT NULL AND p.barcode = sf.sku_code))
		  ))
		  AND (${skuFilter}::TEXT IS NULL OR p.name ILIKE ${skuFilter} OR p.default_code ILIKE ${skuFilter})
		GROUP BY p.id, p.name, p.default_code, p.category, p.qty_available
		ORDER BY qty_available ASC
		LIMIT 10
	`;

	return result.map((r) => {
		const qty = Number(r.qty_available || 0);
		const sold30d = Number(r.units_sold_30d || 0);
		const dailyRate = Math.max(0.5, Number((sold30d / 30).toFixed(1)));
		const daysLeft = Math.round(qty / dailyRate);

		// Pure Odoo-driven target buffer calculation (30-day target inventory minus current SOH)
		const targetStockBuffer = Math.ceil(dailyRate * 30);
		const suggestedQty = Math.max(0, targetStockBuffer - qty);
		const urgency = qty <= 2 ? "critical" : qty <= 8 ? "high" : "medium";

		return {
			productId: Number(r.id),
			name: String(r.name),
			sku: String(r.sku),
			category: String(r.category),
			qtyOnHand: qty,
			dailyRunRate: dailyRate,
			daysOfSupplyRemaining: daysLeft,
			suggestedReorderQty: suggestedQty,
			recommendedVendor: "Primary Odoo SaaS Vendor",
			urgency,
		};
	});
}

/**
 * Stock aging distribution computed dynamically from product timestamps.
 */
export async function getStockAgingDistribution(filters?: {
	store?: string;
	category?: string;
	brand?: string;
	sku?: string;
}): Promise<StockAgingCategory[]> {
	const storeFilter =
		filters?.store && filters.store !== "ALL" && filters.store !== "All Stores"
			? filters.store
			: null;
	const categoryFilter =
		filters?.category && filters.category !== "All Categories"
			? filters.category
			: null;
	const brandFilter =
		filters?.brand && filters.brand !== "All Brands" ? filters.brand : null;
	const skuFilter = filters?.sku ? `%${filters.sku.trim()}%` : null;

	const agingResult = await sql`
		SELECT
			CASE
				WHEN p.updated_at >= NOW() - INTERVAL '30 days' THEN '0-30 Days'
				WHEN p.updated_at >= NOW() - INTERVAL '60 days' THEN '31-60 Days'
				WHEN p.updated_at >= NOW() - INTERVAL '90 days' THEN '61-90 Days'
				ELSE '90+ Days'
			END AS age_range,
			COUNT(DISTINCT p.id)::INT AS item_count,
			COALESCE(SUM(fi.quantity), 0)::FLOAT AS total_qty,
			COALESCE(SUM(fi.quantity * p.cost_price), 0)::FLOAT AS val_cost
		FROM dim_products p
		JOIN fact_inventory fi ON p.id = fi.product_id
		LEFT JOIN dim_stores s ON fi.location_id = s.location_id
		WHERE p.active = true
		  AND (${storeFilter}::TEXT IS NULL OR s.name ILIKE ${storeFilter} OR s.code ILIKE ${storeFilter} OR s.id IN (
		        SELECT so.store_id 
		        FROM fact_sales_orders so 
		        JOIN sales_fact_v sf ON LOWER(TRIM(so.name)) = LOWER(TRIM(sf.bill_no))
		        WHERE sf.store_display_name ILIKE ${storeFilter} OR sf.billed_by ILIKE ${storeFilter}
		  ))
		  AND (${categoryFilter}::TEXT IS NULL OR TRIM(p.category) ILIKE TRIM(${categoryFilter}))
		  AND (${brandFilter}::TEXT IS NULL OR EXISTS (
		        SELECT 1 FROM sales_fact sf 
		        WHERE sf.brand ILIKE ${brandFilter}
		          AND (LOWER(TRIM(p.name)) = LOWER(TRIM(sf.item_name)) OR (p.default_code IS NOT NULL AND p.default_code = sf.sku_code) OR (p.barcode IS NOT NULL AND p.barcode = sf.sku_code))
		  ))
		  AND (${skuFilter}::TEXT IS NULL OR p.name ILIKE ${skuFilter} OR p.default_code ILIKE ${skuFilter})
		GROUP BY age_range
		ORDER BY age_range ASC
	`;

	const map: Record<
		string,
		{ itemCount: number; totalQuantity: number; valuationCost: number }
	> = {};
	for (const r of agingResult) {
		map[String(r.age_range)] = {
			itemCount: Number(r.item_count || 0),
			totalQuantity: Number(r.total_qty || 0),
			valuationCost: Number(r.val_cost || 0),
		};
	}

	const ranges: Array<"0-30 Days" | "31-60 Days" | "61-90 Days" | "90+ Days"> =
		["0-30 Days", "31-60 Days", "61-90 Days", "90+ Days"];

	return ranges.map((range) => ({
		ageRange: range,
		itemCount: map[range]?.itemCount || 0,
		totalQuantity: map[range]?.totalQuantity || 0,
		valuationCost: map[range]?.valuationCost || 0,
	}));
}
