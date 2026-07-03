# BaseballHelm — Database Readiness Packet

> ## APPLIED 2026-07-02 (owner addendum)
>
> All 8 migrations below are **now live in prod** — Nick personally reviewed and applied each one, full verification battery green. Status by file:
>
> | # | Fixes | Status |
> |---|---|---|
> | 1 | `..._651_column_reconcile.sql` | **Applied**, with 2 amendments: (a) `baseball_fielding_events` gets `throw_velocity` directly (not `throw_velocity_new` — decided: different metric from the pre-existing `arm_velocity`, no rename needed); (b) `ALTER TABLE public.baseball_stat_sources ALTER COLUMN name DROP NOT NULL` added right after the stat_sources `ADD COLUMN` block |
> | 2 | `..._practice_effectiveness_v7_reconcile.sql` | **Applied**, with 1 amendment: added a guarded `UNIQUE (team_id, dedupe_key)` constraint (`uq_baseball_practice_effectiveness_team_dedupe`) — required by `measureForTeam`'s upsert `onConflict` target |
> | 3 | `..._verdict.sql` (branch `fix/baseball-p2-practice-effectiveness-verdicts`) | **Applied** verbatim |
> | 4 | `..._event_acks_policy_restore.sql` | **Applied** verbatim |
> | 5 | `..._652_announcements_rls_fix.sql` | **Applied** verbatim |
> | 6 | `..._program_logo_storage.sql` (branch `fix/baseball-p2-program-logo-upload`) | **Applied** verbatim |
> | 7 | `..._anon_grant_drift_revoke.sql` | **Applied** verbatim — live `pg_proc.proacl` re-check confirms no `anon` on any of the 3 functions post-apply |
> | 8 | `fix/baseball-p2-teams-manage` self-leave migration (`20260701021000_baseball_team_coach_staff_self_leave.sql`) | **Applied** — found on the branch during review, not originally in this packet's inventory |
>
> Files 1, 2, 4, 5, 7 are authored on `fix/baseball-p0-db-reconcile` (new worktree `.claude/worktrees/p0-db-reconcile`) so repo history matches what's live — see PR (branch pushed, opened into `batch/baseball-fixes`). Files 3, 6, 8 already exist as committed files on their respective open fix-fleet branches. **Nothing further needs to apply from this packet — the DB step is done.**
>
> ---

**Date:** 2026-07-02 · **Author:** DB-readiness staging pass (read-only against live prod) · **Repo checkout:** `/Users/ricknini/Downloads/helmv3` (branch `batch/baseball-fixes`) · **Live project:** `qmnssrrolpinvwjjnufo` (shared golf+baseball)

> **Method:** every claim below is from a direct read-only `information_schema` / `pg_catalog` / `pg_policies` / `pg_proc` query against the LIVE database, or a direct read of a migration/source file on disk — never from `schema_migrations`/`list_migrations` alone (confirmed unreliable in this repo: a migration can be recorded-applied and not have taken effect — see §3, Finding C). **No `apply_migration`, no `execute_sql` DDL/DML, no write of any kind touched the live DB producing this packet.**
>
> This revises an earlier same-day draft of this file (timestamped 23:42 on disk) — that draft correctly identified that #651 is bigger than "11 columns" for `baseball_stat_sources`/`baseball_catching_events`/`baseball_baserunning_events` (an entire migration generation silently no-op'd against pre-existing older tables) but stopped short of drafting the SQL. This version verifies that finding against the actual `.select()`/`.insert()` call sites (catching the exact column lists code needs), extends it to `baseball_fielding_events` (also undercounted) and — a finding the earlier draft missed — `baseball_practice_effectiveness_reviews` (24 of 25 columns missing, not 2), and drafts every migration end-to-end.

---

## 0. TL;DR for the one-decision approval

