import { type NextRequest, NextResponse } from "next/server";
import { invalidateDashboardCache } from "@/lib/cache/revalidate";

export const runtime = "nodejs";

/**
 * POST /api/internal/revalidate
 *
 * Bridges the Oracle-hosted always-on worker (a standalone Node process, not
 * a Next.js request) to invalidateDashboardCache() (src/lib/cache/revalidate.ts).
 * revalidateTag()/revalidatePath() only work inside a real Next.js request
 * context — calling them from the worker directly silently no-ops. This
 * route exists so the worker can trigger real cache invalidation by making
 * an HTTP call into a route that *is* a request context.
 *
 * Self-authenticates via INTERNAL_API_SECRET (see proxy.ts's publicPaths —
 * this route is exempt from session-cookie enforcement, same as webhooks).
 */
export async function POST(req: NextRequest) {
	const expectedSecret = process.env.INTERNAL_API_SECRET;
	if (!expectedSecret) {
		console.warn(
			"[internal/revalidate] INTERNAL_API_SECRET is not configured on server.",
		);
		return NextResponse.json(
			{ error: "INTERNAL_API_SECRET not configured" },
			{ status: 503 },
		);
	}

	const providedSecret = req.headers.get("x-internal-secret");
	if (providedSecret !== expectedSecret) {
		console.warn(
			"[internal/revalidate] Rejected request with invalid/missing secret",
		);
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	let body: { tags?: string[]; paths?: string[] } = {};
	try {
		body = await req.json();
	} catch {
		// No body is fine — invalidateDashboardCache() has sensible defaults.
	}

	const result = await invalidateDashboardCache({
		tags: body.tags,
		paths: body.paths,
	});

	return NextResponse.json(result);
}
