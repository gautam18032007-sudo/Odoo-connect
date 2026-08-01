import path from "node:path";
import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

async function migrate() {
	if (!process.env.DATABASE_URL) {
		console.log("Missing DATABASE_URL. Skipping migration.");
		return;
	}

	const sql = neon(process.env.DATABASE_URL);
	console.log(
		"Migrating sync_telemetry for Phase 3 Trace IDs & Production Observability...",
	);

	await sql`
		ALTER TABLE sync_telemetry 
		ADD COLUMN IF NOT EXISTS trace_id TEXT,
		ADD COLUMN IF NOT EXISTS worker_id TEXT DEFAULT 'worker_main',
		ADD COLUMN IF NOT EXISTS finished_at TIMESTAMP WITH TIME ZONE,
		ADD COLUMN IF NOT EXISTS duration_ms INTEGER DEFAULT 0,
		ADD COLUMN IF NOT EXISTS poll_interval_ms INTEGER DEFAULT 2000,
		ADD COLUMN IF NOT EXISTS entity TEXT,
		ADD COLUMN IF NOT EXISTS rows_fetched INTEGER DEFAULT 0,
		ADD COLUMN IF NOT EXISTS rows_inserted INTEGER DEFAULT 0,
		ADD COLUMN IF NOT EXISTS rows_updated INTEGER DEFAULT 0,
		ADD COLUMN IF NOT EXISTS rows_skipped INTEGER DEFAULT 0,
		ADD COLUMN IF NOT EXISTS write_date_cursor TEXT,
		ADD COLUMN IF NOT EXISTS odoo_response_ms INTEGER DEFAULT 0,
		ADD COLUMN IF NOT EXISTS database_write_ms INTEGER DEFAULT 0,
		ADD COLUMN IF NOT EXISTS processing_ms INTEGER DEFAULT 0;
	`;

	console.log("✅ Sync telemetry Phase 3 schema migration completed.");
}

migrate().catch((err) => {
	console.error("❌ Telemetry Phase 3 migration failed:", err);
});
