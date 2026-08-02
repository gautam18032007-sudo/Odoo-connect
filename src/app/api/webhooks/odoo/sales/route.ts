import { type NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { checkRateLimit, getClientIp } from "@/lib/security/rate-limit";

const WEBHOOK_RATE_LIMIT_MAX_ATTEMPTS = 120;
const WEBHOOK_RATE_LIMIT_WINDOW_SECONDS = 60;

/**
 * POST /api/webhooks/odoo/sales
 *
 * Receives real-time sales order payloads pushed by Odoo Standard Plan
 * via Make.com or Zapier. Replaces manual Excel uploads for sales data.
 *
 * Odoo trigger: Sales Order → On Creation / On Update (state = sale or done)
 * Expected payload (Make.com maps Odoo fields to this shape):
 * {
 *   order_name: "S00001",
 *   sale_date: "2024-06-01",
 *   store_name: "SmartworksNoida Noida",
 *   customer_name: "Ravi Kumar",
 *   customer_mobile: "9876543210",
 *   payment_method: "Cash",
 *   lines: [
 *     {
 *       product_key: "PROD-001",
 *       sku_code: "SKU-001",
 *       item_name: "White Shirt",
 *       category: "Apparel",
 *       brand: "Arrow",
 *       quantity: 2,
 *       mrp_amount: 1200,
 *       discount_amount: 200,
 *       gross_amount: 1000,
 *       tax_amount: 50,
 *       net_amount: 1050
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
		order_name,
		sale_date,
		store_name,
		customer_name,
		customer_mobile,
		payment_method,
		lines,
	} = body;

	if (
		!order_name ||
		!sale_date ||
		!store_name ||
		!Array.isArray(lines) ||
		lines.length === 0
	) {
		return NextResponse.json(
			{
				error:
					"Missing required fields: order_name, sale_date, store_name, lines",
			},
			{ status: 400 },
		);
	}

	try {
		// Resolve canonical store name via alias mapping (same logic as Excel import)
		const storeResult = await sql`
      SELECT canonical_store FROM store_alias_mapping
      WHERE lower(source_name) = lower(${store_name})
      LIMIT 1
    `;
		const canonicalStore = storeResult[0]?.canonical_store ?? store_name;

		const storeRow = await sql`
      SELECT id FROM store_dimension WHERE store_name = ${canonicalStore} LIMIT 1
    `;
		const storeId = storeRow[0]?.id ?? null;

		// Upsert each line into sales_fact
		let upserted = 0;
		for (const line of lines) {
			const {
				product_key,
				sku_code,
				item_name,
				category,
				brand,
				quantity,
				mrp_amount,
				discount_amount,
				gross_amount,
				tax_amount,
				net_amount,
			} = line;

			if (!product_key || !item_name || quantity == null) continue;

			await sql`
        INSERT INTO sales_fact (
          upload_id, sale_date, bill_no, billed_by, product_key,
          category, brand, sku_code, item_name, quantity,
          mrp_amount, discount_amount, gross_amount, tax_amount, net_amount,
          payment_method, customer_mobile, customer_name, source_billed_by, store_id
        ) VALUES (
          0, ${sale_date}::date, ${order_name}, ${canonicalStore}, ${product_key},
          ${category ?? null}, ${brand ?? null}, ${sku_code ?? null}, ${item_name}, ${Number(quantity)},
          ${Number(mrp_amount ?? 0)}, ${Number(discount_amount ?? 0)}, ${Number(gross_amount ?? 0)},
          ${Number(tax_amount ?? 0)}, ${Number(net_amount ?? 0)},
          ${payment_method ?? null}, ${customer_mobile ?? null}, ${customer_name ?? null},
          ${store_name}, ${storeId}
        )
        ON CONFLICT (sale_date, bill_no, billed_by, product_key) DO UPDATE SET
          category = EXCLUDED.category,
          brand = EXCLUDED.brand,
          sku_code = EXCLUDED.sku_code,
          item_name = EXCLUDED.item_name,
          quantity = EXCLUDED.quantity,
          mrp_amount = EXCLUDED.mrp_amount,
          discount_amount = EXCLUDED.discount_amount,
          gross_amount = EXCLUDED.gross_amount,
          tax_amount = EXCLUDED.tax_amount,
          net_amount = EXCLUDED.net_amount,
          payment_method = EXCLUDED.payment_method,
          customer_mobile = EXCLUDED.customer_mobile,
          customer_name = EXCLUDED.customer_name
      `;
			upserted++;
		}

		return NextResponse.json({ success: true, upserted, order: order_name });
	} catch (error) {
		console.error("[webhook/odoo/sales] error:", error);
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : "Internal error" },
			{ status: 500 },
		);
	}
}
