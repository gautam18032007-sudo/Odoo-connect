/**
 * ZenZebra CRM Domain Event Bus
 * Implements Event-Driven Architecture to decouple side effects (notifications, activity logs, analytics).
 */

export type DomainEventType =
	| "LeadCreated"
	| "LeadQualified"
	| "ProposalSent"
	| "ContractSigned"
	| "PaymentReceived"
	| "CustomerCreated"
	| "SalesBatchUploaded";

export interface DomainEvent<T = any> {
	eventId: string;
	eventType: DomainEventType;
	timestamp: string;
	actor: string;
	payload: T;
}

type EventListener<T = any> = (event: DomainEvent<T>) => void | Promise<void>;

class DomainEventBus {
	private listeners: Map<DomainEventType, Set<EventListener>> = new Map();

	public subscribe<T>(
		eventType: DomainEventType,
		listener: EventListener<T>,
	): () => void {
		if (!this.listeners.has(eventType)) {
			this.listeners.set(eventType, new Set());
		}
		this.listeners.get(eventType)?.add(listener);

		return () => {
			this.listeners.get(eventType)?.delete(listener);
		};
	}

	public async publish<T>(
		eventType: DomainEventType,
		actor: string,
		payload: T,
	): Promise<void> {
		const event: DomainEvent<T> = {
			eventId: `evt_${Math.random().toString(36).substring(2, 9)}_${Date.now()}`,
			eventType,
			timestamp: new Date().toISOString(),
			actor,
			payload,
		};

		if (process.env.NODE_ENV === "development") {
			console.log(
				`[EVENT_BUS] Event Emitted: ${eventType} by ${actor}`,
				payload,
			);
		}

		const eventListeners = this.listeners.get(eventType);
		if (eventListeners) {
			const promises = Array.from(eventListeners).map((listener) => {
				try {
					return Promise.resolve(listener(event));
				} catch (err) {
					console.error(`Error in event listener for ${eventType}:`, err);
					return Promise.resolve();
				}
			});
			await Promise.all(promises);
		}
	}
}

export const eventBus = new DomainEventBus();
