import * as os from "node:os";
import {
	getAllLastSyncTimes,
	getDeadLetterQueueCount,
	upsertWorkerHeartbeat,
} from "../../repositories/odoo.repository";
import { OdooClient } from "../client";
import { SyncQueueManager } from "./queue";

const WORKER_ID = "main";

export interface SyncWorkerState {
	isRunning: boolean;
	currentIntervalMs: number;
	lastSyncTimestamp: string | null;
	lastChangeTimestamp: number;
	consecutiveErrors: number;
	totalRecordsSynced: number;
	activeJobCount: number;
	deadLetterCount: number;
	lastStatus: "idle" | "active" | "error" | "backing_off";
}

const FAST_POLL_INTERVAL_MS = 2000; // 2 seconds when changes detected
const LARGE_IMPORT_POLL_MS = 1000; // 1 second during massive bulk activity
const SLOW_POLL_INTERVAL_MS = 15000; // 15 seconds when idle > 5 mins
const IDLE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

export class AlwaysOnSyncWorker {
	private client: OdooClient;
	private queueManager: SyncQueueManager;
	private state: SyncWorkerState;
	private shouldStop = false;

	constructor() {
		this.client = new OdooClient();
		this.queueManager = new SyncQueueManager();
		this.state = {
			isRunning: false,
			currentIntervalMs: FAST_POLL_INTERVAL_MS,
			lastSyncTimestamp: null,
			lastChangeTimestamp: Date.now(),
			consecutiveErrors: 0,
			totalRecordsSynced: 0,
			activeJobCount: 0,
			deadLetterCount: 0,
			lastStatus: "idle",
		};
	}

	public getState(): SyncWorkerState {
		return {
			...this.state,
			activeJobCount: this.queueManager.getPendingCount(),
			deadLetterCount: this.queueManager.getDeadLetterCount(),
		};
	}

	/**
	 * Same as getState(), but with deadLetterCount sourced from the
	 * persisted sync_dead_letter_queue table instead of the in-memory
	 * SyncQueueManager counter. Used only for the heartbeat write below —
	 * that's the value external consumers (/api/health, /api/sync/status
	 * reading a remote heartbeat) actually see, and it must reflect durable
	 * state, not this process's in-memory count, which a forensic audit
	 * confirmed can silently diverge from the table (insertDeadLetterJob's
	 * own DB write can fail independently of the in-memory push).
	 * Falls back to the in-memory count if the DB read itself fails, so a
	 * transient DB error can't block the heartbeat write entirely.
	 */
	private async getPersistedState(): Promise<SyncWorkerState> {
		const inMemoryState = this.getState();
		try {
			const persistedDeadLetterCount = await getDeadLetterQueueCount();
			return { ...inMemoryState, deadLetterCount: persistedDeadLetterCount };
		} catch (err: any) {
			console.warn(
				"[AlwaysOnSyncWorker] Failed to read persisted DLQ count for heartbeat (using in-memory count):",
				err.message,
			);
			return inMemoryState;
		}
	}

	public stop(): void {
		console.log("🛑 Stopping Always-On Odoo Sync Worker...");
		this.shouldStop = true;
	}

