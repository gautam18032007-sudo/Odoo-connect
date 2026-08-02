#!/usr/bin/env node
// Liveness probe for the always-on sync worker (Docker HEALTHCHECK / systemd
// watchdog / manual check). The worker has no HTTP port to curl, so this
// reads its persisted heartbeat row instead (worker_heartbeat table,
// written every poll cycle by AlwaysOnSyncWorker — see
// src/lib/odoo/sync/worker.ts). Exits 0 if a fresh heartbeat exists, 1
// otherwise. Never fabricates a healthy result: no row, DB error, or a stale
// row are all treated as unhealthy.
import * as fs from "node:fs";
import * as path from "node:path";

const FRESHNESS_SECONDS = Number(process.env.WORKER_HEALTH_FRESHNESS_SECONDS || 120);

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
	if (!process.env.DATABASE_URL) {
		console.error("[check-worker-health] Missing DATABASE_URL.");
		process.exit(1);
	}

	const { neon } = await import("@neondatabase/serverless");
	const sql = neon(process.env.DATABASE_URL);

	const rows = await sql`
		SELECT hostname, updated_at::text,
			EXTRACT(EPOCH FROM (NOW() - updated_at))::int AS seconds_ago
		FROM worker_heartbeat
		WHERE worker_id = 'main'
		LIMIT 1
	`;

	if (rows.length === 0) {
		console.error("[check-worker-health] UNHEALTHY: no heartbeat row found yet.");
		process.exit(1);
	}

	const secondsAgo = Number(rows[0].seconds_ago);
	if (secondsAgo > FRESHNESS_SECONDS) {
		console.error(
			`[check-worker-health] UNHEALTHY: heartbeat is ${secondsAgo}s old (threshold ${FRESHNESS_SECONDS}s).`,
		);
		process.exit(1);
	}

	console.log(
		`[check-worker-health] healthy: heartbeat ${secondsAgo}s ago from ${rows[0].hostname}.`,
	);
	process.exit(0);
}

main().catch((err) => {
	console.error("[check-worker-health] UNHEALTHY: error checking heartbeat:", err.message);
	process.exit(1);
});
