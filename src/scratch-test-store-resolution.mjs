import path from 'node:path';
import dotenv from 'dotenv';
import { neon } from '@neondatabase/serverless';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
const sql = neon(process.env.DATABASE_URL);

async function testStore(storeFilter) {
  console.log(`\nTesting filter: "${storeFilter}"`);
  const res = await sql`
    SELECT 
      s.id, s.name, s.code, s.location_id,
      COALESCE(SUM(fi.quantity), 0) AS total_qty
    FROM dim_stores s
    LEFT JOIN fact_inventory fi ON s.location_id = fi.location_id
    WHERE ${storeFilter}::TEXT IS NULL 
       OR s.name ILIKE ${storeFilter} 
       OR s.code ILIKE ${storeFilter}
       OR s.id IN (
         SELECT so.store_id 
         FROM fact_sales_orders so 
         JOIN sales_fact_v sf ON LOWER(TRIM(so.name)) = LOWER(TRIM(sf.bill_no))
         WHERE sf.store_display_name ILIKE ${storeFilter} OR sf.billed_by ILIKE ${storeFilter}
       )
    GROUP BY s.id, s.name, s.code, s.location_id
  `;
  console.log(res);
}

async function run() {
  await testStore('Smart Works Noida');
  await testStore('KLJ');
  await testStore('Head office');
  await testStore('SWN');
}

run().catch(console.error);
