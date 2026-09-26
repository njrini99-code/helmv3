# INC-2026-09-26: the nightly ledger-vs-catalog check reported 258 missing objects, and 236 were false

- Feature: `feature_awareness_system` (DB drift tooling, `scripts/db/check-ledger-vs-catalog.mjs`)
- Status: FIXED on branch agent/health-20260926-1130; not merged yet
- Risk: R1. Read-only CI tooling. No schema, RLS or data change.
- Signal: the `Database drift (production)` workflow was red every day from at
  least 2026-09-22, deduplicated onto issue #1897 (signature 4ad78da89e949006)

## What was wrong

`check-ledger-vs-catalog` parses the CREATE TABLE/FUNCTION/POLICY names in
every applied migration and asserts each one exists in the live catalog.
Three bugs made it fail on objects that exist or were removed on purpose:

1. **It read the catalog for `public` only.** Migrations also create objects
   in `helm_debug`, `helm_jobs` and `helm_private`, and policies on
   `storage.objects`. Graveyard migrations move retired tables to
   `graveyard` (`EXECUTE format('ALTER TABLE public.%I SET SCHEMA graveyard')`).
2. **It ignored later drops.** An object created in migration A and dropped
   in a later applied migration B (for example
   `DROP FUNCTION IF EXISTS helm_private.prevent_active_round_stranding()`)
   was reported as missing.
3. **It treated `format()` templates as names.** Policies created in DO
   blocks (`%1$s_coach_select_team`, `%I`) were counted as names.

## Fix

- The catalog is read across every non-`pg_*` and non-`information_schema`
  schema (`isUserSchema`).
- `parseRemovedObjects` covers DROP TABLE/FUNCTION/POLICY, comma lists, and
  table/function/policy RENAME. It only honours a removal from an applied
  version later than the create.
- Policy names must be identifiers.

Live production run, read-only: **258 → 22**. The remaining 22 are real
ledger/catalog disagreements, and the check still fails on them:
- 20 baseball policies. Their tables exist under differently named policies,
  for example `baseball_player_timeline_events` carries `baseball_timeline_*`,
  and some delete policies are absent.
- 2 functions absent everywhere: `baseball_log_staff_change` and
  `baseball_stat_visual_views_touch`.

These are RLS/schema items for the owner (R3), tracked on #1897.

Regression tests: `scripts/__tests__/check-ledger-vs-catalog.test.mjs` (4 new
tests fail on a9a03535e; all 11 pass on the fix). Replay:
`replay/manifests/ledger-vs-catalog-scope-2026-09-26.yml`.
