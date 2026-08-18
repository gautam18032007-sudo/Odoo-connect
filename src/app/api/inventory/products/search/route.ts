import { type NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/inventory/products/search?q=...&store=...&category=...&brand=...
 *
 * Dedicated, lightweight autocomplete endpoint for the Inventory Dashboard's
 * product/SKU search. Resolves against dim_products (the Odoo-derived
 * product master) directly, NOT sales_fact_v — sales data and inventory
 * data are different sources of truth and must not be conflated here.
 * fact_inventory/dim_stores are only touched via an EXISTS scoping check
 * (store filter), which can never fan out the returned rows since dim_products
 * already has exactly one row per product.
 */
export async function GET(req: NextRequest) {
	try {
		const { searchParams } = new URL(req.url);
		const q = (searchParams.get("q") || "").trim();
		const store = searchParams.get("store");
		const category = searchParams.get("category");
		const brand = searchParams.get("brand");

		if (q.length < 2) {
			return NextResponse.json({ success: true, data: [] });
		}

		const storeFilter =
			store && store !== "ALL" && store !== "All Stores" ? store : null;
		const categoryFilter =
			category && category !== "All Categories" ? category : null;
		const brandFilter = brand && brand !== "All Brands" ? brand : null;
		const likeQ = `%${q}%`;
		const prefixQ = `${q}%`;

		const rows = await sql`
			SELECT p.id, p.name, p.default_code, p.barcode, p.category
			FROM dim_products p
			WHERE p.active = true
			  AND (p.name ILIKE ${likeQ} OR p.default_code ILIKE ${likeQ} OR p.barcode ILIKE ${likeQ})
			  AND (${categoryFilter}::TEXT IS NULL OR TRIM(LOWER(p.category)) = TRIM(LOWER(${categoryFilter})))
			  AND (${storeFilter}::TEXT IS NULL OR EXISTS (
			        SELECT 1 FROM fact_inventory fi
			        JOIN dim_stores s ON fi.location_id = s.location_id
			        WHERE fi.product_id = p.id AND (s.name ILIKE ${storeFilter} OR s.code ILIKE ${storeFilter})
			  ))
			  AND (${brandFilter}::TEXT IS NULL OR EXISTS (
			        SELECT 1 FROM sales_fact_v sf WHERE sf.sku_code = p.default_code AND sf.brand = ${brandFilter}
			  ))
			ORDER BY
			  CASE
			    WHEN p.name ILIKE ${prefixQ} THEN 0
			    WHEN p.default_code ILIKE ${prefixQ} THEN 1
			    ELSE 2
			  END,
			  p.name ASC
			LIMIT 10
		`;

		const data = rows.map((r) => ({
			id: Number(r.id),
			name: String(r.name),
			sku: r.default_code ? String(r.default_code) : null,
			barcode: r.barcode ? String(r.barcode) : null,
			category: r.category ? String(r.category) : null,
		}));

		return NextResponse.json({ success: true, data });
	} catch (err: any) {
		console.error("❌ Inventory Product Search API Error:", err);
		return NextResponse.json(
			{ success: false, error: err.message || "Product search failed" },
			{ status: 500 },
		);
	}
}
