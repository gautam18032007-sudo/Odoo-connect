import * as fs from "node:fs";
import * as path from "node:path";

const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
	const envConfig = fs.readFileSync(envPath, "utf8");
	for (const line of envConfig.split("\n")) {
		const trimmed = line.trim();
		if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
			const [key, ...val] = trimmed.split("=");
			if (key && !process.env[key.trim()]) {
				process.env[key.trim()] = val.join("=").replace(/^["']|["']$/g, "");
			}
		}
	}
}

async function main() {
	const { OdooClient } = await import("./src/lib/odoo/client");
	const client = new OdooClient();
	await client.authenticate();
	console.log("✅ Authenticated to Odoo SaaS successfully.");

	// 1. POS Orders summary
	const posOrders = await client.callKw<any[]>("pos.order", "search_read", [], {
		domain: [["state", "in", ["paid", "done", "invoiced"]]],
		fields: ["id", "name", "date_order", "amount_total", "amount_tax", "partner_id", "config_id", "lines"],
		limit: 10,
		order: "date_order desc",
	});
	console.log(`\n📦 Live Odoo POS Orders (sample count: ${posOrders.length}):`);
	if (posOrders.length > 0) {
		console.log("First POS Order:", JSON.stringify(posOrders[0], null, 2));
	}

	// 2. Standard Sale Orders summary
	const saleOrders = await client.callKw<any[]>("sale.order", "search_read", [], {
		domain: [["state", "in", ["sale", "done"]]],
		fields: ["id", "name", "date_order", "amount_total", "amount_tax", "amount_untaxed", "partner_id", "order_line"],
		limit: 10,
		order: "date_order desc",
	});
	console.log(`\n🛍️ Live Odoo Sale Orders (sample count: ${saleOrders.length}):`);
	if (saleOrders.length > 0) {
		console.log("First Sale Order:", JSON.stringify(saleOrders[0], null, 2));
	}
}

main().catch(console.error);
