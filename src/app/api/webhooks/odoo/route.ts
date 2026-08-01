import { after, type NextRequest, NextResponse } from "next/server";
import {
	enqueueWebhookEvent,
	processWebhookEvent,
	verifyWebhookSecret,
	type WebhookPayload,
} from "@/lib/odoo/webhook-handler";

export const runtime = "nodejs";

/**
 * POST /api/webhooks/odoo
 * Real-time event-driven webhook handler for Odoo 19 SaaS.
 * Provides < 100 ms acknowledgment response and performs async background sync.
 */
export async function POST(req: NextRequest) {
	const startTime = Date.now();

	if (!verifyWebhookSecret(req.headers, req.nextUrl.searchParams)) {
		console.warn("[webhook/odoo] Rejected unauthorized webhook POST attempt");
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	let body: WebhookPayload;
	try {
		body = await req.json();
	} catch {
		return NextResponse.json(
			{ error: "Invalid JSON payload" },
			{ status: 400 },
		);
	}

	if (!body.id || !body.model) {
		return NextResponse.json(
			{ error: "Missing required fields: id and model" },
			{ status: 400 },
		);
	}

	// 1. Enqueue event for deduplication
	const { eventId, isDuplicate } = await enqueueWebhookEvent(body);

	// 2. Delegate background processing via Next.js after() or async execution
	if (!isDuplicate) {
		try {
			if (typeof after === "function") {
				after(async () => {
					await processWebhookEvent(eventId);
				});
			} else {
				processWebhookEvent(eventId).catch((err) =>
					console.error("[webhook/odoo] Background process error:", err),
				);
			}
		} catch {
			processWebhookEvent(eventId).catch((err) =>
				console.error("[webhook/odoo] Background process error:", err),
			);
		}
	}

	const elapsedMs = Date.now() - startTime;
	console.log(
		`[webhook/odoo] Accepted ${body.model} #${body.id} (eventId: ${eventId}, duplicate: ${isDuplicate}) in ${elapsedMs}ms`,
	);

	return NextResponse.json(
		{
			success: true,
			eventId,
			isDuplicate,
			message: isDuplicate
				? "Webhook event deduplicated"
				: "Webhook accepted for background processing",
			elapsedMs,
		},
		{ status: 200 },
	);
}
