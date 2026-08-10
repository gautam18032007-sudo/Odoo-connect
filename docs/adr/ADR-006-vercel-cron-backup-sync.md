# ADR-006: Vercel Cron Backup Sync — Heartbeat-Gated, Lock-Coordinated Incremental Recovery

**Status**: Accepted  
**Date**: 2026-08-10  
**Deciders**: Engineering (Staff+ Review)  
**Safety Classification**: `[REVIEW]` — API route refactor; no SQL semantics changed  

---

## Context

The ZenZebra Sales CRM uses a three-layer synchronization architecture to move data from Odoo SaaS into the Neon PostgreSQL database:

1. **Oracle Always-On Worker** (`src/lib/odoo/sync/worker.ts`) — primary, runs continuously on an Oracle Cloud VM with 2-15 second polling intervals, a priority queue, DLQ, and heartbeat.
2. **Webhook Handler** (`/api/webhooks/odoo`) — real-time, event-driven, < 100 ms acknowledgement, background processing via `syncSingleRecord()`.
3. **Vercel Cron** (`/api/cron/odoo-sync`) — backup/reconciliation, fires every minute, should only act when the Oracle Worker is unavailable.

### Problem

The Vercel Cron backup path was registered in `vercel.json` and authenticated correctly, but its implementation had two critical flaws:

1. **It called `runSyncPipeline()`** — a deprecated, uncoordinated full-sync function with no queue, no retry/backoff, no DLQ, and no locking. Running this alongside the Oracle Worker would cause racing writes to `fact_sales_orders`, `dim_products`, `dim_customers`, and `fact_inventory`.

2. **It had no awareness of the Oracle Worker's state** — the cron could run a full sync while the worker was actively syncing the same records.

The safeguard in place (`LEGACY_CRON_SYNC_ENABLED !== "true"`) was correct but left the backup path permanently disabled with no safe alternative.

---

## Decision

Replace `runSyncPipeline()` in the Vercel Cron backup route with a **lock-aware, worker-heartbeat-checking, incremental recovery path**.

### Three-Layer Coordination

```
PRIMARY:    Oracle Worker      → polls Odoo every 2-15s
MONITOR:    Oracle systemd     → restarts worker if heartbeat stale (every 2 min)
BACKUP:     Vercel Cron        → incremental DB sync only when worker heartbeat stale
REALTIME:   Webhook Handler    → event-driven single-record sync (advisory-locked)
```

### Vercel Cron Logic (new)

```
GET /api/cron/odoo-sync
  1. Verify CRON_SECRET                       → 401 if missing/wrong
  2. Check VERCEL_CRON_BACKUP_ENABLED=true    → 200 skipped if not set
  3. Read worker_heartbeat for worker 'main'
       → if secondsAgo <= 120: return { skipped, reason: "worker_heartbeat_fresh" }
  4. pg_try_advisory_lock(1516500225)          → if locked: return { skipped, reason: "sync_already_running" }
  5. For each entity [products, customers, sales, inventory]:
       a. getLastSyncTime(entity)              → incremental cursor
       b. syncX(client, lastSync)              → same function as Oracle Worker
       c. logSyncTelemetry(workerId: "vercel_cron", traceId)
  6. invalidateDashboardCache()               → if totalRecords > 0
  7. pg_advisory_unlock()
  8. Return { success, traceId, totalRecords, durationMs }
```

### Oracle Layer — systemd Timer

A new `worker-health-check.timer` (every 2 min) drives `worker-health-check.service`, which:
1. Runs `scripts/check-worker-health.mjs` (reads `worker_heartbeat` table).
2. If stale: triggers `pm2 restart zenzebra-sync-worker`.

This ensures the Oracle Worker self-heals within 2 minutes of a crash, long before Vercel Cron needs to act as a fallback.

---

## Locking Mechanism

| Layer | Lock Type | Scope |
|---|---|---|
| Oracle Worker | `SyncQueueManager.isProcessing` in-memory flag | Within the single worker process |
| Webhook handler | `pg_advisory_xact_lock(hashtext(eventId))` | Per-event, transaction-scoped |
| Vercel Cron backup | `pg_try_advisory_lock(1516500225)` | Session-scoped, auto-released on connection close |
| Reconciliation (admin) | `sync_telemetry` row lock (`reconcile_lock`) | Long-running sweeps only |

