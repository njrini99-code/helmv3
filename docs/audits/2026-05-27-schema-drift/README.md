## 2026-05-27 — Supabase schema drift audit

### What

Migration replay against a clean Postgres was failing on `baseball_academic_eligibility.updated_by does not exist`. PR #97 had been adding one-line column backfills to each failing migration, but every new commit revealed the next missing column. Whack-a-mole.

This audit captures the full state of prod vs source, and the single alignment migration that closes the drift in one shot.

### Files

- `prod-schema-public.sql` — `pg_dump --schema-only --schema=public` of `qmnssrrolpinvwjjnufo` (Helm-Production) at the timestamp in the dirname. 26,521 lines, 175 tables, 483 indexes, 585 policies.
- `drift-report.txt` — parser output: which tables / columns exist in prod but not in source.

### How prod got out of sync

Two contributing patterns:

1. **Five orphan tables were created directly in the prod DB** (via Studio or manual SQL), never written as migrations:
   - `admin_analytics_events`, `admin_api_perf_log`, `admin_client_errors` — early observability tables.
   - `golf_player_notification_state` — used by RLS policies in `20260427210000_canonical_rls_snapshot.sql` and ALTERed by `20260526050000_v3_notification_prefs_columns.sql`, but never `CREATE TABLE`-ed in source.
   - `golf_team_coach_staff` — sibling of `baseball_team_coach_staff`, created in prod only.

2. **217 columns across 53 tables were added directly in prod** — most look like quick fixes that were applied to the prod DB to unblock a feature, and the migration was never written back. Examples:
   - `baseball_academic_eligibility.updated_by` (the failure that surfaced this audit)
   - `baseball_events` (+10 cols including `created_by_id`, `all_day`, `recurring`, etc.)
   - `golf_rounds` (+13 cols including `temperature`, `wind_speed`, `total_to_par`, `is_verified`)
   - `golf_patterns_v2` (+12 cols including `coach_id`, `description`, `evidence`, `team_id`)

### Fix

`supabase/migrations/20260221110000_prod_schema_alignment.sql` runs one slot before the first migration that referenced any of these columns (`20260221120000_add_remaining_fk_indexes.sql`). It is fully idempotent (`ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`) so applying it against prod is a no-op.

One column was deferred to a follow-up alignment because its table is created later than this slot: `crm_email_templates.format` (table created `20260313000000`). That column isn't referenced by any source migration, so it doesn't break replay.

### How to regenerate the diff

```bash
# 1. Dump prod (Settings → Database → Connection string → Session pooler)
PGURL='postgresql://postgres.qmnssrrolpinvwjjnufo:...@aws-1-us-east-1.pooler.supabase.com:5432/postgres'
pg_dump --schema-only --no-acl --no-owner --schema=public --dbname="$PGURL" \
  > docs/audits/$(date +%Y-%m-%d)-schema-drift/prod-schema-public.sql

# 2. Run the diff (scripts/check-schema-drift.py if checked in, else /tmp/diff_schema.py)
python3 diff_schema.py docs/audits/$(date +%Y-%m-%d)-schema-drift/prod-schema-public.sql supabase/migrations/
```

### Reverse drift (source has columns prod doesn't)

The drift report also lists ~hundreds of "extra in source" columns — these are columns that source migrations CREATE but don't exist in prod. Most are legacy columns that were renamed or dropped manually in prod without a migration; they don't break replay (source happily creates them; nothing in prod cares), but they are technical debt and should be reconciled in a future cleanup.
