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
	const { sql } = await import("../../lib/db");

	console.log("=== MIGRATING WEBHOOK_EVENTS SCHEMA IN NEON DB ===");

	await sql`
		CREATE TABLE IF NOT EXISTS webhook_events (
			id BIGSERIAL PRIMARY KEY,
			event_id VARCHAR(100) UNIQUE,
			model VARCHAR(50) NOT NULL,
			record_id INT NOT NULL,
			payload JSONB NOT NULL,
			status VARCHAR(20) NOT NULL DEFAULT 'pending',
			retry_count INT NOT NULL DEFAULT 0,
			error_message TEXT,
			received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			processed_at TIMESTAMPTZ
		);
	`;

	await sql`
		CREATE INDEX IF NOT EXISTS idx_webhook_events_status_model 
		ON webhook_events(status, model, record_id);
	`;

	console.log("✅ webhook_events table and indexes created successfully!");
}

main().catch((err) => {
	console.error("❌ Webhook schema migration failed:", err);
	process.exit(1);
});
