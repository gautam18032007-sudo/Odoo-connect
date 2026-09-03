import { sql } from "../db";
import { syncSingleRecord } from "./incremental-sync";

export interface WebhookPayload {
	id: number;
	model: string;
	event_id?: string;
	write_date?: string;
	[key: string]: any;
}

/**
 * Validates webhook security secret token.
 */
export function verifyWebhookSecret(
	headers: Headers,
	searchParams: URLSearchParams,
): boolean {
	const expectedSecret = process.env.ODOO_WEBHOOK_SECRET;
	if (!expectedSecret) {
		console.error(
			"[webhookSecret] ODOO_WEBHOOK_SECRET is not configured — rejecting all webhook requests (fail closed).",
		);
		return false;
	}

	const headerSecret = headers.get("x-webhook-secret");
	const authHeader = headers.get("authorization");
	const bearerToken = authHeader?.startsWith("Bearer ")
		? authHeader.substring(7)
		: null;
	const querySecret = searchParams.get("secret");

	const providedSecret = headerSecret || bearerToken || querySecret;
	return providedSecret === expectedSecret;
}

/**
 * Enrolls an incoming webhook event into `webhook_events` table for deduplication and audit logging.
 */
export async function enqueueWebhookEvent(payload: WebhookPayload): Promise<{
	eventId: string;
	isDuplicate: boolean;
}> {
	const model = String(payload.model || "unknown");
	const recordId = Number(payload.id || 0);
	const eventId = payload.event_id || `evt_${model}_${recordId}_${Date.now()}`;

	try {
		const existing = await sql`
			SELECT id, status FROM webhook_events
			WHERE event_id = ${eventId} OR (model = ${model} AND record_id = ${recordId} AND status = 'processed' AND received_at > NOW() - INTERVAL '10 seconds')
			LIMIT 1
		`;

		if (existing && existing.length > 0) {
			console.log(
				`[webhookHandler] Deduplicated event ${eventId} (already ${existing[0].status})`,
			);
			return { eventId, isDuplicate: true };
		}

		await sql`
			INSERT INTO webhook_events (
				event_id, model, record_id, payload, status
			) VALUES (
				${eventId}, ${model}, ${recordId}, ${JSON.stringify(payload)}, 'pending'
			)
			ON CONFLICT (event_id) DO NOTHING
		`;

		return { eventId, isDuplicate: false };
	} catch (err) {
		console.error("[webhookHandler] Error enqueuing webhook event:", err);
		return { eventId, isDuplicate: false };
	}
}

/**
 * Processes a queued webhook event with PostgreSQL advisory locking to prevent race conditions.
 */
export async function processWebhookEvent(eventId: string): Promise<void> {
	try {
		// Acquire PostgreSQL advisory lock based on hashtext of eventId
		await sql`SELECT pg_advisory_xact_lock(hashtext(${eventId}));`;

		const rows = await sql`
			SELECT id, model, record_id, payload, retry_count
			FROM webhook_events
			WHERE event_id = ${eventId} AND status IN ('pending', 'failed')
			LIMIT 1
		`;

		if (!rows || rows.length === 0) {
			return; // already processed or non-existent
		}

		const eventRow = rows[0];
		const model = String(eventRow.model);
		const recordId = Number(eventRow.record_id);
		const retryCount = Number(eventRow.retry_count || 0);

		console.log(
			`[webhookHandler] Processing event ${eventId} (${model} #${recordId})`,
		);

		const result = await syncSingleRecord(model, recordId);

		if (result.success) {
			await sql`
				UPDATE webhook_events SET
					status = 'processed',
					processed_at = NOW(),
					error_message = NULL
				WHERE event_id = ${eventId}
			`;
			console.log(`[webhookHandler] Successfully processed event ${eventId}`);
		} else {
			const newRetry = retryCount + 1;
			const isDead = newRetry >= 3;
			const newStatus = isDead ? "dead_letter" : "failed";

			await sql`
				UPDATE webhook_events SET
					status = ${newStatus},
					retry_count = ${newRetry},
					error_message = ${result.message}
				WHERE event_id = ${eventId}
			`;
			console.warn(
				`[webhookHandler] Event ${eventId} failed (attempt ${newRetry}): ${result.message}`,
			);
		}
	} catch (err) {
		const errMsg = err instanceof Error ? err.message : String(err);
		console.error(
			`[webhookHandler] Unhandled error processing ${eventId}:`,
			errMsg,
		);

		await sql`
			UPDATE webhook_events SET
				status = 'failed',
				retry_count = retry_count + 1,
				error_message = ${errMsg}
			WHERE event_id = ${eventId}
		`;
	}
}
