# Disaster Recovery — Sync Worker

Scenarios specific to the always-on worker moving to Oracle Cloud. For
database-level recovery, see [BACKUP_RESTORE.md](./BACKUP_RESTORE.md).

## Worker process crashes

**Detection**: `checks.worker.status` on `/api/health` goes from `"alive"`
to `"stale"` (heartbeat older than 120s) — see [MONITORING.md](./MONITORING.md).

**Recovery**: automatic under all three supervision strategies (Docker
`restart: unless-stopped`, PM2 `autorestart`, systemd `Restart=always`) —
see [WORKER_DEPLOYMENT.md](./WORKER_DEPLOYMENT.md). No manual action needed
unless it's crash-looping (check logs — `docker compose logs`, `pm2 logs`,
or `journalctl -u zenzebra-worker`).

## Oracle VM is unreachable / destroyed

**Impact**: real-time sync stops (the webhook path on Vercel is unaffected
— it still receives and dead-letters events into `webhook_events`, it just
has nothing polling in the background for the incremental/backup sync).
Business data already synced is unaffected; nothing is lost, sync just
pauses.

**Recovery**: provision a new VM ([ORACLE_SETUP.md](./ORACLE_SETUP.md)),
deploy the worker ([WORKER_DEPLOYMENT.md](./WORKER_DEPLOYMENT.md)). On
first start, `getLastSyncTime()` per entity picks up from the last
successful `sync_telemetry` row in Neon (which is independent of the VM),
so the incremental sync resumes from where it left off rather than
re-pulling everything.

## Odoo becomes unreachable (API down, credentials rotated, etc.)

**Detection**: `/api/health`'s `checks.odooSaaS.status` becomes
`"disconnected"`; the worker's own retry/backoff (built earlier this
project) keeps attempting with exponential backoff rather than hammering a
down endpoint.

**Recovery**: once Odoo is reachable again (or credentials are fixed in
`.env.local`/`.env.worker` and the worker is restarted), normal polling
resumes automatically — no manual re-sync trigger needed for a transient
outage. For a credential change specifically, the worker process must be
restarted after updating the env file (it doesn't hot-reload env vars).

## Sync queue jobs keep failing (DLQ growing)

**Detection**: `checks.syncQueue.status` becomes `"degraded"` (>10
dead-lettered jobs) on `/api/health`.

**Investigation**:
```sql
SELECT job_type, error_message, attempts, created_at
FROM sync_dead_letter_queue
WHERE status = 'dead_letter'
ORDER BY created_at DESC;
```
A cluster of the same `error_message` usually points to one root cause
(e.g. an Odoo field removed/renamed, a permission change) rather than N
unrelated failures — classified permanent errors dead-letter immediately
(no wasted retries), so a spike here is a real signal, not noise.

**Recovery**: fix the root cause, then either wait for the next natural
sync cycle to succeed (most entities re-attempt on their own schedule) or
manually re-trigger via the existing manual sync scripts
(`src/scripts/trigger-sync-now.ts`) once the fix is deployed. Mark
resolved DLQ rows via `markDeadLetterResolved()` if you want them out of
the active count (they're kept, not deleted, for audit history).

## Full data-loss scenario (Neon database itself lost)

Out of scope for this document — see
[BACKUP_RESTORE.md](./BACKUP_RESTORE.md)'s point-in-time recovery via
Neon's own managed backups. This is a database-platform-level event, not
something the worker's retry/DLQ logic is designed to protect against.
