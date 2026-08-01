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
	const { OdooClient } = await import("../lib/odoo/client");
	const client = new OdooClient();
	await client.authenticate();

	console.log("=== DEBUGGING TODAY'S ODOO ORDERS ===");

	// Query last 30 pos orders regardless of date filter
	const posOrders = await client.callKw<any[]>("pos.order", "search_read", [], {
		domain: [["state", "in", ["paid", "done", "invoiced"]]],
		fields: ["id", "name", "date_order", "amount_total", "state"],
		limit: 30,
		order: "id desc",
	});

	console.log("Latest 30 POS Orders in Odoo SaaS:");
	console.table(posOrders);
}

main().catch(console.error);
