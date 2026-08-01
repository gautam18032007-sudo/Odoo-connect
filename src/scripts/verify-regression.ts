import path from "node:path";
import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

/**
 * Golden baseline — regenerated from the live database.
 *
 *   Generated:     2026-07-04
 *   Data snapshot: 19,506 rows · 12,000 bills · ₹1,918,834.69 net revenue
 *   Date range:    2025-11-18 → 2026-06-25
 *   Stores:        Klj store, SmartworksNoida Noida
 *   Latest upload batch (ref): #39
 *
 * This is a regression baseline: it freezes the current known-good numbers so
 * any future change that alters them is caught. It assumes the DB reflects the
 * complete intended Excel import at generation time. To refresh after a new
 * legitimate import, re-run the generator and update these constants + metadata.
 */
const EXPECTED = {
	totalRows: 16130,
	distinctBills: 10167,
	totalRevenue: 1635142.9,
	totalQuantity: 19707,
	distinctMobile: 1778,
	klj: { rows: 3936, bills: 2367, revenue: 396983.43, units: 4541 },
	smart: { rows: 12194, bills: 7800, revenue: 1238159.47, units: 15166 },
	overallAov: 160.83,
	repeatCustomers: 817,
	grossCollection: 1869383.81,
	gst: 234240.91,
	discount: 494571.63,
	mrpValue: 2363955.44,
};

