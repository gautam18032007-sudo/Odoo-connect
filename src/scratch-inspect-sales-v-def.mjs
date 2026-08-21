import path from 'node:path';
import dotenv from 'dotenv';
import { neon } from '@neondatabase/serverless';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
const sql = neon(process.env.DATABASE_URL);

async function run() {
  console.log('=== SALES_FACT_V VIEW DEFINITION ===');
  const viewDef = await sql`
    SELECT pg_get_viewdef('sales_fact_v', true) AS view_definition;
  `;
  console.log(viewDef[0]?.view_definition);

  console.log('=== PRODUCT NAME SAMPLE WITH BRAND VS BRAND IN SALES_FACT_V ===');
  const sampleMatch = await sql`
    SELECT p.id, p.name, p.default_code, p.barcode, p.category, sf.brand, sf.sku_code, sf.product_name
    FROM dim_products p
    LEFT JOIN sales_fact_v sf ON LOWER(TRIM(p.name)) = LOWER(TRIM(sf.product_name)) OR p.default_code = sf.sku_code OR p.barcode = sf.sku_code
    WHERE sf.brand IS NOT NULL
    LIMIT 10;
  `;
  console.log(sampleMatch);

  console.log('=== SOH MATCHED BY PRODUCT NAME / BARCODE / DEFAULT_CODE ===');
  const sohMatch = await sql`
    SELECT 
      COUNT(DISTINCT p.id) as total_products,
      SUM(p.qty_available) as total_soh,
      COUNT(DISTINCT CASE WHEN sf.brand IS NOT NULL THEN p.id END) as matched_products,
      SUM(CASE WHEN sf.brand IS NOT NULL THEN p.qty_available ELSE 0 END) as matched_soh
    FROM dim_products p
    LEFT JOIN (
      SELECT DISTINCT ON (LOWER(TRIM(product_name))) product_name, sku_code, brand
      FROM sales_fact_v
      WHERE brand IS NOT NULL
    ) sf ON LOWER(TRIM(p.name)) = LOWER(TRIM(sf.product_name)) OR p.default_code = sf.sku_code OR p.barcode = sf.sku_code;
  `;
  console.log(sohMatch);
}

run().catch(console.error);
