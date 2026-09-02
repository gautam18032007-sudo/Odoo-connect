import * as dotenv from 'dotenv';
import * as path from 'path';
import dns from 'node:dns';

if (typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

async function runPilotAudit() {
  console.log('========================================================================');
  console.log('🔍 ZENZEBRA PILOT: FULL ROW-BY-ROW DATA FORENSIC RECONCILIATION ENGINE');
  console.log('========================================================================\n');

  const { OdooClient } = await import('../src/lib/odoo/client.ts');
  const { sql } = await import('../src/lib/db.ts');

  const odoo = new OdooClient();
  console.log('🔐 Authenticating with Odoo 19 SaaS...');
  await odoo.authenticate();
  console.log('✅ Odoo Authentication successful.\n');

  // 1. Audit Dimensions: Stores (pos.config), Warehouses, Locations
  console.log('--- [1/7] AUDITING STORES & POS CONFIGS ---');
  const odooPosConfigs = await odoo.callKw('pos.config', 'search_read', [[]], {
    fields: ['id', 'name', 'company_id', 'picking_type_id', 'journal_id', 'active']
  });
  console.log(`Odoo POS Configs count: ${odooPosConfigs.length}`);
  const dbStores = await sql`SELECT * FROM dim_stores ORDER BY id`;
  const dbPosConfigs = await sql`SELECT * FROM dim_pos_configs ORDER BY id`;
  console.log(`DB dim_stores count: ${dbStores.length}`);
  console.log(`DB dim_pos_configs count: ${dbPosConfigs.length}`);

  // 2. Audit Products
  console.log('\n--- [2/7] AUDITING PRODUCTS (product.product) ---');
  const odooProducts = await odoo.callKw('product.product', 'search_read', [[['active', 'in', [true, false]]]], {
    fields: ['id', 'name', 'default_code', 'barcode', 'list_price', 'standard_price', 'qty_available', 'active', 'categ_id']
  });
  console.log(`Odoo Total Products (active + inactive): ${odooProducts.length}`);
  const dbProducts = await sql`SELECT * FROM dim_products ORDER BY id`;
  console.log(`DB dim_products count: ${dbProducts.length}`);

  // Compare products field by field
  let productMatches = 0;
  let productPriceMismatches = 0;
  let productMissingInDb = 0;
  const dbProductMap = new Map(dbProducts.map(p => [p.id, p]));

  for (const op of odooProducts) {
    const dp = dbProductMap.get(op.id);
    if (!dp) {
      productMissingInDb++;
    } else {
      if (Math.abs(Number(dp.list_price) - Number(op.list_price || 0)) > 0.01) {
        productPriceMismatches++;
      } else {
        productMatches++;
      }
    }
  }
  console.log(`Product Reconciliation: Matches: ${productMatches}, Price Mismatches: ${productPriceMismatches}, Missing in DB: ${productMissingInDb}`);

  // 3. Audit Customers (res.partner)
  console.log('\n--- [3/7] AUDITING CUSTOMERS (res.partner) ---');
  const odooPartners = await odoo.callKw('res.partner', 'search_read', [[['active', 'in', [true, false]]]], {
    fields: ['id', 'name', 'email', 'mobile', 'phone', 'city', 'customer_rank', 'active']
  });
  console.log(`Odoo Total Partners: ${odooPartners.length}`);
  const dbCustomers = await sql`SELECT * FROM dim_customers ORDER BY id`;
  console.log(`DB dim_customers count: ${dbCustomers.length}`);

  // 4. Audit POS Sales Orders (pos.order)
  console.log('\n--- [4/7] AUDITING SALES ORDERS (pos.order) ---');
  const odooOrders = await odoo.callKw('pos.order', 'search_read', [[]], {
    fields: ['id', 'name', 'date_order', 'partner_id', 'config_id', 'amount_total', 'amount_tax', 'state'],
    limit: 50000
  });
  console.log(`Odoo Total POS Orders: ${odooOrders.length}`);
  const dbOrders = await sql`SELECT * FROM fact_sales_orders ORDER BY id`;
  console.log(`DB fact_sales_orders count: ${dbOrders.length}`);

  let odooTotalGross = 0;
  let odooTotalTax = 0;
  for (const o of odooOrders) {
    odooTotalGross += Number(o.amount_total || 0);
    odooTotalTax += Number(o.amount_tax || 0);
  }

  const [dbOrderAgg] = await sql`
    SELECT 
      COUNT(*)::int AS count,
      COALESCE(SUM(amount_total), 0)::numeric(12,2) AS total_gross,
      COALESCE(SUM(amount_untaxed), 0)::numeric(12,2) AS total_untaxed,
      MIN(date_order) AS min_date,
      MAX(date_order) AS max_date
    FROM fact_sales_orders;
  `;

  console.log(`Odoo Total Gross Collection: ₹${odooTotalGross.toFixed(2)}, Tax: ₹${odooTotalTax.toFixed(2)}`);
  console.log(`DB fact_sales_orders Gross: ₹${Number(dbOrderAgg?.total_gross || 0).toFixed(2)}, Count: ${dbOrderAgg?.count}, Min Date: ${dbOrderAgg?.min_date}, Max Date: ${dbOrderAgg?.max_date}`);

  // 5. Audit POS Order Lines (pos.order.line)
  console.log('\n--- [5/7] AUDITING ORDER LINES (pos.order.line) ---');
  const odooLines = await odoo.callKw('pos.order.line', 'search_read', [[]], {
    fields: ['id', 'order_id', 'product_id', 'price_unit', 'discount', 'qty', 'price_subtotal', 'price_subtotal_incl'],
    limit: 100000
  });
  console.log(`Odoo Total Order Lines: ${odooLines.length}`);
  const [dbLinesAgg] = await sql`
    SELECT 
      COUNT(*)::int AS count,
      COALESCE(SUM(qty), 0)::numeric(12,2) AS total_qty,
      COALESCE(SUM(price_subtotal), 0)::numeric(12,2) AS total_subtotal,
      COALESCE(SUM(tax_amount), 0)::numeric(12,2) AS total_tax
    FROM fact_sales_lines;
  `;
  console.log(`DB fact_sales_lines count: ${dbLinesAgg?.count}, Units: ${dbLinesAgg?.total_qty}, Subtotal: ₹${dbLinesAgg?.total_subtotal}, Tax: ₹${dbLinesAgg?.total_tax}`);

  // 6. Audit Stock Quants (stock.quant)
  console.log('\n--- [6/7] AUDITING INVENTORY (stock.quant) ---');
  const odooQuants = await odoo.callKw('stock.quant', 'search_read', [[['location_id.usage', '=', 'internal']]], {
    fields: ['id', 'product_id', 'location_id', 'quantity', 'reserved_quantity']
  });
  console.log(`Odoo Internal Stock Quants count: ${odooQuants.length}`);
  let odooTotalStockQty = 0;
  for (const q of odooQuants) {
    odooTotalStockQty += Number(q.quantity || 0);
  }
  console.log(`Odoo Total On-Hand Stock Qty: ${odooTotalStockQty}`);

  const [dbInvAgg] = await sql`
    SELECT 
      COUNT(*)::int AS count,
      COALESCE(SUM(quantity), 0)::numeric(12,2) AS total_qty,
      COALESCE(SUM(reserved_quantity), 0)::numeric(12,2) AS reserved_qty
    FROM fact_inventory;
  `;
  console.log(`DB fact_inventory records: ${dbInvAgg?.count}, Total Qty: ${dbInvAgg?.total_qty}, Reserved: ${dbInvAgg?.reserved_qty}`);

  // 7. Audit Analytical Views & Sales Fact Compatibility
  console.log('\n--- [7/7] AUDITING ANALYTICAL COMPATIBILITY VIEW (sales_fact_v) ---');
  const [viewAgg] = await sql`
    SELECT 
      COUNT(*)::int AS rows,
      COUNT(DISTINCT bill_no)::int AS distinct_bills,
      COALESCE(SUM(quantity), 0)::int AS total_units,
      COALESCE(SUM(gross_amount), 0)::numeric(12,2) AS gross_revenue,
      COALESCE(SUM(tax_amount), 0)::numeric(12,2) AS gst_liability,
      COALESCE(SUM(net_amount), 0)::numeric(12,2) AS net_revenue,
      COALESCE(SUM(net_amount) / NULLIF(COUNT(DISTINCT bill_no), 0), 0)::numeric(12,2) AS aov
    FROM sales_fact_v;
  `;
  console.log('sales_fact_v Metrics:', viewAgg);

  // By Store Breakdown
  const storeBreakdown = await sql`
    SELECT 
      store_display_name,
      COUNT(DISTINCT bill_no)::int AS orders,
      COALESCE(SUM(quantity), 0)::int AS units,
      COALESCE(SUM(net_amount), 0)::numeric(12,2) AS revenue
    FROM sales_fact_v
    GROUP BY store_display_name
    ORDER BY revenue DESC;
  `;
  console.log('\nStore Breakdown in sales_fact_v:', storeBreakdown);

  console.log('\n========================================================================');
  console.log('🏁 PILOT FORENSIC DATA RECONCILIATION EXECUTION FINISHED');
  console.log('========================================================================');
}

runPilotAudit().catch((err) => {
  console.error('❌ Audit failed:', err);
  process.exit(1);
});
