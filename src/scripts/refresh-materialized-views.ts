import path from "node:path";
import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

// Relative import (not @/): ts-node CommonJS doesn't resolve path aliases.
import { refreshMaterializedViews } from "../lib/materialized-views";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

/**
 * CLI wrapper around the shared refresh engine. Meant to run at the end of the
 * upload pipeline (the route also calls refreshMaterializedViews in-process):
 *   Upload → Commit → Refresh MV → Verify → Invalidate cache → Dashboard fresh
 *
 *   npm run refresh:mv
 */
async function main() {
	if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL missing");
	const sql = neon(process.env.DATABASE_URL);
	console.log("Refreshing materialized views…");
	const results = await refreshMaterializedViews(sql);
	let failed = 0;
	for (const r of results) {
		console.log(
			`${r.ok ? "✅" : "❌"} ${r.view.padEnd(24)} ${r.ok ? `${r.ms.toFixed(0)} ms` : r.error}`,
		);
		if (!r.ok) failed++;
	}
	if (failed > 0) process.exit(1);
	console.log("✅ All materialized views refreshed.");
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
