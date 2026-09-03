/**
 * RETIRED — this script is intentionally disabled and must never run.
 *
 * The original version of this file:
 *   1. Read the real password_hash for the "zebra" user directly from the
 *      production database.
 *   2. Tested it against a hardcoded plaintext password string (redacted
 *      here; see git history if the exact value is ever needed for
 *      rotation purposes).
 *   3. If it didn't match, AUTOMATICALLY and UNCONDITIONALLY reset the
 *      password_hash for "zebra", "diwakarpro01", and "gautam12" to that
 *      same hardcoded value — no confirmation, no dry-run, no scoping.
 *
 * That is exactly the class of destructive/dangerous script this project's
 * security audits have repeatedly flagged and fixed elsewhere (see
 * src/scripts/clear-odoo-tables.ts, delete-batch-3.ts,
 * remap-billed-by-ground-truth.ts, backfill-billed-by.ts for the same
 * remediation pattern). This file was never referenced by package.json,
 * CI, deployment, or any other script — confirmed dead/unused before
 * retirement — so it is fully disabled rather than "fixed," per this
 * project's established practice of retiring unused destructive scripts
 * outright instead of leaving a weakened-but-still-dangerous version.
 *
 * The original source is preserved in git history for audit purposes —
 * `git log --oneline -- fix-passwords.ts` then `git show <commit>:fix-passwords.ts`.
 * It must not be restored or re-enabled. If a legitimate password-reset
 * tool is ever needed, it must require an explicit, externally-supplied
 * new password (e.g. via a required environment variable checked for
 * presence, never a hardcoded literal), operate on exactly one named user
 * passed as an explicit argument, and never silently touch other accounts.
 */

throw new Error(
	"fix-passwords.ts is retired and must not be executed. See the header comment in this file for why, and for the safe alternative pattern.",
);
