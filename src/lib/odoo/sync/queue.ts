import { sql } from "../../db";
import { refreshMaterializedViews } from "../../materialized-views";
import { logSyncTelemetry } from "../../repositories/odoo.repository";
import type { OdooClient } from "../client";
import { syncCustomers } from "./syncCustomers";
import { syncInventory } from "./syncInventory";
import { syncProducts } from "./syncProducts";
import { syncSales } from "./syncSales";

export type QueueJobType =
	| "products"
	| "customers"
	| "inventory"
	| "sales_orders"
	| "analytics_refresh";

export type PriorityLevel = "HIGH" | "MEDIUM" | "LOW";

export interface QueueJob {
	id: string;
	type: QueueJobType;
	priority: PriorityLevel;
	lastSyncTime: string | null;
	attempts: number;
	maxRetries: number;
	createdAt: number;
}

export class SyncQueueManager {
	private queue: QueueJob[] = [];
	private deadLetterQueue: Array<QueueJob & { error: string }> = [];
	private isProcessing = false;

	/** Enqueue jobs grouped by priority */
	public enqueueBatch(lastSyncMap: Record<string, string | null>): void {
		const timestamp = Date.now();
		const jobDefs: Array<{ type: QueueJobType; priority: PriorityLevel }> = [
			{ type: "inventory", priority: "HIGH" },
			{ type: "sales_orders", priority: "HIGH" },
			{ type: "products", priority: "MEDIUM" },
			{ type: "customers", priority: "MEDIUM" },
			{ type: "analytics_refresh", priority: "LOW" },
		];

		for (const def of jobDefs) {
			const jobId = `${def.type}_${timestamp}`;
			if (!this.queue.some((j) => j.type === def.type)) {
				this.queue.push({
					id: jobId,
					type: def.type,
					priority: def.priority,
					lastSyncTime: lastSyncMap[def.type] || null,
					attempts: 0,
					maxRetries: 3,
					createdAt: timestamp,
				});
			}
		}
	}

	public getPendingCount(): number {
		return this.queue.length;
	}

	public getDeadLetterCount(): number {
		return this.deadLetterQueue.length;
	}

	public getDeadLetterJobs() {
		return [...this.deadLetterQueue];
	}

	private async executeSingleJob(
		client: OdooClient,
		job: QueueJob,
	): Promise<number> {
		const startedAt = new Date().toISOString();
		job.attempts += 1;

		try {
			let count = 0;
			if (job.type === "products") {
				count = await syncProducts(client, job.lastSyncTime);
			} else if (job.type === "customers") {
				count = await syncCustomers(client, job.lastSyncTime);
			} else if (job.type === "inventory") {
				count = await syncInventory(client);
			} else if (job.type === "sales_orders") {
				count = await syncSales(client, job.lastSyncTime);
			} else if (job.type === "analytics_refresh") {
				await refreshMaterializedViews(sql);
				count = 1;
			}

			await logSyncTelemetry(
				job.type,
				startedAt,
				new Date().toISOString(),
				"success",
				count,
				null,
				job.attempts,
				this.queue.length,
				"active",
			);

			return count;
		} catch (err: any) {
			const errMsg = err instanceof Error ? err.message : String(err);
			await logSyncTelemetry(
				job.type,
				startedAt,
				new Date().toISOString(),
				"failed",
				0,
				errMsg,
				job.attempts,
				this.queue.length,
				"active",
			);
			throw err;
		}
	}

	/** Process jobs concurrently by priority level */
	public async processQueue(client: OdooClient): Promise<{
		totalProcessedRecords: number;
		hasChanges: boolean;
		errors: string[];
	}> {
		if (this.isProcessing) {
			return { totalProcessedRecords: 0, hasChanges: false, errors: [] };
		}

		this.isProcessing = true;
		let totalProcessedRecords = 0;
		let hasChanges = false;
		const errors: string[] = [];

		// Group queued jobs by priority
		const highPriority = this.queue.filter((j) => j.priority === "HIGH");
		const mediumPriority = this.queue.filter((j) => j.priority === "MEDIUM");
		const lowPriority = this.queue.filter((j) => j.priority === "LOW");

		this.queue = [];

		// 1. Process HIGH priority (Inventory & Sales) simultaneously in parallel
		if (highPriority.length > 0) {
			const results = await Promise.allSettled(
				highPriority.map((j) => this.executeSingleJob(client, j)),
			);
			for (let i = 0; i < results.length; i++) {
				const res = results[i];
				const job = highPriority[i];
				if (res.status === "fulfilled") {
					totalProcessedRecords += res.value;
					if (res.value > 0) hasChanges = true;
				} else {
					errors.push(`${job.type}: ${res.reason?.message || res.reason}`);
					if (job.attempts < job.maxRetries) {
						this.queue.push(job);
					} else {
						this.deadLetterQueue.push({ ...job, error: String(res.reason) });
					}
				}
			}
		}

		// 2. Process MEDIUM priority (Products & Customers) simultaneously in parallel
		if (mediumPriority.length > 0) {
			const results = await Promise.allSettled(
				mediumPriority.map((j) => this.executeSingleJob(client, j)),
			);
			for (let i = 0; i < results.length; i++) {
				const res = results[i];
				const job = mediumPriority[i];
				if (res.status === "fulfilled") {
					totalProcessedRecords += res.value;
					if (res.value > 0) hasChanges = true;
				} else {
					errors.push(`${job.type}: ${res.reason?.message || res.reason}`);
					if (job.attempts < job.maxRetries) {
						this.queue.push(job);
					} else {
						this.deadLetterQueue.push({ ...job, error: String(res.reason) });
					}
				}
			}
		}

		// 3. Process LOW priority (Analytics Refresh)
		for (const job of lowPriority) {
			try {
				const count = await this.executeSingleJob(client, job);
				totalProcessedRecords += count;
				if (count > 0) hasChanges = true;
			} catch (err: any) {
				errors.push(`${job.type}: ${err.message}`);
			}
		}

		this.isProcessing = false;
		return { totalProcessedRecords, hasChanges, errors };
	}
}
