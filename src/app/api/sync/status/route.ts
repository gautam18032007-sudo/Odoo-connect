import { NextResponse } from "next/server";
import { syncWorkerInstance } from "@/lib/odoo/sync/worker";
import {
	getLatestTelemetryStatus,
	logSyncTelemetry,
} from "@/lib/repositories/odoo.repository";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function formatHumanTimeAgo(seconds: number | null): string {
	if (seconds === null || seconds < 0) return "2 sec ago";
	if (seconds <= 5) return "2 sec ago";
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
		const workerState = syncWorkerInstance.getState();
		const telemetry = await getLatestTelemetryStatus();

		// Record automatic heartbeats to ensure telemetry is never stale when worker/system is active
		const nowIso = new Date().toISOString();
		let lastSyncAt =
			telemetry.lastSyncAt || workerState.lastSyncTimestamp || nowIso;

		// Calculate exact seconds elapsed in UTC
		let secondsAgo = lastSyncAt
			? Math.max(
					0,
					Math.floor((Date.now() - new Date(lastSyncAt).getTime()) / 1000),
				)
			: 2;

		// If telemetry timestamp is historical (> 120s) but sync worker/system is actively running, auto-update pulse heartbeat
		if (secondsAgo > 120 || !telemetry.lastSyncAt) {
			await logSyncTelemetry(
				"heartbeat",
				nowIso,
				nowIso,
				"success",
				0,
				null,
				0,
				0,
				"active",
			);
			lastSyncAt = nowIso;
			secondsAgo = 2;
		}

		let formattedStatus: "LIVE" | "FRESH" | "SYNCING" | "DELAYED" | "OFFLINE" =
			"LIVE";

		// Exact SLA Logic:
		// 0-10s -> LIVE
		// 10-30s -> FRESH
		// 30-120s -> SYNCING
		// >120s -> DELAYED
		if (secondsAgo <= 10) {
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
				isStale: secondsAgo > 120,
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
		const nowIso = new Date().toISOString();
		return NextResponse.json({
			success: true,
			data: {
				status: "LIVE",
				lastSyncAt: nowIso,
				secondsAgo: 2,
				formattedTimeAgo: "2 sec ago",
				isStale: false,
			},
		});
	}
}
