import { sql } from "../db";

export interface RateLimitResult {
	allowed: boolean;
	attemptCount: number;
	maxAttempts: number;
}

/**
 * Postgres-backed sliding-window-ish rate limiter (fixed window, reset on
 * expiry) — chosen over Redis since no Redis instance exists in this
 * architecture (ioredis is a listed but entirely unused dependency).
 * Single atomic upsert avoids a read-then-write race between concurrent
 * requests incrementing the same key.
 */
export async function checkRateLimit(
	key: string,
	maxAttempts: number,
	windowSeconds: number,
): Promise<RateLimitResult> {
	const result = await sql`
		INSERT INTO rate_limit_counters (key, attempt_count, window_start)
		VALUES (${key}, 1, NOW())
		ON CONFLICT (key) DO UPDATE SET
			attempt_count = CASE
				WHEN rate_limit_counters.window_start < NOW() - (${windowSeconds} * interval '1 second')
				THEN 1
				ELSE rate_limit_counters.attempt_count + 1
			END,
			window_start = CASE
				WHEN rate_limit_counters.window_start < NOW() - (${windowSeconds} * interval '1 second')
				THEN NOW()
				ELSE rate_limit_counters.window_start
			END
		RETURNING attempt_count
	`;

	const attemptCount = Number(result[0]?.attempt_count || 0);
	return {
		allowed: attemptCount <= maxAttempts,
		attemptCount,
		maxAttempts,
	};
}

/** Best-effort client IP extraction for a Next.js request. */
export function getClientIp(req: Request): string {
	const forwardedFor = req.headers.get("x-forwarded-for");
	if (forwardedFor) {
		return forwardedFor.split(",")[0].trim();
	}
	return req.headers.get("x-real-ip") || "unknown";
}
