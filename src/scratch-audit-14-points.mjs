import path from 'node:path';
import dotenv from 'dotenv';
import { neon } from '@neondatabase/serverless';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
const sql = neon(process.env.DATABASE_URL);

async function run() {
  console.log('=== FORENSIC AUDIT POINT 1: BRAND IDENTITY MAPPING ===');
  const brandTest = await sql`
    SELECT 
      sf.brand,
      COUNT(DISTINCT p.id) as distinct_products,
      SUM(fi.quantity) as total_location_soh,
      SUM(p.qty_available) as total_product_soh
    FROM dim_products p
    LEFT JOIN fact_inventory fi ON p.id = fi.product_id
    JOIN (
      SELECT DISTINCT ON (LOWER(TRIM(item_name))) item_name, sku_code, brand
      FROM sales_fact
      WHERE brand IS NOT NULL AND brand <> ''
    ) sf ON LOWER(TRIM(p.name)) = LOWER(TRIM(sf.item_name)) OR (p.default_code IS NOT NULL AND p.default_code = sf.sku_code) OR (p.barcode IS NOT NULL AND p.barcode = sf.sku_code)
    WHERE p.active = true
    GROUP BY sf.brand
    ORDER BY total_location_soh DESC;
  `;
  console.log('--- BRAND MAPPING RESULTS (FIRST 10) ---', brandTest.slice(0, 10));

  console.log('=== FORENSIC AUDIT POINT 2: CATEGORY MATCHING ===');
  const catTest = await sql`
    SELECT 
      p.category,
      TRIM(p.category) as trimmed_category,
      COUNT(DISTINCT p.id) as item_count,
      SUM(p.qty_available) as soh
    FROM dim_products p
    WHERE p.active = true
    GROUP BY p.category
    ORDER BY soh DESC;
  `;
  console.log('--- CATEGORY MATCHING RESULTS ---', catTest);

  console.log('=== FORENSIC AUDIT POINT 3: STORE LOCATION RESOLUTION ===');
  const storeTest = await sql`
    SELECT 
      s.id as store_id,
      s.name as store_name,
      s.code as store_code,
      s.location_id,
      fi.location_name,
      COUNT(DISTINCT fi.product_id) as item_count,
      SUM(fi.quantity) as total_qty
    FROM dim_stores s
    LEFT JOIN fact_inventory fi ON s.location_id = fi.location_id
    GROUP BY s.id, s.name, s.code, s.location_id, fi.location_name;
  `;
  console.log('--- STORE LOCATION RESOLUTION ---', storeTest);

  console.log('=== FORENSIC AUDIT POINT 4 & 5: GRAIN & ROW MULTIPLICATION TEST ===');
  const grainTest = await sql`
    SELECT 
      COUNT(*) as total_rows_joined,
      COUNT(DISTINCT p.id) as distinct_product_ids,
      COUNT(DISTINCT fi.location_id) as distinct_locations,
      SUM(p.qty_available) as sum_qty_available_with_multiplication,
      SUM(fi.quantity) as sum_fact_inventory_quantity
    FROM dim_products p
    LEFT JOIN fact_inventory fi ON p.id = fi.product_id;
  `;
  console.log('--- GRAIN & ROW MULTIPLICATION TEST ---', grainTest[0]);
}

run().catch(console.error);
