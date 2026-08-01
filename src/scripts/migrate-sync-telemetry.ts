import path from "node:path";
import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

async function migrate() {
	if (!process.env.DATABASE_URL) {
		console.log("No DATABASE_URL found. Skipping migration.");
		return;
	}

	const sql = neon(process.env.DATABASE_URL);

	console.log(
		"Updating sync_telemetry schema for real-time telemetry tracking...",
	);

	await sql`
		CREATE TABLE IF NOT EXISTS sync_telemetry (
			id SERIAL PRIMARY KEY,
			sync_type TEXT NOT NULL,
			records_processed INTEGER DEFAULT 0,
			status TEXT NOT NULL,
			started_at TIMESTAMP WITH TIME ZONE NOT NULL,
			completed_at TIMESTAMP WITH TIME ZONE,
			error_message TEXT,
			retry_count INTEGER DEFAULT 0,
			queue_length INTEGER DEFAULT 0,
			worker_state TEXT DEFAULT 'idle'
		);
	`;

	await sql`
		ALTER TABLE sync_telemetry 
		ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0,
		ADD COLUMN IF NOT EXISTS queue_length INTEGER DEFAULT 0,
		ADD COLUMN IF NOT EXISTS worker_state TEXT DEFAULT 'idle';
	`;

	console.log("✅ Sync telemetry schema updated successfully.");
}

migrate().catch((err) => {
	console.error("❌ Telemetry migration error:", err);
});