The Vercel Cron lock ID (`1516500225 = 0x5A5B0101`) is statically reserved and documented here. It must not be reused by any other lock in the system.

---

## Why NOT `runSyncPipeline()`

`runSyncPipeline()` (`src/lib/odoo/sync/orchestrator.ts`) is marked `@deprecated` because:
- No queue or priority system — all entities sync serially even if only one changed.
- No backoff — an Odoo timeout kills the entire pipeline, not just one entity.
- No DLQ — failed records are silently lost.
- No advisory lock — concurrent calls race on the same tables.
- Writes telemetry with `workerId: "worker_main"` making it indistinguishable from Oracle Worker telemetry in observability queries.

The new cron backup uses the same underlying `syncX()` functions, gains proper per-entity error isolation, and records `workerId: "vercel_cron"` for clean telemetry separation.

---

## Consequences

### Positive
- Vercel Cron can safely be enabled (`VERCEL_CRON_BACKUP_ENABLED=true`) alongside the Oracle Worker without racing.
- The backup path is now incremental (cursor-based via `getLastSyncTime`) rather than a full re-sync.
- Real telemetry with `traceId` and `workerId: "vercel_cron"` enables Vercel-vs-Oracle attribution in `sync_telemetry`.
- The Oracle health timer (`worker-health-check.timer`) gives the worker a second chance to self-recover within 2 minutes, keeping the Vercel Cron as a true last resort.

### Negative / Trade-offs
- The Vercel Cron backup still uses separate connection state from the Oracle Worker. If both fire within the same 120-second window (e.g. worker heartbeat is at 119 s when cron fires), the heartbeat check may not prevent an overlap. Mitigation: idempotent `ON CONFLICT DO UPDATE` upserts make any overlap safe at the data level; the advisory lock prevents genuine concurrent Vercel invocations.
- The Vercel Pro plan is required for per-minute cron frequency. On Hobby, the cron fires once per day (still useful as a daily reconciliation, not per-minute). The Oracle Worker remains primary and continuous regardless.

---

## Alternatives Considered

1. **Simply set `LEGACY_CRON_SYNC_ENABLED=true`** — Rejected. `runSyncPipeline()` has no locking and races the worker.
2. **Add a cron entry for `/api/cron/sync` or `/api/cron`** — Rejected. Both routes now return `410 Gone` (deprecated).
3. **Use Redis distributed lock instead of PostgreSQL advisory lock** — Rejected. The project already uses Neon PostgreSQL for all coordination. Adding Redis would be a new infrastructure dependency for a backup path. PostgreSQL advisory locks are reliable, cost-free, and auto-released.
4. **Use `reconciliation.ts`'s `acquireReconciliationLock()`** — Rejected. That mechanism uses a `sync_telemetry` row and is designed for long-running (30+ minute) admin sweeps, not 1-minute cron invocations. It would permanently block the reconciliation admin path if a cron invocation crashed mid-lock.

---

## References

- [worker.ts](file:///c:/Users/pc/Documents/zenzebrasalescrm-main/src/lib/odoo/sync/worker.ts) — Oracle Worker implementation
- [cron-lock.ts](file:///c:/Users/pc/Documents/zenzebrasalescrm-main/src/lib/odoo/sync/cron-lock.ts) — Advisory lock helper (new)
- [odoo-sync/route.ts](file:///c:/Users/pc/Documents/zenzebrasalescrm-main/src/app/api/cron/odoo-sync/route.ts) — Rewritten backup cron route
- [worker-health-check.timer](file:///c:/Users/pc/Documents/zenzebrasalescrm-main/deploy/worker-health-check.timer) — Oracle-layer health timer (new)
- [queue.ts](file:///c:/Users/pc/Documents/zenzebrasalescrm-main/src/lib/odoo/sync/queue.ts) — Worker queue/DLQ
- [reconciliation.ts](file:///c:/Users/pc/Documents/zenzebrasalescrm-main/src/lib/odoo/sync/reconciliation.ts) — Long-running admin reconciliation (unmodified)
