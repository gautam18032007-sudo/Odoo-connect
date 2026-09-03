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
	const { GET: cronGet } = await import("../../app/api/cron/odoo-sync/route");
	const { NextRequest } = await import("next/server");

	console.log("=== TESTING BACKUP CRON SYNC ENDPOINT /api/cron/odoo-sync ===");

	const secret = process.env.CRON_SECRET || "zenzebra_cron_secret_2026";
	process.env.CRON_SECRET = secret;

	const req = new NextRequest("http://localhost:3000/api/cron/odoo-sync", {
		headers: {
			authorization: `Bearer ${secret}`,
		},
	});
	const res = await cronGet(req);
	const data = await res.json();

	console.log("Cron API HTTP Status:", res.status);
	console.log("Cron API Response Data:", JSON.stringify(data, null, 2));
}

main().catch(console.error);
