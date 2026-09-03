# UI Recovery Report (RC1)

This report details the repository health, branch states, and synchronization steps required to prepare the UI for merge.

## 1. Repository Health & Git Status

### Outer Workspace (`zenzebrasalescrm-main/`)
* **Current Branch**: `main`
* **Commit History**: None yet (`No commits yet`). A fresh Git repo has been initialized locally and all files are currently staged as `new file` in the working tree.
* **Uncommitted/Staged Changes**: All source files (under `src/` and scripts) are currently staged for an initial commit.
* **Working Tree**: Contains the active Next.js development server runtime.

### Inner Directory Git Clone (`zenzebrasalescrm/`)
* **Current Branch**: `gautam-2.0` (tracking `origin/gautam-2.0`)
* **Working Tree State**: Clean (`nothing to commit, working tree clean`).
* **Latest Commits**:
  1. `2dab885a7a0b101c6a9802a7f57a71a5a56f7d40` (July 3, 18:49:46): "Rework Customer Retention module: merge Segments & Health tab, add LTV/CAC/AOV tab, restyle to dark bento layout" (Gautam)
  2. `4c0ef6b07a7e2b065d93ed8e30292a388fac326a` (July 3, 10:52:31): "Initial commit for Gautam 2.0" (Gautam)
  3. `1ead11d9b00b051a5fd5eb71eade217b4a093272` (July 1, 22:04:31): "feat: add purchase chunked staging upload UI/API, rename Sales Dashboard, and plot purchases in Revenue Momentum" (Diwakar Bhagat)

---

## 2. Synchronization & Recovery Strategy

### Detected File Discrepancies
The outer workspace is currently missing key backend/sync files related to **Odoo webhook integrations** and **Purchase data loading** which exist in the inner repository's `gautam-2.0` branch. These are:
* `src/lib/business-logic/purchase.ts`
* `src/lib/business-logic/profitability.ts`
* `src/lib/business-logic/margin.ts`
* `src/lib/founder/purchase-import-service.ts`
* `src/lib/parser/purchase-parser.ts`
* `src/app/api/webhooks/odoo/` (4 routes)
* `src/scripts/migrate-purchase-fact.ts`
* `src/scripts/seed-purchase-from-excel.ts`
* `src/scripts/migrate-odoo-webhook-tables.ts`

### Indentation / Code Style Discrepancy
* **Outer Workspace**: Uses **Tabs** for indentation (configured in Biome).
* **Inner sub-repository**: Uses **2 Spaces** for indentation.

### Sync Action Checklist
To safely consolidate the newest UI improvements:
1. **Copy missing files** from the inner repository to the outer directory to ensure that both repositories are structurally in sync.
2. **Apply Biome Formatting** to the release branch (`npm run format`) to unify all spacing/indentation differences.
3. **Commit** the changes to a temporary branch in the outer workspace before staging the merge to the production architecture repository.
