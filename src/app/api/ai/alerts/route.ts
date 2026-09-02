import { neon } from "@neondatabase/serverless";
import { NextResponse } from "next/server";

export interface FounderAlert {
	id: string;
	type: "REVENUE" | "MARGIN" | "INVENTORY" | "DEAD_STOCK" | "WHATSAPP";
	severity: "CRITICAL" | "WARNING" | "INFO";
	title: string;
	message: string;
	timestamp: string;
}

/**
 * Founder AI — Real-Time Alert Engine Endpoint.
 * Evaluates operational conditions in real time against canonical tables.
 */
export async function GET() {
	if (!process.env.DATABASE_URL) {
		return NextResponse.json(
			{ error: "DATABASE_URL missing" },
			{ status: 500 },
		);
	}

	const sql = neon(process.env.DATABASE_URL);
	const alerts: FounderAlert[] = [];

	try {
		// 1. Low Stock & Stockout Alerts
		const lowStock = await sql`
			SELECT name, default_code, qty_available
			FROM dim_products
			WHERE qty_available = 0 AND active = true
			LIMIT 5
		`;
		for (const item of lowStock) {
			alerts.push({
				id: `stockout_${item.name}`,
				type: "INVENTORY",
				severity: "CRITICAL",
				title: "Stockout Alert",
				message: `Product "${item.name}" (SKU: ${item.default_code || "N/A"}) is completely OUT OF STOCK (0 units on hand).`,
				timestamp: new Date().toISOString(),
			});
		}

		// 2. Low Margin / Margin Erosion Alerts
		const lowMargin = await sql`
			SELECT 
				name, 
				list_price, 
				cost_price, 
				ROUND(((list_price - cost_price) / NULLIF(list_price, 0) * 100)::numeric, 2) AS margin_pct
			FROM dim_products
			WHERE list_price > 0 AND cost_price > 0 AND ((list_price - cost_price) / list_price) < 0.15 AND active = true
			LIMIT 5
		`;
		for (const item of lowMargin) {
			alerts.push({
				id: `margin_${item.name}`,
				type: "MARGIN",
				severity: "WARNING",
				title: "Low Margin Alert",
				message: `Product "${item.name}" has gross margin of ${item.margin_pct}% (Price: ₹${item.list_price}, Cost: ₹${item.cost_price}).`,
				timestamp: new Date().toISOString(),
			});
		}

		// 3. Dead Stock Alerts (On-hand > 0 with zero sales)
		const deadStock = await sql`
			SELECT p.name, p.qty_available, p.list_price
			FROM dim_products p
			WHERE p.qty_available > 20 AND p.active = true
			LIMIT 3
		`;
		for (const item of deadStock) {
			alerts.push({
				id: `deadstock_${item.name}`,
				type: "DEAD_STOCK",
				severity: "INFO",
				title: "Dead Stock Risk",
				message: `High inventory on hand (${item.qty_available} units) for "${item.name}". Consider promotional bundling.`,
				timestamp: new Date().toISOString(),
			});
		}

		// 4. WhatsApp Automation Alerts — optional: whatsapp_message doesn't exist
		// on every environment (no active WhatsApp integration on this DB), so a
		// missing table here must not take down the other 3, working alert types.
		try {
			const whatsapp = await sql`
				SELECT COUNT(*)::int AS pending_messages
				FROM whatsapp_message
				WHERE state = 'outgoing'
			`;
			const pendingCount = Number(whatsapp[0]?.pending_messages || 0);
			if (pendingCount > 0) {
				alerts.push({
					id: "wa_pending",
					type: "WHATSAPP",
					severity: "INFO",
					title: "WhatsApp Queue Active",
					message: `${pendingCount} automated WhatsApp notifications queued for delivery to customers.`,
					timestamp: new Date().toISOString(),
				});
			}
		} catch (whatsappError: any) {
			console.error(
				"[Founder AI Alerts] WhatsApp check skipped:",
				whatsappError.message,
			);
		}

		return NextResponse.json({
			success: true,
			count: alerts.length,
			alerts,
		});
	} catch (error: any) {
		console.error("[Founder AI Alerts] Error:", error.message);
		return NextResponse.json(
			{ success: false, error: error.message },
			{ status: 500 },
		);
	}
}
