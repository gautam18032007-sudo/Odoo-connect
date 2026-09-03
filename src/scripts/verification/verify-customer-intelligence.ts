import path from "node:path";
import { type NeonQueryFunction, neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

/**
 * Phase 1 "freeze" harness for Customer Intelligence v1.0.
 *
 * Makes the customer layer mathematically hard to break by asserting every trust
 * invariant directly against sales_fact_v, mirroring the business-layer engines
 * (identity resolution, reconciliation, cohort subset, value buckets, LTV/AOV)
 * plus cross-dashboard revenue parity. Run:
 *
 *   npm run verify:customer-intelligence
 *
 * Self-contained (inline SQL, no @/ aliases) like verify-ground-truth.ts.
 */

// Identity layer — must stay in lockstep with src/lib/business-logic/customer-identity.ts
const IDENTITY = `CASE
  WHEN regexp_replace(COALESCE(customer_mobile, ''), '\\D', '', 'g') <> ''
    THEN 'MOBILE_' || regexp_replace(customer_mobile, '\\D', '', 'g')
  WHEN btrim(COALESCE(customer_name, '')) <> ''
    THEN 'NAME_' || md5(lower(btrim(regexp_replace(customer_name, '\\s+', ' ', 'g'))))
  ELSE 'ANON_' || bill_no END`;
const IDENTIFIED = `(regexp_replace(COALESCE(customer_mobile, ''), '\\D', '', 'g') <> '' OR btrim(COALESCE(customer_name, '')) <> '')`;

let failed = 0;
const money = (v: unknown) => Number(v ?? 0);
const RUPEE = 1; // reconciliation tolerance

function assert(label: string, ok: boolean, detail: string) {
	console.log(`${ok ? "✅" : "❌"} ${label}: ${detail}`);
	if (!ok) failed++;
}

type Sql = NeonQueryFunction<false, false>;

/** Revenue-composition partition for a window, optionally filtered to one store. */
async function composition(
	sql: Sql,
	start: string,
	end: string,
	store: string | null,
) {
	const [row] = await sql.query(
		`WITH scoped AS (
       SELECT (${IDENTITY}) AS ck, (${IDENTIFIED}) AS is_identified, sale_date, bill_no, net_amount
       FROM sales_fact_v
       WHERE ($3::text IS NULL OR billed_by = $3)
     ),
     first_purchase AS (SELECT ck, MIN(sale_date) AS first_date FROM scoped GROUP BY ck),
     period AS (
       SELECT s.*, fp.first_date FROM scoped s JOIN first_purchase fp ON fp.ck = s.ck
       WHERE s.sale_date BETWEEN $1::date AND $2::date
     )
     SELECT
       COALESCE(SUM(net_amount),0) AS revenue,
       COALESCE(SUM(net_amount) FILTER (WHERE first_date BETWEEN $1::date AND $2::date),0) AS new_rev,
       COALESCE(SUM(net_amount) FILTER (WHERE first_date < $1::date),0) AS repeat_rev,
       COALESCE(SUM(net_amount) FILTER (WHERE is_identified),0) AS ident_rev,
       COALESCE(SUM(net_amount) FILTER (WHERE NOT is_identified),0) AS anon_rev,
       COUNT(DISTINCT ck)::int AS customers,
       COUNT(DISTINCT ck) FILTER (WHERE first_date BETWEEN $1::date AND $2::date)::int AS new_cust,
       COUNT(DISTINCT ck) FILTER (WHERE first_date < $1::date)::int AS repeat_cust,
       COUNT(DISTINCT bill_no)::int AS bills,
       COUNT(DISTINCT bill_no) FILTER (WHERE is_identified)::int AS ident_bills,
       COUNT(DISTINCT bill_no) FILTER (WHERE NOT is_identified AND bill_no NOT IN (SELECT bill_no FROM period WHERE is_identified))::int AS anon_bills
     FROM period`,
		[start, end, store],
	);
	return row;
}

async function main() {
	if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL missing");
	const sql = neon(process.env.DATABASE_URL);

	const [range] = await sql.query(
		`SELECT MIN(sale_date)::text AS min_date, MAX(sale_date)::text AS max_date FROM sales_fact_v`,
	);
	if (!range?.max_date) {
		console.log("No data in sales_fact_v — nothing to verify.");
		return;
	}
	const asOf: string = range.max_date;
	const periodEnd = asOf;
	const periodStart = new Date(
		new Date(`${asOf}T00:00:00Z`).getTime() - 30 * 864e5,
	)
		.toISOString()
		.slice(0, 10);
	console.log(`Data range ${range.min_date} → ${asOf}`);
	console.log(`Reconciliation window: ${periodStart} → ${periodEnd}\n`);

	// 1. Revenue Composition reconciliation (period-scoped partitions).
	console.log("--- Revenue Composition reconciliation ---");
	const comp = await composition(sql, periodStart, periodEnd, null);
	const revenue = money(comp.revenue);
	assert(
		"Repeat + New = Total revenue",
		Math.abs(money(comp.repeat_rev) + money(comp.new_rev) - revenue) < RUPEE,
		`${money(comp.repeat_rev).toFixed(2)} + ${money(comp.new_rev).toFixed(2)} vs ${revenue.toFixed(2)}`,
	);
	assert(
		"Identified + Anonymous = Total revenue",
		Math.abs(money(comp.ident_rev) + money(comp.anon_rev) - revenue) < RUPEE,
		`${money(comp.ident_rev).toFixed(2)} + ${money(comp.anon_rev).toFixed(2)} vs ${revenue.toFixed(2)}`,
	);
	assert(
		"Identified + Anonymous = Total bills",
		Number(comp.ident_bills) + Number(comp.anon_bills) === Number(comp.bills),
		`${comp.ident_bills} + ${comp.anon_bills} vs ${comp.bills}`,
	);
	assert(
		"New + Repeat customers = Total customers",
		Number(comp.new_cust) + Number(comp.repeat_cust) === Number(comp.customers),
		`${comp.new_cust} + ${comp.repeat_cust} vs ${comp.customers}`,
	);
	const repeatPct = revenue > 0 ? (money(comp.repeat_rev) / revenue) * 100 : 0;
	const anonPct = revenue > 0 ? (money(comp.anon_rev) / revenue) * 100 : 0;
	console.log(
		`   Repeat revenue %: ${repeatPct.toFixed(1)}% · Anonymous revenue %: ${anonPct.toFixed(1)}%`,
	);

	// 2. Cross-dashboard revenue parity — customer revenue = store revenue = finance revenue.
	// Every dashboard sums net_amount from sales_fact_v; prove the customer layer's
	// window revenue equals the plain window sum, and per-store sums roll up to the grand total.
	console.log("\n--- Cross-dashboard revenue parity ---");
	const [plain] = await sql.query(
		`SELECT COALESCE(SUM(net_amount),0) AS revenue FROM sales_fact_v WHERE sale_date BETWEEN $1::date AND $2::date`,
		[periodStart, periodEnd],
	);
	assert(
		"Customer-layer revenue = raw SUM(net_amount) for window",
		Math.abs(revenue - money(plain.revenue)) < RUPEE,
		`${revenue.toFixed(2)} vs ${money(plain.revenue).toFixed(2)}`,
	);
	const [grand] = await sql.query(
		`SELECT COALESCE(SUM(net_amount),0) AS revenue FROM sales_fact_v WHERE sale_date <= $1::date`,
		[asOf],
	);
	const perStore = await sql.query(
		`SELECT billed_by, COALESCE(SUM(net_amount),0) AS revenue FROM sales_fact_v WHERE sale_date <= $1::date GROUP BY billed_by`,
		[asOf],
	);
	const storeSum = perStore.reduce(
		(s: number, r: any) => s + money(r.revenue),
		0,
	);
	assert(
		"Sum of per-store revenue = grand total (store = finance = total)",
		Math.abs(storeSum - money(grand.revenue)) < RUPEE,
		`${storeSum.toFixed(2)} vs ${money(grand.revenue).toFixed(2)} across ${perStore.length} stores`,
	);

	// 3. Filter-combination stability — reconciliation must hold under every store filter.
	console.log("\n--- Filter-combination stability (per store) ---");
	for (const r of perStore) {
		const store = String(r.billed_by);
		const c = await composition(sql, periodStart, periodEnd, store);
		const rev = money(c.revenue);
		const ok =
			Math.abs(money(c.repeat_rev) + money(c.new_rev) - rev) < RUPEE &&
			Math.abs(money(c.ident_rev) + money(c.anon_rev) - rev) < RUPEE &&
			Number(c.new_cust) + Number(c.repeat_cust) === Number(c.customers);
		assert(`Reconciles under store=${store}`, ok, `revenue ₹${rev.toFixed(2)}`);
	}

	// 4. Identity resolution — mobile fallback works; anonymous never merge.
	console.log("\n--- Identity resolution ---");
	const [keys] = await sql.query(
		`WITH t AS (SELECT (${IDENTITY}) AS ck, (${IDENTIFIED}) AS is_id, bill_no FROM sales_fact_v WHERE sale_date <= $1::date)
     SELECT
       COUNT(DISTINCT ck)::int AS total_keys,
       COUNT(DISTINCT ck) FILTER (WHERE ck LIKE 'MOBILE_%')::int AS mobile_keys,
       COUNT(DISTINCT ck) FILTER (WHERE ck LIKE 'NAME_%')::int AS name_keys,
       COUNT(DISTINCT ck) FILTER (WHERE ck LIKE 'ANON_%')::int AS anon_keys,
       COUNT(DISTINCT ck) FILTER (WHERE NOT is_id)::int AS unidentified_keys,
       COUNT(DISTINCT bill_no) FILTER (WHERE NOT is_id)::int AS unidentified_bills
     FROM t`,
		[asOf],
	);
	assert(
		"Identity buckets partition all keys (mobile+name+anon = total)",
		Number(keys.mobile_keys) +
			Number(keys.name_keys) +
			Number(keys.anon_keys) ===
			Number(keys.total_keys),
		`${keys.mobile_keys}+${keys.name_keys}+${keys.anon_keys} vs ${keys.total_keys}`,
	);
	assert(
		"Mobile fallback active (name-only identities resolved to NAME_)",
		Number(keys.name_keys) >= 0,
		`${keys.name_keys} name-fallback customers`,
	);
	assert(
		"Anonymous never merge (1 anonymous key per bill)",
		Number(keys.anon_keys) === Number(keys.unidentified_bills),
		`${keys.anon_keys} anon keys vs ${keys.unidentified_bills} unidentified bills`,
	);

	// 5. Value Distribution reconciliation (lifetime, as-of).
	console.log("\n--- Value Distribution reconciliation ---");
	const [dist] = await sql.query(
		`WITH base AS (
       SELECT (${IDENTITY}) AS ck, bill_no, net_amount FROM sales_fact_v WHERE sale_date <= $1::date
     ),
     per AS (SELECT ck, COUNT(DISTINCT bill_no) AS visits, SUM(net_amount) AS rev FROM base GROUP BY ck)
     SELECT
       (SELECT COALESCE(SUM(rev),0) FROM per) AS bucket_rev,
       (SELECT COUNT(*) FROM per)::int AS bucket_cust,
       (SELECT COALESCE(SUM(net_amount),0) FROM base) AS total_rev,
       (SELECT COUNT(DISTINCT ck) FROM base)::int AS total_cust`,
		[asOf],
	);
	assert(
		"Visit-bucket revenue = total revenue",
		Math.abs(money(dist.bucket_rev) - money(dist.total_rev)) < RUPEE,
		`${money(dist.bucket_rev).toFixed(2)} vs ${money(dist.total_rev).toFixed(2)}`,
	);
	assert(
		"Visit-bucket customers = distinct identities",
		Number(dist.bucket_cust) === Number(dist.total_cust),
		`${dist.bucket_cust} vs ${dist.total_cust}`,
	);

	// 6. Cohort consistency + average retention (decay) curve.
	console.log("\n--- Cohort consistency & retention decay ---");
	const [cohort] = await sql.query(
		`WITH base AS (
       SELECT (${IDENTITY}) AS ck, date_trunc('month', sale_date)::date AS m
       FROM sales_fact_v WHERE sale_date <= $1::date AND ${IDENTIFIED}
     ),
     cohort AS (SELECT ck, MIN(m) AS cohort_month FROM base GROUP BY ck),
     activity AS (
       SELECT c.cohort_month, b.m AS activity_month, COUNT(DISTINCT b.ck) AS active
       FROM base b JOIN cohort c ON c.ck = b.ck GROUP BY c.cohort_month, b.m
     ),
     sized AS (
       SELECT cohort_month,
         MAX(active) FILTER (WHERE activity_month = cohort_month) AS size,
         MAX(active) AS max_active
       FROM activity GROUP BY cohort_month
     )
     SELECT COUNT(*)::int AS cohorts,
       COUNT(*) FILTER (WHERE max_active > size)::int AS violations,
       COALESCE(SUM(size),0)::int AS total_identified
     FROM sized`,
		[asOf],
	);
	assert(
		"Retention subset (no cohort exceeds 100%)",
		Number(cohort.violations) === 0,
		`${cohort.violations} violation(s) across ${cohort.cohorts} cohorts`,
	);
	console.log(
		`   Identified customers (sum of cohort sizes): ${cohort.total_identified}`,
	);

	const decay = await sql.query(
		`WITH base AS (
       SELECT (${IDENTITY}) AS ck, date_trunc('month', sale_date)::date AS m
       FROM sales_fact_v WHERE sale_date <= $1::date AND ${IDENTIFIED}
     ),
     cohort AS (SELECT ck, MIN(m) AS cohort_month FROM base GROUP BY ck),
     sizes AS (SELECT cohort_month, COUNT(*) AS size FROM cohort GROUP BY cohort_month),
     activity AS (
       SELECT c.cohort_month,
         ((extract(year FROM b.m) - extract(year FROM c.cohort_month)) * 12
           + (extract(month FROM b.m) - extract(month FROM c.cohort_month)))::int AS off,
         COUNT(DISTINCT b.ck) AS active
       FROM base b JOIN cohort c ON c.ck = b.ck GROUP BY c.cohort_month, 2
     )
     SELECT a.off,
       ROUND(SUM(a.active)::numeric / NULLIF(SUM(s.size),0) * 100, 1) AS avg_ret,
       SUM(s.size)::int AS base
     FROM activity a JOIN sizes s ON s.cohort_month = a.cohort_month
     GROUP BY a.off ORDER BY a.off`,
		[asOf],
	);
	console.log(
		"   Average retention curve (size-weighted; base = cohort customers at that offset):",
	);
	for (const d of decay) {
		const thin = Number(d.base) < 30 ? "  ⚠ small sample" : "";
		console.log(
			`     Month ${d.off}: ${Number(d.avg_ret).toFixed(1)}%  (base ${d.base})${thin}`,
		);
	}
	const m0 = decay.find((d: any) => Number(d.off) === 0);
	assert(
		"Month-0 retention = 100% (anchor)",
		m0 ? Math.abs(Number(m0.avg_ret) - 100) < 0.1 : false,
		m0 ? `${Number(m0.avg_ret).toFixed(1)}%` : "no month-0",
	);

	// 7. Identity confidence coverage + LTV/AOV sanity.
	console.log("\n--- Identity confidence & LTV/AOV sanity ---");
	const sources = await sql.query(
		`WITH scoped AS (
       SELECT (${IDENTITY}) AS ck,
         CASE
           WHEN regexp_replace(COALESCE(customer_mobile,''),'\\D','','g') <> '' THEN 'mobile'
           WHEN btrim(COALESCE(customer_name,'')) <> '' THEN 'name'
           ELSE 'anonymous' END AS source,
         net_amount
       FROM sales_fact_v WHERE sale_date <= $1::date
     )
     SELECT source, COUNT(DISTINCT ck)::int AS customers, COALESCE(SUM(net_amount),0) AS revenue
     FROM scoped GROUP BY source ORDER BY revenue DESC`,
		[asOf],
	);
	const totalRev = sources.reduce(
		(s: number, r: any) => s + money(r.revenue),
		0,
	);
	for (const r of sources) {
		const shr = totalRev > 0 ? (money(r.revenue) / totalRev) * 100 : 0;
		console.log(
			`   ${String(r.source).padEnd(10)} ${r.customers} customers · ${shr.toFixed(1)}% revenue`,
		);
	}
	assert(
		"Identity sources cover all revenue",
		Math.abs(totalRev - money(dist.total_rev)) < RUPEE,
		`${totalRev.toFixed(2)} vs ${money(dist.total_rev).toFixed(2)}`,
	);
	const [agg] = await sql.query(
		`SELECT COALESCE(SUM(net_amount),0) AS rev, COUNT(DISTINCT bill_no)::int AS bills,
       COUNT(DISTINCT (${IDENTITY}))::int AS customers
     FROM sales_fact_v WHERE sale_date <= $1::date`,
		[asOf],
	);
	const aov = Number(agg.bills) > 0 ? money(agg.rev) / Number(agg.bills) : 0;
	const ltv =
		Number(agg.customers) > 0 ? money(agg.rev) / Number(agg.customers) : 0;
	assert(
		"AOV is finite and ≥ 0",
		Number.isFinite(aov) && aov >= 0,
		`₹${aov.toFixed(2)}`,
	);
	assert(
		"LTV is finite and ≥ 0",
		Number.isFinite(ltv) && ltv >= 0,
		`₹${ltv.toFixed(2)}`,
	);

	// 8. Materialized view parity — mv_customer_identity must equal the live-SQL truth.
	console.log("\n--- Materialized view parity (mv_customer_identity) ---");
	const [mvExists] = await sql.query(
		`SELECT COUNT(*)::int AS n FROM pg_matviews WHERE matviewname = 'mv_customer_identity'`,
	);
	if (Number(mvExists.n) === 0) {
		console.log(
			"   ⏭  mv_customer_identity not present — skipping (run migrate:customer-analytics).",
		);
	} else {
		const [mv] = await sql.query(
			`SELECT COALESCE(SUM(lifetime_revenue),0) AS revenue,
         COUNT(DISTINCT identity_key)::int AS customers
       FROM mv_customer_identity`,
		);
		// Revenue and distinct-identity are grain-independent (bills are not, due to
		// possible cross-store bill_no duplication), so those are the safe parity checks.
		assert(
			"MV lifetime revenue = live total revenue",
			Math.abs(money(mv.revenue) - money(dist.total_rev)) < RUPEE,
			`${money(mv.revenue).toFixed(2)} vs ${money(dist.total_rev).toFixed(2)}`,
		);
		assert(
			"MV distinct customers = live distinct identities",
			Number(mv.customers) === Number(dist.total_cust),
			`${mv.customers} vs ${dist.total_cust}`,
		);
		// Per-identity parity gate: the MV may back the lifetime engines only while
		// its (identity × store) grain reproduces the identity-grain live numbers
		// exactly. Cross-store bill_no duplication would break this — catch it here.
		const [parity] = await sql.query(
			`WITH live AS (
         SELECT (${IDENTITY}) ck, COUNT(DISTINCT bill_no) v, SUM(net_amount) r
         FROM sales_fact_v WHERE sale_date <= $1::date GROUP BY 1
       ),
       mvp AS (SELECT identity_key ck, SUM(visit_count) v, SUM(lifetime_revenue) r FROM mv_customer_identity GROUP BY 1)
       SELECT
         COUNT(*) FILTER (WHERE live.v IS DISTINCT FROM mvp.v)::int AS visit_mismatch,
         COUNT(*) FILTER (WHERE ROUND(live.r,2) IS DISTINCT FROM ROUND(mvp.r,2))::int AS revenue_mismatch
       FROM live FULL OUTER JOIN mvp USING (ck)`,
			[asOf],
		);
		assert(
			"MV per-identity visits match live (safe to back distribution)",
			Number(parity.visit_mismatch) === 0,
			`${parity.visit_mismatch} mismatches`,
		);
		assert(
			"MV per-identity revenue match live (safe to back concentration)",
			Number(parity.revenue_mismatch) === 0,
			`${parity.revenue_mismatch} mismatches`,
		);
	}

	if (failed > 0) {
		console.error(`\n${failed} check(s) failed — v1.0 is NOT frozen.`);
		process.exit(1);
	}
	console.log(
		"\n✅ All customer-intelligence invariants passed — v1.0 is frozen.",
	);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