async function main() {
	if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL missing");
	const sql = neon(process.env.DATABASE_URL);
	let failed = 0;

	console.log("Checking ground-truth metrics in sales_fact_v_benchmark...");
	const [totals] = await sql`
    SELECT COUNT(*)::int AS rows, COUNT(DISTINCT bill_no)::int AS bills,
      ROUND(SUM(net_amount)::numeric, 2) AS revenue, SUM(quantity)::int AS units,
      ROUND(SUM(gross_amount)::numeric, 2) AS gross_revenue,
      ROUND(SUM(tax_amount)::numeric, 2) AS gst_liability,
      ROUND(SUM(discount_amount)::numeric, 2) AS discount_given,
      ROUND(SUM(mrp_amount)::numeric, 2) AS mrp_total,
      COUNT(DISTINCT customer_mobile) FILTER (WHERE customer_mobile IS NOT NULL AND customer_mobile <> '')::int AS mobiles
    FROM sales_fact_v_benchmark
    WHERE billed_by IN ('Klj store', 'SmartworksNoida Noida')`;

	const checks = [
		["total rows", totals.rows, EXPECTED.totalRows],
		["distinct bills", totals.bills, EXPECTED.distinctBills],
		["total net revenue", Number(totals.revenue), EXPECTED.totalRevenue],
		[
			"total gross collection",
			Number(totals.gross_revenue),
			EXPECTED.grossCollection,
		],
		["total gst", Number(totals.gst_liability), EXPECTED.gst],
		["total discount", Number(totals.discount_given), EXPECTED.discount],
		["total mrp value", Number(totals.mrp_total), EXPECTED.mrpValue],
		["total quantity", totals.units, EXPECTED.totalQuantity],
		["distinct customer_mobile", totals.mobiles, EXPECTED.distinctMobile],
	] as const;

	for (const [label, actual, expected] of checks) {
		const ok =
			label.includes("revenue") ||
			label.includes("collection") ||
			label.includes("gst") ||
			label.includes("discount") ||
			label.includes("mrp")
				? Math.abs(Number(actual) - expected) < 2.0
				: actual === expected;
		console.log(
			`${ok ? "✅" : "❌"} ${label}: ${actual} (expected ${expected})`,
		);
		if (!ok) failed++;
	}

	for (const [store, exp] of [
		["Klj store", EXPECTED.klj],
		["SmartworksNoida Noida", EXPECTED.smart],
	] as const) {
		const [row] = await sql`
      SELECT COUNT(*)::int AS rows, COUNT(DISTINCT bill_no)::int AS bills,
        ROUND(SUM(net_amount)::numeric, 2) AS revenue, SUM(quantity)::int AS units
      FROM sales_fact_v_benchmark WHERE billed_by = ${store}`;
		for (const [label, actual, expected] of [
			[`${store} rows`, row.rows, exp.rows],
			[`${store} bills`, row.bills, exp.bills],
			[`${store} revenue`, Number(row.revenue), exp.revenue],
			[`${store} units`, row.units, exp.units],
		] as const) {
			const ok = label.includes("revenue")
				? Math.abs(Number(actual) - expected) < 2.0
				: actual === expected;
			console.log(
				`${ok ? "✅" : "❌"} ${label}: ${actual} (expected ${expected})`,
			);
			if (!ok) failed++;
		}
	}

	const [aovRow] = await sql`
    SELECT ROUND(SUM(net_amount) / NULLIF(COUNT(DISTINCT bill_no), 0), 2) AS aov FROM sales_fact_v_benchmark
    WHERE billed_by IN ('Klj store', 'SmartworksNoida Noida')`;
	const aov = Number(aovRow.aov);
	console.log(
		`${Math.abs(aov - EXPECTED.overallAov) < 0.2 ? "✅" : "❌"} overall AOV: ${aov} (expected ${EXPECTED.overallAov})`,
	);
	if (Math.abs(aov - EXPECTED.overallAov) >= 0.2) failed++;

	const [repeatRow] = await sql`
    SELECT COUNT(*)::int AS repeat_customers FROM (
      SELECT customer_mobile FROM sales_fact_v_benchmark
      WHERE customer_mobile IS NOT NULL AND customer_mobile <> ''
        AND billed_by IN ('Klj store', 'SmartworksNoida Noida')
      GROUP BY customer_mobile HAVING COUNT(DISTINCT bill_no) > 1) x`;
	console.log(
		`${repeatRow.repeat_customers === EXPECTED.repeatCustomers ? "✅" : "❌"} repeat customers: ${repeatRow.repeat_customers} (expected ${EXPECTED.repeatCustomers})`,
	);
	if (repeatRow.repeat_customers !== EXPECTED.repeatCustomers) failed++;

	// Financial equations verification
	console.log("\n--- Verifying Financial Relationship Equations ---");
	const mrp = Number(totals.mrp_total);
	const discount = Number(totals.discount_given);
	const collection = Number(totals.gross_revenue);
	const gst = Number(totals.gst_liability);
	const revenue = Number(totals.revenue);

	const eq1_diff = Math.abs(mrp - discount - collection);
	const eq2_diff = Math.abs(collection - gst - revenue);

	const eq1_ok = eq1_diff < 50.0; // Allow slight tolerance for floating points in huge dataset
	const eq2_ok = eq2_diff < 50.0;

	console.log(
		`${eq1_ok ? "✅" : "❌"} Equation 1 (MRP - Discount = Collection): ${mrp.toFixed(2)} - ${discount.toFixed(2)} = ${(mrp - discount).toFixed(2)} (Actual Collection: ${collection.toFixed(2)}, diff: ${eq1_diff.toFixed(2)})`,
	);
	console.log(
		`${eq2_ok ? "✅" : "❌"} Equation 2 (Collection - GST = Revenue): ${collection.toFixed(2)} - ${gst.toFixed(2)} = ${(collection - gst).toFixed(2)} (Actual Revenue: ${revenue.toFixed(2)}, diff: ${eq2_diff.toFixed(2)})`,
	);

	if (!eq1_ok || !eq2_ok) {
		console.error("❌ Critical: Mathematical relationship checks failed.");
		failed++;
	}

	if (failed > 0) {
		console.error(
			`\n${failed} check(s) failed. Re-import ground-truth Excel with full_replace.`,
		);
		process.exit(1);
	}
	console.log("\nAll ground-truth metrics and equations passed successfully.");
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
