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
	const { syncSales } = await import("../lib/odoo/sync/syncSales");

	console.log("\n=======================================================");
	console.log("=== LAYER 2 SYNC REPAIR FOR 31 JUL & 01 AUG 2026 IST ===");
	console.log("=======================================================\n");

	const client = new OdooClient();
	if (client.getMockModeStatus()) return;
	await client.authenticate();

	console.log("1. Running syncSales from Odoo SaaS (full catch-up sweep)...");
	const totalProcessed = await syncSales(client, null);
	console.log(`- Total orders processed during catch-up sweep: ${totalProcessed}`);

	console.log("\n=======================================================\n");
}

main().catch(console.error);
