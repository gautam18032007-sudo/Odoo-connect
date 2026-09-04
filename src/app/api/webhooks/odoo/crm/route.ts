import { type NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { checkRateLimit, getClientIp } from "@/lib/security/rate-limit";

const WEBHOOK_RATE_LIMIT_MAX_ATTEMPTS = 120;
const WEBHOOK_RATE_LIMIT_WINDOW_SECONDS = 60;

/**
 * LEGACY — PENDING ODOO CONFIGURATION VERIFICATION.
 *
 * This route trusts the inbound webhook payload directly instead of
 * re-reading the authoritative crm.lead record from the Odoo API. No
 * canonical crm.lead sync/mapping exists anywhere in this codebase yet
 * (confirmed via repo-wide search during the 2026-09 real-time sync audit),
 * so this route cannot currently be upgraded to the re-read pattern without
 * building that mapping first. Whether any Odoo automation still calls this
 * route is unconfirmed — do not retire it until that is verified, but do
 * not extend or rely on it either.
 *
 * POST /api/webhooks/odoo/crm
 *
 * Receives CRM lead/opportunity updates from Odoo Standard Plan via Make.com.
 *
 * Odoo trigger: CRM Lead → On Creation / On Stage Change / On Win / On Loss
 * Expected payload:
 * {
 *   odoo_lead_id: 42,
 *   name: "New office furniture deal",
 *   type: "opportunity",           // "lead" or "opportunity"
 *   stage: "Proposition",
 *   salesperson: "Diwakar",
 *   partner_name: "Acme Corp",
 *   email: "contact@acme.com",
 *   phone: "9876543210",
 *   expected_revenue: 150000,
 *   probability: 60,
 *   date_deadline: "2024-07-15",
 *   source: "Website",
 *   medium: "Email",
 *   active: true,
 *   won: false,
 *   created_at: "2024-06-01T10:00:00Z",
 *   updated_at: "2024-06-15T14:30:00Z"
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
		odoo_lead_id,
		name,
		type,
		stage,
		salesperson,
		partner_name,
		email,
		phone,
		expected_revenue,
		probability,
		date_deadline,
		source,
		medium,
		active,
		won,
		created_at,
		updated_at,
	} = body;

	if (!odoo_lead_id || !name) {
		return NextResponse.json(
			{ error: "Missing required fields: odoo_lead_id, name" },
			{ status: 400 },
		);
	}

	try {
		await sql`
      INSERT INTO crm_leads (
        odoo_lead_id, name, type, stage, salesperson, partner_name,
        email, phone, expected_revenue, probability, date_deadline,
        source, medium, active, won, odoo_created_at, odoo_updated_at
      ) VALUES (
        ${Number(odoo_lead_id)},
        ${name},
        ${type ?? "lead"},
        ${stage ?? null},
        ${salesperson ?? null},
        ${partner_name ?? null},
        ${email ?? null},
        ${phone ?? null},
        ${Number(expected_revenue ?? 0)},
        ${Number(probability ?? 0)},
        ${date_deadline ?? null},
        ${source ?? null},
        ${medium ?? null},
        ${active !== false},
        ${won === true},
        ${created_at ?? null},
        ${updated_at ?? null}
      )
      ON CONFLICT (odoo_lead_id) DO UPDATE SET
        name = EXCLUDED.name,
        type = EXCLUDED.type,
        stage = EXCLUDED.stage,
        salesperson = EXCLUDED.salesperson,
        partner_name = EXCLUDED.partner_name,
        email = EXCLUDED.email,
        phone = EXCLUDED.phone,
        expected_revenue = EXCLUDED.expected_revenue,
        probability = EXCLUDED.probability,
        date_deadline = EXCLUDED.date_deadline,
        source = EXCLUDED.source,
        medium = EXCLUDED.medium,
        active = EXCLUDED.active,
        won = EXCLUDED.won,
        odoo_updated_at = EXCLUDED.odoo_updated_at,
        synced_at = NOW()
    `;

		return NextResponse.json({ success: true, odoo_lead_id });
	} catch (error) {
		console.error("[webhook/odoo/crm] error:", error);
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : "Internal error" },
			{ status: 500 },
		);
	}
}
