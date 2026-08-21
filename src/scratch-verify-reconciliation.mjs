import path from 'node:path';
import dotenv from 'dotenv';
import { neon } from '@neondatabase/serverless';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
const sql = neon(process.env.DATABASE_URL);

async function runMetrics(filters) {
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
			COALESCE(SUM(fi.quantity * p.cost_price), 0) AS total_val_cost
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

	const storeBreakdown = await sql`
		SELECT
			s.name AS store_name,
			COUNT(DISTINCT fi.product_id) AS item_count,
			COALESCE(SUM(fi.quantity), 0) AS total_qty
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
	`;

	return {
		overview: overviewResult[0],
		storeBreakdown,
	};
}

async function testCombination(name, filters) {
  console.log(`\n========================================`);
  console.log(`TEST COMBINATION: ${name}`);
  console.log(`Filters:`, filters);

  const res = await runMetrics(filters);
  console.log(`-> Total SOH: ${res.overview.total_soh} units (${res.overview.total_items} active items)`);
  console.log(`-> MRP Valuation: ₹${res.overview.total_val_mrp}`);
  console.log(`-> Cost Valuation: ₹${res.overview.total_val_cost}`);
  console.log(`-> Store Breakdown:`, res.storeBreakdown);
}

async function run() {
  await testCombination("1. All Stores + All Categories + All Brands", {});
  await testCombination("2. Smart Works Noida (Store Only)", { store: "Smart Works Noida" });
  await testCombination("3. KLJ (Store Only)", { store: "KLJ" });
  await testCombination("4. Head office (Store Only)", { store: "Head office" });
  await testCombination("5. Category = Cosmetics", { category: "Cosmetics" });
  await testCombination("6. Category = Skincare", { category: "Skincare" });
  await testCombination("7. Brand = Go desi", { brand: "Go desi" });
  await testCombination("8. Brand = GIRNAR", { brand: "GIRNAR" });
  await testCombination("9. Store (SWN) + Category (Cosmetics)", { store: "Smart Works Noida", category: "Cosmetics" });
  await testCombination("10. Store (KLJ) + Brand (GIRNAR)", { store: "KLJ", brand: "GIRNAR" });
  await testCombination("11. Store (SWN) + Category (Cosmetics) + Brand (Go desi)", { store: "Smart Works Noida", category: "Cosmetics", brand: "Go desi" });
}

run().catch(console.error);
