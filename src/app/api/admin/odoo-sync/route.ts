import { type NextRequest, NextResponse } from "next/server";
import { GET as odooSyncGET } from "../../cron/odoo-sync/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/odoo-sync?mode=delta
 *
 * Authenticated Odoo Incremental (Delta) Sync API endpoint.
 * Called by Vercel Cron and cron-job.org with:
 *   Authorization: Bearer <CRON_SECRET>
 */
export async function GET(req: NextRequest) {
	const authHeader =
		req.headers.get("authorization") || req.headers.get("Authorization");
	const cronSecret = process.env.CRON_SECRET;

	if (!cronSecret && process.env.NODE_ENV === "production") {
		return NextResponse.json(
			{ error: "Cron authentication is not configured" },
			{ status: 500 },
		);
	}

	if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	// Delegate to the production Odoo sync engine handler
	const response = await odooSyncGET(req);
	return response;
}

export async function POST(req: NextRequest) {
	return GET(req);
}
