import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_w7COfdHcGB0N@ep-purple-bird-ayuy6x74-pooler.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require';
if (!process.env.DATABASE_URL) {
  try {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const envPath = path.resolve(process.cwd(), '.env.local');
    if (fs.existsSync(envPath)) {
      const envConfig = fs.readFileSync(envPath, 'utf8');
      for (const line of envConfig.split('\n')) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
          const [key, ...val] = trimmed.split('=');
          if (key.trim() === 'DATABASE_URL') {
            process.env.DATABASE_URL = val.join('=').replace(/^["']|["']$/g, '');
          }
        }
      }
    }
  } catch (e) {}
}
const dbUrl = process.env.DATABASE_URL || DATABASE_URL;
const sql = neon(dbUrl);

// Simulate the exact query from customer-retention-cohort.ts
const CUSTOMER_IDENTITY_KEY_SQL = `COALESCE(NULLIF(TRIM(customer_mobile), ''), NULLIF(TRIM(customer_name), ''))`;
const IS_IDENTIFIED_SQL = `(${CUSTOMER_IDENTITY_KEY_SQL}) IS NOT NULL`;

try {
  const queryString = `
    WITH base AS (
      SELECT
        (${CUSTOMER_IDENTITY_KEY_SQL}) AS ck,
        date_trunc('month', sale_date)::date AS m,
        bill_no,
        net_amount
      FROM sales_fact_v
      WHERE sale_date <= $1::date
        AND ($2::text IS NULL OR billed_by = $2)
        AND ($3::text IS NULL OR category = $3)
        AND ($4::text IS NULL OR brand = $4)
        AND ($5::text[] IS NULL OR category <> ALL($5::text[]))
        AND ${IS_IDENTIFIED_SQL}
    ),
    cohort AS (
      SELECT ck, MIN(m) AS cohort_month
      FROM base
      GROUP BY ck
    ),
    activity AS (
      SELECT
        c.cohort_month,
        b.m AS activity_month,
        COUNT(DISTINCT b.ck) AS active_customers,
        SUM(b.net_amount) AS revenue,
        COUNT(DISTINCT b.bill_no) AS bills
      FROM base b
      JOIN cohort c ON c.ck = b.ck
      GROUP BY c.cohort_month, b.m
    )
    SELECT
      to_char(cohort_month, 'YYYY-MM') AS cohort_month,
      to_char(activity_month, 'YYYY-MM') AS activity_month,
      active_customers,
      revenue::numeric AS revenue,
      bills,
      ((EXTRACT(YEAR FROM activity_month) - EXTRACT(YEAR FROM cohort_month)) * 12
        + (EXTRACT(MONTH FROM activity_month) - EXTRACT(MONTH FROM cohort_month)))::integer AS month_offset
    FROM activity
    ORDER BY cohort_month, month_offset`;

  const rows = await sql.query(queryString, [
    '2026-06-30', // currentEnd
    null,         // store
    null,         // category
    null,         // brand
    null,         // food exclusion
  ]);

  console.log('\n📊 RETENTION COHORT RAW DATA:');
  console.log(`Total activity rows: ${rows.length}`);
  
  // Summarize by cohort
  const byCohort = {};
  for (const row of rows) {
    const key = row.cohort_month;
    if (!byCohort[key]) byCohort[key] = { size: 0, cells: [] };
    if (row.month_offset === 0) byCohort[key].size = Number(row.active_customers);
    byCohort[key].cells.push({
      offset: row.month_offset,
      active: Number(row.active_customers),
      retention: row.month_offset === 0 ? 100 : 0, // will calc
      revenue: Number(row.revenue),
    });
  }

  console.log('\n🗓️  COHORT SUMMARY (last 6 months):');
  const sortedKeys = Object.keys(byCohort).sort().slice(-6);
  for (const key of sortedKeys) {
    const cohort = byCohort[key];
    const size = cohort.size;
    console.log(`\n${key} cohort — ${size} customers acquired:`);
    for (const cell of cohort.cells.slice(0, 6)) {
      const ret = size > 0 ? Math.round((cell.active / size) * 1000) / 10 : 0;
      console.log(`  M+${cell.offset}: ${cell.active} active → ${ret}% retention | ₹${Math.round(cell.revenue).toLocaleString('en-IN')} revenue`);
    }
  }

  // Count identified customers
  const totalIdentified = Object.values(byCohort).reduce((sum, c) => sum + c.size, 0);
  console.log(`\n✅ Total identified customers across all cohorts: ${totalIdentified}`);

} catch (err) {
  console.error('❌ Error:', err.message);
  console.error(err.stack);
}
