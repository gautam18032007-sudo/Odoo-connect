import path from "node:path";
import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

/**
 * Postgres-backed rate limiting — chosen over ioredis (a listed but
 * completely unused dependency; no Redis instance exists in this
 * architecture) to avoid introducing a new infrastructure dependency for a
 * lightweight need. Additive only.
 */
async function migrate() {
	if (!process.env.DATABASE_URL) {
		console.error("Missing DATABASE_URL in environment.");
		process.exit(1);
	}

	console.log("Connecting to database...");
	const sql = neon(process.env.DATABASE_URL);

	console.log("Creating rate_limit_counters...");
	await sql`
		CREATE TABLE IF NOT EXISTS rate_limit_counters (
			key TEXT PRIMARY KEY,
			attempt_count INTEGER NOT NULL DEFAULT 1,
			window_start TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)
	`;

	console.log("✅ Rate limit schema migration completed successfully.");
}

migrate().catch((err) => {
	console.error("Migration failed:", err);
	process.exit(1);
});
