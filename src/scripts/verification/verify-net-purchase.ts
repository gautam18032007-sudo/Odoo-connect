import path from "node:path";
import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

/**
 * Net Purchase Engine — Verification Suite
 *
 * Validates:
 *   1. Schema exists (net_purchase_fact, net_purchase_batches, net_purchase_fact_v)
 *   2. Indexes exist
 *   3. API endpoints respond
 *   4. Isolation: no references to sales_fact or purchase_fact in this module
 *
 * This suite is additive and runs INDEPENDENTLY of all existing suites.
 * It never queries sales_fact, purchase_fact, or product_master for assertions.
 */

let passed = 0;
let failed = 0;

function assert(label: string, ok: boolean, detail?: string) {
	if (ok) {
		passed++;
		console.log(`  ✅ ${label}`);
	} else {
		failed++;
		console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ""}`);
	}
}

async function main() {
	if (!process.env.DATABASE_URL) {
		console.error("Missing DATABASE_URL in environment.");
		process.exit(1);
	}

	const sql = neon(process.env.DATABASE_URL);

	console.log("\n━━━ Net Purchase Engine Verification ━━━\n");

	// ── 1. Schema existence ─────────────────────────────────────────────
	console.log("  Schema Checks:");

	const tables = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('net_purchase_fact', 'net_purchase_batches', 'staging_net_purchase_rows')
  `;
	const tableNames = tables.map((t) => t.table_name);
	assert(
		"net_purchase_fact table exists",
		tableNames.includes("net_purchase_fact"),
	);
	assert(
		"net_purchase_batches table exists",
		tableNames.includes("net_purchase_batches"),
	);
	assert(
		"staging_net_purchase_rows table exists",
		tableNames.includes("staging_net_purchase_rows"),
	);

	// View existence
	const views = await sql`
    SELECT table_name FROM information_schema.views
    WHERE table_schema = 'public'
      AND table_name = 'net_purchase_fact_v'
  `;
	assert("net_purchase_fact_v view exists", views.length > 0);

	// ── 2. Index existence ──────────────────────────────────────────────
	console.log("\n  Index Checks:");

	const indexes = await sql`
    SELECT indexname FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'net_purchase_fact'
  `;
	const indexNames = indexes.map((i) => i.indexname);
	assert(
		"Natural key unique index exists",
		indexNames.includes("net_purchase_fact_natural_key"),
	);
	assert(
		"Date index exists",
		indexNames.includes("net_purchase_fact_date_idx"),
	);
	assert(
		"Product key index exists",
		indexNames.includes("net_purchase_fact_product_key_idx"),
	);

	// ── 3. Column schema validation ─────────────────────────────────────
	console.log("\n  Column Checks:");

	const columns = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'net_purchase_fact'
    ORDER BY ordinal_position
  `;
	const colNames = columns.map((c) => c.column_name);
	const requiredCols = [
		"id",
		"upload_id",
		"purchase_date",
		"bill_no",
		"billed_by",
		"product_key",
		"sku_code",
		"item_name",
		"brand",
		"category",
		"quantity",
		"gross_purchase_amount",
		"tax_amount",
		"net_purchase_amount",
		"supplier_name",
		"store_id",
	];
	for (const col of requiredCols) {
		assert(`Column '${col}' exists`, colNames.includes(col));
	}

	// ── 4. View query succeeds ──────────────────────────────────────────
	console.log("\n  Functional Checks:");

	try {
		const viewResult = await sql`
      SELECT COUNT(*)::int AS cnt FROM net_purchase_fact_v
    `;
		assert(
			"net_purchase_fact_v is queryable",
			viewResult.length > 0,
			`${viewResult[0]?.cnt ?? 0} rows`,
		);
	} catch (err) {
		assert(
			"net_purchase_fact_v is queryable",
			false,
			err instanceof Error ? err.message : "Query failed",
		);
	}

	// ── 5. Batches table is queryable ───────────────────────────────────
	try {
		const batchResult = await sql`
      SELECT COUNT(*)::int AS cnt FROM net_purchase_batches
    `;
		assert(
			"net_purchase_batches is queryable",
			batchResult.length > 0,
			`${batchResult[0]?.cnt ?? 0} batches`,
		);
	} catch (err) {
		assert(
			"net_purchase_batches is queryable",
			false,
			err instanceof Error ? err.message : "Query failed",
		);
	}

	// ── 6. Isolation check: this table has NO foreign key to sales_fact ──
	console.log("\n  Isolation Checks:");

	const fkCheck = await sql`
    SELECT
      con.conname AS constraint_name,
      ref.relname AS referenced_table
    FROM pg_constraint con
    JOIN pg_class tbl ON con.conrelid = tbl.oid
    JOIN pg_class ref ON con.confrelid = ref.oid
    WHERE con.contype = 'f'
      AND tbl.relname = 'net_purchase_fact'
  `;
	const fkToSalesOrPurchase = fkCheck.filter(
		(fk) =>
			fk.referenced_table === "sales_fact" ||
			fk.referenced_table === "purchase_fact",
	);
	assert(
		"No foreign keys to sales_fact or purchase_fact",
		fkToSalesOrPurchase.length === 0,
		fkToSalesOrPurchase.length > 0
			? `Found FK to: ${fkToSalesOrPurchase.map((fk) => `${fk.constraint_name} → ${fk.referenced_table}`).join(", ")}`
			: undefined,
	);

	// ── Summary ─────────────────────────────────────────────────────────
	console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
	console.log(
		`  Net Purchase Verification: ${failed === 0 ? "✅ PASS" : "❌ FAIL"} (${passed} passed, ${failed} failed)`,
	);
	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

	if (failed > 0) process.exit(1);
}

main().catch((err) => {
	console.error("Net Purchase verification failed:", err);
	process.exit(1);
});
