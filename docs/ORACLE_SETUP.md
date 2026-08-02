# Oracle Cloud VM Setup — Always-On Sync Worker

Prepares an Oracle Cloud (or any Ubuntu 24.04) always-on VM to run the
ZenZebra Odoo sync worker. This document covers VM prep only — for
choosing and configuring a supervision strategy (Docker / PM2 / systemd),
see [WORKER_DEPLOYMENT.md](./WORKER_DEPLOYMENT.md).

This repo does not provision Oracle Cloud itself (no cloud credentials are
available to automate this) — these are the manual/scriptable steps to run
on the VM once it exists.

## 1. Base packages

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl ufw fail2ban htop
```

## 2. Node.js 20 LTS

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node --version   # expect v20.x — matches the node:20-alpine base image
                  # used in Dockerfile.worker
```

## 3. Pick ONE supervision strategy

Only install what the chosen strategy needs — don't install all three,
see [WORKER_DEPLOYMENT.md](./WORKER_DEPLOYMENT.md) for the decision.

**Docker:**
```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
# log out/in for the group change to take effect
docker compose version
```

**PM2** (no Docker needed):
```bash
sudo npm install -g pm2
pm2 --version
```

**systemd** — nothing extra to install; systemd is already part of Ubuntu.

## 4. Firewall

The worker itself needs no inbound ports open (no HTTP server). Only open
what you actually use:

```bash
sudo ufw allow OpenSSH
# If you later add nginx fronting a status endpoint (see deploy/nginx.worker.conf):
# sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status
```

## 5. fail2ban (SSH brute-force protection)

```bash
sudo systemctl enable --now fail2ban
sudo fail2ban-client status sshd
```

## 6. Deploy user + directory

```bash
sudo useradd -m -s /bin/bash zenzebra
sudo mkdir -p /opt/zenzebra-sales-crm
sudo chown zenzebra:zenzebra /opt/zenzebra-sales-crm
sudo mkdir -p /etc/zenzebra
sudo chown zenzebra:zenzebra /etc/zenzebra
```

## 7. Clone and configure

```bash
sudo -u zenzebra git clone https://github.com/gautam18032007-sudo/Odoo-connect.git /opt/zenzebra-sales-crm
cd /opt/zenzebra-sales-crm
sudo -u zenzebra npm ci
cp .env.worker.example .env.local   # fill in real DATABASE_URL / ODOO_* values
```

## 8. Start the worker

Follow [WORKER_DEPLOYMENT.md](./WORKER_DEPLOYMENT.md) for the Docker/PM2/systemd
startup commands, then confirm it's alive:

```bash
node scripts/check-worker-health.mjs
```

## External dependencies this document cannot complete for you

- Actually creating the Oracle Cloud VM (compute shape, image, network) —
  requires an Oracle Cloud account/console access.
- A real domain + DNS record, only relevant if you later add the optional
  nginx-fronted status endpoint (`deploy/nginx.worker.conf`).
- GitHub repo secrets (`ORACLE_HOST`, `ORACLE_USER`, `ORACLE_SSH_KEY`) for
  `.github/workflows/deploy-worker.yml` to actually run.