	private triggerCacheRevalidation(): void {
		const appUrl = process.env.NEXT_PUBLIC_APP_URL;
		const secret = process.env.INTERNAL_API_SECRET;
		if (!appUrl || !secret) {
			return; // Not configured — dashboard falls back to client polling.
		}

		fetch(`${appUrl.replace(/\/$/, "")}/api/internal/revalidate`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-internal-secret": secret,
			},
			body: "{}",
		}).catch((err) => {
			console.warn(
				"[AlwaysOnSyncWorker] Cache revalidation call failed (non-fatal):",
				err.message,
			);
		});
	}

	public async start(): Promise<void> {
		if (this.state.isRunning) {
			console.log("⚠️ Sync Worker is already running.");
			return;
		}

		this.state.isRunning = true;
		this.shouldStop = false;
		console.log("==================================================");
		console.log("🚀 Always-On Odoo Sync Worker Engine Started.");
		console.log("==================================================");

		// Initial authentication attempt
		try {
			await this.client.authenticate();
			console.log("✅ Sync Worker authenticated with Odoo SaaS.");
		} catch (authErr: any) {
			console.error(
				"⚠️ Initial authentication failed. Proceeding in resilient retry loop:",
				authErr.message,
			);
		}

		while (!this.shouldStop) {
			const cycleStart = Date.now();

			try {
				// Re-authenticate if session lost
				await this.client.authenticate();

				// Get timestamps per entity in a single grouped query
				const lastSyncMap = await getAllLastSyncTimes();

				// Enqueue jobs in foreign key order
				this.queueManager.enqueueBatch(lastSyncMap);

				// Process queue
				const result = await this.queueManager.processQueue(this.client);

				this.state.totalRecordsSynced += result.totalProcessedRecords;

				if (result.errors.length > 0) {
					this.state.consecutiveErrors += 1;
					this.state.lastStatus = "error";
				} else {
					this.state.consecutiveErrors = 0;
				}

				if (result.hasChanges) {
					this.state.lastChangeTimestamp = Date.now();
					this.state.lastStatus = "active";

					// Large import check: if > 500 records processed in single loop, accelerate to 1s
					if (result.totalProcessedRecords > 500) {
						this.state.currentIntervalMs = LARGE_IMPORT_POLL_MS;
					} else {
						this.state.currentIntervalMs = FAST_POLL_INTERVAL_MS;
					}

					// Bridge to Next.js cache invalidation — revalidateTag/Path only
					// work inside a real request context, which this standalone
					// process isn't, so we call into one via HTTP instead.
					// Fire-and-forget: a failure here must never stall the poll loop.
					this.triggerCacheRevalidation();
				} else {
					// Adaptive polling calculation
					const timeSinceLastChange =
						Date.now() - this.state.lastChangeTimestamp;
					if (timeSinceLastChange > IDLE_THRESHOLD_MS) {
						this.state.currentIntervalMs = SLOW_POLL_INTERVAL_MS;
						this.state.lastStatus = "backing_off";
					} else {
						this.state.currentIntervalMs = FAST_POLL_INTERVAL_MS;
						this.state.lastStatus = "idle";
					}
				}

				this.state.lastSyncTimestamp = new Date().toISOString();
			} catch (err: any) {
				this.state.consecutiveErrors += 1;
				this.state.lastStatus = "error";
				console.error(
					`❌ Worker loop exception (Consecutive errors: ${this.state.consecutiveErrors}):`,
					err.message,
				);

				// Error backoff: 5s, 10s, max 30s
				const errorBackoff = Math.min(
					5000 * 2 ** (this.state.consecutiveErrors - 1),
					30000,
				);
				this.state.currentIntervalMs = errorBackoff;
			}

			// Persist heartbeat so /api/sync/status and /api/health can report
			// this worker's real state even when it runs on a separate host.
			// Fire-and-forget — a heartbeat write failure must never stall sync.
			this.getPersistedState()
				.then((state) => upsertWorkerHeartbeat(WORKER_ID, os.hostname(), state))
				.catch((err) => {
					console.warn(
						"[AlwaysOnSyncWorker] Failed to persist heartbeat:",
						err.message,
					);
				});

			// Calculate remaining sleep time for consistent loop pacing
			const elapsed = Date.now() - cycleStart;
			const sleepTime = Math.max(0, this.state.currentIntervalMs - elapsed);

			if (!this.shouldStop) {
				await new Promise((res) => setTimeout(res, sleepTime));
			}
		}

		this.state.isRunning = false;
		console.log("🏁 Sync Worker process terminated cleanly.");
	}
}

// Singleton global instance for server-side Next.js execution if needed
const globalForWorker = globalThis as unknown as {
	__odooSyncWorkerInstance?: AlwaysOnSyncWorker;
};

export const syncWorkerInstance =
	globalForWorker.__odooSyncWorkerInstance || new AlwaysOnSyncWorker();

if (process.env.NODE_ENV !== "production") {
	globalForWorker.__odooSyncWorkerInstance = syncWorkerInstance;
}
