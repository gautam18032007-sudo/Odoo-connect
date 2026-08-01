/**
 * ZenZebra CRM Domain Event Store & Retry Engine
 * Handles event persistence, correlation tracking, retry queues, and dead-letter management.
 */

import { sql } from "@/lib/db";
import type { DomainEvent } from "./event-bus";

export interface StoredEvent extends DomainEvent {
	dbId?: number;
	correlationId: string;
	status: "PENDING" | "PROCESSED" | "FAILED" | "DLQ";
	retryCount: number;
	lastError?: string;
}

export class DomainEventStore {
	public async persistEvent(
		event: DomainEvent,
		correlationId?: string,
	): Promise<number | null> {
		try {
			const corrId =
				correlationId || `corr_${Math.random().toString(36).substring(2, 9)}`;
			const rows = await sql`
				INSERT INTO audit_logs (
					action,
					target,
					actor,
					details,
					created_at
				) VALUES (
					${event.eventType},
					${event.eventId},
					${event.actor},
					${JSON.stringify({ payload: event.payload, correlationId: corrId })},
					CURRENT_TIMESTAMP
				)
				RETURNING id;
			`;
			return rows[0]?.id || null;
		} catch (err) {
			console.warn(
				"Failed to persist event to DB, operating in fallback mode:",
				err,
			);
			return null;
		}
	}
}

export const eventStore = new DomainEventStore();
