import { type NextRequest, NextResponse } from "next/server";
import { invalidateDashboardCache } from "@/lib/cache/revalidate";
import { OdooClient } from "@/lib/odoo/client";
import { releaseCronLock, tryAcquireCronLock } from "@/lib/odoo/sync/cron-lock";
import { syncCustomers } from "@/lib/odoo/sync/syncCustomers";
import { syncInventory } from "@/lib/odoo/sync/syncInventory";
import { syncProducts } from "@/lib/odoo/sync/syncProducts";
import { syncSales } from "@/lib/odoo/sync/syncSales";
import {
	getLastSyncTime,
	getWorkerHeartbeat,
	logSyncTelemetry,
} from "@/lib/repositories/odoo.repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Worker heartbeat older than this is considered stale — cron may proceed.
// Must match HEARTBEAT_FRESHNESS_SECONDS in /api/sync/status and /api/health.
const WORKER_FRESHNESS_SECONDS = 120;

// Authentication returns one of three states:
//   "ok"            — valid Authorization: Bearer <CRON_SECRET> header
//   "unauthorized"  — header missing or wrong secret (→ 401)
//   "misconfigured" — CRON_SECRET env var not set in production (→ 500)
//
// cron-job.org must send: Authorization: Bearer <CRON_SECRET>
// No ?secret= query param is accepted (weaker auth surface removed).
// In NODE_ENV=development with no CRON_SECRET set, requests are allowed
// so local testing does not require configuring a secret.
type AuthResult = "ok" | "unauthorized" | "misconfigured";

function checkAuth(req: NextRequest): AuthResult {
	const expectedSecret = process.env.CRON_SECRET;
	if (!expectedSecret) {
		if (process.env.NODE_ENV === "development") {
			console.warn(
				"[ODOO_CRON] CRON_SECRET not set — development bypass active. Set CRON_SECRET before deploying.",
			);
			return "ok";
		}
		// Production with no CRON_SECRET = server misconfiguration, not a client auth error.
		console.error(
			"[ODOO_CRON] CRON_SECRET is not configured. Set it in Vercel environment variables.",
		);
		return "misconfigured";
	}
	const authHeader =
		req.headers.get("authorization") || req.headers.get("Authorization");
	const bearerToken = authHeader?.startsWith("Bearer ")
		? authHeader.substring(7)
		: null;
	// Constant-time comparison is not available in edge/Node without crypto,
	// but CRON_SECRET is not a cryptographic key — timing attacks are not a
	// realistic threat for a cron-job.org IP-sourced request. Simple equality.
	if (!bearerToken || bearerToken !== expectedSecret) {
		return "unauthorized";
	}
	return "ok";
}

/**
 * GET /api/cron/odoo-sync  (external backup scheduler endpoint)
 *
 * External caller: cron-job.org fires every 2 minutes with:
 *   Authorization: Bearer <CRON_SECRET>
 * This route does NOT depend on Vercel's cron configuration.
 *
 * Architecture:
 *   Primary sync  → Oracle always-on worker (`src/lib/odoo/sync/worker.ts`)
 *   Backup sync   → this route (fires only when the worker heartbeat is stale)
 *
 * Coordination guarantee (three-layer):
 *   1. Heartbeat check  — skips if the Oracle worker wrote a heartbeat < 120 s ago.
 *   2. Advisory lock    — pg_try_advisory_lock prevents two concurrent invocations
 *                         from racing each other.
 *   3. Idempotent ops   — all DB writes use ON CONFLICT DO UPDATE, so an
 *                         accidental overlap is safe in the worst case.
 *
 * This route does NOT call runSyncPipeline() (the legacy uncoordinated full sync).
 * Instead it reuses the same individual entity sync functions the Oracle worker uses,
 * so business logic, SQL semantics, and KPI calculations are identical.
 */
