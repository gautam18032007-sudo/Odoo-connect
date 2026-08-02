import { NextResponse } from "next/server";
import { syncWorkerInstance } from "@/lib/odoo/sync/worker";
import {
	getLatestTelemetryStatus,
	getWorkerHeartbeat,
} from "@/lib/repositories/odoo.repository";

// A heartbeat older than this is treated as stale, not as evidence the
// worker is running — same "never fabricate freshness" principle as the
// sync telemetry freshness fix.
const HEARTBEAT_FRESHNESS_SECONDS = 120;

export const dynamic = "force-dynamic";
export const revalidate = 0;

function formatHumanTimeAgo(seconds: number | null): string {
	if (seconds === null) return "Never synced";
	if (seconds < 0) return "just now";
	if (seconds <= 10) return `${seconds} sec ago`;
	if (seconds <= 30) return `${seconds} sec ago`;
	if (seconds <= 120) return `${seconds} sec ago`;
	const mins = Math.floor(seconds / 60);
	if (mins < 60) return `${mins} min ago`;
	const hours = Math.floor(mins / 60);
	if (hours < 24) return `${hours} hr ago`;
	const days = Math.floor(hours / 24);
	return `${days} day${days === 1 ? "" : "s"} ago`;
}

export async function GET() {
	try {
		const inProcessState = syncWorkerInstance.getState();
		const telemetry = await getLatestTelemetryStatus();

		// If this process's own worker singleton was never started (e.g. this
		// API is served by Vercel while the actual worker runs on a separate
		// host), fall back to the persisted heartbeat instead of reporting a
		// meaningless idle default — but only if that heartbeat is still fresh.
		let workerState = inProcessState;
		let workerSource: "in_process" | "heartbeat" | "none" = "in_process";
		if (!inProcessState.isRunning) {
			const heartbeat = await getWorkerHeartbeat("main");
			if (heartbeat && heartbeat.secondsAgo <= HEARTBEAT_FRESHNESS_SECONDS) {
				workerState = heartbeat.state as unknown as typeof inProcessState;
				workerSource = "heartbeat";
			} else if (!heartbeat) {
				workerSource = "none";
			}
		}

		// Report the REAL last-sync timestamp — never fabricate one. A stale or
		// missing timestamp must surface as DELAYED/OFFLINE, not be papered over.
		const lastSyncAt =
			telemetry.lastSyncAt || workerState.lastSyncTimestamp || null;

		const secondsAgo = lastSyncAt
			? Math.max(
					0,
					Math.floor((Date.now() - new Date(lastSyncAt).getTime()) / 1000),
				)
			: null;

		// Exact SLA Logic:
		// no sync ever recorded -> OFFLINE
		// 0-10s -> LIVE
		// 10-30s -> FRESH
		// 30-120s -> SYNCING
		// >120s -> DELAYED
		let formattedStatus: "LIVE" | "FRESH" | "SYNCING" | "DELAYED" | "OFFLINE";
		if (secondsAgo === null) {
			formattedStatus = "OFFLINE";
		} else if (secondsAgo <= 10) {
			formattedStatus = "LIVE";
		} else if (secondsAgo <= 30) {
			formattedStatus = "FRESH";
		} else if (secondsAgo <= 120) {
			formattedStatus = "SYNCING";
		} else {
			formattedStatus = "DELAYED";
		}

		const response = NextResponse.json({
			success: true,
			data: {
				status: formattedStatus,
				lastSyncAt,
				secondsAgo,
				formattedTimeAgo: formatHumanTimeAgo(secondsAgo),
				isStale: secondsAgo === null || secondsAgo > 120,
				workerSource,
				entityStatuses: telemetry.entityStatuses,
			},
		});

		// Enforce no-cache HTTP headers
		response.headers.set(
			"Cache-Control",
			"no-store, no-cache, must-revalidate, proxy-revalidate",
		);
		response.headers.set("Pragma", "no-cache");
		response.headers.set("Expires", "0");

		return response;
	} catch (error: any) {
		console.error("Failed to fetch sync status:", error);
		// Honest failure state — never claim LIVE when the real status is unknown.
		return NextResponse.json({
			success: true,
			data: {
				status: "OFFLINE",
				lastSyncAt: null,
				secondsAgo: null,
				formattedTimeAgo: "Unknown",
				isStale: true,
			},
		});
	}
}
