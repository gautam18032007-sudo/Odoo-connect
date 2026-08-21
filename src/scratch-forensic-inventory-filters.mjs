import path from 'node:path';
import dotenv from 'dotenv';
import { neon } from '@neondatabase/serverless';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
const sql = neon(process.env.DATABASE_URL);

async function run() {
  console.log('=== 1. DIM_PRODUCTS COLUMNS & SAMPLE ===');
  const prodSample = await sql`SELECT * FROM dim_products LIMIT 5`;
  console.log(Object.keys(prodSample[0] || {}));
  console.log(prodSample[0]);

  console.log('=== 2. DISTINCT CATEGORIES IN DIM_PRODUCTS ===');
  const categories = await sql`SELECT category, COUNT(*) as product_count, SUM(qty_available) as total_soh FROM dim_products GROUP BY category ORDER BY total_soh DESC`;
  console.log(categories);

  console.log('=== 3. DISTINCT BRANDS IN SALES_FACT_V ===');
  const salesBrands = await sql`SELECT brand, COUNT(DISTINCT sku_code) as sku_count, COUNT(*) as sales_line_count FROM sales_fact_v GROUP BY brand`;
  console.log(salesBrands);

  console.log('=== 4. PRODUCTS WITH SOH MATCHED BY SALES_FACT_V BRAND ===');
  const matchedVsUnmatched = await sql`
    SELECT 
      COUNT(DISTINCT p.id) as total_active_products,
      SUM(p.qty_available) as total_soh,
      COUNT(DISTINCT CASE WHEN EXISTS (SELECT 1 FROM sales_fact_v sf WHERE sf.sku_code = p.default_code) THEN p.id END) as products_with_brand,
      SUM(CASE WHEN EXISTS (SELECT 1 FROM sales_fact_v sf WHERE sf.sku_code = p.default_code) THEN p.qty_available ELSE 0 END) as soh_with_brand,
      COUNT(DISTINCT CASE WHEN NOT EXISTS (SELECT 1 FROM sales_fact_v sf WHERE sf.sku_code = p.default_code) THEN p.id END) as products_without_brand,
      SUM(CASE WHEN NOT EXISTS (SELECT 1 FROM sales_fact_v sf WHERE sf.sku_code = p.default_code) THEN p.qty_available ELSE 0 END) as soh_without_brand
    FROM dim_products p
    WHERE p.active = true
  `;
  console.log(matchedVsUnmatched);
}

run().catch(console.error);
