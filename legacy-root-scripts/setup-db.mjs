/**
 * RETIRED — this script is intentionally disabled and must never run.
 *
 * The original version of this file created the `users`/`sessions` tables
 * and then seeded three accounts (`Diwakarpro01`, `Gautam12`, `zebra`) with
 * a single hardcoded plaintext password (redacted here; see git history —
 * pre-dates this file's tracking, so it was never committed — if the exact
 * value is ever needed for rotation purposes), inserted via
 * `ON CONFLICT (username) DO UPDATE SET ... password_hash = EXCLUDED.password_hash`.
 * That upsert meant re-running this script at any point would silently
 * overwrite whatever real password was currently set for those users,
 * including the "zebra" account's securely-generated production password —
 * the same class of risk already remediated in fix-passwords.ts and
 * tools/initialize-new-neon-db.mjs.
 *
 * This file was never tracked by git, never referenced by package.json,
 * CI, deployment, or any other script — confirmed dead/unused before
 * retirement (Handover Phase 3 security audit). It is fully retired rather
 * than "fixed to be fail-closed" since its one-time bootstrap purpose no
 * longer applies to a database already in active production use.
 *
 * It must not be restored or re-enabled. If a future database ever needs
 * bootstrapping from scratch, the schema-creation SQL can be recovered from
 * git history where available, but any user-seeding step must use the same
 * pattern already established in src/scripts/seed/seed-auth.ts: a fresh,
 * randomly generated password per account, printed once, never hardcoded
 * in source.
 */

throw new Error(
	"RETIRED: legacy-root-scripts/setup-db.mjs is retired and must not be used for database/account initialization.",
);
