/**
 * RETIRED — this script is intentionally disabled and must never run.
 *
 * The original version of this file ran an UNCONDITIONAL, no-confirmation
 * deduplication pass against `sales_fact`: it queried for duplicate rows
 * (grouped by `sale_date`/`bill_no`/`store`/`sku` — an old, pre-migration
 * column naming scheme; the current schema uses `billed_by`/`sku_code`),
 * then executed `DELETE FROM sales_fact WHERE id NOT IN (SELECT MAX(id) ...)`
 * whenever any duplicates were found, followed by an `ALTER TABLE ... ADD
 * CONSTRAINT UNIQUE`. Because it referenced columns that no longer exist,
 * running it today would fail at the first query — but that schema
 * mismatch is not a safety mechanism and must not be relied on as one; the
 * destructive intent (an unconditional DELETE with no dry-run, no
 * confirmation flag, no scoping) is the actual problem, independent of
 * whether it currently errors out.
 *
 * This file was never referenced anywhere in the repository — confirmed
 * before retirement. The original source is preserved in git history for
 * audit purposes — `git log --oneline -- test-neon.ts` then
 * `git show <commit>:test-neon.ts`. It must not be restored or re-enabled.
 * If sales_fact deduplication is ever genuinely needed again, it must be
 * built as a scoped, dry-run-first tool with an explicit confirmation
 * gate — the same pattern already used for
 * src/scripts/clear-odoo-tables.ts.
 */

throw new Error(
	"test-neon.ts is retired and must not be executed. See the header comment in this file for why.",
);
