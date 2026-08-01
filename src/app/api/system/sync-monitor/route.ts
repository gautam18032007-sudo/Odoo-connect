import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { syncWorkerInstance } from "@/lib/odoo/sync/worker";

export const runtime = "nodejs";

export async function GET() {
	try {
		const workerState = syncWorkerInstance.getState();

		// Fetch recent telemetry logs from database
		const logs = await sql`
			SELECT 
				id, trace_id, sync_type, records_processed, status,
				started_at::text, completed_at::text, duration_ms, poll_interval_ms,
				rows_fetched, rows_inserted, rows_updated, rows_skipped,
				write_date_cursor, odoo_response_ms, database_write_ms, processing_ms,
				error_message
			FROM sync_telemetry
			ORDER BY id DESC
			LIMIT 25
		`;

		// Aggregate sync metrics by entity
		const entitySummary = await sql`
			SELECT 
				sync_type,
				COUNT(*)::int AS total_batches,
				COALESCE(SUM(records_processed), 0)::int AS total_records,
				MAX(completed_at)::text AS last_sync_at
			FROM sync_telemetry
			WHERE status = 'success'
			GROUP BY sync_type
		`;

		const memoryUsage = process.memoryUsage();

		return NextResponse.json({
			success: true,
			data: {
				worker: workerState,
				memory: {
					rssMb: Math.round(memoryUsage.rss / (1024 * 1024)),
					heapTotalMb: Math.round(memoryUsage.heapTotal / (1024 * 1024)),
					heapUsedMb: Math.round(memoryUsage.heapUsed / (1024 * 1024)),
				},
				entitySummary: entitySummary.map((e) => ({
					entity: e.sync_type,
					totalBatches: Number(e.total_batches),
					totalRecords: Number(e.total_records),
					lastSyncAt: e.last_sync_at,
				})),
				recentLogs: logs.map((l) => ({
					id: Number(l.id),
					traceId: l.trace_id || `tr_${l.id}`,
					syncType: l.sync_type,
					recordsProcessed: Number(l.records_processed || 0),
					status: l.status,
					startedAt: l.started_at,
					completedAt: l.completed_at,
					durationMs: Number(l.duration_ms || 0),
					odooResponseMs: Number(l.odoo_response_ms || 0),
					databaseWriteMs: Number(l.database_write_ms || 0),
					writeDateCursor: l.write_date_cursor || "N/A",
					errorMessage: l.error_message || null,
				})),
			},
		});
	} catch (error: any) {
		console.error("Failed to fetch sync monitor state:", error);
		return NextResponse.json(
			{
				success: false,
				error: error.message || "Failed to load sync monitor data",
			},
			{ status: 500 },
		);
	}
}
