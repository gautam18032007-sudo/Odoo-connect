import path from "node:path";
import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

/**
 * Phase 2 data-platform migration for Customer Intelligence.
 *
 * Idempotent and additive (safe to re-run; append-only philosophy preserved):
 *   1. Indexes on identity columns the customer engines scan (mobile, name).
 *      (sale_date / bill_no indexes already exist — not recreated.)
 *   2. mv_customer_identity — materialized lifetime customer layer at
 *      (identity_key × billed_by) grain, so global and store-filtered lifetime
 *      metrics read a small MV instead of re-scanning sales_fact_v.
 *
 * Identity resolution stays in lockstep with customer-identity.ts.
 * The live-SQL path remains the source of truth; verify asserts MV == live.
 *
 *   npm run migrate:customer-analytics
 */

const IDENTITY = `CASE
  WHEN regexp_replace(COALESCE(customer_mobile,''),'\\D','','g') <> '' THEN 'MOBILE_'||regexp_replace(customer_mobile,'\\D','','g')
  WHEN btrim(COALESCE(customer_name,'')) <> '' THEN 'NAME_'||md5(lower(btrim(regexp_replace(customer_name,'\\s+',' ','g'))))
  ELSE 'ANON_'||bill_no END`;
const IDENTITY_SOURCE = `CASE
  WHEN regexp_replace(COALESCE(customer_mobile,''),'\\D','','g') <> '' THEN 'mobile'
  WHEN btrim(COALESCE(customer_name,'')) <> '' THEN 'name'
  ELSE 'anonymous' END`;

async function main() {
	if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL missing");
	const sql = neon(process.env.DATABASE_URL);

	console.log("1/3  Creating identity-column indexes (if missing)…");
	await sql.query(
		`CREATE INDEX IF NOT EXISTS idx_sales_fact_customer_mobile ON sales_fact (customer_mobile)`,
	);
	await sql.query(
		`CREATE INDEX IF NOT EXISTS idx_sales_fact_customer_name ON sales_fact (customer_name)`,
	);
	console.log(
		"     ✓ idx_sales_fact_customer_mobile, idx_sales_fact_customer_name",
	);

	console.log("2/3  Creating mv_customer_identity (if missing)…");
	await sql.query(
		`CREATE MATERIALIZED VIEW IF NOT EXISTS mv_customer_identity AS
     WITH base AS (
       SELECT
         (${IDENTITY}) AS identity_key,
         (${IDENTITY_SOURCE}) AS identity_source,
         billed_by,
         sale_date,
         bill_no,
         net_amount
       FROM sales_fact_v
     )
     SELECT
       identity_key,
       billed_by,
       MIN(identity_source) AS identity_source,
       MIN(sale_date) AS first_purchase,
       MAX(sale_date) AS last_purchase,
       COALESCE(SUM(net_amount), 0) AS lifetime_revenue,
       COUNT(DISTINCT bill_no) AS visit_count,
       COUNT(DISTINCT bill_no) AS lifetime_orders
     FROM base
     GROUP BY identity_key, billed_by
     WITH NO DATA`,
	);
	// Unique index enables REFRESH ... CONCURRENTLY.
	await sql.query(
		`CREATE UNIQUE INDEX IF NOT EXISTS uq_mv_customer_identity ON mv_customer_identity (identity_key, billed_by)`,
	);
	await sql.query(
		`CREATE INDEX IF NOT EXISTS idx_mv_customer_identity_store ON mv_customer_identity (billed_by)`,
	);
	console.log("     ✓ mv_customer_identity + indexes");

	console.log("3/3  Populating mv_customer_identity…");
	// First populate must be non-concurrent (view was created WITH NO DATA).
	await sql.query(`REFRESH MATERIALIZED VIEW mv_customer_identity`);
	const [check] = await sql.query(
		`SELECT COUNT(*)::int AS rows, COUNT(DISTINCT identity_key)::int AS customers,
       COALESCE(SUM(lifetime_revenue),0) AS revenue FROM mv_customer_identity`,
	);
	console.log(
		`     ✓ ${check.rows} rows · ${check.customers} customers · ₹${Number(check.revenue).toFixed(2)} lifetime revenue`,
	);

	console.log(
		"\n✅ Migration complete. Run `npm run verify:customer-intelligence` to confirm MV parity.",
	);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
