import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

if (!process.env.DATABASE_URL) {
  console.error('❌ Missing DATABASE_URL in .env.local');
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

async function run() {
  console.log('🚀 Running full schema migration...\n');

  // ── 1. upload_batches ──────────────────────────────────────────────────
  console.log('1️⃣  Creating upload_batches...');
  await sql`
    CREATE TABLE IF NOT EXISTS upload_batches (
      id SERIAL PRIMARY KEY,
      filename TEXT NOT NULL,
      status TEXT NOT NULL,
      row_count INTEGER NOT NULL DEFAULT 0,
      error_count INTEGER NOT NULL DEFAULT 0,
      valid_row_count INTEGER NOT NULL DEFAULT 0,
      quarantined_row_count INTEGER NOT NULL DEFAULT 0,
      date_range_start DATE,
      date_range_end DATE,
      uploaded_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      upload_type TEXT,
      latest_sale_date DATE,
      row_count_raw INTEGER,
      row_count_stored INTEGER,
      rows_quarantined INTEGER,
      stores_found TEXT[],
      categories_found TEXT[],
      net_sales NUMERIC(12,2)
    )
  `;

  // ── 2. sales_fact ──────────────────────────────────────────────────────
  console.log('2️⃣  Creating sales_fact...');
  await sql`
    CREATE TABLE IF NOT EXISTS sales_fact (
      id SERIAL PRIMARY KEY,
      upload_id INTEGER REFERENCES upload_batches(id) ON DELETE CASCADE,
      sale_date DATE NOT NULL,
      bill_no TEXT NOT NULL,
      billed_by TEXT NOT NULL,
      category TEXT,
      brand TEXT,
      sku_code TEXT,
      item_name TEXT,
      product_key TEXT NOT NULL DEFAULT '',
      quantity INTEGER NOT NULL,
      mrp_amount NUMERIC(12,2),
      discount_amount NUMERIC(12,2),
      gross_amount NUMERIC(12,2),
      tax_amount NUMERIC(12,2),
      net_amount NUMERIC(12,2),
      payment_method TEXT,
      customer_mobile TEXT,
      customer_name TEXT,
      source_billed_by TEXT,
      store_id INTEGER
    )
  `;

  // Unique constraint
  await sql`
    DO $$ BEGIN
      ALTER TABLE sales_fact ADD CONSTRAINT uq_sales_fact_key
        UNIQUE (sale_date, bill_no, billed_by, product_key);
    EXCEPTION WHEN duplicate_table THEN NULL;
    END $$
  `;

  // Indexes
  await sql`CREATE INDEX IF NOT EXISTS idx_sales_fact_upload_id ON sales_fact (upload_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_sales_fact_sale_date ON sales_fact (sale_date)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_sales_fact_billed_by ON sales_fact (billed_by)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_sales_fact_category ON sales_fact (category)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_sales_fact_customer_mobile ON sales_fact (customer_mobile)`;

  // ── 3. staging_upload_rows ─────────────────────────────────────────────
  console.log('3️⃣  Creating staging_upload_rows...');
  await sql`
    CREATE TABLE IF NOT EXISTS staging_upload_rows (
      id BIGSERIAL PRIMARY KEY,
      batch_id INTEGER REFERENCES upload_batches(id) ON DELETE CASCADE,
      row_number INTEGER,
      parsed JSONB NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('valid', 'quarantined')),
      error_reason TEXT
    )
  `;

  // ── 4. store_dimension ─────────────────────────────────────────────────
  console.log('4️⃣  Creating store_dimension...');
  await sql`
    CREATE TABLE IF NOT EXISTS store_dimension (
      id SERIAL PRIMARY KEY,
      store_code TEXT UNIQUE NOT NULL,
      store_name TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      city TEXT,
      active BOOLEAN DEFAULT TRUE,
      opened_date DATE
    )
  `;
  await sql`
    INSERT INTO store_dimension (store_code, store_name, display_name, city) VALUES
      ('SWN01', 'SmartworksNoida Noida', 'Smart Works Noida', 'Noida'),
      ('KLJ01', 'Klj store', 'KLJ', 'Delhi')
    ON CONFLICT (store_name) DO UPDATE SET
      store_code = EXCLUDED.store_code,
      display_name = EXCLUDED.display_name,
      city = EXCLUDED.city
  `;

  // ── 5. store_alias_mapping ─────────────────────────────────────────────
  console.log('5️⃣  Creating store_alias_mapping...');
  await sql`
    CREATE TABLE IF NOT EXISTS store_alias_mapping (
      id SERIAL PRIMARY KEY,
      source_name TEXT UNIQUE NOT NULL,
      canonical_store TEXT NOT NULL,
      active BOOLEAN DEFAULT TRUE
    )
  `;
  const mappings = [
    { source: 'smartworksnoida noida', canonical: 'SmartworksNoida Noida' },
    { source: 'surjeet kumar',         canonical: 'SmartworksNoida Noida' },
    { source: 'master admin',          canonical: 'SmartworksNoida Noida' },
    { source: 'smartworksggn ggn',     canonical: 'SmartworksNoida Noida' },
    { source: 'awfisggn ggn',          canonical: 'SmartworksNoida Noida' },
    { source: 'sanjam saluja',         canonical: 'SmartworksNoida Noida' },
    { source: 'deepanshu zz',          canonical: 'SmartworksNoida Noida' },
    { source: 'sonu kumar',            canonical: 'SmartworksNoida Noida' },
    { source: 'klj store',             canonical: 'Klj store' },
  ];
  for (const m of mappings) {
    await sql`
      INSERT INTO store_alias_mapping (source_name, canonical_store)
      VALUES (${m.source}, ${m.canonical})
      ON CONFLICT (source_name) DO UPDATE SET canonical_store = EXCLUDED.canonical_store
    `;
  }

  // ── 6. purchase_orders ────────────────────────────────────────────────
  console.log('6️⃣  Creating purchase_orders...');
  await sql`
    CREATE TABLE IF NOT EXISTS purchase_orders (
      id SERIAL PRIMARY KEY,
      odoo_po_id INTEGER,
      po_number TEXT UNIQUE NOT NULL,
      vendor_name TEXT NOT NULL,
      vendor_email TEXT,
      order_date DATE,
      scheduled_date DATE,
      state TEXT NOT NULL DEFAULT 'draft',
      amount_untaxed NUMERIC(12,2) DEFAULT 0,
      amount_tax NUMERIC(12,2) DEFAULT 0,
      amount_total NUMERIC(12,2) DEFAULT 0,
      currency TEXT DEFAULT 'INR',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  // ── 7. Views ───────────────────────────────────────────────────────────
  console.log('7️⃣  Creating views...');
  await sql`DROP VIEW IF EXISTS sales_fact_v CASCADE`;
  await sql`DROP VIEW IF EXISTS data_freshness CASCADE`;
  await sql`DROP VIEW IF EXISTS customer_metrics CASCADE`;
  await sql`DROP VIEW IF EXISTS customer_ltv CASCADE`;
  await sql`DROP VIEW IF EXISTS customer_segments CASCADE`;
  await sql`DROP VIEW IF EXISTS customer_retention_summary CASCADE`;

  await sql`
    CREATE OR REPLACE VIEW sales_fact_v AS
    SELECT
      sf.id, sf.upload_id, sf.bill_no, sf.sale_date,
      CASE
        WHEN sf.billed_by IN ('Klj store', 'SmartworksNoida Noida') THEN sf.billed_by
        ELSE 'Head office'
      END AS billed_by,
      sf.product_key, sf.sku_code, sf.item_name, sf.brand, sf.category,
      sf.quantity, sf.mrp_amount, sf.discount_amount, sf.gross_amount,
      sf.tax_amount, sf.net_amount, sf.customer_mobile, sf.customer_name,
      sf.payment_method,
      CASE
        WHEN sf.billed_by = 'SmartworksNoida Noida' THEN 'Smart Works Noida'
        WHEN sf.billed_by = 'Klj store' THEN 'KLJ'
        ELSE 'Head office'
      END AS store_display_name
    FROM sales_fact sf
  `;

  await sql`
    CREATE OR REPLACE VIEW data_freshness AS
    SELECT
      MAX(sf.sale_date) AS latest_sale_date,
      CURRENT_DATE - MAX(sf.sale_date) AS days_stale,
      COUNT(DISTINCT sf.bill_no) AS total_bills,
      SUM(sf.net_amount) AS total_revenue,
      MAX(ub.uploaded_at) AS last_upload_at
    FROM sales_fact sf
    JOIN upload_batches ub ON sf.upload_id = ub.id
  `;

  await sql`
    CREATE OR REPLACE VIEW customer_metrics AS
    SELECT
      customer_mobile, MAX(customer_name) AS customer_name,
      MIN(sale_date) AS first_purchase_date, MAX(sale_date) AS last_purchase_date,
      COUNT(DISTINCT bill_no) AS total_orders, SUM(net_amount) AS total_revenue,
      SUM(net_amount) / NULLIF(COUNT(DISTINCT bill_no), 0) AS aov,
      CASE
        WHEN COUNT(DISTINCT bill_no) > 1 THEN
          (MAX(sale_date) - MIN(sale_date))::numeric / (COUNT(DISTINCT bill_no) - 1)
        ELSE NULL
      END AS avg_purchase_gap_days
    FROM sales_fact_v
    WHERE customer_mobile IS NOT NULL AND customer_mobile <> ''
    GROUP BY customer_mobile
  `;

  await sql`
    CREATE OR REPLACE VIEW customer_ltv AS
    SELECT customer_mobile, customer_name, total_orders AS orders,
      total_revenue AS revenue, aov, total_revenue AS ltv,
      ROUND(LEAST(100, (total_orders * 10) + (100 / (1 + (CURRENT_DATE - last_purchase_date)))))::int AS retention_score
    FROM customer_metrics
  `;

  await sql`
    CREATE OR REPLACE VIEW customer_segments AS
    SELECT customer_mobile, customer_name, total_orders, total_revenue, aov,
      first_purchase_date, last_purchase_date,
      CASE WHEN total_orders = 1 THEN 'New' ELSE 'Returning' END AS segment_type
    FROM customer_metrics
  `;

  await sql`
    CREATE OR REPLACE VIEW customer_retention_summary AS
    SELECT DATE_TRUNC('month', first_purchase_date)::date AS cohort_month,
      COUNT(DISTINCT customer_mobile) AS cohort_customers,
      SUM(total_revenue) AS total_cohort_revenue, AVG(total_revenue) AS avg_cohort_ltv
    FROM customer_metrics
    GROUP BY cohort_month
  `;

  // ── Final check ────────────────────────────────────────────────────────
  const tables = await sql`
    SELECT table_name, table_type
    FROM information_schema.tables
    WHERE table_schema = 'public'
    ORDER BY table_type, table_name
  `;

  console.log('\n✅ All done! Tables & views created:\n');
  for (const t of tables) {
    const icon = t.table_type === 'VIEW' ? '👁 ' : '📋';
    console.log(`  ${icon} ${t.table_name}`);
  }
}

run().catch(err => { console.error('❌ Migration failed:', err.message); process.exit(1); });
