import { type NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/net-purchase/summary
 *
 * Returns aggregate net purchase metrics filtered by date range, store,
 * brand, category, and sku. Queries only `net_purchase_fact_v`.
 */
export async function GET(req: NextRequest) {
	try {
		const params = req.nextUrl.searchParams;
		const startDate = params.get("startDate");
		const endDate = params.get("endDate");
		const rawStore = params.get("store");
		const rawBrand = params.get("brand");
		const rawCategory = params.get("category");
		const store =
			rawStore && rawStore !== "All Stores" && rawStore !== "all"
				? rawStore
				: null;
		const brand =
			rawBrand && rawBrand !== "All Brands" && rawBrand !== "all"
				? rawBrand
				: null;
		const category =
			rawCategory && rawCategory !== "All Categories" && rawCategory !== "all"
				? rawCategory
				: null;
		const sku = params.get("sku") || null;

		// Check if net_purchase_fact_v exists in the database
		const [viewCheck] = await sql`
			SELECT COUNT(*)::int as count
			FROM information_schema.tables
			WHERE table_name = 'net_purchase_fact_v'
		`;

		if (!viewCheck || Number(viewCheck.count) === 0) {
			return NextResponse.json({
				success: true,
				data: {
					summary: {
						netPurchase: 0,
						grossPurchase: 0,
						tax: 0,
						rowCount: 0,
						earliestDate: null,
						latestDate: null,
					},
					byStore: [],
					byCategory: [],
				},
			});
		}

		// Total aggregates
		const [summary] = await sql`
      SELECT
        COALESCE(SUM(net_purchase_amount), 0)::numeric AS net_purchase,
        COALESCE(SUM(gross_purchase_amount), 0)::numeric AS gross_purchase,
        COALESCE(SUM(tax_amount), 0)::numeric AS tax,
        COUNT(*)::int AS row_count,
        MIN(purchase_date) AS earliest_date,
        MAX(purchase_date) AS latest_date
      FROM net_purchase_fact_v
      WHERE (${startDate}::date IS NULL OR purchase_date >= ${startDate}::date)
        AND (${endDate}::date IS NULL OR purchase_date <= ${endDate}::date)
        AND (${store}::text IS NULL OR store_display_name = ${store})
        AND (${brand}::text IS NULL OR brand = ${brand})
        AND (${category}::text IS NULL OR category = ${category})
        AND (${sku}::text IS NULL OR (sku_code ILIKE '%' || ${sku} || '%' OR item_name ILIKE '%' || ${sku} || '%'))
    `;

		// By store breakdown
		const byStore = await sql`
      SELECT
        store_display_name AS store,
        COALESCE(SUM(net_purchase_amount), 0)::numeric AS net_purchase,
        COUNT(*)::int AS row_count
      FROM net_purchase_fact_v
      WHERE (${startDate}::date IS NULL OR purchase_date >= ${startDate}::date)
        AND (${endDate}::date IS NULL OR purchase_date <= ${endDate}::date)
        AND (${brand}::text IS NULL OR brand = ${brand})
        AND (${category}::text IS NULL OR category = ${category})
        AND (${sku}::text IS NULL OR (sku_code ILIKE '%' || ${sku} || '%' OR item_name ILIKE '%' || ${sku} || '%'))
      GROUP BY store_display_name
      ORDER BY net_purchase DESC
    `;

		// By category breakdown
		const byCategory = await sql`
      SELECT
        COALESCE(category, 'Uncategorized') AS category,
        COALESCE(SUM(net_purchase_amount), 0)::numeric AS net_purchase,
        COUNT(*)::int AS row_count
      FROM net_purchase_fact_v
      WHERE (${startDate}::date IS NULL OR purchase_date >= ${startDate}::date)
        AND (${endDate}::date IS NULL OR purchase_date <= ${endDate}::date)
        AND (${store}::text IS NULL OR store_display_name = ${store})
        AND (${brand}::text IS NULL OR brand = ${brand})
        AND (${sku}::text IS NULL OR (sku_code ILIKE '%' || ${sku} || '%' OR item_name ILIKE '%' || ${sku} || '%'))
      GROUP BY category
      ORDER BY net_purchase DESC
    `;

		return NextResponse.json({
			success: true,
			data: {
				summary: {
					netPurchase: Number(summary?.net_purchase ?? 0),
					grossPurchase: Number(summary?.gross_purchase ?? 0),
					tax: Number(summary?.tax ?? 0),
					rowCount: Number(summary?.row_count ?? 0),
					earliestDate: summary?.earliest_date ?? null,
					latestDate: summary?.latest_date ?? null,
				},
				byStore,
				byCategory,
			},
		});
	} catch (error) {
		console.error("GET /api/net-purchase/summary failed:", error);
		return NextResponse.json(
			{ success: false, error: "Failed to fetch net purchase summary" },
			{ status: 500 },
		);
	}
}
