import { type NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { checkRateLimit, getClientIp } from "@/lib/security/rate-limit";

const WEBHOOK_RATE_LIMIT_MAX_ATTEMPTS = 120;
const WEBHOOK_RATE_LIMIT_WINDOW_SECONDS = 60;

/**
 * POST /api/webhooks/odoo/inventory
 *
 * Receives stock level snapshots from Odoo Standard Plan via Make.com.
 *
 * Odoo triggers:
 *   1. stock.quant (On Inventory Update) → current stock snapshot
 *   2. stock.move (On Delivery / On Receipt) → stock movement event
 *
 * Use `event_type` to distinguish: "snapshot" or "movement"
 *
 * Snapshot payload:
 * {
 *   event_type: "snapshot",
 *   snapshot_at: "2024-06-15T10:00:00Z",
 *   items: [
 *     {
 *       product_id: 101,
 *       product_name: "White Shirt L",
 *       product_code: "SKU-001",
 *       location: "WH/Stock",
 *       quantity: 45,
 *       reserved_quantity: 5
 *     }
 *   ]
 * }
 *
 * Movement payload:
 * {
 *   event_type: "movement",
 *   move_id: 500,
 *   move_type: "in",              // "in" (receipt) or "out" (delivery)
 *   reference: "WH/IN/00050",
 *   product_id: 101,
 *   product_name: "White Shirt L",
 *   product_code: "SKU-001",
 *   quantity_moved: 20,
 *   from_location: "Vendors",
 *   to_location: "WH/Stock",
 *   moved_at: "2024-06-15T09:30:00Z"
 * }
 */

export const runtime = "nodejs";

function verifyWebhookSecret(req: NextRequest): boolean {
	const secret = req.headers.get("x-webhook-secret");
	return secret === process.env.ODOO_WEBHOOK_SECRET;
}

export async function POST(req: NextRequest) {
	if (!verifyWebhookSecret(req)) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const rateLimit = await checkRateLimit(
		`webhook:${getClientIp(req)}`,
		WEBHOOK_RATE_LIMIT_MAX_ATTEMPTS,
		WEBHOOK_RATE_LIMIT_WINDOW_SECONDS,
	);
	if (!rateLimit.allowed) {
		return NextResponse.json({ error: "Too many requests" }, { status: 429 });
	}

	let body: any;
	try {
		body = await req.json();
	} catch {
		return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
	}

	const { event_type } = body;

	if (!event_type || !["snapshot", "movement"].includes(event_type)) {
		return NextResponse.json(
			{ error: "event_type must be 'snapshot' or 'movement'" },
			{ status: 400 },
		);
	}

	try {
		if (event_type === "snapshot") {
			const { snapshot_at, items } = body;
			if (!Array.isArray(items) || items.length === 0) {
				return NextResponse.json(
					{ error: "snapshot requires items array" },
					{ status: 400 },
				);
			}

			let upserted = 0;
			for (const item of items) {
				const {
					product_id,
					product_name,
					product_code,
					location,
					quantity,
					reserved_quantity,
				} = item;
				if (!product_id || !location) continue;

				await sql`
          INSERT INTO inventory_snapshots (
            odoo_product_id, product_name, product_code,
            location, quantity, reserved_quantity, snapshot_at
          ) VALUES (
            ${Number(product_id)},
            ${product_name ?? null},
            ${product_code ?? null},
            ${location},
            ${Number(quantity ?? 0)},
            ${Number(reserved_quantity ?? 0)},
            ${snapshot_at ?? new Date().toISOString()}
          )
          ON CONFLICT (odoo_product_id, location) DO UPDATE SET
            product_name = EXCLUDED.product_name,
            product_code = EXCLUDED.product_code,
            quantity = EXCLUDED.quantity,
            reserved_quantity = EXCLUDED.reserved_quantity,
            snapshot_at = EXCLUDED.snapshot_at,
            synced_at = NOW()
        `;
				upserted++;
			}

			return NextResponse.json({
				success: true,
				event_type: "snapshot",
				upserted,
			});
		}

		if (event_type === "movement") {
			const {
				move_id,
				move_type,
				reference,
				product_id,
				product_name,
				product_code,
				quantity_moved,
				from_location,
				to_location,
				moved_at,
			} = body;

			if (!move_id || !product_id) {
				return NextResponse.json(
					{ error: "movement requires move_id and product_id" },
					{ status: 400 },
				);
			}

			await sql`
        INSERT INTO inventory_movements (
          odoo_move_id, move_type, reference, odoo_product_id,
          product_name, product_code, quantity_moved,
          from_location, to_location, moved_at
        ) VALUES (
          ${Number(move_id)},
          ${move_type ?? "unknown"},
          ${reference ?? null},
          ${Number(product_id)},
          ${product_name ?? null},
          ${product_code ?? null},
          ${Number(quantity_moved ?? 0)},
          ${from_location ?? null},
          ${to_location ?? null},
          ${moved_at ?? new Date().toISOString()}
        )
        ON CONFLICT (odoo_move_id) DO NOTHING
      `;

			return NextResponse.json({
				success: true,
				event_type: "movement",
				move_id,
			});
		}
	} catch (error) {
		console.error("[webhook/odoo/inventory] error:", error);
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : "Internal error" },
			{ status: 500 },
		);
	}
}
