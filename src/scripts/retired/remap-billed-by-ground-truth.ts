import * as path from "node:path";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

/**
 * RETIRED (DEFECT-111, Phase 2 remediation).
 *
 * This script directly mutated sales_fact.billed_by, unconditionally,
 * with no guard. That approach is inconsistent with — and superseded by —
 * this project's established store-identity architecture: store-name
 * unification (e.g. "Klj store"/"KLJ" -> "KLJ") is handled entirely at the
 * sales_fact_v VIEW level (see src/scripts/update-odoo-compatibility-view.ts),
 * specifically so the underlying stored data in sales_fact never needs to
 * be rewritten. Re-running this script would directly contradict that
 * architecture and risk reintroducing raw-data drift the view-level fix
 * was built to avoid.
 *
 * Zero references to this script exist anywhere else in the repository. It
 * is retired rather than left runnable.
 */
async function main() {
	console.error(
		"❌ This script is retired (DEFECT-111) and will not run. Store-name unification is handled at the sales_fact_v view level — see update-odoo-compatibility-view.ts. See this file's header for the full reasoning.",
	);
	process.exit(1);
}

main();
