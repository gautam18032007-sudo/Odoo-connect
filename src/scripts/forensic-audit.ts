import * as fs from "fs";
import * as path from "path";

// Load .env.local
const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
	const envConfig = fs.readFileSync(envPath, "utf8");
	for (const line of envConfig.split("\n")) {
		const trimmed = line.trim();
		if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
			const [key, ...valueParts] = trimmed.split("=");
			const value = valueParts.join("=").replace(/^["']|["']$/g, "");
			if (key && !process.env[key.trim()]) {
				process.env[key.trim()] = value;
			}
		}
	}
}

async function main() {
	const { sql } = await import("../lib/db");
	const { OdooClient } = await import("../lib/odoo/client");
	const { getDailyHealthMetrics } = await import("../lib/business-logic/sales");
	const { cleanDashboardFilters, getComparisonPeriods } = await import("../lib/business-logic/comparison");

	console.log("\n=======================================================================");
	console.log("=== FORENSIC 6-LAYER DIVERGENCE AUDIT (31 JUL & 01 AUG 2026 IST) ===");
	console.log("=======================================================================\n");

	const client = new OdooClient();
	if (client.getMockModeStatus()) {
		console.log("Running in Mock Mode. Cannot query live Odoo instance.");
		return;
	}

	await client.authenticate();

	const targets = [
		{ label: "31 Jul 2026 IST", dateStr: "2026-07-31", istStartUtc: "2026-07-30 18:30:00", istEndUtc: "2026-07-31 18:29:59" },
		{ label: "01 Aug 2026 IST", dateStr: "2026-08-01", istStartUtc: "2026-07-31 18:30:00", istEndUtc: "2026-08-01 18:29:59" },
	];

	for (const target of targets) {
		console.log(`\n------------------------------------------------------------------`);
		console.log(`AUDITING TARGET DATE: ${target.label}`);
		console.log(`------------------------------------------------------------------`);

		// LAYER 1: Odoo SaaS Ground Truth
		const posOrdersOdoo = await client.callKw<any[]>("pos.order", "search_read", [], {
			domain: [
				["state", "in", ["paid", "done", "invoiced"]],
				["date_order", ">=", target.istStartUtc],
				["date_order", "<=", target.istEndUtc],
			],
			fields: ["id", "name", "date_order", "amount_total", "amount_tax", "lines"],
		});
		const l1_bills = posOrdersOdoo.length;
		const l1_gross = posOrdersOdoo.reduce((sum: number, o: any) => sum + Number(o.amount_total || 0), 0);

		const posLineIdsOdoo = posOrdersOdoo.flatMap((o: any) => o.lines || []);
		let l1_units = 0;
		let l1_net = 0;
		let l1_tax = 0;
		if (posLineIdsOdoo.length > 0) {
			const linesOdoo = await client.callKw<any[]>("pos.order.line", "search_read", [], {
				domain: [["id", "in", posLineIdsOdoo]],
				fields: ["qty", "price_subtotal", "price_subtotal_incl"],
			});
			l1_units = linesOdoo.reduce((sum: number, l: any) => sum + Number(l.qty || 0), 0);
			l1_net = linesOdoo.reduce((sum: number, l: any) => sum + Number(l.price_subtotal || 0), 0);
			l1_tax = linesOdoo.reduce((sum: number, l: any) => sum + (Number(l.price_subtotal_incl || 0) - Number(l.price_subtotal || 0)), 0);
		}

		// LAYER 2: Neon Raw Tables (fact_sales_orders & fact_sales_lines)
		const rawOrders = await sql`
			SELECT 
				COUNT(*)::int as bill_cuts,
				SUM(amount_total)::numeric(12,2) as gross_amount,
				SUM(amount_untaxed)::numeric(12,2) as net_amount
			FROM fact_sales_orders
			WHERE date_order >= ${target.istStartUtc}::timestamp
			  AND date_order <= ${target.istEndUtc}::timestamp
			  AND state IN ('paid', 'done', 'invoiced')
		`;

		const rawLines = await sql`
			SELECT 
				COUNT(*)::int as line_count,
				SUM(qty)::int as units,
				SUM(price_subtotal)::numeric(12,2) as net_subtotal,
				SUM(tax_amount)::numeric(12,2) as tax_amount
			FROM fact_sales_lines fl
			JOIN fact_sales_orders fo ON fl.order_id = fo.id
			WHERE fo.date_order >= ${target.istStartUtc}::timestamp
			  AND fo.date_order <= ${target.istEndUtc}::timestamp
			  AND fo.state IN ('paid', 'done', 'invoiced')
		`;

		const l2_bills = Number(rawOrders[0]?.bill_cuts || 0);
		const l2_gross = Number(rawOrders[0]?.gross_amount || 0);
		const l2_net = Number(rawLines[0]?.net_subtotal || 0);
		const l2_tax = Number(rawLines[0]?.tax_amount || 0);
		const l2_units = Number(rawLines[0]?.units || 0);

		// LAYER 3: Analytical View (sales_fact_v)
		const viewRes = await sql`
			SELECT 
				COUNT(*)::int as line_count,
				COUNT(DISTINCT bill_no)::int as bill_cuts,
				SUM(gross_amount)::numeric(12,2) as collection,
				SUM(net_amount)::numeric(12,2) as net_revenue,
				SUM(discount_amount)::numeric(12,2) as discount,
				SUM(tax_amount)::numeric(12,2) as gst,
				SUM(quantity)::int as units
			FROM sales_fact_v
			WHERE sale_date = ${target.dateStr}::date
		`;

		const l3_bills = Number(viewRes[0]?.bill_cuts || 0);
		const l3_gross = Number(viewRes[0]?.collection || 0);
		const l3_net = Number(viewRes[0]?.net_revenue || 0);
		const l3_tax = Number(viewRes[0]?.gst || 0);
		const l3_units = Number(viewRes[0]?.units || 0);

		// LAYER 4: Repository / Business Engine (getDailyHealthMetrics)
		const filters = cleanDashboardFilters({
			startDate: target.dateStr,
			endDate: target.dateStr,
			categoryScope: "all",
		});
		const periods = getComparisonPeriods(filters);
		const dailyHealth = await getDailyHealthMetrics(sql as any, periods, filters);

		const l4_bills = dailyHealth.salesKpis.billCuts.current;
		const l4_gross = dailyHealth.salesKpis.collection.current;
		const l4_net = dailyHealth.salesKpis.revenue.current;
		const l4_tax = dailyHealth.salesKpis.gst.current;
		const l4_units = dailyHealth.salesKpis.unitsSold.current;

		// LAYER 5 & 6: Report Comparison Table
		console.log(`\nLAYER-BY-LAYER DATA FLOW COMPARISON (${target.label}):`);
		console.table([
			{
				Layer: "1. Odoo SaaS (JSON-RPC)",
				"Bill Cuts": l1_bills,
				"Gross Collection": `₹${l1_gross.toFixed(2)}`,
				"Net Revenue": `₹${l1_net.toFixed(2)}`,
				"GST Tax": `₹${l1_tax.toFixed(2)}`,
				"Units": l1_units,
				Status: "SOURCE",
			},
			{
				Layer: "2. Neon Raw Tables",
				"Bill Cuts": l2_bills,
				"Gross Collection": `₹${l2_gross.toFixed(2)}`,
				"Net Revenue": `₹${l2_net.toFixed(2)}`,
				"GST Tax": `₹${l2_tax.toFixed(2)}`,
				"Units": l2_units,
				Status: l2_gross === l1_gross && l2_bills === l1_bills ? "PASS" : "FAIL",
			},
			{
				Layer: "3. sales_fact_v View",
				"Bill Cuts": l3_bills,
				"Gross Collection": `₹${l3_gross.toFixed(2)}`,
				"Net Revenue": `₹${l3_net.toFixed(2)}`,
				"GST Tax": `₹${l3_tax.toFixed(2)}`,
				"Units": l3_units,
				Status: l3_gross === l1_gross && l3_bills === l1_bills ? "PASS" : "FAIL",
			},
			{
				Layer: "4. Dashboard API Engine",
				"Bill Cuts": l4_bills,
				"Gross Collection": `₹${l4_gross.toFixed(2)}`,
				"Net Revenue": `₹${l4_net.toFixed(2)}`,
				"GST Tax": `₹${l4_tax.toFixed(2)}`,
				"Units": l4_units,
				Status: l4_gross === l1_gross && l4_bills === l1_bills ? "PASS" : "FAIL",
			},
		]);

		console.log(`\nDIVERGENCE SUMMARY FOR ${target.label}:`);
		console.log(`- Layer 1 vs Layer 2 (Odoo vs Raw DB): Gross Diff = ₹${(l1_gross - l2_gross).toFixed(2)}, Bill Diff = ${l1_bills - l2_bills}`);
		console.log(`- Layer 2 vs Layer 3 (Raw DB vs View): Gross Diff = ₹${(l2_gross - l3_gross).toFixed(2)}, Bill Diff = ${l2_bills - l3_bills}`);
		console.log(`- Layer 3 vs Layer 4 (View vs API):    Gross Diff = ₹${(l3_gross - l4_gross).toFixed(2)}, Bill Diff = ${l3_bills - l4_bills}`);

		if (l1_gross !== l2_gross || l1_bills !== l2_bills) {
			console.log(`\n❌ FIRST DIVERGENCE FOUND AT LAYER 2 (Odoo SaaS → Neon Raw Tables Sync Gap!)`);
		} else if (l2_gross !== l3_gross || l2_bills !== l3_bills) {
			console.log(`\n❌ FIRST DIVERGENCE FOUND AT LAYER 3 (Neon Raw Tables → sales_fact_v View Join/Filter Loss!)`);
		} else if (l3_gross !== l4_gross || l3_bills !== l4_bills) {
			console.log(`\n❌ FIRST DIVERGENCE FOUND AT LAYER 4 (sales_fact_v View → Dashboard API Business Function Filter Loss!)`);
		} else {
			console.log(`\n✅ ALL LAYERS MATCH EXACTLY FOR ${target.label}!`);
		}
	}

	console.log("\n=======================================================================\n");
}

main().catch(console.error);
