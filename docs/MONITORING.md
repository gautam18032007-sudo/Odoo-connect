# Monitoring the Sync Worker

Two existing API routes (built before this deployment-artifacts round) are
the primary monitoring surface — this doc explains what they report and how
to read them, it does not add new endpoints.

## `/api/health`

Checks database connectivity, the webhook dead-letter queue, materialized
view freshness, Odoo connectivity, the polling sync dead-letter queue
(`checks.syncQueue`), and the worker heartbeat (`checks.worker`):

```json
{
  "checks": {
    "syncQueue": { "status": "healthy", "deadLetter": 0, "lastDeadLetterAt": null },
    "worker": { "status": "alive", "hostname": "oracle-vm-1", "secondsAgo": 3, "state": { "...": "..." } }
  }
}
```

`checks.worker.status` is one of:
- `"never_started"` — no heartbeat row exists yet (worker never ran, or its
  first cycle hasn't completed).
- `"stale"` — a heartbeat exists but is older than 120s; the worker is
  probably crashed, stuck, or the host is unreachable.
- `"alive"` — a fresh heartbeat exists.

`checks.syncQueue.status` degrades to `"degraded"` once more than 10 jobs
are sitting in `sync_dead_letter_queue` — worth investigating, since that
many permanent/exhausted failures usually points at a systemic issue
(Odoo schema change, expired credentials), not isolated bad rows.

## `/api/sync/status`

Reports overall sync freshness (`status: LIVE/FRESH/SYNCING/DELAYED/OFFLINE`,
same thresholds as before this work), plus `workerSource`:
- `"in_process"` — this API instance's own in-memory worker singleton is
  running (only true if the Next.js process itself started a worker, which
  it normally doesn't on Vercel).
- `"heartbeat"` — falling back to the persisted heartbeat, meaning a
  separate worker process (e.g. on Oracle) is the one actually running.
- `"none"` — no in-process worker and no fresh heartbeat — nothing is
  syncing.

This is how you confirm, from the Vercel-hosted dashboard, that the
Oracle-hosted worker is the one actually doing the work.

## Querying directly

For anything not surfaced above:

```sql
-- Dead-lettered jobs awaiting investigation
SELECT * FROM sync_dead_letter_queue WHERE status = 'dead_letter' ORDER BY created_at DESC;

-- Worker's last reported state
SELECT * FROM worker_heartbeat WHERE worker_id = 'main';

-- Per-entity sync freshness
SELECT sync_type, completed_at, status FROM sync_telemetry
WHERE sync_type <> 'heartbeat' ORDER BY completed_at DESC LIMIT 20;
```

## What's intentionally NOT built

No alerting (Slack/email/PagerDuty on worker-down or DLQ-growing) exists
yet — that's Phase 11 of the mega-prompt this doc responds to, and was
explicitly deferred to a later round, not silently skipped. The building
blocks (`/api/health` status fields, `sync_dead_letter_queue` counts) are
there for whoever wires up alerting next; polling them from an external
uptime monitor (e.g. a cron hitting `/api/health` and alerting on non-200
or `checks.worker.status !== "alive"`) is the fastest way to get basic
alerting without new code.
