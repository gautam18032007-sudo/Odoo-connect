import { NextResponse } from "next/server";
import { syncWorkerInstance } from "@/lib/odoo/sync/worker";
import { getLatestTelemetryStatus } from "@/lib/repositories/odoo.repository";

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
		const workerState = syncWorkerInstance.getState();
		const telemetry = await getLatestTelemetryStatus();

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
