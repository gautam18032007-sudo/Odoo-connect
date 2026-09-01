import * as dotenv from 'dotenv';
import * as path from 'path';
import dns from 'node:dns';

if (typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

async function runDataPopulation() {
  console.log('====================================================');
  console.log('🚀 STEP 5: AUTHORITATIVE ODOO SAAS DATA POPULATION');
  console.log('====================================================\n');

  const { OdooClient } = await import('../src/lib/odoo/client.ts');
  const { syncProducts } = await import('../src/lib/odoo/sync/syncProducts.ts');
  const { syncCustomers } = await import('../src/lib/odoo/sync/syncCustomers.ts');
  const { syncSales } = await import('../src/lib/odoo/sync/syncSales.ts');
  const { syncInventory } = await import('../src/lib/odoo/sync/syncInventory.ts');
  const { sql } = await import('../src/lib/db.ts');

  const client = new OdooClient();
  
  console.log('🔐 Authenticating with Odoo 19 Enterprise SaaS...');
  await client.authenticate();
  console.log('✅ Odoo authentication successful!\n');

  // 1. Sync Products
  console.log('📦 1. Syncing Products (product.product)...');
  const productCount = await syncProducts(client, null);
  console.log(`   ✅ Synced ${productCount} products.\n`);

  // 2. Sync Customers
  console.log('👥 2. Syncing Customers (res.partner)...');
  const customerCount = await syncCustomers(client, null);
  console.log(`   ✅ Synced ${customerCount} customers.\n`);

  // 3. Sync Sales Orders & Lines
  console.log('💳 3. Syncing POS & Sales Orders (pos.order, sale.order)...');
  const salesCount = await syncSales(client, null);
  console.log(`   ✅ Synced ${salesCount} sales records.\n`);

  // 4. Sync Inventory
  console.log('📊 4. Syncing Inventory Stock on Hand (stock.quant)...');
  const invCount = await syncInventory(client);
  console.log(`   ✅ Synced ${invCount} inventory stock quants.\n`);

  // 5. Populate sales_fact from canonical facts for compatibility views
  console.log('🔄 5. Populating sales_fact compatibility layer...');
  await sql`
    INSERT INTO upload_batches (id, filename, status, row_count, valid_row_count, upload_type)
    VALUES (1, 'odoo_live_sync_initial', 'completed', 0, 0, 'odoo_initial')
    ON CONFLICT (id) DO NOTHING;
  `;

  await sql`
    INSERT INTO sales_fact (
      upload_id, sale_date, bill_no, billed_by, category, brand,
      sku_code, item_name, product_key, quantity, mrp_amount,
      discount_amount, gross_amount, tax_amount, net_amount,
      payment_method, customer_mobile, customer_name, source_billed_by, store_id
    )
    SELECT
      1 AS upload_id,
      fso.date_order::date AS sale_date,
      fso.name AS bill_no,
      COALESCE(ds.name, 'ZenZebra Flagship') AS billed_by,
      COALESCE(dp.category, 'General') AS category,
      'ZenZebra' AS brand,
      COALESCE(dp.default_code, 'SKU-' || dp.id) AS sku_code,
      COALESCE(dp.name, 'Product Item') AS item_name,
      COALESCE(dp.default_code, 'SKU-' || dp.id) AS product_key,
      fsl.qty::int AS quantity,
      (fsl.price_unit * fsl.qty) AS mrp_amount,
      ((fsl.price_unit * fsl.qty) * (fsl.discount / 100)) AS discount_amount,
      fsl.price_subtotal AS gross_amount,
      fsl.tax_amount AS tax_amount,
      (fsl.price_subtotal + fsl.tax_amount) AS net_amount,
      'POS' AS payment_method,
      COALESCE(dc.mobile, dc.email, '') AS customer_mobile,
      dc.name AS customer_name,
      COALESCE(ds.name, 'ZenZebra Flagship') AS source_billed_by,
      fso.store_id AS store_id
    FROM fact_sales_lines fsl
    JOIN fact_sales_orders fso ON fsl.order_id = fso.id
    LEFT JOIN dim_products dp ON fsl.product_id = dp.id
    LEFT JOIN dim_stores ds ON fso.store_id = ds.id
    LEFT JOIN dim_customers dc ON fso.partner_id = dc.id
    ON CONFLICT DO NOTHING;
  `;

  // Row counts audit
  const [ordersRow] = await sql`SELECT COUNT(*)::int AS count FROM fact_sales_orders`;
  const [linesRow] = await sql`SELECT COUNT(*)::int AS count FROM fact_sales_lines`;
  const [productsRow] = await sql`SELECT COUNT(*)::int AS count FROM dim_products`;
  const [customersRow] = await sql`SELECT COUNT(*)::int AS count FROM dim_customers`;
  const [inventoryRow] = await sql`SELECT COUNT(*)::int AS count FROM fact_inventory`;
  const [salesFactRow] = await sql`SELECT COUNT(*)::int AS count FROM sales_fact`;

  console.log('====================================================');
  console.log('📊 DATA POPULATION SUMMARY:');
  console.log(`   - Orders (fact_sales_orders) : ${ordersRow?.count}`);
  console.log(`   - Lines (fact_sales_lines)   : ${linesRow?.count}`);
  console.log(`   - Products (dim_products)    : ${productsRow?.count}`);
  console.log(`   - Customers (dim_customers)  : ${customersRow?.count}`);
  console.log(`   - Inventory (fact_inventory) : ${inventoryRow?.count}`);
  console.log(`   - Sales Fact (sales_fact)    : ${salesFactRow?.count}`);
  console.log('====================================================\n');
}

runDataPopulation().catch((err) => {
  console.error('❌ Data population failed:', err);
  process.exit(1);
});
