import path from "node:path";
import { type NeonQueryFunction, neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

/**
 * Performance verification for the data platform. Times the representative heavy
 * query behind each dashboard and fails if any exceeds the latency budget.
 * Measures DB query time (the dominant cost); run:
 *
 *   npm run verify:performance
 *
 * Self-contained inline SQL (no @/ aliases), like the other verify scripts.
 */

const BUDGET_MS = 1000; // hard fail above this
const WARN_MS = 700; // soft warning

const IDENTITY = `CASE
  WHEN regexp_replace(COALESCE(customer_mobile,''),'\\D','','g') <> '' THEN 'MOBILE_'||regexp_replace(customer_mobile,'\\D','','g')
  WHEN btrim(COALESCE(customer_name,'')) <> '' THEN 'NAME_'||md5(lower(btrim(regexp_replace(customer_name,'\\s+',' ','g'))))
  ELSE 'ANON_'||bill_no END`;

type Sql = NeonQueryFunction<false, false>;

let failed = 0;

/** Run `fn` and return elapsed ms (median of 3 runs to smooth cold-start jitter). */
async function timed(fn: () => Promise<unknown>): Promise<number> {
	const samples: number[] = [];
	for (let i = 0; i < 3; i++) {
		const t0 = performance.now();
		await fn();
		samples.push(performance.now() - t0);
	}
	samples.sort((a, b) => a - b);
	return samples[1];
}

async function bench(label: string, fn: () => Promise<unknown>) {
	const ms = await timed(fn);
	const status = ms > BUDGET_MS ? "❌" : ms > WARN_MS ? "⚠️ " : "✅";
	console.log(`${status} ${label.padEnd(28)} ${ms.toFixed(0)} ms`);
	if (ms > BUDGET_MS) failed++;
}

async function main() {
	if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL missing");
	const sql = neon(process.env.DATABASE_URL) as Sql;

	const [range] = await sql.query(
		`SELECT MAX(sale_date)::text AS max FROM sales_fact_v`,
	);
	const asOf: string = range?.max ?? new Date().toISOString().slice(0, 10);
	const start = new Date(new Date(`${asOf}T00:00:00Z`).getTime() - 30 * 864e5)
		.toISOString()
		.slice(0, 10);

	console.log(
		`Latency budget: ${BUDGET_MS} ms (warn ${WARN_MS} ms) · window ${start} → ${asOf}\n`,
	);

	// Sales dashboard — core KPI aggregate.
	await bench("Sales KPIs", () =>
		sql.query(
			`SELECT SUM(net_amount) rev, COUNT(DISTINCT bill_no) bills, SUM(quantity) units
       FROM sales_fact_v WHERE sale_date BETWEEN $1::date AND $2::date`,
			[start, asOf],
		),
	);

	// Store overview — per-store performance.
	await bench("Store overview", () =>
		sql.query(
			`SELECT billed_by, SUM(net_amount) rev, COUNT(DISTINCT bill_no) bills
       FROM sales_fact_v WHERE sale_date BETWEEN $1::date AND $2::date GROUP BY billed_by`,
			[start, asOf],
		),
	);

	// Customer Intelligence — the 5 engine queries in parallel (worst case).
	await bench("Customer Intelligence", () =>
		Promise.all([
			// retention cohort
			sql.query(
				`WITH base AS (SELECT (${IDENTITY}) ck, date_trunc('month',sale_date)::date m, bill_no, net_amount
           FROM sales_fact_v WHERE sale_date <= $1::date),
         cohort AS (SELECT ck, MIN(m) cm FROM base GROUP BY ck)
         SELECT c.cm, b.m, COUNT(DISTINCT b.ck), SUM(b.net_amount), COUNT(DISTINCT b.bill_no)
         FROM base b JOIN cohort c ON c.ck=b.ck GROUP BY c.cm, b.m`,
				[asOf],
			),
			// revenue composition
			sql.query(
				`WITH scoped AS (SELECT (${IDENTITY}) ck, sale_date, bill_no, net_amount FROM sales_fact_v),
         fp AS (SELECT ck, MIN(sale_date) fd FROM scoped GROUP BY ck),
         period AS (SELECT s.*, fp.fd FROM scoped s JOIN fp ON fp.ck=s.ck WHERE s.sale_date BETWEEN $1::date AND $2::date)
         SELECT SUM(net_amount), COUNT(DISTINCT bill_no), COUNT(DISTINCT ck) FROM period`,
				[start, asOf],
			),
			// value distribution
			sql.query(
				`WITH base AS (SELECT (${IDENTITY}) ck, bill_no, net_amount FROM sales_fact_v WHERE sale_date <= $1::date),
         per AS (SELECT ck, COUNT(DISTINCT bill_no) v, SUM(net_amount) r FROM base GROUP BY ck)
         SELECT LEAST(v,5), COUNT(*), SUM(r) FROM per GROUP BY LEAST(v,5)`,
				[asOf],
			),
			// concentration
			sql.query(
				`WITH base AS (SELECT (${IDENTITY}) ck, net_amount FROM sales_fact_v WHERE sale_date <= $1::date),
         per AS (SELECT ck, SUM(net_amount) r FROM base GROUP BY ck),
         ranked AS (SELECT r, ROW_NUMBER() OVER (ORDER BY r DESC) rnk, COUNT(*) OVER () tot FROM per)
         SELECT SUM(r) FILTER (WHERE rnk <= ceil(tot*0.1)) FROM ranked`,
				[asOf],
			),
			// identity confidence
			sql.query(
				`SELECT CASE WHEN regexp_replace(COALESCE(customer_mobile,''),'\\D','','g')<>'' THEN 'm' WHEN btrim(COALESCE(customer_name,''))<>'' THEN 'n' ELSE 'a' END s,
           COUNT(DISTINCT (${IDENTITY})), SUM(net_amount)
         FROM sales_fact_v WHERE sale_date BETWEEN $1::date AND $2::date GROUP BY 1`,
				[start, asOf],
			),
		]),
	);

	if (failed > 0) {
		console.error(
			`\n${failed} query(ies) exceeded the ${BUDGET_MS} ms budget.`,
		);
		process.exit(1);
	}
	console.log("\n✅ All dashboards within performance budget.");
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
