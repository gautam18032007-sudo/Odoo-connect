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

	console.log("\n=======================================================");
	console.log("=== ODOO ↔ DATABASE DEEP GAP INVESTIGATION ===");
	console.log("=======================================================\n");

	// 1. Inspect the 48 orders in fact_sales_orders that have NO lines in fact_sales_lines
	const ordersWithoutLines = await sql`
		SELECT fo.id, fo.name, fo.date_order::text, fo.amount_total, fo.amount_untaxed, fo.order_type
		FROM fact_sales_orders fo
		LEFT JOIN fact_sales_lines fl ON fo.id = fl.order_id
		WHERE fo.date_order::date = '2026-07-31'::date
		  AND fl.id IS NULL
		ORDER BY fo.id
	`;
	console.log(`1. Sample orders in fact_sales_orders (31 Jul 2026) with NO lines in fact_sales_lines (Total: ${ordersWithoutLines.length}):`);
	console.table(ordersWithoutLines.slice(0, 15));

	// 2. Check if Odoo connection parameters exist
	const client = new OdooClient();
	if (!client.getMockModeStatus()) {
		console.log("\n2. Querying Odoo directly for 31 Jul 2026 (IST vs UTC)...");
		await client.authenticate();
		
		// Odoo dates for 31 Jul 2026 IST: 2026-07-30 18:30:00 UTC to 2026-07-31 18:29:59 UTC
		const istStartUtc = "2026-07-30 18:30:00";
		const istEndUtc = "2026-07-31 18:29:59";

		// POS Orders count & sum in Odoo for IST date range
		const posOrdersIst = await client.callKw<any[]>("pos.order", "search_read", [], {
			domain: [
				["state", "in", ["paid", "done", "invoiced"]],
				["date_order", ">=", istStartUtc],
				["date_order", "<=", istEndUtc],
			],
			fields: ["id", "name", "date_order", "amount_total", "amount_tax", "lines"],
		});

		console.log(`Odoo POS Orders for 31 Jul 2026 IST (${istStartUtc} to ${istEndUtc}):`);
		console.log(`- Count: ${posOrdersIst.length}`);
		const posGross = posOrdersIst.reduce((sum: number, o: any) => sum + Number(o.amount_total || 0), 0);
		console.log(`- Total Gross (amount_total): ₹${posGross.toFixed(2)}`);

		// Standard Sale Orders count & sum in Odoo for IST date range
		const saleOrdersIst = await client.callKw<any[]>("sale.order", "search_read", [], {
			domain: [
				["state", "in", ["sale", "done"]],
				["date_order", ">=", istStartUtc],
				["date_order", "<=", istEndUtc],
			],
			fields: ["id", "name", "date_order", "amount_total", "amount_untaxed", "order_line"],
		});

		console.log(`\nOdoo Standard Sale Orders for 31 Jul 2026 IST (${istStartUtc} to ${istEndUtc}):`);
		console.log(`- Count: ${saleOrdersIst.length}`);
		const saleGross = saleOrdersIst.reduce((sum: number, o: any) => sum + Number(o.amount_total || 0), 0);
		console.log(`- Total Gross (amount_total): ₹${saleGross.toFixed(2)}`);
		console.log(`- COMBINED Odoo Orders: ${posOrdersIst.length + saleOrdersIst.length}`);
		console.log(`- COMBINED Odoo Gross: ₹${(posGross + saleGross).toFixed(2)}`);
	} else {
		console.log("\n2. Running in Validation Mode (Odoo credentials not provided). Analyzing local database tables...");
	}

	// 3. Inspect sales_fact_v view JOIN structure
	console.log("\n3. Checking sales_fact_v view join count vs fact_sales_orders count for 31 Jul 2026:");
	const istV = await sql`
		SELECT 
			COUNT(*)::int as view_lines,
			COUNT(DISTINCT bill_no)::int as view_bills,
			SUM(gross_amount)::numeric(12,2) as view_gross,
			SUM(net_amount)::numeric(12,2) as view_net
		FROM sales_fact_v
		WHERE sale_date = '2026-07-31'::date
	`;
	console.table(istV);

	console.log("\n=======================================================\n");
}

main().catch(console.error);
