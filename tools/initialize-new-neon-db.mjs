import { neon } from '@neondatabase/serverless';
import { hash } from '@node-rs/argon2';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import dns from 'node:dns';

if (typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const dbUrl = process.env.DATABASE_URL;

if (!dbUrl) {
  console.error('❌ Error: DATABASE_URL is not set in .env.local');
  process.exit(1);
}

const parsed = new URL(dbUrl);
console.log('====================================================');
console.log('🚀 INITIALIZING NEW NEON DATABASE (DYNAMIC ARCHITECTURE)');
console.log('====================================================');
console.log(`🌐 Target Host: ${parsed.hostname}`);
console.log(`📦 Database   : ${parsed.pathname.replace(/^\//, '')}`);
console.log('🔑 Credentials: [REDACTED]');
console.log('----------------------------------------------------\n');

const sql = neon(dbUrl);

const ARGON2_OPTIONS = { algorithm: 2, memoryCost: 65536, timeCost: 3, parallelism: 4 };

async function runInitialization() {
  try {
    // 1. Probe SELECT 1
    console.log('📡 Step 1: Probing connection with `SELECT 1`...');
    const probe = await sql`SELECT 1 AS alive, version() AS ver`;
    console.log('   ✅ Connection successful! PostgreSQL:', probe[0]?.ver?.split(' ')?.slice(0, 2)?.join(' '));
    console.log();

    // 2. Multi-GST Dimension
    console.log('🏛️ Step 2: Creating Multi-GST Registration Dimension (dim_gst_registrations)...');
    await sql`
      CREATE TABLE IF NOT EXISTS dim_gst_registrations (
        id SERIAL PRIMARY KEY,
        gstin TEXT UNIQUE NOT NULL,
        legal_name TEXT NOT NULL,
        state_code TEXT NOT NULL,
        state_name TEXT NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `;
    // Seed default GSTINs
    await sql`
      INSERT INTO dim_gst_registrations (id, gstin, legal_name, state_code, state_name) VALUES
        (1, '07AABCB1234F1Z5', 'ZenZebra Retail Private Limited (Delhi)', '07', 'Delhi'),
        (2, '09AABCB1234F1Z3', 'ZenZebra Retail Private Limited (UP)', '09', 'Uttar Pradesh'),
        (3, '29AABCB1234F1Z8', 'ZenZebra Retail Private Limited (Karnataka)', '29', 'Karnataka')
      ON CONFLICT (gstin) DO UPDATE SET
        legal_name = EXCLUDED.legal_name,
        state_code = EXCLUDED.state_code,
        state_name = EXCLUDED.state_name;
    `;
    console.log('   ✅ Multi-GST registration dimension ready.');
    console.log();

    // 3. Dynamic Store Dimension
    console.log('🏪 Step 3: Creating Dynamic Store Dimension (dim_stores)...');
    await sql`
      CREATE TABLE IF NOT EXISTS dim_stores (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        code TEXT,
        gst_registration_id INTEGER REFERENCES dim_gst_registrations(id) ON DELETE SET NULL,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `;
    await sql`
      INSERT INTO dim_stores (id, name, code, gst_registration_id) VALUES
        (1, 'ZenZebra Flagship', 'ZZ', 1),
        (2, 'KLJ Noida', 'KLJ', 2),
        (3, 'Smartworks Noida', 'SWN', 2)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        code = EXCLUDED.code,
        gst_registration_id = EXCLUDED.gst_registration_id;
    `;
    console.log('   ✅ Store dimension ready.');
    console.log();

    // 4. Dynamic POS Machine Dimension
    console.log('💻 Step 4: Creating Dynamic POS Machine Dimension (dim_pos_configs)...');
    await sql`
      CREATE TABLE IF NOT EXISTS dim_pos_configs (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        store_id INTEGER REFERENCES dim_stores(id) ON DELETE CASCADE,
        picking_type_id INTEGER,
        journal_id INTEGER,
        is_active BOOLEAN DEFAULT TRUE,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `;
    await sql`
      INSERT INTO dim_pos_configs (id, name, store_id) VALUES
        (1, 'Flagship Main Register', 1),
        (2, 'KLJ Noida POS Register', 2),
        (3, 'Smartworks Noida POS Register', 3)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        store_id = EXCLUDED.store_id;
    `;
    console.log('   ✅ POS machine dimension ready.');
    console.log();

    // 5. Product & Customer Dimensions
    console.log('📦 Step 5: Creating Product & Customer Dimensions...');
    await sql`
      CREATE TABLE IF NOT EXISTS dim_products (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        default_code TEXT,
        barcode TEXT,
        list_price NUMERIC(12, 2) DEFAULT 0.00,
        cost_price NUMERIC(12, 2) DEFAULT 0.00,
        qty_available NUMERIC(12, 2) DEFAULT 0.00,
        free_qty NUMERIC(12, 2) DEFAULT 0.00,
        active BOOLEAN DEFAULT TRUE,
        category TEXT,
        brand TEXT DEFAULT 'ZenZebra',
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS dim_customers (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT,
        mobile TEXT,
        city TEXT,
        customer_rank INTEGER DEFAULT 0,
        active BOOLEAN DEFAULT TRUE,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `;
    console.log('   ✅ Product and Customer dimensions ready.');
    console.log();

    // 6. Decoupled Marketing Spend Dimension
    console.log('📈 Step 6: Creating Decoupled Marketing Spend Model (dim_marketing_spend)...');
    await sql`
      CREATE TABLE IF NOT EXISTS dim_marketing_spend (
        id SERIAL PRIMARY KEY,
        store_id INTEGER REFERENCES dim_stores(id) ON DELETE CASCADE,
        period_month DATE NOT NULL,
        monthly_budget NUMERIC(12, 2) NOT NULL,
        channel TEXT DEFAULT 'all',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (store_id, period_month, channel)
      );
    `;
    console.log('   ✅ Marketing spend model ready.');
    console.log();

    // 7. Canonical Fact Tables
    console.log('📊 Step 7: Creating Canonical Fact Tables (fact_sales_orders, fact_sales_lines, fact_inventory)...');
    await sql`
      CREATE TABLE IF NOT EXISTS fact_sales_orders (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        date_order TIMESTAMP WITH TIME ZONE NOT NULL,
        partner_id INTEGER REFERENCES dim_customers(id) ON DELETE SET NULL,
        store_id INTEGER REFERENCES dim_stores(id) ON DELETE SET NULL,
        pos_config_id INTEGER REFERENCES dim_pos_configs(id) ON DELETE SET NULL,
        amount_total NUMERIC(12, 2) DEFAULT 0.00,
        amount_untaxed NUMERIC(12, 2) DEFAULT 0.00,
        amount_tax NUMERIC(12, 2) DEFAULT 0.00,
        state TEXT NOT NULL,
        order_type TEXT NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS fact_sales_lines (
        id TEXT PRIMARY KEY,
        order_id TEXT REFERENCES fact_sales_orders(id) ON DELETE CASCADE,
        product_id INTEGER REFERENCES dim_products(id) ON DELETE RESTRICT,
        price_unit NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
        discount NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
        qty NUMERIC(12, 2) NOT NULL DEFAULT 1.00,
        price_subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
        tax_amount NUMERIC(12, 2) DEFAULT 0.00,
        cgst_amount NUMERIC(12, 2) DEFAULT 0.00,
        sgst_amount NUMERIC(12, 2) DEFAULT 0.00,
        igst_amount NUMERIC(12, 2) DEFAULT 0.00,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS fact_inventory (
        product_id INTEGER REFERENCES dim_products(id) ON DELETE CASCADE,
        location_id INTEGER NOT NULL,
        location_name TEXT,
        quantity NUMERIC(12, 2) DEFAULT 0.00,
        reserved_quantity NUMERIC(12, 2) DEFAULT 0.00,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (product_id, location_id)
      );
    `;
    console.log('   ✅ Canonical fact tables ready.');
    console.log();

    // 8. Telemetry & DLQ
    console.log('📡 Step 8: Creating Sync Telemetry & DLQ Tables...');
    await sql`
      CREATE TABLE IF NOT EXISTS sync_telemetry (
        id SERIAL PRIMARY KEY,
        sync_type TEXT NOT NULL,
        records_processed INTEGER DEFAULT 0,
        status TEXT NOT NULL,
        started_at TIMESTAMP WITH TIME ZONE NOT NULL,
        completed_at TIMESTAMP WITH TIME ZONE,
        error_message TEXT,
        trace_id TEXT,
        worker_id TEXT DEFAULT 'worker_main',
        finished_at TIMESTAMP WITH TIME ZONE,
        duration_ms INTEGER DEFAULT 0,
        poll_interval_ms INTEGER DEFAULT 2000,
        entity TEXT,
        rows_fetched INTEGER DEFAULT 0,
        rows_inserted INTEGER DEFAULT 0,
        rows_updated INTEGER DEFAULT 0,
        rows_skipped INTEGER DEFAULT 0,
        write_date_cursor TEXT,
        odoo_response_ms INTEGER DEFAULT 0,
        database_write_ms INTEGER DEFAULT 0,
        processing_ms INTEGER DEFAULT 0,
        retry_count INTEGER DEFAULT 0,
        queue_length INTEGER DEFAULT 0,
        worker_state TEXT DEFAULT 'active'
      );
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS sync_dead_letter_queue (
        id BIGSERIAL PRIMARY KEY,
        job_type TEXT NOT NULL,
        attempts INTEGER NOT NULL,
        error_message TEXT NOT NULL,
        last_sync_time TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        resolved_at TIMESTAMPTZ,
        status TEXT NOT NULL DEFAULT 'dead_letter'
      );
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS worker_heartbeat (
        worker_id TEXT PRIMARY KEY,
        hostname TEXT,
        state JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `;
    console.log('   ✅ Telemetry and DLQ tables ready.');
    console.log();

    // 9. Staging & Compatibility Tables
    console.log('📋 Step 9: Creating Staging and Compatibility Tables...');
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
      );
    `;
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
      );
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS store_dimension (
        id SERIAL PRIMARY KEY,
        store_code TEXT UNIQUE NOT NULL,
        store_name TEXT UNIQUE NOT NULL,
        display_name TEXT NOT NULL,
        city TEXT,
        active BOOLEAN DEFAULT TRUE,
        opened_date DATE
      );
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS store_alias_mapping (
        id SERIAL PRIMARY KEY,
        source_name TEXT UNIQUE NOT NULL,
        canonical_store TEXT NOT NULL,
        active BOOLEAN DEFAULT TRUE
      );
    `;
    await sql`
      INSERT INTO store_dimension (store_code, store_name, display_name, city) VALUES
        ('SWN01', 'SmartworksNoida Noida', 'Smart Works Noida', 'Noida'),
        ('KLJ01', 'Klj store', 'KLJ', 'Delhi')
      ON CONFLICT (store_name) DO UPDATE SET
        store_code = EXCLUDED.store_code,
        display_name = EXCLUDED.display_name,
        city = EXCLUDED.city;
    `;
    console.log('   ✅ Staging and compatibility tables ready.');
    console.log();

    // 10. Auth Layer & Seed Users
    console.log('🔐 Step 10: Creating Auth Tables & Administrators...');
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        employee_id TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS sessions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `;

    const defaultUsers = [
      { employee_id: 'EMP001', name: 'Diwakar Bhagat', username: 'Diwakarpro01', password: 'Admin@123' },
      { employee_id: 'EMP002', name: 'Gautam', username: 'Gautam12', password: 'Admin@123' },
      { employee_id: 'ZEBRA001', name: 'Zebra Admin', username: 'zebra', password: 'Admin@123' },
    ];

    for (const u of defaultUsers) {
      const passwordHash = await hash(u.password, ARGON2_OPTIONS);
      await sql`
        INSERT INTO users (employee_id, name, username, password_hash)
        VALUES (${u.employee_id}, ${u.name}, ${u.username}, ${passwordHash})
        ON CONFLICT (username) DO UPDATE SET
          name = EXCLUDED.name,
          employee_id = EXCLUDED.employee_id,
          password_hash = EXCLUDED.password_hash;
      `;
      console.log(`   👤 User ready: ${u.username} (${u.name})`);
    }
    console.log('   ✅ Auth layer initialized.');
    console.log();

    // 11. Dynamic Analytical Views (Zero Hardcoded Store Case Statements)
    console.log('👁️ Step 11: Creating Dynamic Analytical Views...');
    await sql`
      CREATE OR REPLACE VIEW sales_fact_v AS
      SELECT
        sf.id,
        sf.upload_id,
        sf.bill_no,
        sf.sale_date,
        sf.billed_by,
        sf.product_key,
        sf.sku_code,
        sf.item_name,
        sf.brand,
        sf.category,
        sf.quantity,
        sf.mrp_amount,
        sf.discount_amount,
        sf.gross_amount,
        sf.tax_amount,
        sf.net_amount,
        sf.customer_mobile,
        sf.customer_name,
        sf.payment_method,
        COALESCE(ds.name, sf.billed_by) AS store_display_name,
        ds.id AS store_id,
        ds.gst_registration_id,
        dg.gstin AS store_gstin,
        dg.state_name AS gst_state
      FROM sales_fact sf
      LEFT JOIN dim_stores ds ON sf.store_id = ds.id OR sf.billed_by = ds.name OR sf.billed_by = ds.code
      LEFT JOIN dim_gst_registrations dg ON ds.gst_registration_id = dg.id;
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
      JOIN upload_batches ub ON sf.upload_id = ub.id;
    `;

    await sql`
      CREATE OR REPLACE VIEW customer_metrics AS
      SELECT
        customer_mobile,
        MAX(customer_name) AS customer_name,
        MIN(sale_date) AS first_purchase_date,
        MAX(sale_date) AS last_purchase_date,
        COUNT(DISTINCT bill_no) AS total_orders,
        SUM(net_amount) AS total_revenue,
        SUM(net_amount) / NULLIF(COUNT(DISTINCT bill_no), 0) AS aov,
        CASE
          WHEN COUNT(DISTINCT bill_no) > 1 THEN
            (MAX(sale_date) - MIN(sale_date))::numeric / (COUNT(DISTINCT bill_no) - 1)
          ELSE NULL
        END AS avg_purchase_gap_days
      FROM sales_fact_v
      WHERE customer_mobile IS NOT NULL AND customer_mobile <> ''
      GROUP BY customer_mobile;
    `;

    await sql`
      CREATE OR REPLACE VIEW customer_ltv AS
      SELECT
        customer_mobile,
        customer_name,
        total_orders AS orders,
        total_revenue AS revenue,
        aov,
        total_revenue AS ltv,
        ROUND(LEAST(100, (total_orders * 10) + (100 / (1 + (CURRENT_DATE - last_purchase_date)))))::int AS retention_score
      FROM customer_metrics;
    `;

    await sql`
      CREATE OR REPLACE VIEW customer_segments AS
      SELECT
        customer_mobile,
        customer_name,
        total_orders,
        total_revenue,
        aov,
        first_purchase_date,
        last_purchase_date,
        CASE WHEN total_orders = 1 THEN 'New' ELSE 'Returning' END AS segment_type
      FROM customer_metrics;
    `;

    await sql`
      CREATE OR REPLACE VIEW customer_retention_summary AS
      SELECT
        DATE_TRUNC('month', first_purchase_date)::date AS cohort_month,
        COUNT(DISTINCT customer_mobile) AS cohort_customers,
        SUM(total_revenue) AS total_cohort_revenue,
        AVG(total_revenue) AS avg_cohort_ltv
      FROM customer_metrics
      GROUP BY cohort_month;
    `;
    console.log('   ✅ Dynamic analytical views created.');
    console.log();

    // 12. Indexes
    console.log('⚡ Step 12: Creating Performance Indexes...');
    await sql`CREATE INDEX IF NOT EXISTS idx_dim_products_sku ON dim_products (default_code);`;
    await sql`CREATE INDEX IF NOT EXISTS idx_dim_customers_mobile ON dim_customers (mobile);`;
    await sql`CREATE INDEX IF NOT EXISTS idx_fact_sales_orders_date ON fact_sales_orders (date_order);`;
    await sql`CREATE INDEX IF NOT EXISTS idx_fact_sales_orders_store ON fact_sales_orders (store_id);`;
    await sql`CREATE INDEX IF NOT EXISTS idx_fact_sales_lines_product ON fact_sales_lines (product_id);`;
    await sql`CREATE INDEX IF NOT EXISTS idx_sales_fact_sale_date ON sales_fact (sale_date);`;
    await sql`CREATE INDEX IF NOT EXISTS idx_sales_fact_billed_by ON sales_fact (billed_by);`;
    await sql`CREATE INDEX IF NOT EXISTS idx_sales_fact_customer_mobile ON sales_fact (customer_mobile);`;
    await sql`CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions (token_hash);`;
    await sql`CREATE INDEX IF NOT EXISTS idx_users_username ON users (username);`;
    console.log('   ✅ Performance indexes ready.');
    console.log();

    // 13. Verification Audit
    console.log('📋 Step 13: Auditing Final New Neon Schema Objects...');
    const objects = await sql`
      SELECT table_name, table_type
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_type, table_name;
    `;

    console.log('\n====================================================');
    console.log(`🎉 Schema Initialization Complete! Total objects: ${objects.length}`);
    console.log('====================================================');
    for (const obj of objects) {
      const icon = obj.table_type === 'VIEW' ? '👁️' : '📋';
      console.log(`   ${icon} [${obj.table_type}] ${obj.table_name}`);
    }
  } catch (err) {
    console.error('\n❌ Initialization error:', err.message);
    process.exit(1);
  }
}

runInitialization();