- **8 migrations staged.** 2 already exist as files on open, unmerged fix branches (verified clean). **The other 6 do not exist as files anywhere — drafted in full below**, because the issues they fix (#651, #652, the event-acknowledgements lockout, one table's near-total schema drift, and an anon-grant drift) are scoped by planning docs but nobody had authored the SQL.
- **All 8 are additive-only, RLS-safe, collision-free, and lint-clean** (only cosmetic `sqlfluff` layout findings — same class every already-merged migration in this repo has; CI runs that job `|| true`, advisory).
- **3 of the 8 fix confirmed-live, active breakage today**: (1) every real stat-event CSV import (TrackMan/Rapsodo/GameChanger/etc.) fails at the source-resolution step — both the read-only *preview* and the *commit* — because `baseball_stat_sources` is missing `source_key` itself, not just `source_name`; (2) Decision Room "Resolve" and "Record decision note" throw a raw Postgres error to the coach; (3) `baseball_event_acknowledgements` has RLS on with **zero policies** — fully locked out for every non-service-role caller.
- **Two tables turned out to be full schema-generation no-ops, not narrow gaps** — `baseball_practice_effectiveness_reviews` (24/25 V7 columns missing; the feature has produced zero rows ever) and `baseball_stat_sources` (11/11 spec columns missing; live has a completely different, older column set). `baseball_catching_events`, `baseball_fielding_events`, and `baseball_baserunning_events` are a hybrid — their original "envelope" columns (id/team_id/game_id/etc.) landed, but 5–7 columns each that code actually reads/writes did not, under a mix of missing-entirely and named-differently.
- **All 7 affected event/source/effectiveness tables are currently EMPTY (0 rows)** except `baseball_event_acknowledgements` (2 rows) — every `NOT NULL` addition is backfill-free and safe.
- **One open naming question, flagged not blocking:** `baseball_fielding_events` already has a live `arm_velocity` column; code separately references `throw_velocity`. Drafted as a new `throw_velocity_new` column pending a one-line confirmation from Nick on whether these are the same metric (→ rename) or different metrics (→ keep both, drop the `_new` suffix). Everything else in the batch has zero open questions.
- **Nothing in the 24 pending app-code fix branches** (`fix/baseball-p0-*` / `p1-*` / `p2-*`) needs a new migration beyond the 2 already-committed ones — verified by diffing all 24 against `batch/baseball-fixes` for `supabase/migrations/` changes and every new `.from()`/`.rpc()` reference (all resolve to tables/RPCs confirmed live).

---

## 1. Inventory — every pending baseball-related migration

### 1.1 Migration files that exist, on a branch, not yet applied

| # | File | Branch | Status |
|---|---|---|---|
| A | `supabase/migrations/20260701030000_baseball_practice_effectiveness_verdict.sql` | `fix/baseball-p2-practice-effectiveness-verdicts` | Exists, unapplied, **verified clean** (§2) |
| B | `supabase/migrations/20260701031000_baseball_program_logo_storage.sql` | `fix/baseball-p2-program-logo-upload` | Exists, unapplied, **verified clean** (§2) |

Only two migration files exist across all 24 pending fix branches — confirmed via `git diff batch/baseball-fixes...<branch> -- supabase/migrations/` on every one (`fix/baseball-p0-globals-css`, `fix/baseball-p0-use-server-messages`, all 8 `p1-*`, all 14 `p2-*`; all 24 root off `batch/baseball-fixes`, not `main` — an initial diff against `origin/main` found "no merge base" and was corrected).

### 1.2 Migrations that need to exist but don't yet (drafted in this packet)

Scoped by `docs/audits/REPO_UNTANGLE_AND_CLEAN_BASE.md` and `docs/baseball/PRODUCTION_READINESS_MASTER_PLAN.md` (WS0), but **no file, branch, or PR exists for any of them** — confirmed by searching every `*baseball*` ref for `651`, `652`, `column_reconcile`, `announcements_rls_fix`, `event_ack`:

| # | File (drafted below) | Fixes | Scoped by |
|---|---|---|---|
| C | `20260702095900_baseball_651_column_reconcile.sql` | #651 — all 6 affected tables (see §3 Finding A for why this is one file, not the two-tier split an earlier draft proposed) | WS0.1, corrected by this review |
| D | `20260702100200_baseball_practice_effectiveness_v7_reconcile.sql` | `baseball_practice_effectiveness_reviews` — new finding, was folded into #651's "11 columns" but is really its own 24-column generation-level miss | This review (new finding) |
| E | `20260702100000_baseball_652_announcements_rls_fix.sql` | #652 (RLS recursion, 42P17) | WS0.2 |
| F | `20260702100100_baseball_event_acks_policy_restore.sql` | `baseball_event_acknowledgements` locked out (0 policies) | Untangle plan "event_acks"; root cause found by this review |
| G | `20260702100300_baseball_anon_grant_drift_revoke.sql` | 3 confirmed anon-EXECUTE drift instances | Untangle-plan/task-2 "anon-grant sweep" (targeted subset, see §3.7) |

### 1.3 Scoped items resolved as out-of-scope or already-fine

- **`baseball_coaches_public`** is flagged ERROR by the security-definer-view lint, but its defining migration (`20260701011000_baseball_coaches_public_view.sql`) explicitly sets `security_invoker = false` as a *documented, deliberate* security boundary: narrow non-PII columns (no email/phone), `SELECT`-only to `authenticated`, no anon, no write-through. Flipping it to `security_invoker = on` would make it re-apply the base table's now-narrowed (self-or-teammate) RLS — and since a player has neither condition true against another team's coach, **every cross-org coach-identity lookup a player does (recruiting, messaging) would return zero rows**, breaking the feature the view exists to serve. **Do not "fix" this lint finding.**
- **`v_crm_coaches_by_school`** is a `crm_coaches` (internal CRM prospect directory) view, not a baseball-product table — confirmed via its definition (`SELECT ... FROM crm_coaches`). Out of scope for this packet; flag separately for the CRM workstream.
- **`baseball_demo_sessions`** is the only baseball table with a live `anon` grant — confirmed intentional (demo login flow needs anon read/write before auth exists).

---

## 2. Per-migration verdict table

| Migration | Additive only? | RLS on new objects? | Grants clean? | Collision-free? | Linted? | Sport-prefix? |
|---|---|---|---|---|---|---|
| A `..._verdict.sql` | ✅ `ADD COLUMN IF NOT EXISTS` + guarded CHECK add + `CREATE INDEX IF NOT EXISTS` | N/A (existing table, RLS+4 policies) | N/A | ✅ `verdict` confirmed absent live | ✅ cosmetic only | ✅ |
| B `..._program_logo_storage.sql` | ✅ bucket `INSERT ... ON CONFLICT DO UPDATE` (idempotent), `DROP POLICY IF EXISTS` before each `CREATE` | ✅ 3 policies (coach-only INSERT, owner-only UPDATE/DELETE); no SELECT policy needed (bucket `public=true`, served via public URL) | ✅ `authenticated` + coach-row EXISTS check only; no anon | ✅ `'logos'` bucket confirmed absent from live `storage.buckets` (6 existing); sole consumer is `dashboard/program/page.tsx` | ✅ cosmetic only | N/A (storage) |
| C `..._651_column_reconcile.sql` | ✅ `ADD COLUMN IF NOT EXISTS` throughout, guarded CHECK/UNIQUE adds | N/A (all 6 tables already RLS+policies live) | N/A | ✅ every added column confirmed absent by exact name; all 6 tables confirmed EMPTY | ✅ cosmetic only | ✅ |
| D `..._practice_effectiveness_v7_reconcile.sql` | ✅ 24× `ADD COLUMN IF NOT EXISTS`, 5 guarded CHECK adds | N/A (RLS+4 policies live) | N/A | ✅ 24 of 25 spec columns confirmed absent (only `source_refs` already exists); table confirmed EMPTY | ✅ cosmetic only | ✅ |
| E `..._652_announcements_rls_fix.sql` | ✅ 3 new `SECURITY DEFINER STABLE` helpers + policy `DROP`/`CREATE`, no table/column change | ✅ same visibility semantics preserved (verified against live `pg_policies` qual text before drafting) | ✅ `REVOKE ALL ... FROM public, anon` then `GRANT EXECUTE ... TO authenticated` on all 3 helpers | ✅ exact policy names verified against live `pg_policies`; `baseball_ann_recipients_select_player` explicitly untouched | ✅ cosmetic only | ✅ |
| F `..._event_acks_policy_restore.sql` | ✅ pure policy `DROP IF EXISTS`+`CREATE`, wrapped in the original `to_regclass` guard | ✅ restores the exact original working design | ✅ includes `REVOKE ALL ... FROM anon` (idempotent re-assert) | ✅ `is_baseball_team_coach_v2` confirmed live; table columns match policy bodies | ✅ clean | ✅ |
| G `..._anon_grant_drift_revoke.sql` | ✅ pure `REVOKE` | N/A | ✅ this **is** the grant fix | ✅ all 3 functions + exact signatures confirmed live with `anon=X` present | ✅ clean, zero findings | ✅ |

**sqlfluff** (matching `.circleci/config.yml`'s exact invocation: `sqlfluff lint --dialect postgres --rules core <file>`): every finding across all 6 drafted files is `LT01`/`LT02`/`LT05`/`CP02` (spacing/indent/line-length/capitalization) — the same categories present throughout the already-merged migration history. CI runs this job `|| true` (advisory, non-blocking). **Zero functional/correctness findings on any file.**

**squawk**: not installed in this environment, no local Postgres to point it at. CI's `squawk-migrations` job is authoritative. Every migration here is `ADD COLUMN IF NOT EXISTS` / policy-only / storage-only / `REVOKE`-only — no `ALTER COLUMN TYPE`, no `DROP COLUMN`, no non-concurrent index on a populated table — expected clean, but **unverified**; flagging honestly.

---

## 3. Findings behind the drafted migrations

### Finding A — #651: an entire migration generation no-op'd, not 11 stray columns

`supabase/migrations/20260624000080_baseball_elite_stat_event_model.sql` used `CREATE TABLE IF NOT EXISTS` for 8 tables. Three (`baseball_pitch_events`, `baseball_batted_ball_events`, `baseball_swing_events`) were genuinely new and landed with their full intended schema — confirmed live. **Four already existed under an older schema**, so the `CREATE TABLE IF NOT EXISTS` silently no-op'd on each, and the true gap is much wider than WS0.1's "11 columns" framing, verified by reading every call site (not just the migration's `CREATE TABLE` body):

| Table | Code-referenced columns confirmed missing (exact `.select()`/`.insert()` audit) | What live has instead |
|---|---|---|
| `baseball_stat_sources` | `source_key`, `source_name`, `source_category`, `trust_tier`, `is_enabled`, `default_visibility`, `requires_review`, `ai_can_use`, `expected_cadence_days`, `created_by` (10 of 11 spec columns; `field_mapping_profile` added too for schema completeness though not directly code-referenced) | `name`, `source_type`, `config_json`, `external_id_namespace`, `is_active`, `trust_level` — a different, older schema entirely |
| `baseball_catching_events` | `catcher_id`, `block_result`, `steal_result`, `pop_time`, `throw_accuracy`, `data_context`, `measured_at` (7, not the 2 WS0.1 listed) | `player_id` (not `catcher_id`), `blocking_result` (not `block_result`), `pop_time_seconds` (not `pop_time`), `caught_stealing`+`stolen_base_attempt` (not `steal_result`) |
| `baseball_fielding_events` | `chance_difficulty`, `measured_at`, `arm_accuracy`, `throw_velocity`, `data_context` (5, not the 2 WS0.1 listed) | `arm_velocity` (a different metric — see §0 open question), no `throw_velocity`/`arm_accuracy`/`data_context` |
| `baseball_baserunning_events` | `runner_id`, `home_to_first`, `data_context`, `decision_quality`, `measured_at` (5, not the 2 WS0.1 listed) | `player_id` (not `runner_id`) |
| `baseball_plate_appearances` | `data_context` only — genuinely narrow, this table already has `import_run_id`/`source_trust_level`/`source_visibility` from a more modern migration | matches WS0.1 |
| `baseball_decision_log` | `detail` only — genuinely narrow | matches WS0.1 |

**Confirmed hard-broken today, not just soft-degraded:** `src/app/baseball/actions/stat-event-imports.ts` — `resolveSourceId()` (:161-198) and `resolveSourceIdReadonly()` (:320-335, used by the **read-only preview** step too) both do `.eq('source_key', sourceKey).eq('source_name', sourceName)` against `baseball_stat_sources`. `source_key` doesn't exist live either — this 400s on the SELECT before the code ever reaches the INSERT. **Every elite stat-event CSV import (TrackMan/Rapsodo/GameChanger/etc.), preview or commit, fails at source resolution today.** This is a materially bigger and more active-risk finding than "provenance silently lost on insert" (an earlier read of this file mis-scoped it as insert-only).

Everything else (catching/fielding/baserunning) is confirmed **read-only, dead-end, and soft-degrading** — no INSERT/upsert path exists anywhere in `src/` for these 3 tables today (`commitEventImport`'s grain-to-table map only covers pitch/batted-ball/swing), and every read site (`stats-center.ts` documented silent-degrade block ~828-830, `stat-visuals.ts`, `player-snapshot-cards.ts`, `engine-run.ts`, `loaders-events.ts`) catches the PostgREST error and returns an empty/degraded result. Confirming the master plan's own #651 symptom (catching/fielding/baserunning splits always show empty).

**Decision made, not left open:** the additive-only house rule forbids `RENAME COLUMN`, so the existing older columns (`player_id`, `blocking_result`, `pop_time_seconds`, etc.) are left untouched and the code-expected columns are added alongside them (e.g., both `player_id` and the new `catcher_id` will exist on `baseball_catching_events`). This does NOT require a code change to ship — the code already only ever reads the new names, so the old columns simply go unused going forward (harmless). A follow-up cleanup task (out of scope here) could eventually backfill/consolidate, but nothing in this packet depends on it.

**One open, non-blocking naming question:** `baseball_fielding_events` already has `arm_velocity` (NUMERIC); code wants `throw_velocity`. These may be the same metric under two names or genuinely different metrics (arm strength vs. throw-on-play speed) — the migration drafts `throw_velocity_new` and documents the decision inline; flip the name before applying once Nick confirms (safe either way, table is empty).

### Finding B — #652: confirmed still-live, spec verified against current `pg_policies`, one optional cleanup noted

Direct query confirms the recursion exactly as documented: `baseball_announcements_select_player` `EXISTS`-subqueries `baseball_announcement_recipients`; `baseball_ann_recipients_select_coach`/`_insert`/`_delete` each subquery back to `baseball_announcements`. `baseball_ann_recipients_select_player` (qual: `player_id = get_my_player_id()`) is non-recursive and untouched. The 3-helper-function fix in `docs/baseball/PRODUCTION_READINESS_MASTER_PLAN.md` WS0.2 is accurate; drafted verbatim in §5.

**Optional, non-blocking:** both tables currently carry 2 permissive `SELECT` policies each (coach + player) — a `multiple_permissive_policies` advisor pattern. Since this migration already touches every one of these policies, collapsing each pair into a single `OR`'d policy is a natural follow-up, but not done here (keeping the diff minimal and matching the master plan's spec exactly reduces review risk more than the collapse saves).

### Finding C — `baseball_event_acknowledgements`: root cause found, this is the only fully-locked-out baseball table

Direct query: RLS on, 0 rows in `pg_policy`. Checked all 119 baseball tables — the only one in this state. `supabase/migrations/20260624000050_baseball_rls_helpers_and_policies.sql` (:551-587) created 4 policies named `baseball_event_acks_select/insert/update/delete`. `supabase/migrations/20260630165403_normalize_baseball_event_ack_policies.sql` DROPs exactly those same 4 names, with a comment claiming a differently-named `baseball_event_acknowledgements_*` set from the same source migration would remain — but that source migration never created policies under that name, only `baseball_event_acks_*` (which it also defensively DROPped, in case an even earlier migration had used it). **This is a "ran and broke something" case** (the DROP executed correctly; `list_migrations` correctly shows it applied) — not a "recorded but unran" case. Fix restores the original 4 definitions verbatim (§5).

### Finding D — anon-EXECUTE drift on 3 SECURITY DEFINER RPCs, confirmed via live `pg_proc.proacl`

`can_insert_baseball_team_member`, `try_redeem_baseball_team_invitation`, `release_baseball_team_invitation_redemption` all show `anon=X` in their live ACL, despite their own defining migrations (`20260630233000`, `20260630180200`) explicitly doing `REVOKE ALL ... FROM PUBLIC; GRANT EXECUTE ... TO authenticated, service_role;` at creation — no anon, ever, in the source. No later migration touches any of the three (checked via `grep -rl` across all migrations), so this is drift from outside migration history. All three call sites are in `src/app/baseball/actions/teams.ts`, a `'use server'` file that checks `supabase.auth.getUser()` before any RPC call — anon access is not required by the app. **This is a targeted 3-function finding, not the full "155 SECURITY DEFINER RPCs" sweep** referenced in the broader DB-untangle task — flagging so it isn't mistaken for a completed comprehensive audit.

---

## 4. Ordered apply list

```
1. supabase/migrations/20260702095900_baseball_651_column_reconcile.sql
2. supabase/migrations/20260702100200_baseball_practice_effectiveness_v7_reconcile.sql
3. supabase/migrations/20260701030000_baseball_practice_effectiveness_verdict.sql   (exists — fix/baseball-p2-practice-effectiveness-verdicts)
4. supabase/migrations/20260702100100_baseball_event_acks_policy_restore.sql
5. supabase/migrations/20260702100000_baseball_652_announcements_rls_fix.sql
6. supabase/migrations/20260701031000_baseball_program_logo_storage.sql            (exists — fix/baseball-p2-program-logo-upload)
7. supabase/migrations/20260702100300_baseball_anon_grant_drift_revoke.sql
```

No file has a hard technical dependency on another (all are `ADD COLUMN IF NOT EXISTS` / policy-only / storage-only / `REVOKE`-only) — this order is defense-in-depth sequencing: schema fixes first, then lockout/recursion fixes, then storage, then hardening cleanup last.

---

## 5. Full drafted SQL

<details>
<summary><b>1. 20260702095900_baseball_651_column_reconcile.sql</b></summary>

```sql
-- #651 schema-drift reconcile — REVISED after deeper code-reference audit.
--
-- Original WS0.1 framing ("11 missing columns") undercounts this badly. The
-- whole 20260624000080_baseball_elite_stat_event_model.sql generation used
-- CREATE TABLE IF NOT EXISTS against 4 tables that already existed under an
-- older schema (baseball_stat_sources, baseball_catching_events,
-- baseball_fielding_events, baseball_baserunning_events) -- so for these 4,
-- the ENTIRE intended column set silently no-op'd, not just 1-2 columns each.
-- Confirmed by reading every .select()/.insert() call against these 4 tables
-- across stats-center.ts, engine-run.ts, stat-visuals.ts,
-- player-snapshot-cards.ts, loaders-events.ts, stat-event-imports.ts.
-- Only baseball_plate_appearances and baseball_decision_log are genuinely
-- narrow single/dual-column gaps (handled at the bottom of this file).
-- All 6 tables are EMPTY (0 rows) in prod -- every addition is backfill-free.
--
-- Severity:
--   P0 ACTIVE TODAY: baseball_stat_sources -- resolveSourceId() /
--     resolveSourceIdReadonly() in stat-event-imports.ts .eq('source_key',...)
--     and .eq('source_name',...) 400 on EVERY event-import preview AND
--     commit (source_key doesn't exist live either -- this breaks the
--     read-only preview path too, not just the insert); the insert's other
--     6 fields (source_category, trust_tier, is_enabled, default_visibility,
--     requires_review, ai_can_use, expected_cadence_days, created_by) are
--     also all missing.
--   P0 ACTIVE TODAY: baseball_decision_log.detail -- Decision Room
--     "Resolve"/"Record decision note" inserts fail visibly.
--   P1 LATENT, dead-end reads only (no INSERT path exists anywhere in src/
--     for fielding/catching/baserunning/plate_appearances today; every read
--     site catches the error and returns an empty/degraded result, never
--     crashes): fielding_events (chance_difficulty, measured_at, arm_accuracy,
--     throw_velocity, data_context), catching_events (catcher_id, block_result,
--     steal_result, pop_time, throw_accuracy, data_context, measured_at),
--     baserunning_events (runner_id, home_to_first, data_context,
--     decision_quality, measured_at), plate_appearances (data_context).

-- ---------------------------------------------------------------------------
-- baseball_stat_sources (full reconcile -- live has name/source_type/
-- config_json/external_id_namespace/is_active/trust_level, a DIFFERENT older
-- schema; code needs the columns below, verbatim from the elite-stat-event
-- migration's spec)
-- ---------------------------------------------------------------------------
ALTER TABLE public.baseball_stat_sources
  ADD COLUMN IF NOT EXISTS source_key TEXT,
  ADD COLUMN IF NOT EXISTS source_name TEXT NOT NULL,
  ADD COLUMN IF NOT EXISTS source_category TEXT,
  ADD COLUMN IF NOT EXISTS trust_tier TEXT NOT NULL DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS is_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS default_visibility TEXT NOT NULL DEFAULT 'staff_only',
  ADD COLUMN IF NOT EXISTS requires_review BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS ai_can_use BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS expected_cadence_days INTEGER,
  ADD COLUMN IF NOT EXISTS field_mapping_profile JSONB,
  ADD COLUMN IF NOT EXISTS created_by UUID;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'baseball_stat_sources_source_key_check') THEN
    ALTER TABLE public.baseball_stat_sources
      ADD CONSTRAINT baseball_stat_sources_source_key_check
      CHECK (source_key IN (
        'manual', 'gamechanger_xml', 'statcrew_xml', 'ncaa_live_stats',
        'prestosports_xml', 'sidearm_xml', 'statbroadcast_xml',
        'trackman_csv', 'rapsodo_csv', 'yakkertech_csv', 'hittrax_csv',
        'pocket_radar_csv', 'blast_csv', 'diamond_kinetics_csv',
        'synergy_export', 'six_four_three_export', 'awre_video', 'onform_export',
        'armcare_csv', 'teambuildr_csv', 'teamworks_csv',
        'google_sheets', 'generic_csv', 'generic_xlsx', 'pdf_extract'
      ));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'baseball_stat_sources_source_category_check') THEN
    ALTER TABLE public.baseball_stat_sources
      ADD CONSTRAINT baseball_stat_sources_source_category_check
      CHECK (source_category IN (
        'official_game', 'player_development', 'tracking', 'video',
        'strength', 'academics', 'operations'
      ));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'baseball_stat_sources_trust_tier_check') THEN
    ALTER TABLE public.baseball_stat_sources
      ADD CONSTRAINT baseball_stat_sources_trust_tier_check
      CHECK (trust_tier IN ('official', 'verified_vendor', 'coach_reviewed', 'player_submitted', 'unverified', 'inferred'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'baseball_stat_sources_default_visibility_check') THEN
    ALTER TABLE public.baseball_stat_sources
      ADD CONSTRAINT baseball_stat_sources_default_visibility_check
      CHECK (default_visibility IN ('staff_only', 'player_visible', 'restricted'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_baseball_stat_sources_team_key') THEN
    ALTER TABLE public.baseball_stat_sources
      ADD CONSTRAINT uq_baseball_stat_sources_team_key UNIQUE (team_id, source_key, source_name);
  END IF;
END $$;
-- source_key is intentionally nullable here (not NOT NULL like the original
-- spec) to guarantee this ALTER can never fail even if this ever runs against
-- a non-empty table by accident; flip to NOT NULL before relying on it if
-- Nick wants strict parity (safe today -- table has 0 rows).

-- ---------------------------------------------------------------------------
-- baseball_fielding_events (partial reconcile -- adds the 5 columns code
-- actually references beyond what already exists: chance_difficulty,
-- measured_at, arm_accuracy, throw_velocity, data_context)
-- ---------------------------------------------------------------------------
ALTER TABLE public.baseball_fielding_events
  ADD COLUMN IF NOT EXISTS chance_difficulty TEXT,
  ADD COLUMN IF NOT EXISTS measured_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS arm_accuracy TEXT,
  ADD COLUMN IF NOT EXISTS throw_velocity_new NUMERIC,
  ADD COLUMN IF NOT EXISTS data_context TEXT NOT NULL DEFAULT 'official_game';
-- NOTE: live baseball_fielding_events already has a column named
-- "arm_velocity" (NUMERIC) -- a different metric (raw arm strength) than the
-- code-referenced "throw_velocity" (throw speed on a specific play). Adding
-- throw_velocity AS "throw_velocity_new" pending a naming decision -- if
-- Nick confirms these are the same concept, rename the ADD COLUMN above to
-- throw_velocity and update the one call site instead
-- (player-snapshot-cards.ts:570); if they're genuinely different metrics,
-- rename throw_velocity_new -> throw_velocity here before applying (safe,
-- table is empty) and drop this comment.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'baseball_fielding_events_data_context_check') THEN
    ALTER TABLE public.baseball_fielding_events
      ADD CONSTRAINT baseball_fielding_events_data_context_check
      CHECK (data_context IN (
        'official_game', 'scrimmage', 'practice', 'bullpen', 'cage',
        'showcase', 'sensor', 'video', 'lift', 'readiness', 'manual'
      ));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- baseball_catching_events (partial reconcile -- adds the 7 columns code
-- references beyond what already exists under different names: catcher_id,
-- block_result, steal_result, pop_time, throw_accuracy, data_context,
-- measured_at. Existing player_id/blocking_result/pop_time_seconds/
-- caught_stealing/stolen_base_attempt are left untouched -- additive only)
-- ---------------------------------------------------------------------------
ALTER TABLE public.baseball_catching_events
  ADD COLUMN IF NOT EXISTS catcher_id UUID REFERENCES public.baseball_players(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS block_result TEXT,
  ADD COLUMN IF NOT EXISTS steal_result TEXT,
  ADD COLUMN IF NOT EXISTS pop_time NUMERIC,
  ADD COLUMN IF NOT EXISTS throw_accuracy TEXT,
  ADD COLUMN IF NOT EXISTS data_context TEXT NOT NULL DEFAULT 'official_game',
  ADD COLUMN IF NOT EXISTS measured_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'baseball_catching_events_data_context_check') THEN
    ALTER TABLE public.baseball_catching_events
      ADD CONSTRAINT baseball_catching_events_data_context_check
      CHECK (data_context IN (
        'official_game', 'scrimmage', 'practice', 'bullpen', 'cage',
        'showcase', 'sensor', 'video', 'lift', 'readiness', 'manual'
      ));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- baseball_baserunning_events (partial reconcile -- adds the 5 columns code
-- references: runner_id, home_to_first, data_context, decision_quality,
-- measured_at. Existing player_id is left untouched -- additive only)
-- ---------------------------------------------------------------------------
ALTER TABLE public.baseball_baserunning_events
  ADD COLUMN IF NOT EXISTS runner_id UUID REFERENCES public.baseball_players(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS home_to_first NUMERIC,
  ADD COLUMN IF NOT EXISTS data_context TEXT NOT NULL DEFAULT 'official_game',
  ADD COLUMN IF NOT EXISTS decision_quality TEXT,
  ADD COLUMN IF NOT EXISTS measured_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'baseball_baserunning_events_data_context_check') THEN
    ALTER TABLE public.baseball_baserunning_events
      ADD CONSTRAINT baseball_baserunning_events_data_context_check
      CHECK (data_context IN (
        'official_game', 'scrimmage', 'practice', 'bullpen', 'cage',
        'showcase', 'sensor', 'video', 'lift', 'readiness', 'manual'
      ));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- baseball_plate_appearances (genuinely narrow -- already has import_run_id/
-- source_trust_level/source_visibility from a more modern migration; only
-- data_context is missing)
-- ---------------------------------------------------------------------------
ALTER TABLE public.baseball_plate_appearances
  ADD COLUMN IF NOT EXISTS data_context TEXT NOT NULL DEFAULT 'official_game';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'baseball_plate_appearances_data_context_check') THEN
    ALTER TABLE public.baseball_plate_appearances
      ADD CONSTRAINT baseball_plate_appearances_data_context_check
      CHECK (data_context IN (
        'official_game', 'scrimmage', 'practice', 'bullpen', 'cage',
        'showcase', 'sensor', 'video', 'lift', 'readiness', 'manual'
      ));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- baseball_decision_log (genuinely narrow -- only detail is missing)
-- ---------------------------------------------------------------------------
ALTER TABLE public.baseball_decision_log
  ADD COLUMN IF NOT EXISTS detail TEXT;

-- Rollback (additive-only convention -- do not DROP COLUMN on shared prod DB;
-- all 6 tables are empty so a true DROP is low-risk if ever truly needed, but
-- prefer a follow-up migration dropping just the new CHECK/UNIQUE
-- constraints listed above).
```

</details>

<details>
<summary><b>2. 20260702100200_baseball_practice_effectiveness_v7_reconcile.sql</b></summary>

```sql
-- baseball_practice_effectiveness_reviews V7-object reconcile.
--
-- LIVE-VERIFIED (2026-07-02): 20260624000094_baseball_practice_effectiveness.sql
-- CREATE TABLE IF NOT EXISTS'd this table against a pre-existing, differently
-- shaped table (an older player/coach post-practice rating survey: block_id,
-- reviewed_by_coach_id, overall_grade, reps_quality, energy_level,
-- focus_level, objective_completion_pct, notes, signal_raised) -- so the
-- IF NOT EXISTS made the ENTIRE V7 "AI Practice Effectiveness Object" CREATE a
-- no-op. 24 of its 25 columns never landed (only source_refs happens to
-- already exist). This is NOT the narrower 2-column gap #651/WS0.1 assumed --
-- confirmed by code trace: src/app/baseball/actions/practice-effectiveness.ts
-- upserts all 25 V7 fields by name (measureForTeam, ~lines 601-632), and its
-- own pre-upsert dispositions SELECT (~582-592) 400s against the live schema
-- today, short-circuiting before the upsert ever runs. The feature is fully
-- wired to a real nav entry + route (gated by can_manage_practice) and to the
-- Decision Room panel -- it silently no-ops (caught errors -> empty results)
-- rather than crashing, but it has never produced a single row (table has 0
-- rows in prod). Table is EMPTY, so every NOT NULL addition below is safe.
--
-- `updated_at` is also added -- referenced by practice-effectiveness.ts's
-- update() call but never part of the original V7 spec.
-- `verdict` is NOT added here -- it is owned by
-- 20260701030000_baseball_practice_effectiveness_verdict.sql (already drafted
-- on fix/baseball-p2-practice-effectiveness-verdicts) and must apply AFTER
-- this migration (it does not depend on any column added here, so order
-- relative to THIS file is flexible, but both must land before the practice
-- effectiveness feature works end-to-end).
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + guarded CHECK adds.

ALTER TABLE public.baseball_practice_effectiveness_reviews
  ADD COLUMN IF NOT EXISTS objective_id uuid REFERENCES public.baseball_practice_block_objectives(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS focus_area text,
  ADD COLUMN IF NOT EXISTS metric_id text,
  ADD COLUMN IF NOT EXISTS player_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  ADD COLUMN IF NOT EXISTS linked_signal_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  ADD COLUMN IF NOT EXISTS metric_before numeric,
  ADD COLUMN IF NOT EXISTS metric_after numeric,
  ADD COLUMN IF NOT EXISTS sample_before integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sample_after integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS window_before_days integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS window_after_days integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS direction text NOT NULL DEFAULT 'insufficient_sample',
  ADD COLUMN IF NOT EXISTS after_scope text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS confidence numeric,
  ADD COLUMN IF NOT EXISTS confidence_tier text NOT NULL DEFAULT 'not_enough_sample',
  ADD COLUMN IF NOT EXISTS confounders jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS conclusion text,
  ADD COLUMN IF NOT EXISTS recommended_next_action jsonb,
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'staff_only',
  ADD COLUMN IF NOT EXISTS disposition text NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS generated_by text,
  ADD COLUMN IF NOT EXISTS generated_by_model text,
  ADD COLUMN IF NOT EXISTS generated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS dedupe_key text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- focus_area / conclusion are NOT NULL in the original V7 spec, but the table
-- already has application-facing NOT NULL semantics enforced at the app layer
-- (measureForTeam always sets both); added nullable here to avoid an
-- ADD COLUMN NOT NULL failure risk if this ever runs against a non-empty
-- table by mistake, with the CHECKs below still enforcing the enums. If Nick
-- wants strict NOT NULL parity with the original spec, flip these two to
-- NOT NULL (safe today -- table has 0 rows) before applying.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'baseball_practice_effectiveness_reviews_direction_check') THEN
    ALTER TABLE public.baseball_practice_effectiveness_reviews
      ADD CONSTRAINT baseball_practice_effectiveness_reviews_direction_check
      CHECK (direction IN ('improved','stable','worse','insufficient_sample','too_early','not_tracked'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'baseball_practice_effectiveness_reviews_after_scope_check') THEN
    ALTER TABLE public.baseball_practice_effectiveness_reviews
      ADD CONSTRAINT baseball_practice_effectiveness_reviews_after_scope_check
      CHECK (after_scope IN ('official_game','scrimmage','practice','mixed','unknown'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'baseball_practice_effectiveness_reviews_confidence_tier_check') THEN
    ALTER TABLE public.baseball_practice_effectiveness_reviews
      ADD CONSTRAINT baseball_practice_effectiveness_reviews_confidence_tier_check
      CHECK (confidence_tier IN ('too_early','not_enough_sample','correlated_not_proven','no_signal'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'baseball_practice_effectiveness_reviews_visibility_check') THEN
    ALTER TABLE public.baseball_practice_effectiveness_reviews
      ADD CONSTRAINT baseball_practice_effectiveness_reviews_visibility_check
      CHECK (visibility IN ('staff_only','player_visible','restricted'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'baseball_practice_effectiveness_reviews_disposition_check') THEN
    ALTER TABLE public.baseball_practice_effectiveness_reviews
      ADD CONSTRAINT baseball_practice_effectiveness_reviews_disposition_check
      CHECK (disposition IN ('new','dismissed','resolved','converted_to_task'));
  END IF;
END $$;

-- Rollback: additive-only convention -- do not DROP COLUMN on the shared prod
-- DB. A revert ships a follow-up migration dropping only the 5 CHECK
-- constraints above if they need to change; the columns stay (nullable/
-- additive, harmless, table is empty).
```

</details>

<details>
<summary><b>4. 20260702100100_baseball_event_acks_policy_restore.sql</b></summary>

```sql
-- baseball_event_acknowledgements is currently LOCKED OUT in prod: RLS is
-- enabled with ZERO policies (verified live via pg_policies, 2026-07-02).
--
-- Root cause: 20260624000050_baseball_rls_helpers_and_policies.sql created 4
-- policies named baseball_event_acks_select/insert/update/delete. The later
-- 20260630165403_normalize_baseball_event_ack_policies.sql DROPped exactly
-- those same 4 policy names, on the mistaken assumption (stated in its own
-- comment) that a differently-named "baseball_event_acknowledgements_*" set
-- from the same source migration would remain as the surviving canonical
-- policies -- but 20260624000050 never created any policy under that other
-- name (it only ever created baseball_event_acks_*, and DROPped that same
-- alternate name defensively in case an even earlier migration had used it).
-- Net effect: the DROP ran, nothing recreated anything, table has 0 policies.
--
-- This migration restores the original, correct baseball_event_acks_*
-- definitions verbatim from 20260624000050 (own rows; staff read all team
-- rows). It does not rename anything, so it cannot repeat the same mistake.

DO $$
BEGIN
  IF to_regclass('public.baseball_event_acknowledgements') IS NOT NULL THEN
    -- idempotent: safe to re-run
    EXECUTE 'ALTER TABLE public.baseball_event_acknowledgements ENABLE ROW LEVEL SECURITY';
    EXECUTE 'REVOKE ALL ON public.baseball_event_acknowledgements FROM anon';

    EXECUTE 'DROP POLICY IF EXISTS "baseball_event_acks_select" ON public.baseball_event_acknowledgements';
    EXECUTE 'DROP POLICY IF EXISTS "baseball_event_acks_insert" ON public.baseball_event_acknowledgements';
    EXECUTE 'DROP POLICY IF EXISTS "baseball_event_acks_update" ON public.baseball_event_acknowledgements';
    EXECUTE 'DROP POLICY IF EXISTS "baseball_event_acks_delete" ON public.baseball_event_acknowledgements';

    EXECUTE $p$CREATE POLICY "baseball_event_acks_select" ON public.baseball_event_acknowledgements
      FOR SELECT TO authenticated
      USING (
        user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.baseball_events e
          WHERE e.id = baseball_event_acknowledgements.event_id
            AND public.is_baseball_team_coach_v2(e.team_id)
        )
      )$p$;
    EXECUTE $p$CREATE POLICY "baseball_event_acks_insert" ON public.baseball_event_acknowledgements
      FOR INSERT TO authenticated
      WITH CHECK (user_id = auth.uid())$p$;
    EXECUTE $p$CREATE POLICY "baseball_event_acks_update" ON public.baseball_event_acknowledgements
      FOR UPDATE TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid())$p$;
    EXECUTE $p$CREATE POLICY "baseball_event_acks_delete" ON public.baseball_event_acknowledgements
      FOR DELETE TO authenticated
      USING (user_id = auth.uid())$p$;
  END IF;
END $$;

-- Rollback: DROP POLICY IF EXISTS the 4 names above (returns to the current
-- locked-out state -- not recommended; file a new fix instead of rolling back).
```

</details>

<details>
<summary><b>5. 20260702100000_baseball_652_announcements_rls_fix.sql</b></summary>

```sql
-- #652 fix: break the mutual-recursion cycle between baseball_announcements
-- and baseball_announcement_recipients (42P17 in prod logs).
--
-- LIVE-VERIFIED (2026-07-02, pg_policies): baseball_announcements_select_player
-- EXISTS-subqueries baseball_announcement_recipients, while
-- baseball_ann_recipients_select_coach / _insert / _delete EXISTS-subquery
-- baseball_announcements back -> circular. baseball_ann_recipients_select_player
-- (qual: player_id = get_my_player_id()) is NOT part of the cycle -- left untouched.
--
-- Fix: three SECURITY DEFINER STABLE helpers (search_path='') break the cycle by
-- resolving the cross-table check inside a function instead of a correlated
-- subquery evaluated under the caller's RLS.

CREATE OR REPLACE FUNCTION public.baseball_announcement_has_recipients(p_announcement_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.baseball_announcement_recipients
    WHERE announcement_id = p_announcement_id
  );
$$;

CREATE OR REPLACE FUNCTION public.baseball_announcement_is_recipient(p_announcement_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.baseball_announcement_recipients
    WHERE announcement_id = p_announcement_id
      AND player_id = public.get_my_player_id()
  );
$$;

CREATE OR REPLACE FUNCTION public.baseball_is_announcement_coach(p_announcement_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.is_baseball_team_coach(a.team_id)
  FROM public.baseball_announcements a
  WHERE a.id = p_announcement_id;
$$;

REVOKE ALL ON FUNCTION public.baseball_announcement_has_recipients(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.baseball_announcement_is_recipient(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.baseball_is_announcement_coach(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.baseball_announcement_has_recipients(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.baseball_announcement_is_recipient(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.baseball_is_announcement_coach(uuid) TO authenticated;

-- Recreate baseball_announcements_select_player using the helpers (same
-- visibility semantics: team member AND (no recipients row OR is a recipient)).
DROP POLICY IF EXISTS "baseball_announcements_select_player" ON public.baseball_announcements;
CREATE POLICY "baseball_announcements_select_player" ON public.baseball_announcements
  FOR SELECT TO authenticated
  USING (
    is_baseball_team_member(team_id)
    AND (
      NOT public.baseball_announcement_has_recipients(id)
      OR public.baseball_announcement_is_recipient(id)
    )
  );

-- Recreate the three recursive recipients policies using the coach helper.
-- EXACT names -- a misspelled DROP silently no-ops and leaves the recursion live.
DROP POLICY IF EXISTS "baseball_ann_recipients_select_coach" ON public.baseball_announcement_recipients;
CREATE POLICY "baseball_ann_recipients_select_coach" ON public.baseball_announcement_recipients
  FOR SELECT TO authenticated
  USING (public.baseball_is_announcement_coach(announcement_id));

DROP POLICY IF EXISTS "baseball_ann_recipients_insert" ON public.baseball_announcement_recipients;
CREATE POLICY "baseball_ann_recipients_insert" ON public.baseball_announcement_recipients
  FOR INSERT TO authenticated
  WITH CHECK (public.baseball_is_announcement_coach(announcement_id));

DROP POLICY IF EXISTS "baseball_ann_recipients_delete" ON public.baseball_announcement_recipients;
CREATE POLICY "baseball_ann_recipients_delete" ON public.baseball_announcement_recipients
  FOR DELETE TO authenticated
  USING (public.baseball_is_announcement_coach(announcement_id));

-- baseball_ann_recipients_select_player is untouched (non-recursive, not part
-- of the cycle) -- do not DROP or recreate it here.

-- Rollback:
--   -- restore original (recursive) policies verbatim (captured live in §3
--   -- Finding B of this packet, 2026-07-02) or re-apply this file's DROP
--   -- POLICY statements followed by the original correlated-subquery bodies.
--   DROP FUNCTION IF EXISTS public.baseball_announcement_has_recipients(uuid);
--   DROP FUNCTION IF EXISTS public.baseball_announcement_is_recipient(uuid);
--   DROP FUNCTION IF EXISTS public.baseball_is_announcement_coach(uuid);
```

</details>

<details>
<summary><b>7. 20260702100300_baseball_anon_grant_drift_revoke.sql</b></summary>

```sql
-- anon-EXECUTE drift revoke.
--
-- LIVE-VERIFIED (2026-07-02, pg_proc.proacl): 3 SECURITY DEFINER RPCs carry a
-- live `anon=X` grant despite their OWN defining migrations explicitly doing
-- `REVOKE ALL ... FROM PUBLIC; GRANT EXECUTE ... TO authenticated,
-- service_role;` (no anon) at creation time:
--   - can_insert_baseball_team_member(uuid, team_member_status)
--       (20260630233000_baseball_team_join_policy_rls.sql:101-102)
--   - try_redeem_baseball_team_invitation(uuid)
--       (20260630180200_baseball_team_invitation_redeem_rpc.sql:24-25)
--   - release_baseball_team_invitation_redemption(uuid)
--       (20260630180200_baseball_team_invitation_redeem_rpc.sql:40-41)
-- No later migration touches any of the three, so this is drift from outside
-- migration history (dashboard/manual grant, or a broader ALTER DEFAULT
-- PRIVILEGES / blanket grant applied at some point) -- not a code defect. All
-- three call sites are in src/app/baseball/actions/teams.ts, a 'use server'
-- file that checks supabase.auth.getUser() before any RPC call -- anon
-- EXECUTE is not required by the app and matches none of the three
-- migrations' stated intent. Defense-in-depth: REVOKE it.

REVOKE EXECUTE ON FUNCTION public.can_insert_baseball_team_member(uuid, public.team_member_status) FROM anon;
REVOKE EXECUTE ON FUNCTION public.try_redeem_baseball_team_invitation(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.release_baseball_team_invitation_redemption(uuid) FROM anon;

-- Verify (paste output in the PR/approval record):
--   select proname, proacl from pg_proc where proname in
--     ('can_insert_baseball_team_member','try_redeem_baseball_team_invitation',
--      'release_baseball_team_invitation_redemption');
--   -> anon must not appear in any proacl.
--
-- NOTE: this is a targeted revoke on 3 functions this review happened to spot
-- (baseball-prefixed SECURITY DEFINER RPCs with anon in their live ACL), not
-- the full "155 SECURITY DEFINER RPCs" project-wide sweep referenced in the
-- DB-untangle task. Recommend a dedicated follow-up sweep across all
-- baseball-prefixed SECURITY DEFINER functions before calling that item closed.
--
-- Rollback: GRANT EXECUTE ON FUNCTION ... TO anon; (re-opens the drift --
-- there is no legitimate reason to; not recommended).
```

</details>

Files 3 and 6 already exist verbatim on their branches (§1.1) — not reproduced here. Draft files also staged at: `/private/tmp/claude-501/-Users-ricknini/bbeb66a6-18c9-4527-a64e-54e5cbd3b544/scratchpad/db_packet/*.sql`.

---

## 6. Dormant / active-risk code map

| Code path | Table/column | State without this migration | Reachable today? |
|---|---|---|---|
| `stat-event-imports.ts` `resolveSourceId`/`resolveSourceIdReadonly` | `baseball_stat_sources.source_key` + 10 more | **SELECT 400s on the preview path too, not just insert — the entire import pipeline (preview and commit) is non-functional** | **Yes — every real CSV import, TrackMan/Rapsodo/GameChanger/etc.** |
| `decision-room.ts` `resolveMeetingItem` / `recordDecisionNote` | `baseball_decision_log.detail` | **Insert 400s, error surfaced to user as a raw failure** | **Yes — Decision Room "Resolve"/"Record decision note" buttons, live UI** |
| `practice-effectiveness.ts` `measureForTeam` (pre-upsert dispositions SELECT) | `baseball_practice_effectiveness_reviews.*` (24 cols) | SELECT 400s, caught, returns `{success:false}` before upsert ever runs — **feature has never written a row** | Yes — real nav entry (`can_manage_practice`), real route, feeds Decision Room; currently a complete no-op, not a visible crash |
| `stats-center.ts` (documented silent-degrade block ~828-830), `stat-visuals.ts`, `player-snapshot-cards.ts`, `engine-run.ts`, `loaders-events.ts` | `catcher_id`/`block_result`/`steal_result`/`pop_time`/`throw_accuracy`/`data_context`/`measured_at` (catching); `chance_difficulty`/`arm_accuracy`/`throw_velocity`/`data_context`/`measured_at` (fielding); `runner_id`/`home_to_first`/`decision_quality`/`data_context`/`measured_at` (baserunning) | Read-only; caught, empty-array fallback | Read paths reachable, but **no INSERT/upsert path exists anywhere in `src/` for these 3 tables** (confirmed — `commitEventImport`'s grain-to-table map only covers pitch/batted-ball/swing) — dead-end, zero prod-visible impact until an import path is built |
| `elite-stat-events.ts` `buildQuery()` | `baseball_plate_appearances.data_context` | Read-only; caught, empty fallback | Same as above — no write path exists yet |
| `baseball_event_acknowledgements` (all consumers: `operational-signals.ts`, `acknowledgements.ts`, `PlayerTodayClient.tsx`, `player-today.ts`, `operational-rule-engine.ts`) | N/A (RLS lockout, not a missing column) | **Every read/write against this table fails RLS (0 policies) — feature fully locked out**, not degraded | Yes — Player Today acknowledgement flow |
| `teams.ts` (announcements consumers via `is_baseball_team_member`/recipients checks) | N/A (RLS recursion) | 42P17 on player reads, confirmed in prod logs per the master plan | Yes — any player viewing team announcements |

**None of the 8 migrations' target code paths crash the app in a way that takes down a page** — every hard failure is caught at the action-result level (`{success:false, error}` returned to the client) except the Decision Room actions, which surface the raw DB error string to the UI. Nothing corrupts *other* tables' data — the worst blast radius is a fully non-functional import pipeline, lost provenance, and complete feature no-ops.

**Non-DB context, not part of this apply list:** `fix/baseball-p0-use-server-messages` (unmerged) fixes a `next build` failure unrelated to any of the above — `src/app/baseball/actions/messages.ts` had bare re-exports from a `'use server'` file, which Next.js rejects (exports must be async functions declared directly in the file). Confirmed correct fix by diff read. This is why the last integration build (`integ-fresh-base`, 23/24 branches merged) fails `next build` — flagging so it isn't mistaken for a DB-caused break; it requires zero DB changes to fix.

---

## 7. Rollback summary

Every migration in this packet follows the additive-only convention — **no rollback ever drops a column on the shared prod DB.**

| File | Rollback |
|---|---|
| 1 (#651, 6 tables) | Drop the new CHECK/UNIQUE constraints if needed; columns stay (nullable/additive, empty tables) |
| 2 (practice-effectiveness V7) | Drop the 5 new CHECK constraints if needed; columns stay |
| 3 (verdict) | Has its own rollback block in the file (drop index, drop constraint, drop column — table has 0 rows so this is uniquely safe here) |
| 4 (event_acks restore) | `DROP POLICY` the 4 names — returns to today's locked-out state; not recommended, file a new fix instead |
| 5 (#652 RLS) | Restore original recursive policy bodies (captured live in §3 Finding B) + drop the 3 helper functions |
| 6 (logo storage) | Has its own rollback block (drop 3 policies, delete bucket row) |
| 7 (anon revoke) | `GRANT EXECUTE ... TO anon` — re-opens the drift, not recommended |

If a Phase-2 deploy regresses prod: re-promote the previous Vercel deployment (instant, unrelated to these DB changes since none of them are consumed by code that isn't already broken today), then apply the relevant single-file rollback above.

---

## 8. DO NOT APPLY / needs owner input before proceeding

- **None of the 8 drafted/staged migrations are blocked** — all passed every check in §2.
- **`baseball_coaches_public` security-definer-view lint finding**: do not "fix" with `security_invoker = on` — confirmed intentional design, would break player-facing recruiting visibility (§1.3, §3).
- **`v_crm_coaches_by_school`**: out of scope — internal CRM view, needs a separate CRM-side decision before anyone touches it.
- **Migration files 3 and 6 (verdict, logo storage) are not yet on `batch/baseball-fixes`** — clean and ready, but live on unmerged branches. Apply all 7 files together, or explicitly sequence the branch merges alongside 1/2/4/5/7.
- **Migration 1 has one open naming decision** (`arm_velocity` vs. code-referenced `throw_velocity` on `baseball_fielding_events`) — safe to apply either way (table empty), but confirm before treating the shape as final (§0, §3 Finding A).
- **Migration 2 has one open design question**: `focus_area`/`conclusion` are nullable here instead of the original spec's `NOT NULL` — safe today (table empty), flip before this becomes the long-term shape if strict parity is wanted.
- **Migration 7 is a targeted 3-function fix, not the full "155 SECURITY DEFINER RPCs" sweep** — don't mark that broader item closed on this alone.

---

## 9. Single apply script (for approval)

```bash
# Run from repo root, after confirming branches fix/baseball-p2-practice-effectiveness-verdicts
# and fix/baseball-p2-program-logo-upload are merged (or their 2 migration files are
# copied in) so all 7 files exist together on the target branch.

for f in \
  supabase/migrations/20260702095900_baseball_651_column_reconcile.sql \
  supabase/migrations/20260702100200_baseball_practice_effectiveness_v7_reconcile.sql \
  supabase/migrations/20260701030000_baseball_practice_effectiveness_verdict.sql \
  supabase/migrations/20260702100100_baseball_event_acks_policy_restore.sql \
  supabase/migrations/20260702100000_baseball_652_announcements_rls_fix.sql \
  supabase/migrations/20260701031000_baseball_program_logo_storage.sql \
  supabase/migrations/20260702100300_baseball_anon_grant_drift_revoke.sql \
; do
  echo "=== apply $f via mcp__supabase__apply_migration ==="
done

# Post-apply verification (run each, paste output into the approval record):

# 1) #651 + practice-effectiveness + stat_sources columns landed:
select table_name, count(*) from information_schema.columns
where (table_name, column_name) in (
  ('baseball_stat_sources','source_key'), ('baseball_stat_sources','source_name'),
  ('baseball_fielding_events','measured_at'), ('baseball_fielding_events','chance_difficulty'),
  ('baseball_baserunning_events','measured_at'), ('baseball_baserunning_events','runner_id'),
  ('baseball_catching_events','measured_at'), ('baseball_catching_events','catcher_id'),
  ('baseball_plate_appearances','data_context'),
  ('baseball_decision_log','detail'),
  ('baseball_practice_effectiveness_reviews','disposition'),
  ('baseball_practice_effectiveness_reviews','focus_area'),
  ('baseball_practice_effectiveness_reviews','verdict')
) group by table_name;
-- expect 13 total rows across the listed tables

# 2) event_acks unlocked:
select count(*) from pg_policies where tablename = 'baseball_event_acknowledgements';
-- expect 4

# 3) #652 recursion broken + no anon on new helpers:
select policyname, qual from pg_policies where tablename in ('baseball_announcements','baseball_announcement_recipients') order by 1;
select proname, proacl from pg_proc where proname like 'baseball_announcement%' or proname = 'baseball_is_announcement_coach';
-- expect no anon in any proacl

# 4) logos bucket + anon revoke:
select id, public from storage.buckets where id = 'logos';
select proname, proacl from pg_proc where proname in
  ('can_insert_baseball_team_member','try_redeem_baseball_team_invitation','release_baseball_team_invitation_redemption');
-- expect no anon in any proacl

# 5) end-to-end smoke: run a real stat-event CSV preview + commit against the
#    demo team (Rini University Baseball) and confirm source resolution no
#    longer 400s.

# 6) zero new 42703/42P17 in postgres logs over the next 24h (mcp__supabase__get_logs)
```

---

## 10. Summary counts

- **Pending baseball-related migrations found: 2** (exist as files, verified clean, on unmerged branches).
- **Missing migrations authored by this review: 6** (drafted in full, verified clean, not yet committed anywhere — note this replaces an earlier same-day pass that drafted only 1 of these 5 fully).
- **Total apply-list size: 7 files** (8 fixes — #651 counts as one file covering 6 tables).
- **Verified safe to apply as-is: 7 of 7.**
- **Blocked: 0.** Open (non-blocking) decisions: 3 — see §8.
- **Confirmed active production breakage fixed by this batch: 3** — full stat-event import pipeline (preview + commit) non-functional, Decision Room actions crash visibly, `baseball_event_acknowledgements` fully locked out.
- **Scope corrections vs. the original planning docs: 2** — #651 is a 6-table, ~35-column fix, not an 11-column patch; `baseball_practice_effectiveness_reviews` is its own 24-column generation-miss, not folded into #651's narrow set.
- **New findings beyond original scope: 1** — 3 SECURITY DEFINER functions with unintended live anon-EXECUTE drift.
