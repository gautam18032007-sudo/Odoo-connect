# ZenZebra CRM — Agent Rules

## Source of Truth

**Excel column mapping is absolute source of truth.** Real Neon column names override any product-doc examples:

- `net_amount` (not `net_sales`)
- `bill_no` (not `bill_number`)
- `customer_mobile` (not `customer_id`)
- `sku_code`, `item_name`, `billed_by` (raw store values)

Ground-truth file: sheet `main`, stores `'Klj store'` and `'SmartworksNoida Noida'` only.

## Architecture

Two data paths feed the same analytics layer — both are real, both currently run:

```
Excel → excel-parser.ts → staging_upload_rows → validate → commit → sales_fact ─┐
                                                                                  ├→ sales_fact_v → business-logic → API → UI
Odoo → OdooClient (webhook + Oracle-hosted always-on worker) → dim_*/fact_* ────┘
```

- **Never** insert Excel directly into `sales_fact` without staging.
- **All analytics queries** use `sales_fact_v`, never raw `sales_fact` or raw `dim_*`/`fact_*` tables — `sales_fact_v` is a `UNION ALL` compatibility view blending legacy Excel data with the Odoo canonical tables (`fact_sales_lines`, `fact_sales_orders`, `dim_products`, `dim_customers`, `dim_stores`).
- Store exclusion lives in the view WHERE clause only — do not hardcode staff names in components.

### Odoo sync path

- **Primary sync engine**: `AlwaysOnSyncWorker` (`src/lib/odoo/sync/worker.ts`) + `SyncQueueManager` (`src/lib/odoo/sync/queue.ts`) — a standalone Node process meant to run continuously on an always-on host (Oracle Cloud VM), not Vercel. Has priority-ordered queue, per-job exponential backoff, failure classification (permanent vs. transient), a DB-persisted dead-letter queue (`sync_dead_letter_queue`), and a persisted heartbeat (`worker_heartbeat`) so `/api/health` and `/api/sync/status` can report its real state regardless of which host it runs on. See `docs/WORKER_DEPLOYMENT.md`.
- **Real-time path**: Odoo webhooks → `src/app/api/webhooks/odoo/route.ts` → `webhook_events` (deduped, `pg_advisory_xact_lock`-serialized) → `syncSingleRecord()`.
- **Legacy backup engine, disabled by default**: `runSyncPipeline()` (`src/lib/odoo/sync/orchestrator.ts`) — no queue/retry/DLQ/locking. Reachable via `/api/cron`, `/api/cron/sync`, `/api/cron/odoo-sync`, but all three no-op unless `LEGACY_CRON_SYNC_ENABLED=true` — **do not enable this alongside a running worker**, it has no coordination with the queue and would race its writes. Marked `@deprecated` in code; kept only as a manually-controlled fallback.
- **Cache bridge**: the worker runs outside any Next.js request context, so `revalidateTag`/`revalidatePath` can't be called directly from it — it POSTs to `/api/internal/revalidate` (secret-protected, see `INTERNAL_API_SECRET`) after a sync with changes, which runs `invalidateDashboardCache()` from within a real request context instead.
- There are also 4 legacy Make.com/Zapier-style webhook routes (`src/app/api/webhooks/odoo/{sales,purchase,inventory,crm}/route.ts`) writing directly to `sales_fact`/other tables — these predate the canonical Odoo JSON-RPC integration above and their current relationship to it hasn't been fully audited; treat as a separate, older integration path until confirmed otherwise.

## Upload

- `full_replace`: morning file (~17K rows) — TRUNCATE + insert
- `incremental`: intraday — DELETE latest sale_date + insert
- Track batches in `upload_batches` (extended with `upload_type`, `latest_sale_date`)

## Comparison

- `comparison.ts` owns all period logic — **mirror period only** (no calendar-month shortcut)
- Components never compute comparison windows

## Filters

- Zustand filter state → API params → SQL → computed response (no frontend `filteredDataset`)
- `store` = raw `billed_by` value
- `categoryScope`: `all` | `retail` (retail excludes LIVE MENU, SNACK CORNER, BEVERAGES)

## Out of Scope V1

- Weather/footfall correlation → Future Analytics module

## Verification

After full re-import, run: `npx ts-node -P tsconfig.scripts.json src/scripts/verify-ground-truth.ts`
