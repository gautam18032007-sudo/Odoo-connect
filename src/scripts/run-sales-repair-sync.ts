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
	const { syncSales } = await import("../lib/odoo/sync/syncSales");

	console.log("\n=======================================================");
	console.log(
		"=== RUNNING SALES REPAIR SYNC (FULL OVERWRITE WITH AUTO-PRODUCT RECOVERY) ===",
	);
	console.log("=======================================================\n");

	const client = new OdooClient();
	if (client.getMockModeStatus()) return;
	await client.authenticate();

	const count = await syncSales(client, null);
	console.log(
		`\nSales repair sync completed. Total orders processed: ${count}`,
	);

	console.log("\n=======================================================\n");
}

main().catch(console.error);
