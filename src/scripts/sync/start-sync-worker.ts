import * as fs from "node:fs";
import * as path from "node:path";

// Must load env and use a dynamic import for AlwaysOnSyncWorker below —
// a static top-level import would let db.ts evaluate (and cache
// DATABASE_URL as undefined, falling back to the mock SQL client) before
// this dotenv.config() call ever runs, since ES module imports are hoisted
// ahead of any other top-level code. Same pattern already used by
// trigger-sync-now.ts and other scripts in this repo.
const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
	const envConfig = fs.readFileSync(envPath, "utf8");
	for (const line of envConfig.split("\n")) {
		const trimmed = line.trim();
		if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
			const [key, ...valueParts] = trimmed.split("=");
			const value = valueParts.join("=").replace(/^["']|["']$/g, "");
			if (key && !process.env[key.trim()]) {
				process.env[key.trim()] = value;
			}
		}
	}
}

async function main() {
	const { AlwaysOnSyncWorker } = await import("../../lib/odoo/sync/worker");

	console.log("==================================================");
	console.log("⚡ Starting ZenZebra Always-On Odoo SaaS Sync Worker");
	console.log("==================================================");

	const worker = new AlwaysOnSyncWorker();

	// Graceful shutdown handling
	process.on("SIGINT", () => {
		console.log("\n[SIGINT] Shutting down sync worker...");
		worker.stop();
		process.exit(0);
	});

	process.on("SIGTERM", () => {
		console.log("\n[SIGTERM] Shutting down sync worker...");
		worker.stop();
		process.exit(0);
	});

	await worker.start();
}

main().catch((err) => {
	console.error("❌ Fatal error in sync worker runner:", err);
	process.exit(1);
});
