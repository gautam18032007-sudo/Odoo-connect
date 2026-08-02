import { type NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { checkRateLimit, getClientIp } from "@/lib/security/rate-limit";

const WEBHOOK_RATE_LIMIT_MAX_ATTEMPTS = 120;
const WEBHOOK_RATE_LIMIT_WINDOW_SECONDS = 60;

/**
 * POST /api/webhooks/odoo/purchase
 *
 * Receives Purchase Order payloads from Odoo Standard Plan via Make.com.
 *
 * Odoo trigger: Purchase Order → On Confirmation / On Receipt / On Invoice
 * Expected payload:
 * {
 *   odoo_po_id: 15,
 *   po_number: "PO/2024/0015",
 *   vendor_name: "Supplier Ltd",
 *   vendor_email: "vendor@supplier.com",
 *   order_date: "2024-06-01",
 *   scheduled_date: "2024-06-15",
 *   state: "purchase",            // draft|sent|purchase|done|cancel
 *   amount_untaxed: 50000,
 *   amount_tax: 9000,
 *   amount_total: 59000,
 *   currency: "INR",
 *   notes: "Urgent delivery",
 *   lines: [
 *     {
 *       product_name: "Office Chair",
 *       product_code: "CHAIR-001",
 *       quantity: 10,
 *       unit_price: 5000,
 *       subtotal: 50000,
 *       qty_received: 5,
 *       qty_billed: 5,
 *       scheduled_date: "2024-06-15"
 *     }
 *   ]
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

	const {
		odoo_po_id,
		po_number,
		vendor_name,
		vendor_email,
		order_date,
		scheduled_date,
		state,
		amount_untaxed,
		amount_tax,
		amount_total,
		currency,
		notes,
		lines,
	} = body;

	if (!odoo_po_id || !po_number) {
		return NextResponse.json(
			{ error: "Missing required fields: odoo_po_id, po_number" },
			{ status: 400 },
		);
	}

	try {
		// Upsert the purchase order header
		const poResult = await sql`
      INSERT INTO purchase_orders (
        odoo_po_id, po_number, vendor_name, vendor_email,
        order_date, scheduled_date, state,
        amount_untaxed, amount_tax, amount_total, currency, notes
      ) VALUES (
        ${Number(odoo_po_id)},
        ${po_number},
        ${vendor_name ?? null},
        ${vendor_email ?? null},
        ${order_date ?? null},
        ${scheduled_date ?? null},
        ${state ?? "draft"},
        ${Number(amount_untaxed ?? 0)},
        ${Number(amount_tax ?? 0)},
        ${Number(amount_total ?? 0)},
        ${currency ?? "INR"},
        ${notes ?? null}
      )
      ON CONFLICT (odoo_po_id) DO UPDATE SET
        po_number = EXCLUDED.po_number,
        vendor_name = EXCLUDED.vendor_name,
        vendor_email = EXCLUDED.vendor_email,
        order_date = EXCLUDED.order_date,
        scheduled_date = EXCLUDED.scheduled_date,
        state = EXCLUDED.state,
        amount_untaxed = EXCLUDED.amount_untaxed,
        amount_tax = EXCLUDED.amount_tax,
        amount_total = EXCLUDED.amount_total,
        notes = EXCLUDED.notes,
        synced_at = NOW()
      RETURNING id
    `;

		const internalPoId = poResult[0]?.id;
		let linesUpserted = 0;

		if (internalPoId && Array.isArray(lines)) {
			// Delete existing lines and re-insert (simpler than per-line upsert for POs)
			await sql`DELETE FROM purchase_order_lines WHERE po_id = ${internalPoId}`;

			for (const line of lines) {
				const {
					product_name,
					product_code,
					quantity,
					unit_price,
					subtotal,
					qty_received,
					qty_billed,
					scheduled_date: lineDate,
				} = line;
				if (!product_name) continue;

				await sql`
          INSERT INTO purchase_order_lines (
            po_id, product_name, product_code, quantity,
            unit_price, subtotal, qty_received, qty_billed, scheduled_date
          ) VALUES (
            ${internalPoId},
            ${product_name},
            ${product_code ?? null},
            ${Number(quantity ?? 0)},
            ${Number(unit_price ?? 0)},
            ${Number(subtotal ?? 0)},
            ${Number(qty_received ?? 0)},
            ${Number(qty_billed ?? 0)},
            ${lineDate ?? scheduled_date ?? null}
          )
        `;
				linesUpserted++;
			}
		}

		return NextResponse.json({
			success: true,
			odoo_po_id,
			po_number,
			linesUpserted,
		});
	} catch (error) {
		console.error("[webhook/odoo/purchase] error:", error);
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : "Internal error" },
			{ status: 500 },
		);
	}
}
