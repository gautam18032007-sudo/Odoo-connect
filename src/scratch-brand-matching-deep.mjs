import path from 'node:path';
import dotenv from 'dotenv';
import { neon } from '@neondatabase/serverless';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
const sql = neon(process.env.DATABASE_URL);

async function run() {
  console.log('=== BRAND MATCHING DEEP ANALYSIS ===');
  
  // Test 1: Match by item_name / product name
  const matchByName = await sql`
    SELECT 
      COUNT(DISTINCT p.id) as total_products,
      SUM(p.qty_available) as total_soh,
      COUNT(DISTINCT CASE WHEN sf.brand IS NOT NULL THEN p.id END) as matched_products,
      SUM(CASE WHEN sf.brand IS NOT NULL THEN p.qty_available ELSE 0 END) as matched_soh
    FROM dim_products p
    LEFT JOIN (
      SELECT DISTINCT ON (LOWER(TRIM(item_name))) item_name, brand
      FROM sales_fact
      WHERE brand IS NOT NULL AND brand <> ''
    ) sf ON LOWER(TRIM(p.name)) = LOWER(TRIM(sf.item_name));
  `;
  console.log('--- MATCH BY PRODUCT NAME ---', matchByName);

  // Test 2: Match by SKU / barcode / default_code
  const matchBySku = await sql`
    SELECT 
      COUNT(DISTINCT p.id) as total_products,
      SUM(p.qty_available) as total_soh,
      COUNT(DISTINCT CASE WHEN sf.brand IS NOT NULL THEN p.id END) as matched_products,
      SUM(CASE WHEN sf.brand IS NOT NULL THEN p.qty_available ELSE 0 END) as matched_soh
    FROM dim_products p
    LEFT JOIN (
      SELECT DISTINCT ON (sku_code) sku_code, brand
      FROM sales_fact
      WHERE brand IS NOT NULL AND brand <> ''
    ) sf ON p.default_code = sf.sku_code OR p.barcode = sf.sku_code;
  `;
  console.log('--- MATCH BY SKU / BARCODE ---', matchBySku);

  // Test 3: Match by BOTH name OR SKU OR barcode
  const matchCombined = await sql`
    SELECT 
      COUNT(DISTINCT p.id) as total_products,
      SUM(p.qty_available) as total_soh,
      COUNT(DISTINCT CASE WHEN sf.brand IS NOT NULL THEN p.id END) as matched_products,
      SUM(CASE WHEN sf.brand IS NOT NULL THEN p.qty_available ELSE 0 END) as matched_soh
    FROM dim_products p
    LEFT JOIN (
      SELECT DISTINCT ON (LOWER(TRIM(item_name))) item_name, sku_code, brand
      FROM sales_fact
      WHERE brand IS NOT NULL AND brand <> ''
    ) sf ON LOWER(TRIM(p.name)) = LOWER(TRIM(sf.item_name)) 
         OR p.default_code = sf.sku_code 
         OR p.barcode = sf.sku_code;
  `;
  console.log('--- MATCH COMBINED (NAME + SKU + BARCODE) ---', matchCombined);

  // Inspect sample matched brands
  const sampleBrands = await sql`
    SELECT p.id, p.name, p.default_code, p.category, sf.brand
    FROM dim_products p
    JOIN (
      SELECT DISTINCT ON (LOWER(TRIM(item_name))) item_name, sku_code, brand
      FROM sales_fact
      WHERE brand IS NOT NULL AND brand <> ''
    ) sf ON LOWER(TRIM(p.name)) = LOWER(TRIM(sf.item_name)) OR p.default_code = sf.sku_code OR p.barcode = sf.sku_code
    LIMIT 15;
  `;
  console.log('--- SAMPLE MATCHED BRANDS ---', sampleBrands);
}

run().catch(console.error);