export async function GET(req: NextRequest) {
	const traceId = `cron_${Date.now()}`;
	const startTime = Date.now();

	// ── 1. Authentication ──────────────────────────────────────────────────────
	// checkAuth distinguishes misconfiguration (500) from bad credentials (401).
	const authResult = checkAuth(req);
	if (authResult === "misconfigured") {
		return NextResponse.json(
			{ error: "Server misconfiguration: CRON_SECRET is not configured." },
			{ status: 500 },
		);
	}
	if (authResult === "unauthorized") {
		console.warn("[ODOO_CRON] Rejected unauthorized cron trigger attempt");
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	// ── 2. Feature gate (opt-in for safety) ───────────────────────────────────
	// Default OFF: the Oracle Worker is primary. Vercel Cron will only act as a
	// live backup when VERCEL_CRON_BACKUP_ENABLED=true is explicitly set.
	if (process.env.VERCEL_CRON_BACKUP_ENABLED !== "true") {
		console.log(
			"[ODOO_CRON] Backup cron is disabled (VERCEL_CRON_BACKUP_ENABLED != true). " +
				"Set VERCEL_CRON_BACKUP_ENABLED=true in Vercel env to activate.",
		);
		return NextResponse.json(
			{
				success: true,
				skipped: true,
				reason: "backup_cron_disabled",
				hint: "Set VERCEL_CRON_BACKUP_ENABLED=true in Vercel environment variables.",
				traceId,
				timestamp: new Date().toISOString(),
			},
			{ status: 200 },
		);
	}

	// ── 3. Worker heartbeat check — skip if Oracle worker is alive ─────────────
	try {
		const heartbeat = await getWorkerHeartbeat("main");
		if (heartbeat && heartbeat.secondsAgo <= WORKER_FRESHNESS_SECONDS) {
			console.log(
				`[ODOO_CRON] Oracle Worker heartbeat is fresh (${heartbeat.secondsAgo}s ago on ${heartbeat.hostname}). Skipping backup sync.`,
			);
			return NextResponse.json({
				success: true,
				skipped: true,
				reason: "worker_heartbeat_fresh",
				workerSecondsAgo: heartbeat.secondsAgo,
				workerHostname: heartbeat.hostname,
				traceId,
				timestamp: new Date().toISOString(),
			});
		}
		if (heartbeat) {
			console.log(
				`[ODOO_CRON] Oracle Worker heartbeat is STALE (${heartbeat.secondsAgo}s ago). Proceeding with backup sync.`,
			);
		} else {
			console.log(
				"[ODOO_CRON] No Oracle Worker heartbeat found. Proceeding with backup sync.",
			);
		}
	} catch (heartbeatErr) {
		// Non-fatal: if we cannot read the heartbeat, proceed with the backup sync.
		console.warn(
			"[ODOO_CRON] Failed to read worker heartbeat (proceeding with backup sync):",
			heartbeatErr instanceof Error
				? heartbeatErr.message
				: String(heartbeatErr),
		);
	}

	// ── 4. PostgreSQL advisory lock — prevent concurrent Vercel invocations ────
	const lockAcquired = await tryAcquireCronLock();
	if (!lockAcquired) {
		console.log(
			"[ODOO_CRON] Advisory lock already held — another Vercel Cron invocation is running. Skipping.",
		);
		return NextResponse.json({
			success: true,
			skipped: true,
			reason: "sync_already_running",
			traceId,
			timestamp: new Date().toISOString(),
		});
	}

	console.log(
		`[ODOO_CRON] Starting incremental backup sync (traceId: ${traceId})...`,
	);

	// ── 5. Incremental backup sync ─────────────────────────────────────────────
	// Uses the same entity sync functions as the Oracle Worker (queue.ts) — not
	// the deprecated runSyncPipeline(). Business logic is unchanged.
	let totalRecords = 0;
	const entityErrors: string[] = [];

	try {
		const client = new OdooClient();
		await client.authenticate();

		// Products
		const productsStart = new Date().toISOString();
		try {
			const lastSync = await getLastSyncTime("products");
			const count = await syncProducts(client, lastSync);
			totalRecords += count;
			await logSyncTelemetry(
				"products",
				productsStart,
				new Date().toISOString(),
				"success",
				count,
				null,
				0,
				0,
				"active",
				{ traceId, workerId: "vercel_cron" },
			);
		} catch (err: any) {
			const msg = `products: ${err?.message ?? String(err)}`;
			entityErrors.push(msg);
			console.error("[ODOO_CRON] Products sync error:", err?.message);
			await logSyncTelemetry(
				"products",
				productsStart,
				new Date().toISOString(),
				"failed",
				0,
				err?.message ?? null,
				0,
				0,
				"active",
				{ traceId, workerId: "vercel_cron" },
			);
		}

		// Customers
		const customersStart = new Date().toISOString();
		try {
			const lastSync = await getLastSyncTime("customers");
			const count = await syncCustomers(client, lastSync);
			totalRecords += count;
			await logSyncTelemetry(
				"customers",
				customersStart,
				new Date().toISOString(),
				"success",
				count,
				null,
				0,
				0,
				"active",
				{ traceId, workerId: "vercel_cron" },
			);
		} catch (err: any) {
			const msg = `customers: ${err?.message ?? String(err)}`;
			entityErrors.push(msg);
			console.error("[ODOO_CRON] Customers sync error:", err?.message);
			await logSyncTelemetry(
				"customers",
				customersStart,
				new Date().toISOString(),
				"failed",
				0,
				err?.message ?? null,
				0,
				0,
				"active",
				{ traceId, workerId: "vercel_cron" },
			);
		}

		// Sales (sale.order + pos.order)
		const salesStart = new Date().toISOString();
		try {
			const lastSync = await getLastSyncTime("sales");
			const count = await syncSales(client, lastSync);
			totalRecords += count;
			await logSyncTelemetry(
				"sales",
				salesStart,
				new Date().toISOString(),
				"success",
				count,
				null,
				0,
				0,
				"active",
				{ traceId, workerId: "vercel_cron" },
			);
		} catch (err: any) {
			const msg = `sales: ${err?.message ?? String(err)}`;
			entityErrors.push(msg);
			console.error("[ODOO_CRON] Sales sync error:", err?.message);
			await logSyncTelemetry(
				"sales",
				salesStart,
				new Date().toISOString(),
				"failed",
				0,
				err?.message ?? null,
				0,
				0,
				"active",
				{ traceId, workerId: "vercel_cron" },
			);
		}

		// Inventory (stock.quant snapshot)
		const inventoryStart = new Date().toISOString();
		try {
			const count = await syncInventory(client);
			totalRecords += count;
			await logSyncTelemetry(
				"inventory",
				inventoryStart,
				new Date().toISOString(),
				"success",
				count,
				null,
				0,
				0,
				"active",
				{ traceId, workerId: "vercel_cron" },
			);
		} catch (err: any) {
			const msg = `inventory: ${err?.message ?? String(err)}`;
			entityErrors.push(msg);
			console.error("[ODOO_CRON] Inventory sync error:", err?.message);
			await logSyncTelemetry(
				"inventory",
				inventoryStart,
				new Date().toISOString(),
				"failed",
				0,
				err?.message ?? null,
				0,
				0,
				"active",
				{ traceId, workerId: "vercel_cron" },
			);
		}

		// ── 6. Cache invalidation ──────────────────────────────────────────────
		if (totalRecords > 0) {
			await invalidateDashboardCache();
		}
	} catch (authErr: any) {
		const durationMs = Date.now() - startTime;
		console.error("[ODOO_CRON] Odoo authentication failed:", authErr?.message);
		await logSyncTelemetry(
			"full",
			new Date(startTime).toISOString(),
			new Date().toISOString(),
			"failed",
			0,
			`auth: ${authErr?.message}`,
			0,
			0,
			"active",
			{ traceId, workerId: "vercel_cron", durationMs },
		);
		return NextResponse.json(
			{
				success: false,
				error: "Odoo authentication failed",
				detail: authErr?.message,
				traceId,
				timestamp: new Date().toISOString(),
				durationMs,
			},
			{ status: 502 },
		);
	} finally {
		await releaseCronLock();
	}

	// ── 7. Final telemetry ─────────────────────────────────────────────────────
	const durationMs = Date.now() - startTime;
	const hasErrors = entityErrors.length > 0;

	await logSyncTelemetry(
		"full",
		new Date(startTime).toISOString(),
		new Date().toISOString(),
		hasErrors ? "failed" : "success",
		totalRecords,
		hasErrors ? entityErrors.join("; ") : null,
		0,
		0,
		"active",
		{ traceId, workerId: "vercel_cron", durationMs },
	);

	console.log(
		`[ODOO_CRON] Backup sync complete — records: ${totalRecords}, errors: ${entityErrors.length}, duration: ${durationMs}ms, traceId: ${traceId}`,
	);

	return NextResponse.json({
		success: !hasErrors,
		traceId,
		timestamp: new Date().toISOString(),
		durationMs,
		totalRecords,
		...(hasErrors && { errors: entityErrors }),
	});
}

export async function POST(req: NextRequest) {
	return GET(req);
}
