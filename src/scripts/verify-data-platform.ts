import path from "node:path";
import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

/**
 * Data-platform infrastructure health — a distinct release-gate stage from
 * business correctness. Asserts the indexes and materialized views the customer
 * engines depend on exist, are populated, and reconcile with the live source.
 *
 *   npm run verify:data-platform
 */

const REQUIRED_INDEXES = [
	"idx_sales_fact_customer_mobile",
	"idx_sales_fact_customer_name",
	"idx_sales_fact_sale_date",
	"idx_sales_fact_bill_no",
];
const REQUIRED_MVS = ["mv_customer_identity"];

let failed = 0;
const money = (v: unknown) => Number(v ?? 0);
function assert(label: string, ok: boolean, detail: string) {
	console.log(`${ok ? "✅" : "❌"} ${label}: ${detail}`);
	if (!ok) failed++;
}

async function main() {
	if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL missing");
	const sql = neon(process.env.DATABASE_URL);

	console.log("--- Indexes ---");
	const idx = await sql.query(
		`SELECT indexname FROM pg_indexes WHERE tablename = 'sales_fact'`,
	);
	const present = new Set(
		idx.map((r) => String((r as { indexname: string }).indexname)),
	);
	for (const name of REQUIRED_INDEXES) {
		assert(
			`index ${name}`,
			present.has(name),
			present.has(name) ? "present" : "MISSING",
		);
	}

	console.log("\n--- Materialized views ---");
	const mvs = await sql.query(`SELECT matviewname FROM pg_matviews`);
	const mvPresent = new Set(
		mvs.map((r) => String((r as { matviewname: string }).matviewname)),
	);
	for (const name of REQUIRED_MVS) {
		assert(
			`mv ${name} exists`,
			mvPresent.has(name),
			mvPresent.has(name) ? "present" : "MISSING",
		);
	}

	if (mvPresent.has("mv_customer_identity")) {
		const [mv] = await sql.query(
			`SELECT COUNT(*)::int AS rows, COALESCE(SUM(lifetime_revenue),0) AS revenue,
         COUNT(DISTINCT identity_key)::int AS customers FROM mv_customer_identity`,
		);
		assert(
			"mv_customer_identity populated",
			Number(mv.rows) > 0,
			`${mv.rows} rows`,
		);

		const [live] = await sql.query(
			`SELECT COALESCE(SUM(net_amount),0) AS revenue,
         COUNT(DISTINCT (CASE
           WHEN regexp_replace(COALESCE(customer_mobile,''),'\\D','','g') <> '' THEN 'MOBILE_'||regexp_replace(customer_mobile,'\\D','','g')
           WHEN btrim(COALESCE(customer_name,'')) <> '' THEN 'NAME_'||md5(lower(btrim(regexp_replace(customer_name,'\\s+',' ','g'))))
           ELSE 'ANON_'||bill_no END))::int AS customers
       FROM sales_fact_v`,
		);
		assert(
			"MV revenue = live revenue",
			Math.abs(money(mv.revenue) - money(live.revenue)) < 1,
			`${money(mv.revenue).toFixed(2)} vs ${money(live.revenue).toFixed(2)}`,
		);
		assert(
			"MV customers = live customers",
			Number(mv.customers) === Number(live.customers),
			`${mv.customers} vs ${live.customers}`,
		);
	}

	if (failed > 0) {
		console.error(`\n${failed} data-platform check(s) failed.`);
		process.exit(1);
	}
	console.log("\n✅ Data platform healthy.");
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
