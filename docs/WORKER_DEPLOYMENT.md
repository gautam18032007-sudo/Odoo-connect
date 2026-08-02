# Worker Deployment — Docker vs PM2 vs systemd

The always-on Odoo sync worker (`sync-worker.mjs` → `src/scripts/start-sync-worker.ts`
→ `AlwaysOnSyncWorker` in `src/lib/odoo/sync/worker.ts`) is a single long-running
Node process — a `while(!stop)` poll loop, not an HTTP server. It moves to an
always-on host (e.g. Oracle Cloud) because Vercel serverless functions can't
run indefinitely; this doc does not change the worker's code, only how it's
supervised on that host.

**Pick exactly one of the three options below.** Running more than one
against the same database would double-process the sync queue — there's no
distributed lock between separate worker processes today (the queue is
single-instance, in-process).

| | Docker Compose | PM2 | systemd |
|---|---|---|---|
| Best for | You already run other containers on this VM | You want simple process management without Docker | Minimal dependencies, VM is dedicated to this one job |
| Install footprint | Docker + Compose | `npm i -g pm2` | Nothing extra (built into Ubuntu) |
| Auto-restart on crash | Yes (`restart: unless-stopped`) | Yes (`autorestart`) | Yes (`Restart=always`) |
| Survives VM reboot | Yes (Docker daemon + restart policy) | Needs `pm2 startup` + `pm2 save` | Yes (`systemctl enable`) |
| Log rotation | Built-in (`logging.options.max-size`) | Needs `pm2-logrotate` module | Handled by journald |

## Docker Compose

```bash
cp .env.worker.example .env.worker   # fill in real values
docker compose -f docker-compose.worker.yml up -d --build
docker compose -f docker-compose.worker.yml logs -f
docker compose -f docker-compose.worker.yml ps   # shows healthcheck status
```

Restart after a code update:
```bash
git pull
docker compose -f docker-compose.worker.yml up -d --build
```

## PM2

```bash
cp .env.worker.example .env.local   # PM2 has no env_file option — the
                                      # worker's own dotenv loader reads
                                      # .env.local next to sync-worker.mjs
pm2 start ecosystem.config.js
pm2 save
pm2 startup   # prints a systemd command to run once, so PM2 itself
              # survives a VM reboot
```

Optional log rotation:
```bash
pm2 install pm2-logrotate
```

Restart after a code update:
```bash
git pull && npm ci
pm2 restart zenzebra-sync-worker
```

## systemd

```bash
sudo cp deploy/zenzebra-worker.service /etc/systemd/system/
sudo mkdir -p /etc/zenzebra
sudo cp .env.worker.example /etc/zenzebra/worker.env   # fill in real values
sudo systemctl daemon-reload
sudo systemctl enable --now zenzebra-worker
sudo systemctl status zenzebra-worker
journalctl -u zenzebra-worker -f
```

Restart after a code update:
```bash
git pull && npm ci
sudo systemctl restart zenzebra-worker
```

## Confirming it's actually alive

None of the three supervisors "running" proves the worker is doing useful
work — a process can be alive but stuck. The real signal is the persisted
heartbeat (`worker_heartbeat` table, written every poll cycle):

```bash
node scripts/check-worker-health.mjs
```

...or from the Next.js app side, `/api/health` (`checks.worker`) and
`/api/sync/status` (`workerSource: "heartbeat"` once this worker is the one
being reported on) — see [MONITORING.md](./MONITORING.md).
