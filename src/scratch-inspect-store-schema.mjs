import path from 'node:path';
import dotenv from 'dotenv';
import { neon } from '@neondatabase/serverless';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
const sql = neon(process.env.DATABASE_URL);

async function run() {
  console.log('=== 1. DIM_STORES ===');
  const dimStores = await sql`SELECT * FROM dim_stores`;
  console.log(dimStores);

  console.log('=== 2. FACT_INVENTORY LOCATIONS ===');
  const factInv = await sql`SELECT location_id, location_name, COUNT(*) as cnt, SUM(quantity) as qty FROM fact_inventory GROUP BY location_id, location_name`;
  console.log(factInv);

  console.log('=== 3. SALES_FACT_V STORE NAMES ===');
  const salesV = await sql`SELECT DISTINCT store_display_name, billed_by FROM sales_fact_v`;
  console.log(salesV);

  console.log('=== 4. FACT_SALES_ORDERS STORE IDS ===');
  const ordersStores = await sql`SELECT DISTINCT store_id FROM fact_sales_orders`;
  console.log(ordersStores);
}

run().catch(console.error);
