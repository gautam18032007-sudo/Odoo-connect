import path from "node:path";
import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

/**
 * Persists two things the in-memory AlwaysOnSyncWorker/SyncQueueManager
 * previously lost on every restart:
 * - sync_dead_letter_queue: jobs that exhausted retries during polling sync
 *   (mirrors the already-persisted webhook_events dead-letter pattern).
 * - worker_heartbeat: the worker's last-known state, so /api/sync/status can
 *   report the real state of a worker running on a separate host (e.g. an
 *   Oracle VM) instead of an unstarted in-process singleton.
 * Additive only — does not touch sync_telemetry or any production read path.
 */
async function migrate() {
	if (!process.env.DATABASE_URL) {
		console.error("Missing DATABASE_URL in environment.");
		process.exit(1);
	}

	console.log("Connecting to database...");
	const sql = neon(process.env.DATABASE_URL);

	console.log("Creating sync_dead_letter_queue...");
	await sql`
		CREATE TABLE IF NOT EXISTS sync_dead_letter_queue (
			id BIGSERIAL PRIMARY KEY,
			job_type TEXT NOT NULL,
			attempts INTEGER NOT NULL,
			error_message TEXT NOT NULL,
			last_sync_time TEXT,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			resolved_at TIMESTAMPTZ,
			status TEXT NOT NULL DEFAULT 'dead_letter'
		)
	`;
	await sql`
		CREATE INDEX IF NOT EXISTS idx_sync_dlq_status ON sync_dead_letter_queue(status)
	`;

	console.log("Creating worker_heartbeat...");
	await sql`
		CREATE TABLE IF NOT EXISTS worker_heartbeat (
			worker_id TEXT PRIMARY KEY,
			hostname TEXT,
			state JSONB NOT NULL,
			updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)
	`;

	console.log(
		"✅ Sync DLQ / worker heartbeat schema migration completed successfully.",
	);
}

migrate().catch((err) => {
	console.error("Migration failed:", err);
	process.exit(1);
});
