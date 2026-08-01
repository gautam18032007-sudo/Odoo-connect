import { NextResponse } from "next/server";

import { sql } from "@/lib/db";

export const runtime = "nodejs";

function emptyStatus() {
	return {
		hasData: false,
		isSeeded: false,
		totalRows: 0,
		minDate: null,
		maxDate: null,
		totalRevenue: 0,
		latestBatch: null,
		availableStores: [],
		availableCategories: [],
		availableBrands: [],
	};
}

export async function GET() {
	try {
		const [
			statsResult,
			latestBatchResult,
			storesResult,
			categoriesResult,
			brandsResult,
			freshnessResult,
			categoryBrandMapResult,
		] = await Promise.all([
			sql`
        SELECT COUNT(*) AS total_rows, MIN(sale_date)::text AS min_date, MAX(sale_date)::text AS max_date,
          COALESCE(SUM(net_amount), 0) AS total_revenue
        FROM sales_fact_v
      `,
			sql`
        SELECT
          id,
          filename,
          status,
          row_count AS "rowCount",
          error_count AS "errorCount",
          valid_row_count AS "validRowCount",
          quarantined_row_count AS "quarantinedRowCount",
          date_range_start::text AS "dateRangeStart",
          date_range_end::text AS "dateRangeEnd",
          uploaded_at AS "uploadedAt"
        FROM upload_batches
        ORDER BY uploaded_at DESC
        LIMIT 1
      `,
			sql`SELECT DISTINCT billed_by FROM sales_fact_v ORDER BY billed_by`,
			sql`SELECT DISTINCT category FROM sales_fact_v WHERE category IS NOT NULL AND category <> '' ORDER BY category`,
			sql`SELECT DISTINCT brand FROM sales_fact_v WHERE brand IS NOT NULL AND brand <> '' ORDER BY brand`,
			sql`SELECT latest_sale_date::text, days_stale, total_bills, total_revenue, last_upload_at::text FROM data_freshness`,
			sql`SELECT DISTINCT category, brand FROM sales_fact_v WHERE category IS NOT NULL AND category <> '' AND brand IS NOT NULL AND brand <> '' ORDER BY category, brand`,
		]);

		const stats = statsResult[0] ?? {};
		const totalRows = Number(stats.total_rows ?? 0);

		const categoryBrandMap = (categoryBrandMapResult || []).reduce(
			(acc: Record<string, string[]>, row: any) => {
				const cat = row.category;
				const brnd = row.brand;
				if (!acc[cat]) acc[cat] = [];
				acc[cat].push(brnd);
				return acc;
			},
			{},
		);

		return NextResponse.json({
			success: true,
			data: {
				hasData: totalRows > 0,
				isSeeded: totalRows > 0,
				totalRows,
				minDate: stats.min_date ?? null,
				maxDate: stats.max_date ?? null,
				totalRevenue: Number(stats.total_revenue ?? 0),
				latestBatch: latestBatchResult[0] ?? null,
				availableStores: storesResult
					.map((row) => row.billed_by)
					.filter(Boolean),
				availableCategories: categoriesResult
					.map((row) => row.category)
					.filter(Boolean),
				availableBrands: brandsResult.map((row) => row.brand).filter(Boolean),
				categoryBrandMap,
				dataFreshness: freshnessResult[0]
					? {
							latestSaleDate: freshnessResult[0].latest_sale_date ?? null,
							daysStale:
								freshnessResult[0].days_stale != null
									? Number(freshnessResult[0].days_stale)
									: null,
							totalBills: Number(freshnessResult[0].total_bills ?? 0),
							totalRevenue: Number(freshnessResult[0].total_revenue ?? 0),
							lastUploadAt: freshnessResult[0].last_upload_at ?? null,
						}
					: undefined,
			},
		});
	} catch (error: any) {
		console.warn(
			"Failed to fetch founder status (returning fallback status):",
			error?.message || error,
		);
		return NextResponse.json({
			success: true,
			data: emptyStatus(),
		});
	}
}
