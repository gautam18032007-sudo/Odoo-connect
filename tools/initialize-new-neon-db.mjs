/**
 * RETIRED — this script is intentionally disabled and must never run.
 *
 * The original version of this file (538 lines) was a one-time Neon
 * database bootstrap/recovery tool (schema creation, dimension tables,
 * indexes, etc. — see the "feat(migration): New Neon DB recovery..."
 * commit this file originated from). Alongside that legitimate schema
 * work, it also hardcoded a single plaintext default password (redacted
 * here; see git history if the exact value is ever needed for rotation
 * purposes) for three accounts (`Diwakarpro01`, `Gautam12`, `zebra`),
 * inserted via `ON CONFLICT (username) DO UPDATE`.
 * That upsert meant re-running this script at any point would silently
 * overwrite whatever real password was currently set for those users,
 * including the "zebra" account's securely-generated production password.
 * This is the traced origin of a separate finding: src/app/login/page.tsx
 * previously had this same username and password hardcoded as the login
 * form's input `defaultValue`s, apparently copied from this script's
 * known defaults for local-dev convenience.
 *
 * This file was never referenced by package.json, CI, deployment, or any
 * other script — confirmed dead/unused before retirement. Since its
 * database-bootstrap purpose was a one-time historical recovery action
 * (the database already exists and is in active production use), it is
 * fully retired rather than "fixed to be fail-closed" — there is no
 * legitimate reason to run it again against the current database.
 *
 * The original source is preserved in git history for audit purposes —
 * `git log --oneline -- tools/initialize-new-neon-db.mjs` then
 * `git show <commit>:tools/initialize-new-neon-db.mjs`. It must not be
 * restored or re-enabled. If a future database ever needs bootstrapping
 * from scratch, the schema-creation SQL can be recovered from git
 * history, but any user-seeding step must use the same pattern already
 * established in src/scripts/seed-auth.ts: a fresh, randomly generated
 * password per account, printed once, never hardcoded in source.
 */

throw new Error(
	"tools/initialize-new-neon-db.mjs is retired and must not be executed. See the header comment in this file for why, and for the safe alternative pattern.",
);
