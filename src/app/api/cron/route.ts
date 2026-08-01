import { type NextRequest, NextResponse } from "next/server";
import { runSyncPipeline } from "@/lib/odoo/sync/orchestrator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cron
 * Default Vercel Cron entry point for background Odoo synchronization.
 */
export async function GET(req: NextRequest) {
	const startTime = Date.now();
	const authHeader =
		req.headers.get("authorization") || req.headers.get("Authorization");
	const searchParams = req.nextUrl.searchParams;
	const bearerToken = authHeader?.startsWith("Bearer ")
		? authHeader.substring(7)
		: null;
	const querySecret = searchParams.get("secret");

	const providedSecret = bearerToken || querySecret;
	const expectedSecret = process.env.CRON_SECRET;

	if (expectedSecret && providedSecret !== expectedSecret) {
		console.warn("[ODOO_CRON] Rejected unauthorized cron trigger attempt");
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	console.log("[ODOO_CRON_EXECUTED]", new Date().toISOString());
	console.log(
		"[ODOO_CRON] Starting 1-minute scheduled incremental backup sync...",
	);

	try {
		await runSyncPipeline();
		const durationMs = Date.now() - startTime;
		const durationSec = (durationMs / 1000).toFixed(1);

		return NextResponse.json({
			success: true,
			timestamp: new Date().toISOString(),
			duration: `${durationSec}s`,
			durationMs,
			message:
				"Odoo cron endpoint working. Backup sync completed successfully.",
		});
	} catch (error: any) {
		const durationMs = Date.now() - startTime;
		console.error("[ODOO_CRON] Backup sync failed:", error.message);
		return NextResponse.json(
			{
				success: false,
				error: error.message || "Cron sync pipeline error",
				timestamp: new Date().toISOString(),
				durationMs,
			},
			{ status: 500 },
		);
	}
}

export async function POST(req: NextRequest) {
	return GET(req);
}
