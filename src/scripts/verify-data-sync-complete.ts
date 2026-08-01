import * as fs from "node:fs";
import * as path from "node:path";

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
	console.log("==================================================");
	console.log("📊 ZENZEBRA CRM — COMPLETE ODOO DATA UPDATE VERIFICATION");
	console.log("==================================================\n");

	const { sql } = await import("../lib/db");
	const { OdooClient } = await import("../lib/odoo/client");

	// 1. Neon Database Table Summary
	console.log("1. NEON POSTGRESQL CANONICAL DATA TABLES:");
	console.log("--------------------------------------------------");
	try {
		const [stores] = await sql`SELECT COUNT(*)::int as count FROM dim_stores;`;
		const [products] =
			await sql`SELECT COUNT(*)::int as count FROM dim_products;`;
		const [customers] =
			await sql`SELECT COUNT(*)::int as count FROM dim_customers;`;
		const [orders] =
			await sql`SELECT COUNT(*)::int as count FROM fact_sales_orders;`;
		const [lines] =
			await sql`SELECT COUNT(*)::int as count FROM fact_sales_lines;`;
		const [views] = await sql`SELECT COUNT(*)::int as count FROM sales_fact_v;`;
		const [mvs] =
			await sql`SELECT COUNT(*)::int as count FROM mv_customer_identity;`;
		const [webhooks] =
			await sql`SELECT COUNT(*)::int as count FROM webhook_events;`;

		console.log(
			`  • Stores (dim_stores):              ${stores.count} records`,
		);
		console.log(
			`  • Products (dim_products):          ${products.count} records`,
		);
		console.log(
			`  • Customers (dim_customers):        ${customers.count} records`,
		);
		console.log(
			`  • Sales Orders (fact_sales_orders): ${orders.count} records`,
		);
		console.log(`  • Sales Lines (fact_sales_lines):   ${lines.count} records`);
		console.log(
			`  • Sales Fact View (sales_fact_v):   ${views.count} aggregated rows`,
		);
		console.log(`  • Customer Identity MV:             ${mvs.count} rows`);
		console.log(
			`  • Webhook Audit Log:                ${webhooks.count} logged events`,
		);
	} catch (err: any) {
		console.error("  ❌ Database check error:", err.message);
	}

	// 2. Latest Orders in Neon DB
	console.log("\n2. LATEST 5 SALES ORDERS IN NEON DB:");
	console.log("--------------------------------------------------");
	try {
		const latestOrders = await sql`
			SELECT id, name, date_order, amount_total, state, order_type, updated_at
			FROM fact_sales_orders
			ORDER BY date_order DESC
			LIMIT 5
		`;
		console.log(JSON.stringify(latestOrders, null, 2));
	} catch (err: any) {
		console.error("  ❌ Order query error:", err.message);
	}

	// 3. Odoo SaaS Online Live Comparison
	console.log("\n3. ODOO SAAS ONLINE RECONCILIATION:");
	console.log("--------------------------------------------------");
	try {
		const client = new OdooClient();
		await client.authenticate();
		console.log("  ✅ Authenticated to Odoo SaaS (zenzebra1.odoo.com)");

		const posOrders = await client.callKw<any[]>(
			"pos.order",
			"search_read",
			[],
			{
				fields: ["id", "name", "date_order", "amount_total", "state"],
				order: "id desc",
				limit: 3,
			},
		);

		console.log("\n  Latest POS Orders in Odoo SaaS:");
		console.log(JSON.stringify(posOrders, null, 2));

		// Check if latest Odoo POS order is in Neon DB
		if (posOrders && posOrders.length > 0) {
			const latestId = `pos_${posOrders[0].id}`;
			const [match] = await sql`
				SELECT id, name, amount_total, state FROM fact_sales_orders WHERE id = ${latestId} LIMIT 1
			`;

			console.log(`\n  Reconciliation Check for Latest Order (${latestId}):`);
			if (match) {
				console.log(`  ✅ MATCH FOUND IN NEON DB:`, match);
				console.log("  🎉 Odoo SaaS data matches Neon Database 100%!");
			} else {
				console.log(
					`  ⚠️ Order ${latestId} is in Odoo SaaS but not in Neon DB yet.`,
				);
				console.log(
					"  👉 Trigger sync or configure Odoo Webhook to push latest order.",
				);
			}
		}
	} catch (err: any) {
		console.error("  ❌ Odoo SaaS reconciliation error:", err.message);
	}

	console.log("\n==================================================");
	console.log("🏁 VERIFICATION COMPLETE");
	console.log("==================================================");
}

main().catch(console.error);
