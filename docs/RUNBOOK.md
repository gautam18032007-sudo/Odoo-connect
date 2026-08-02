# Runbook — Quick Commands

Day-to-day operational commands for the always-on sync worker. See
[WORKER_DEPLOYMENT.md](./WORKER_DEPLOYMENT.md) for full setup,
[MONITORING.md](./MONITORING.md) for what the health signals mean, and
[DISASTER_RECOVERY.md](./DISASTER_RECOVERY.md) for incident response.

## Check if the worker is alive

```bash
node scripts/check-worker-health.mjs
```
Or remotely, via the Next.js app: `GET /api/health` → `checks.worker.status`.

## View logs

```bash
# Docker
docker compose -f docker-compose.worker.yml logs -f --tail=200

# PM2
pm2 logs zenzebra-sync-worker --lines 200

# systemd
journalctl -u zenzebra-worker -f --lines 200
```

## Restart the worker

```bash
# Docker
docker compose -f docker-compose.worker.yml restart worker

# PM2
pm2 restart zenzebra-sync-worker

# systemd
sudo systemctl restart zenzebra-worker
```

## Stop the worker

```bash
# Docker
docker compose -f docker-compose.worker.yml stop

# PM2
pm2 stop zenzebra-sync-worker

# systemd
sudo systemctl stop zenzebra-worker
```

## Inspect the dead-letter queue

```sql
SELECT id, job_type, attempts, error_message, created_at
FROM sync_dead_letter_queue
WHERE status = 'dead_letter'
ORDER BY created_at DESC
LIMIT 20;
```

## Mark a dead-lettered job resolved (after fixing root cause)

```ts
// via a one-off ts-node script, or add to an admin script:
import { markDeadLetterResolved } from "@/lib/repositories/odoo.repository";
await markDeadLetterResolved(<id>);
```

## Force a manual resync (bypassing the poll loop's own schedule)

```bash
npx ts-node -P tsconfig.scripts.json src/scripts/trigger-sync-now.ts
```

## Check overall sync freshness

`GET /api/sync/status` — look at `status` (LIVE/FRESH/SYNCING/DELAYED/OFFLINE),
`lastSyncAt`, and `workerSource` (confirms whether the Oracle-hosted worker
or something else is being reported on — see MONITORING.md).

## Deploy a code update

```bash
git pull
npm ci
# then restart via whichever supervisor this VM uses — see "Restart the
# worker" above
```

Or, once GitHub Secrets are configured, trigger
`.github/workflows/deploy-worker.yml` manually from the Actions tab
(`workflow_dispatch`).
