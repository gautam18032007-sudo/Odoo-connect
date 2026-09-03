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
	const { OdooClient } = await import("../../lib/odoo/client");
	const { syncSales } = await import("../../lib/odoo/sync/syncSales");

	console.log("=== TRIGGERING MANUAL INCREMENTAL SYNC NOW ===");
	const client = new OdooClient();
	await client.authenticate();

	const res = await syncSales(client, null);
	console.log("Sync Result: Synced", res, "orders.");
}

main().catch(console.error);
