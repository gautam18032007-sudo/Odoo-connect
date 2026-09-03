import * as path from "node:path";
import * as dotenv from "dotenv";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

/**
 * RETIRED (new finding, Phase 2 destructive-script sweep — same class as
 * DEFECT-111).
 *
 * Same problem as the already-retired remap-billed-by-ground-truth.ts:
 * unconditional `UPDATE sales_fact SET billed_by = ...`, no guard, no
 * confirmation, directly mutating raw stored data instead of using this
 * project's established view-level store-identity unification (see
 * update-odoo-compatibility-view.ts). Additionally, this script references
 * a `store` column that does not exist on the current sales_fact schema
 * (confirmed: sales_fact has no `store` column, only `billed_by`,
 * `source_billed_by`, `store_id`) — it would error immediately if run
 * against the current database, confirming it is a stale artifact from an
 * earlier schema version, not a currently-usable tool.
 *
 * Zero references to this script exist anywhere else in the repository.
 */
async function main() {
	console.error(
		"❌ This script is retired and will not run. Store-name unification is handled at the sales_fact_v view level — see update-odoo-compatibility-view.ts. See this file's header for the full reasoning.",
	);
	process.exit(1);
}

main();
