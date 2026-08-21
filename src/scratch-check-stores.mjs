import path from 'node:path';
import dotenv from 'dotenv';
import { neon } from '@neondatabase/serverless';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
const sql = neon(process.env.DATABASE_URL);

async function run() {
  console.log('--- DIM_STORES ---');
  const stores = await sql`SELECT * FROM dim_stores`;
  console.log(JSON.stringify(stores, null, 2));

  console.log('--- FACT_INVENTORY LOCATIONS ---');
  const inv = await sql`SELECT location_id, location_name, COUNT(*) as item_count, SUM(quantity) as total_qty FROM fact_inventory GROUP BY location_id, location_name`;
  console.log(JSON.stringify(inv, null, 2));

  console.log('--- SALES STORES ---');
  const salesStores = await sql`SELECT DISTINCT store_display_name, billed_by FROM sales_fact_v`;
  console.log(JSON.stringify(salesStores, null, 2));
}

run().catch(console.error);
