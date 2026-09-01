import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const dbUrl = process.env.DATABASE_URL;

if (!dbUrl) {
  console.error('❌ Error: DATABASE_URL is not set in .env.local');
  process.exit(1);
}

const parsed = new URL(dbUrl);
const hostname = parsed.hostname;
const dbName = parsed.pathname.replace(/^\//, '');

console.log('====================================================');
console.log('🔍 PHASE 2: DATABASE CONNECTION & METADATA INSPECTION');
console.log('====================================================');
console.log(`🌐 Configured Host: ${hostname}`);
console.log(`📦 Database Name  : ${dbName}`);
console.log('🔑 Authentication : [REDACTED]');
console.log('----------------------------------------------------');

if (!hostname.includes('ep-broad-boat')) {
  console.warn(`⚠️ WARNING: Host is "${hostname}", not the expected new "ep-broad-boat" instance!`);
}

const sql = neon(dbUrl);

async function runReadOnlyInspection() {
  try {
    // 1. SELECT 1 single probe
    console.log('📡 1. Probing with `SELECT 1`...');
    const testProbe = await sql`SELECT 1 AS alive`;
    console.log('   ✅ `SELECT 1` succeeded! Connection is healthy.\n');

    // 2. PostgreSQL version & settings
    console.log('📋 2. PostgreSQL Version & Info:');
    const versionRes = await sql`SELECT version(), current_schema() AS schema, current_user AS user`;
    console.log(`   🐘 Version : ${versionRes[0]?.version}`);
    console.log(`   📁 Schema  : ${versionRes[0]?.schema}`);
    console.log(`   👤 User    : ${versionRes[0]?.user}\n`);

    // 3. Database Size
    console.log('💾 3. Database Storage:');
    const sizeRes = await sql`SELECT pg_size_pretty(pg_database_size(current_database())) AS total_size`;
    console.log(`   📊 Total Size: ${sizeRes[0]?.total_size}\n`);

    // 4. Installed Extensions
    console.log('🧩 4. Installed Extensions:');
    const extRes = await sql`SELECT extname, extversion FROM pg_extension ORDER BY extname`;
    if (extRes.length === 0) {
      console.log('   (none)');
    } else {
      extRes.forEach(e => console.log(`   - ${e.extname} (${e.extversion})`));
    }
    console.log();

    // 5. Active Connections
    console.log('🔌 5. Active Connections:');
    const connRes = await sql`
      SELECT state, COUNT(*)::int AS count 
      FROM pg_stat_activity 
      WHERE datname = current_database() 
      GROUP BY state
    `;
    connRes.forEach(c => console.log(`   - ${c.state || 'active'}: ${c.count}`));
    console.log();

    // 6. Tables & Approximate Row Counts
    console.log('📊 6. Tables in Public Schema:');
    const tablesRes = await sql`
      SELECT 
        table_name,
        (xpath('/row/cnt/text()', xml_count))[1]::text::int AS row_count
      FROM (
        SELECT 
          table_name, 
          query_to_xml(format('SELECT count(*) AS cnt FROM %I', table_name), false, true, '') AS xml_count
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ) t
      ORDER BY table_name
    `;

    if (tablesRes.length === 0) {
      console.log('   (no base tables found)');
    } else {
      tablesRes.forEach(t => console.log(`   - ${t.table_name}: ~${t.row_count ?? 0} rows`));
    }
    console.log();

    // 7. Views
    console.log('👁️ 7. Views in Public Schema:');
    const viewsRes = await sql`
      SELECT table_name 
      FROM information_schema.views 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `;
    if (viewsRes.length === 0) {
      console.log('   (no views found)');
    } else {
      viewsRes.forEach(v => console.log(`   - ${v.table_name}`));
    }
    console.log();

    // 8. Classification
    console.log('====================================================');
    console.log('🏷️ DATABASE CLASSIFICATION:');
    const expectedCoreTables = ['dim_stores', 'dim_products', 'dim_customers', 'fact_sales_orders', 'fact_sales_lines', 'fact_inventory', 'sales_fact'];
    const foundTableNames = tablesRes.map(t => t.table_name);
    const matchedCount = expectedCoreTables.filter(t => foundTableNames.includes(t)).length;

    let classification = 'A';
    if (tablesRes.length === 0) {
      classification = 'A (Completely empty database)';
    } else if (matchedCount === expectedCoreTables.length) {
      classification = 'C (Contains complete ZenZebra application schema)';
    } else {
      classification = `B (Partially initialized: ${matchedCount}/${expectedCoreTables.length} core tables found)`;
    }
    console.log(`   Result: Class ${classification}`);
    console.log('====================================================');

  } catch (err) {
    console.error('❌ Read-only inspection error:', err.message);
    process.exit(1);
  }
}

runReadOnlyInspection();
