import type { NextRequest } from "next/server";
import { GET as odooSyncGET } from "./odoo-sync/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cron
 *
 * Canonical Cron API endpoint for ZenZebra Sales CRM.
 * Authenticates via `Authorization: Bearer <CRON_SECRET>` and delegates to
 * the production Odoo sync engine (heartbeat-gated with PostgreSQL advisory locking).
 */
export async function GET(req: NextRequest) {
	return odooSyncGET(req);
}

export async function POST(req: NextRequest) {
	return GET(req);
}
