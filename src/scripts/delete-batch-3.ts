import * as path from "node:path";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

/**
 * RETIRED (DEFECT-108, Phase 2 remediation).
 *
 * This was a one-time historical cleanup script for a specific,
 * already-resolved data issue: an extra upload batch (id=3) that needed to
 * be removed to restore a frozen ground-truth state on the database that
 * existed at the time. It previously executed unconditionally against
 * whatever DATABASE_URL was configured, with no guard.
 *
 * Verified before retirement: `upload_batches` id=3 does not exist on the
 * current database (0 rows returned for that id) — the historical fix this
 * script performed has already happened or never applied here. It has no
 * remaining legitimate purpose and is retired rather than left runnable.
 *
 * If a future situation genuinely requires deleting a specific upload
 * batch, write a new, parameterized script (batch id as an explicit
 * argument, not hardcoded) with the same confirmation-gate pattern used in
 * clear-odoo-tables.ts, rather than re-enabling this one.
 */
async function main() {
	console.error(
		"❌ This script is retired (DEFECT-108) and will not run. See the file header for why.",
	);
	process.exit(1);
}

main();
