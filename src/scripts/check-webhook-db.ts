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
	const { sql } = await import("../lib/db");
	console.log("=== CHECKING NEON DB WEBHOOK EVENTS TABLE ===");
	try {
		const events = await sql`
			SELECT id, event_id, model, record_id, status, received_at, processed_at, error_message 
			FROM webhook_events 
			ORDER BY received_at DESC 
			LIMIT 20
		`;
		console.log("Total Webhook Events found in DB:", events.length);
		console.log(JSON.stringify(events, null, 2));
	} catch (err: any) {
		console.error("DB Error:", err.message);
	}
}

main().catch(console.error);
