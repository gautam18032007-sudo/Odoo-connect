# Backup & Restore

## Database (Neon PostgreSQL)

Neon is a managed service with built-in point-in-time recovery — there is
no separate backup job to build or maintain for the database itself.

- **Point-in-time restore**: Neon's dashboard/API supports restoring to any
  point within your plan's retention window (check your current Neon plan
  for the exact window — this varies by tier and isn't something this repo
  controls).
- **Branching for drills**: Neon supports creating a branch from a past
  point in time without touching the production branch — this is the
  recommended way to run a restore drill (see below) without any risk to
  live data.

This repo does not need a `pg_dump` cron job or similar unless you want an
additional, independent copy outside Neon's own retention (e.g. for
long-term archival beyond Neon's window) — that's a deliberate choice to
avoid maintaining redundant backup infrastructure for a managed database
that already provides this.

## Restore drill (recommended quarterly)

1. In the Neon console, create a branch from a point in time (e.g. "1 hour
   ago") — this does not affect the production branch.
2. Point a local `.env.local` at the branch's connection string.
3. Run `npx ts-node -P tsconfig.scripts.json src/scripts/verify-ground-truth.ts`
   (or the relevant `verify:*` script) against the branch to confirm the
   data at that point in time looks correct.
4. Delete the branch when done.

## Worker state (not "backed up" — regenerated)

`sync_dead_letter_queue`, `worker_heartbeat`, and `sync_telemetry` are all
operational/observability state, not business data — if lost, they
regenerate on the next sync cycle. Losing them is not a data-loss event;
it just means temporarily reduced visibility into recent sync history.

## Application code

Recoverable from git history / GitHub — no separate backup needed.

## What this doc cannot do for you

Actually configuring Neon's retention window or verifying it against your
specific plan/billing tier — that requires your Neon account access.
