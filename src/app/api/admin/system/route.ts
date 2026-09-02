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
 * Neon storage size, in MB, against a configurable limit. Read-only
 * (pg_database_size + pg_total_relation_size are pure metadata reads, no
 * table scans) and isolated in its own try/catch — a monitoring failure must
 * never surface as fake data (0, null-as-empty) and must never affect the
 * rest of this endpoint or any dashboard/business-data query. See the
 * multi-store/storage-monitoring forensic audit: actual measured size at
 * time of writing was ~30MB, far below any previously-assumed threshold —
 * this endpoint exists so that number is always measured, never assumed.
 */
async function getStorageStatus() {
	const limitMb = Number(process.env.NEON_STORAGE_LIMIT_MB || 500);
	const warningPct = Number(process.env.NEON_STORAGE_WARNING_PCT || 70);
	const criticalPct = Number(process.env.NEON_STORAGE_CRITICAL_PCT || 90);

	try {
		const [dbSize] = await sql`
			SELECT pg_database_size(current_database())::bigint AS bytes
		`;
		const totalBytes = Number(dbSize?.bytes ?? 0);
		const totalMb = totalBytes / (1024 * 1024);
		const usedPct = limitMb > 0 ? (totalMb / limitMb) * 100 : 0;

		const status =
			usedPct >= criticalPct
				? "CRITICAL"
				: usedPct >= warningPct
					? "WARNING"
					: "NORMAL";

		const largestTables = await sql`
			SELECT
				relname AS table_name,
				pg_total_relation_size(relid)::bigint AS total_bytes,
				pg_relation_size(relid)::bigint AS table_bytes,
				(pg_total_relation_size(relid) - pg_relation_size(relid))::bigint AS index_bytes,
				n_live_tup AS row_estimate
			FROM pg_stat_user_tables
			ORDER BY pg_total_relation_size(relid) DESC
			LIMIT 10
		`;

		return {
			available: true as const,
			totalBytes,
			totalMb: Math.round(totalMb * 100) / 100,
			limitMb,
			usedPct: Math.round(usedPct * 10) / 10,
			status,
			largestTables: largestTables.map((t) => ({
				tableName: String(t.table_name),
				totalMb:
					Math.round((Number(t.total_bytes) / (1024 * 1024)) * 100) / 100,
				tableMb:
					Math.round((Number(t.table_bytes) / (1024 * 1024)) * 100) / 100,
				indexMb:
					Math.round((Number(t.index_bytes) / (1024 * 1024)) * 100) / 100,
				rowEstimate: Number(t.row_estimate ?? 0),
			})),
		};
	} catch (error: any) {
		console.error("[admin/system] Storage measurement failed:", error.message);
		// Explicit unavailable state — never a fabricated 0/empty size, and
		// this failure must not propagate to the rest of the endpoint.
		return {
			available: false as const,
			error: "Storage measurement unavailable",
		};
	}
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
		const storage = await getStorageStatus();

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
				storage,
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
