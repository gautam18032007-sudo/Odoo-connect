import { NextResponse } from "next/server";

import { sql } from "@/lib/db";

export const runtime = "nodejs";

/** Time a query; return elapsed ms (rounded). */
async function probe(fn: () => Promise<unknown>): Promise<number> {
	const t0 = performance.now();
	try {
		await fn();
	} catch {
		return -1;
	}
	return Math.round(performance.now() - t0);
}

/**
 * System observability snapshot for /dashboard/admin/system. Live-probes the
 * heavy dashboard queries, and reports data freshness + materialized-view/index
 * health. Read-only; no persistent metric store (kept lightweight).
 */
export async function GET() {
	try {
		const [freshness] = await sql`
      SELECT MAX(sale_date)::text AS latest_sale_date,
        COUNT(*)::int AS total_rows,
        COUNT(DISTINCT order_id)::int AS total_bills,
        COALESCE(SUM(net_amount), 0) AS total_revenue
      FROM sales_fact_v`;
		const [upload] = await sql`
      SELECT MAX(uploaded_at)::text AS last_uploaded_at
      FROM upload_batches WHERE status = 'success'`;
		const mvs = await sql`
      SELECT matviewname AS name FROM pg_matviews ORDER BY 1`;
		const mvNames = mvs.map((m) => String((m as { name: string }).name));
		let mvCustomerIdentityRows = 0;
		if (mvNames.includes("mv_customer_identity")) {
			const [mvRows] =
				await sql`SELECT COUNT(*)::int AS rows FROM mv_customer_identity`;
			mvCustomerIdentityRows = Number(mvRows?.rows ?? 0);
		}
		const [idx] = await sql`
      SELECT COUNT(*)::int AS n FROM pg_indexes WHERE tablename = 'sales_fact'`;

		const window =
			"sale_date >= (SELECT MAX(sale_date) - 30 FROM sales_fact_v)";
		const salesMs = await probe(() =>
			sql.query(
				`SELECT SUM(net_amount), COUNT(DISTINCT order_id) FROM sales_fact_v WHERE ${window}`,
			),
		);
		const storeMs = await probe(() =>
			sql.query(
				`SELECT billed_by, SUM(net_amount) FROM sales_fact_v WHERE ${window} GROUP BY billed_by`,
			),
		);
		const customerMs = await probe(() =>
			sql.query(
				`SELECT LEAST(SUM(visit_count),5) AS b, COUNT(*), SUM(lifetime_revenue) FROM mv_customer_identity GROUP BY 1`,
			),
		);

		const latestSaleDate = freshness?.latest_sale_date ?? null;
		let dataAgeDays: number | null = null;
		if (latestSaleDate) {
			const today = new Date();
			today.setHours(0, 0, 0, 0);
			const d = new Date(latestSaleDate);
			d.setHours(0, 0, 0, 0);
			dataAgeDays = Math.floor(
				Math.abs(today.getTime() - d.getTime()) / 86400000,
			);
		}

		return NextResponse.json({
			success: true,
			data: {
				freshness: {
					latestSaleDate,
					lastUploadedAt: upload?.last_uploaded_at ?? null,
					dataAgeDays,
					totalRows: Number(freshness?.total_rows ?? 0),
					totalBills: Number(freshness?.total_bills ?? 0),
					totalRevenue: Number(freshness?.total_revenue ?? 0),
				},
				infra: {
					materializedViews: mvNames,
					mvCustomerIdentityRows,
					salesFactIndexes: Number(idx?.n ?? 0),
				},
				latencyMs: { sales: salesMs, store: storeMs, customer: customerMs },
			},
		});
	} catch (error) {
		console.error("Failed to build system snapshot:", error);
		return NextResponse.json(
			{ success: false, error: "Failed to build system snapshot" },
			{ status: 500 },
		);
	}
}
