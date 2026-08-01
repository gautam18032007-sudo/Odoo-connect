import * as fs from "node:fs";
import * as path from "node:path";

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
	const { OdooClient } = await import("../lib/odoo/client");

	console.log("=== ODOO ORDER DATE_ORDER STRING TEST ===");

	const client = new OdooClient();
	if (client.getMockModeStatus()) {
		console.log("Mock mode. Exiting.");
		return;
	}

	await client.authenticate();

	const odooOrder = await client.callKw<any[]>("pos.order", "search_read", [], {
		domain: [["id", "=", 1443]],
		fields: ["id", "name", "date_order", "amount_total"],
	});

	console.log("Odoo pos.order ID 1443 raw response:", odooOrder[0]);
}

main().catch(console.error);
