import { sql } from "../../db";

/**
 * Fixed advisory lock ID reserved for the Vercel Cron backup sync path.
 * Must not collide with any lock ID used by `reconciliation.ts`.
 * Chosen deterministically: 0x5A5B0101 (1516500225 decimal) — well within
 * JavaScript's Number.MAX_SAFE_INTEGER and PostgreSQL's bigint range.
 * Plain number (not BigInt literal) to remain compatible with ES2017 target.
 */
const CRON_BACKUP_LOCK_ID = 1516500225; // 0x5A5B0101

/**
 * Tries to acquire a PostgreSQL session-level advisory lock.
 * Non-blocking: returns false immediately if another session holds the lock.
 * The lock is automatically released when the database connection closes —
 * no explicit release is needed in the happy path, but we expose one so
 * the cron route can release early and keep connections short.
 *
 * @returns true if lock was acquired, false if already held by another session.
 */
export async function tryAcquireCronLock(): Promise<boolean> {
	try {
		const rows = await sql`
			SELECT pg_try_advisory_lock(${String(CRON_BACKUP_LOCK_ID)}::bigint) AS acquired
		`;
		return rows[0]?.acquired === true;
	} catch (err) {
		console.warn(
			"[cron-lock] pg_try_advisory_lock call failed (non-fatal):",
			err instanceof Error ? err.message : String(err),
		);
		// Fail open: if we cannot even check the lock, let the cron proceed.
		// Idempotent upserts guarantee correctness even in the rare overlap case.
		return true;
	}
}

/**
 * Releases the session-level advisory lock acquired via tryAcquireCronLock().
 * Safe to call even if the lock was never acquired — pg_advisory_unlock returns
 * false silently in that case.
 */
export async function releaseCronLock(): Promise<void> {
	try {
		await sql`
			SELECT pg_advisory_unlock(${String(CRON_BACKUP_LOCK_ID)}::bigint)
		`;
	} catch (err) {
		// Non-fatal: connection close will release the lock anyway.
		console.warn(
			"[cron-lock] pg_advisory_unlock call failed (non-fatal):",
			err instanceof Error ? err.message : String(err),
		);
	}
}
