// PM2 process supervisor config for the always-on Odoo sync worker.
// Alternative to Docker Compose / systemd for running the same
// sync-worker.mjs entrypoint on a bare VM — pick ONE supervision strategy,
// see docs/WORKER_DEPLOYMENT.md.
//
// Usage:
//   pm2 start ecosystem.config.js
//   pm2 save && pm2 startup   # supervise PM2 itself via systemd on reboot
//   pm2 logs zenzebra-sync-worker
module.exports = {
	apps: [
		{
			name: "zenzebra-sync-worker",
			script: "sync-worker.mjs",
			cwd: __dirname,
			instances: 1, // single instance only — the queue manager isn't
			// designed for concurrent workers processing the same jobs
			exec_mode: "fork",
			autorestart: true,
			max_memory_restart: "512M",
			// Exponential backoff between crash-loop restarts (min 1s, capped at
			// PM2's internal max) instead of hammering a persistently failing
			// process.
			exp_backoff_restart_delay: 1000,
			max_restarts: 20,
			min_uptime: "30s",
			// PM2 has no env_file option — sync-worker.mjs -> start-sync-worker.ts
			// already loads .env.local itself (see the dotenv loader added there).
			// On the VM, put the real values from .env.worker.example into
			// .env.local next to this file; PM2 only needs NODE_ENV here.
			env: {
				NODE_ENV: "production",
			},
			out_file: "./logs/worker-out.log",
			error_file: "./logs/worker-error.log",
			log_date_format: "YYYY-MM-DD HH:mm:ss Z",
			// Requires `pm2 install pm2-logrotate` — not installed automatically,
			// documented in docs/ORACLE_SETUP.md.
			merge_logs: true,
		},
	],
};
