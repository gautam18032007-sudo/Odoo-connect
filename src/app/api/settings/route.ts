import { NextResponse } from "next/server";

import { sql } from "@/lib/db";
import type { GlobalConfig } from "@/types/app";

/**
 * GET /api/settings
 *
 * Returns all global settings as a flat config object.
 */
export async function GET() {
	try {
		const rows = await sql`SELECT key, value FROM public.settings`;

		const config: Record<string, string> = {};
		for (const row of rows) {
			// Convert snake_case DB keys to camelCase for the frontend
			const camelKey = (row.key as string).replace(/_([a-z])/g, (_, c) =>
				c.toUpperCase(),
			);
			config[camelKey] = row.value as string;
		}

		const settings = config as unknown as GlobalConfig;

		return NextResponse.json({ settings, cached: false });
	} catch (error: any) {
		const defaultSettings = {
			currency: "INR",
			currencySymbol: "₹",
			currencyLocale: "en-IN",
			location: "India",
			companyName: "ZenZebra",
			timezone: "Asia/Kolkata",
		};

		// If table doesn't exist or network timeout occurs, return default settings gracefully
		if (
			error.code === "42P01" ||
			error.message?.includes("fetch failed") ||
			error.message?.includes("timeout") ||
			error.code === "UND_ERR_CONNECT_TIMEOUT"
		) {
			return NextResponse.json({ settings: defaultSettings, cached: false });
		}

		console.error("Settings GET Error:", error);
		return NextResponse.json({ settings: defaultSettings, cached: false });
	}
}

/**
 * PATCH /api/settings
 *
 * Updates one or more settings in Neon.
 *
 * Body: { currency?: string, currencySymbol?: string, location?: string, ... }
 */
export async function PATCH(request: Request) {
	try {
		const body = await request.json();

		// Map camelCase keys back to snake_case for the DB
		const keyMap: Record<string, string> = {
			currency: "currency",
			currencySymbol: "currency_symbol",
			currencyLocale: "currency_locale",
			location: "location",
			companyName: "company_name",
			timezone: "timezone",
		};

		let updatedCount = 0;

		for (const [camelKey, value] of Object.entries(body)) {
			const dbKey = keyMap[camelKey];
			if (!dbKey || typeof value !== "string") continue;

			await sql`
        UPDATE public.settings
        SET value = ${value}, updated_at = NOW()
        WHERE key = ${dbKey}
      `;
			updatedCount++;
		}

		if (updatedCount === 0) {
			return NextResponse.json(
				{ error: "No valid settings to update" },
				{ status: 400 },
			);
		}

		return NextResponse.json({
			success: true,
			message: `Updated ${updatedCount} setting(s).`,
		});
	} catch (error) {
		console.error("Settings PATCH Error:", error);
		return NextResponse.json(
			{ error: "Failed to update settings" },
			{ status: 500 },
		);
	}
}
