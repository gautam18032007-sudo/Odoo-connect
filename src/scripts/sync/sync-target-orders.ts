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
	const { syncSingleRecord } = await import("../../lib/odoo/incremental-sync");
	console.log("=== SYNCING TARGET RECENT ORDERS 1619 & 1620 ===");

	const r19 = await syncSingleRecord("pos.order", 1619);
	console.log("Order 1619 Result:", r19);

	const r20 = await syncSingleRecord("pos.order", 1620);
	console.log("Order 1620 Result:", r20);
}

main().catch(console.error);
