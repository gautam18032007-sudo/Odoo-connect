import { type NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cron  — DEPRECATED
 *
 * This route is no longer the canonical Vercel Cron entry point.
 * The single registered backup cron is: /api/cron/odoo-sync
 *
 * This route is retained only to return a clear 410 Gone so that any
 * leftover external call (monitoring agent, manual trigger) immediately
 * signals the correct endpoint — rather than silently succeeding or 404-ing.
 *
 * @deprecated Use /api/cron/odoo-sync instead.
 */
export async function GET(_req: NextRequest) {
	console.warn(
		"[ODOO_CRON] /api/cron is deprecated. Use /api/cron/odoo-sync instead.",
	);
	return NextResponse.json(
		{
			error: "Gone",
			message:
				"This cron endpoint is deprecated. The canonical backup cron is /api/cron/odoo-sync.",
			canonical: "/api/cron/odoo-sync",
		},
		{ status: 410 },
	);
}

export async function POST(req: NextRequest) {
	return GET(req);
}
