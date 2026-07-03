# BaseballHelm Migration Apply Plan

**Generated:** 2026-06-24
**Author:** deploy-prep helper (read-only audit)
**Repo:** `/Users/ricknini/Downloads/helmv3`
**Target DB:** Supabase project `qmnssrrolpinvwjjnufo` — **SHARED with GolfHelm PRODUCTION**
**Scope:** `supabase/migrations/20260624*.sql`

> ⚠️ **SNAPSHOT IN TIME.** A live BaseballHelm build was still running while this plan was written. **49** `20260624*` files existed at audit time (the task brief estimated ~36). New migration files may have appeared since; re-run the file listing and re-audit any `20260624*` file not in the per-file table below before applying.

> 🔒 **READ-ONLY AUDIT.** No migration was applied. No SQL write was executed. The only write is this file. Three live **read-only** queries were run (function definition + column/enum/constraint existence checks) to de-risk the one shared-object file (see Safety §S1).

> ✅ **RE-VALIDATION — 2026-06-24 (independent second pass).** An independent read-only re-audit (live `list_migrations` + `list_tables`, full-set grep for `golf_`/`DROP`/`DELETE`/`TRUNCATE`/anon grants, per-file object inventory, FK-vs-create ordering, enum-guard + `handle_new_user` body inspection) **confirms every finding above**: 0 already-applied (latest applied = `20260623100504`); 0 RED blockers; `handle_new_user` is the only shared object and is a strict non-regressing superset; filename order is dependency-safe with **no forward FK references** (verified `import_runs`→`000020`, `practices/_blocks`→`000060`, `strength_groups`→`000063`, `signals/actions`→`000092`, `import_sources`→`000090` all precede their referrers); all ALTERs are `ADD COLUMN IF NOT EXISTS` (71/71 tables `IF NOT EXISTS`, 0 plain `CREATE TABLE`); the only non-comment `DELETE` is the WHERE-scoped atomic lineup replace (§R4); zero `GRANT ... TO anon/public`, tables explicitly `REVOKE ALL ... FROM anon`. **One drift observed:** the set is now **48** files (was 49 at first-pass audit time) — the live build dropped/renamed one during the window, making the snapshot caveat observed fact, not just theoretical. **Re-list before applying.** The duplicate `20260624001400` version-key pair (§R1) **has since been resolved** (PKT-16: `000082_baseball_stat_visual_views.sql` → `000083_…`; `001400_baseball_readiness_select_gate_fix.sql` → `001401_…`); no duplicate version keys remain.

---

## Summary

| Metric | Value |
|---|---|
| Total `20260624*.sql` files | **49** |
| Already applied to live DB | **0** |
| Pending (to apply) | **49** |
| Hard safety blockers | **0** |
| Items flagged for REVIEW (not blockers) | **4** |
| Duplicate-version-key collisions | ~~1~~ **0** — resolved by PKT-16 renames |

**Verdict: SAFE TO APPLY in filename order**, subject to the 4 review notes below. Every file is baseball-scoped. No file drops, renames, or destructively writes any `golf_*` object or any shared object **except** one carefully-extended shared trigger function (`handle_new_user`), which was verified against the live definition and is a strict, non-regressing superset (Safety §S1).

**Crucial DB-state finding:** None of the `20260624*` migrations are in `supabase_migrations.schema_migrations` (latest applied row is `20260623100504`). The baseball tables that already exist in the live DB (`baseball_coaches`, `baseball_teams`, `baseball_events`, `baseball_games`, `baseball_player_stats`, etc.) come from the **older** baseball layer (migrations `032`–`037`, `20260208*`, `20260217*`, `20260222200000*`, `20260125*`). This `20260624*` set is a **fresh additive layer on top of that existing baseball base** — it mostly `ALTER ... ADD COLUMN IF NOT EXISTS` onto those existing tables and `CREATE TABLE IF NOT EXISTS` for new ones. Because the new files assume the older baseball base tables exist, **do not apply this set against a DB that lacks the `032`–`037`/`20260222200000` baseball base** (the live prod DB has it — confirmed via `list_tables`).

---

## Per-file table

Order = filename-timestamp order (recommended apply order — see Ordered Apply Sequence).
Idiom across the whole set: `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION`, `DROP POLICY IF EXISTS` + `CREATE POLICY`, `CREATE INDEX IF NOT EXISTS`. Every table gets `ENABLE ROW LEVEL SECURITY` + the uniform grant triplet `REVOKE ALL ... FROM anon` / `GRANT … TO authenticated` / `GRANT ALL … TO service_role`.

| # | File | CREATEs / ALTERs | Baseball-only? |
|---|---|---|---|
| 1 | `…000010_baseball_stat_uploads_reconcile.sql` | Additive reconcile of `baseball_stat_uploads`: ADD missing "session" cols (stat_type, session_date, session_name, total_rows, matched_rows, unmatched_rows, unmatched_data) + import-lineage cols; CHECK-constrains `status` without breaking rows; re-asserts RLS + coach-scoped policies | ✅ |
| 2 | `…000020_baseball_import_lineage.sql` | Import-lineage columns / source-id plumbing on baseball import tables | ✅ |
| 3 | `…000030_baseball_staff_capabilities.sql` | `CREATE OR REPLACE FUNCTION baseball_can_invite_staff(uuid)`; capability plumbing on staff tables | ✅ |
| 4 | `…000040_baseball_timeline_and_acks.sql` | Player-timeline tables/cols + ack scaffolding (additive) | ✅ |
| 5 | `…000050_baseball_rls_helpers_and_policies.sql` | **RLS helper fns** (load-bearing for later files): `get_my_baseball_player_id()`, `is_baseball_team_staff(uuid)`, `has_baseball_staff_capability(uuid,text)`, `can_view_baseball_player(uuid,uuid)` + `(uuid)`, `is_baseball_team_member(uuid)`, `can_manage_baseball_lift_group(uuid,uuid)` + policies | ✅ |
| 6 | `…000060_baseball_practices.sql` | `baseball_practices` / practice-block tables + RLS | ✅ |
| 7 | `…000061_baseball_lifting_performance.sql` | Tables: `baseball_exercises`, `baseball_lift_assignments`, `baseball_lift_results`, `baseball_readiness_checkins` + RLS/grants | ✅ |
| 8 | `…000062_baseball_accept_staff_invite_rpc.sql` | `CREATE OR REPLACE FUNCTION baseball_accept_staff_invite(text)` (v1) | ✅ |
| 9 | `…000063_baseball_v11_premium_lifting.sql` | Premium-lifting table set; grants applied via a `DO`-loop `EXECUTE format(...)` over a baseball-table list (REVOKE anon / GRANT authenticated+service_role) | ✅ |
| 10 | `…000070_baseball_coach_insights_attribution.sql` | Attribution columns on `baseball_coach_insights` (additive) | ✅ |
| 11 | `…000080_baseball_elite_stat_event_model.sql` | Elite stat event-model tables (pitch/batted-ball/swing events) | ✅ |
| 12 | `…000081_baseball_staff_roles_scope_audit.sql` | `baseball_staff_audit_events` table; `baseball_log_staff_change()` fn + trigger; **re-defines** `baseball_accept_staff_invite(text)` (v2 — supersedes #8) | ✅ |
| 13 | `…000083_baseball_stat_visual_views.sql` | Table `baseball_stat_visual_views` + touch trigger + RLS (guards member-fn presence via `to_regprocedure`) | ✅ |
| 14 | `…000090_baseball_settings_os.sql` | Tables `baseball_program_settings`, `baseball_import_sources`, `baseball_integration_configs`, `baseball_settings_audit_log` + RLS; ALTER `baseball_teams` (additive) | ✅ |
| 15 | `…000091_baseball_program_identity.sql` | ALTER `baseball_teams` ADD program-identity FK col → `baseball_teams(id)` ON DELETE SET NULL | ✅ |
| 16 | `…000092_baseball_signals_and_actions.sql` | ADD ~25 cols each to `baseball_signals` + `baseball_actions`; dedupe unique index; RLS + grants | ✅ |
| 17 | `…000093_baseball_postgame_reviews.sql` | Tables `baseball_postgame_reviews` + `…_items` + RLS | ✅ |
| 18 | `…000094_baseball_practice_effectiveness.sql` | Tables `baseball_practice_block_objectives`, `baseball_practice_effectiveness_reviews` + staff/player RLS | ✅ |
| 19 | `…000095_baseball_team_and_season_settings.sql` | Table `baseball_seasons` (one-current-per-team unique idx) + RLS; ALTER `baseball_teams` | ✅ |
| 20 | `…000200_baseball_practice_deepening.sql` | ALTER `baseball_practice_blocks` ADD cols incl FK → `baseball_coach_insights(id)` ON DELETE SET NULL | ✅ |
| 21 | `…000210_baseball_coachhelm_v10_ranking_and_outcome_ledger.sql` | ALTER `baseball_coach_insights` + `baseball_actions` ADD ranking/outcome-ledger cols | ✅ |
| 22 | `…000211_baseball_scrimmage_result.sql` | ALTER `baseball_practice_scrimmages` ADD result cols | ✅ |
| 23 | `…000220_baseball_player_passport_and_daily_contract.sql` | Tables `baseball_player_passport_settings`, `baseball_player_daily_contracts` + RLS/grants | ✅ |
| 24 | `…000221_baseball_video_links_and_class_conflicts.sql` | ALTER `baseball_video_events` (~25 cols); ALTER `baseball_class_conflicts` (~30 cols) + dedupe idx + RLS | ✅ |
| 25 | `…000230_baseball_signal_action_materialization.sql` | ALTER `baseball_meeting_items` + `baseball_coach_player_notes` ADD source/linkage cols; ALTER practice/lift/practice tables; RLS/grants | ✅ |
| 26 | `…000310_baseball_decision_log.sql` | `baseball_decision_log` cols + RLS (SELECT/INSERT/DELETE to authenticated) | ✅ |
| 27 | `…000420_baseball_passport_scout_packet_share_tokens.sql` | Table `baseball_player_passport_share_tokens` + RLS/grants | ✅ |
| 28 | `…000430_baseball_timeline_event_acks.sql` | Table `baseball_timeline_event_acks` (FK → `baseball_player_timeline_events`) + RLS | ✅ |
| 29 | `…000440_baseball_strength_group_audit.sql` | Table `baseball_strength_group_audit` + RLS (SELECT/INSERT) | ✅ |
| 30 | `…000450_baseball_ai_audit_log.sql` | ALTER `baseball_ai_audit` ADD cols + RLS/grants | ✅ |
| 31 | `…000460_baseball_import_registry_load_bearing.sql` | Import-registry hardening (additive cols/indexes/constraints) | ✅ |
| 32 | `…000470_baseball_operational_signal_rule_config.sql` | Operational signal rule-config (additive cols/table) | ✅ |
| 33 | `…000500_baseball_import_raw_file_and_hash.sql` | ALTER `baseball_import_runs` ADD `file_bytes`,`file_hash` + dedupe idx; **creates private storage bucket `baseball-imports`** (`public=false`, ON CONFLICT DO UPDATE) + 4 `storage.objects` policies scoped to `bucket_id='baseball-imports'` | ✅ (storage shared — see §S2) |
| 34 | `…000510_baseball_event_supersede.sql` | ALTER baseball event/pitch/batted-ball/swing tables ADD `superseded_by_run_id`,`superseded_at` (additive) | ✅ |
| 35 | `…000620_baseball_daily_contract_coach_ack.sql` | ALTER `baseball_player_daily_contracts` ADD coach-ack cols + policy | ✅ |
| 36 | `…000820_baseball_daily_contract_missed_rollover.sql` | Missed-contract rollover plumbing (additive) | ✅ |
| 37 | `…000900_baseball_coach_notes.sql` | **`CREATE TYPE baseball_note_scope` (ENUM)**; fn `baseball_staff_has_note_capability(uuid,text)`; table `baseball_coach_notes` + RLS | ✅ |
| 38 | `…001000_baseball_official_stat_breadth.sql` | `CREATE OR REPLACE FUNCTION recalculate_baseball_season_stats(...)` + stat-breadth cols | ✅ |
| 39 | `…001100_baseball_import_match_resolution.sql` | Import match-resolution (additive cols/table) | ✅ |
| 40 | `…001200_baseball_import_source_external_id.sql` | External-id plumbing on import source rows (additive) | ✅ |
| 41 | `…001300_baseball_coachhelm_insight_maturity_counters.sql` | Insight-maturity counter cols (additive) | ✅ |
| 42 | `…001400_baseball_readiness_select_gate_fix.sql` | Re-creates `baseball_readiness_checkins` SELECT policy with correct staff-capability gate (guarded by `to_regclass`) | ✅ |
| 43 | `…001401_baseball_public_player_stats_rpc.sql` | `CREATE OR REPLACE FUNCTION get_baseball_public_player_stats(uuid,integer)` SECURITY DEFINER; **GRANT EXECUTE TO anon** (intentional — body is the gate) — ✅ (PKT-16: renamed from `001400` to `001401`; see §R3) | ✅ |
| 44 | `…001500_baseball_signup_creates_profile_row.sql` | **`CREATE OR REPLACE FUNCTION public.handle_new_user()`** — SHARED auth trigger; extends it to seed a `baseball_players` shell row for `sport='baseball' AND role='player'`; idempotently adds `baseball_players_user_id_key` unique | ⚠️ **shared fn — verified safe, §S1** |
| 45 | `…001600_baseball_replace_lineup_positions_rpc.sql` | `CREATE OR REPLACE FUNCTION baseball_replace_lineup_positions(uuid,text,jsonb)`; contains a WHERE-scoped `DELETE … WHERE lineup_id=p_lineup_id` inside an atomic RPC body | ✅ (see §R4) |
| 46 | `…001700_baseball_task_reminder_sent.sql` | ADD reminder-sent tracking col on baseball task table (additive) | ✅ |
| 47 | `…001800_baseball_practice_blocks_source_postgame.sql` | ALTER `baseball_practice_blocks` ADD source-postgame linkage (additive) | ✅ |
| 48 | `…001900_baseball_events_status_lifecycle.sql` | ALTER `baseball_events` ADD `status` (default 'scheduled') + lifecycle cols + partial index (mirrors `golf_events` shape — **comment reference only, touches no golf object**) | ✅ |

---

## Safety flags

### Hard blockers: **NONE**

No file drops, truncates, or unconditionally deletes any table; no file alters/drops a `golf_*` object; no file grants table-level access to `anon`. All three `golf_` matches in the file set are in **comments only** (`…000510` and `…001900` describe "mirrors golf_events"; `…000510` cites the no-destructive-writes rule). All `DROP TABLE`/`DELETE FROM`/`TRUNCATE` grep hits except one are inside header comments or rollback comments.

### §S1 — Shared trigger function `handle_new_user` (file #44) — VERIFIED SAFE

This is the **only** file that touches a shared, golf-relevant object. Audit detail:

- **Live definition (fetched read-only):** current `public.handle_new_user()` does exactly ONE thing — `INSERT INTO public.users (id,email,role,created_at,updated_at)`. No golf seeding, no other side effects.
- **New definition is a strict superset:** preserves that identical `users` insert verbatim (adding only `ON CONFLICT (id) DO NOTHING`), then appends a baseball-player seed **gated on `sport='baseball' AND role='player'`** and wrapped in `BEGIN … EXCEPTION WHEN OTHERS THEN RAISE WARNING … END`. Golf/OAuth signups never set `sport='baseball'`, so the new branch never executes for them; even if it raised, it is swallowed and cannot break the core `users` insert.
- **Dependencies verified to exist on live DB:** `baseball_player_type` enum ✅; `baseball_players_user_id_key` unique constraint already present ✅ (so the file's `ADD CONSTRAINT` DO-block is a safe no-op); all 8 written columns exist with compatible nullability (`player_type` NOT NULL is satisfied by the `'high_school'` default).
- **Conclusion:** No golf-signup regression risk. This is the correct way to extend a shared trigger. **Still: this is the file to smoke-test first** — after applying, do one golf signup + one baseball player signup and confirm both create the right rows.

### §S2 — Shared `storage` schema (file #33) — SAFE

Creates bucket `baseball-imports` (`public=false`) via `INSERT … ON CONFLICT (id) DO UPDATE` (a golf bucket can never collide on id `baseball-imports`). The 4 `storage.objects` policies are all scoped to `bucket_id='baseball-imports'` and `DROP POLICY IF EXISTS` only baseball-named policies — they cannot affect the golf `course-images` / `recruit-documents` / message-attachment buckets. Depends on `is_baseball_team_coach()` (confirmed present on live DB).

---

## Review notes (not blockers)

- **§R1 — Duplicate version key `20260624001400` — ✅ RESOLVED (PKT-16).** Two files previously shared this timestamp: `…_baseball_public_player_stats_rpc.sql` (retains `001400`) and `…_baseball_readiness_select_gate_fix.sql` (renamed to `001401`). Additionally `…_baseball_stat_visual_views.sql` was renamed from `000082` to `000083` to resolve a second collision with `…_baseball_staff_display_and_invite_columns.sql`. No duplicate version keys remain in the migration set; `db push` is unblocked.
- **§R2 — `baseball_accept_staff_invite(text)` defined twice** (file #8 `000062`, then re-defined in file #12 `000081`). Timestamp order means the `000081` version wins, which is the intended final. No action needed if applied in order; just don't apply `000081` before `000062`-or-skip-`000062`.
- **§R3 — Intentional `anon` EXECUTE on `get_baseball_public_player_stats`** (file #42). This is by design (logged-out coaches viewing public recruiting profiles); the SECURITY DEFINER body re-enforces the public-profile gate (recruiting_activated + profile_visibility=public + team opt-in) and returns NULL otherwise. Mirrors the existing golf public-stats RPC pattern. Listed for awareness, not a blocker.
- **§R4 — WHERE-scoped DELETE inside `baseball_replace_lineup_positions`** (file #45). The `DELETE FROM baseball_lineup_positions WHERE lineup_id=p_lineup_id` is the "clear" half of an atomic clear-then-insert in a single function body; if the INSERT raises, the whole body rolls back. This is the *fix* for the prior non-transactional data-loss bug, not a new risk. Confirmed WHERE-scoped.

---

## Ordered apply sequence

**Apply in filename-timestamp order (the list in the per-file table, #1 → #48).** That order is dependency-safe; the dependency graph confirms it:

1. **`000050` (RLS helpers) before everything that references them.** Many later files' RLS policies call `is_baseball_team_staff`, `is_baseball_team_member`, `has_baseball_staff_capability`, `can_view_baseball_player`, `get_my_baseball_player_id`, `can_manage_baseball_lift_group`. `000050` sorts before all of them. ✅ (Several later files also self-guard with `to_regprocedure(...) IS NOT NULL`, so they degrade gracefully even if a helper is missing — but keep `000050` first.)
2. **Base tables before their column-adds.** `000061` creates `baseball_readiness_checkins`; `…001401_readiness` re-policies it. `000092` adds columns referenced by `000230`/`000310`. `000060`/`000220` create tables that `000200`/`000230`/`000620`/`000820`/`001800` later ALTER. All satisfied by timestamp order.
3. **`000900` (CREATE TYPE `baseball_note_scope`) before any column using it** — the enum and its consuming table `baseball_coach_notes` are in the same file; no later file depends on the enum. ✅
4. **`000062` before `000081`** (the `baseball_accept_staff_invite` redefine). Timestamp order satisfies this.
5. **The former `001400` collision** — ✅ resolved: `001400_baseball_public_player_stats_rpc.sql` and `001401_baseball_readiness_select_gate_fix.sql` now have distinct keys. Neither depends on the other; both depend only on earlier files (`000050` helpers, `000061` table).

**No file needs to move from its natural timestamp position.** The §R1 rename prerequisite has been completed (PKT-16); `db push` can proceed directly.

### Apply mechanics (recommended)
- Apply via the project's normal migration pipeline (`supabase db push` / CI), **not** ad-hoc, so the history rows land with correct version keys.
- If applying through `mcp apply_migration`, pass a **distinct `version`** per file (resolves §R1 automatically) and apply strictly in the order above.
- Re-runnable: every file is idempotent (`IF NOT EXISTS` / `OR REPLACE` / `DROP POLICY IF EXISTS`), so a mid-run failure can be retried from the failed file.

---

## Already-applied vs pending

| Bucket | Detail |
|---|---|
| **Already applied (this set)** | **0 of 49.** No `20260624*` version exists in `schema_migrations`; latest applied row = `20260623100504`. |
| **Pre-existing baseball BASE (not in this set)** | The live DB already has the older baseball layer these files build on: `baseball_coaches`, `baseball_players`, `baseball_teams`, `baseball_team_members`, `baseball_team_coach_staff`, `baseball_events`, `baseball_games`, `baseball_player_stats`, `baseball_box_score_*`, `baseball_stat_uploads`, `baseball_lineups`/`baseball_lineup_positions`, `baseball_documents`, `baseball_tasks`, `baseball_announcements`, `baseball_notifications`, etc. — from migrations `032`–`037`, `20260208*`, `20260217*`, `20260222200000`, `20260125*`. **These provide the tables the `20260624*` files ALTER**; do not apply this set to a DB lacking them. |
| **New tables this set CREATEs** (sampling) | `baseball_stat_visual_views`, `baseball_program_settings`, `baseball_import_sources`, `baseball_integration_configs`, `baseball_settings_audit_log`, `baseball_seasons`, `baseball_postgame_reviews(+_items)`, `baseball_practice_block_objectives`, `baseball_practice_effectiveness_reviews`, `baseball_player_passport_settings`, `baseball_player_daily_contracts`, `baseball_player_passport_share_tokens`, `baseball_timeline_event_acks`, `baseball_strength_group_audit`, `baseball_staff_audit_events`, `baseball_coach_notes`, `baseball_exercises`, `baseball_lift_assignments`, `baseball_lift_results`, `baseball_readiness_checkins`, `baseball_decision_log`, premium-lifting + elite-stat-event tables. **None of these exist yet** → all 49 are pending. |
| **Pending** | **All 49 files.** |

---

## Open risks

1. **Snapshot drift.** The live build may have added `20260624*` files after this audit (49 at audit time vs ~36 estimated → the set is actively growing). **Re-list and re-audit** any file not in the per-file table before applying.
2. **Shared-DB blast radius (file #44).** `handle_new_user` is the one true cross-product surface. Verified non-regressing, but it is shared with golf prod — **smoke-test golf signup immediately after apply** (see §S1). If golf signup ever breaks post-apply, this is the first suspect; rollback = re-apply the live definition captured in §S1.
3. ~~**Duplicate version key (§R1)**~~ — **✅ RESOLVED (PKT-16).** `001401_baseball_readiness_select_gate_fix.sql` and `000083_baseball_stat_visual_views.sql` are the renamed files; no duplicate version keys remain.
4. **Base-layer assumption.** This set is additive on the existing baseball base. If applied to a DB that somehow lacks a base table (e.g. a fresh branch DB), the guarded files (`to_regclass`/`IF NOT EXISTS`) skip silently — which could leave a partial schema rather than erroring loudly. Confirm the base layer exists (it does on prod) before applying.
5. **Not independently exercised.** This is a static + targeted-read audit. The migrations were not run in a scratch/branch DB. For maximum safety, dry-run the full ordered sequence against a Supabase **branch** (or local `supabase db reset`) before touching the shared prod DB.

---

## ✅ Third independent read-only pass — 2026-06-24 (corroboration, no overwrite)

A third read-only audit was run **without modifying the plan above** (this is the only addition).
It used live MCP (`list_migrations`, `list_tables`) + full-set grep + per-file DDL skeletons +
targeted `execute_sql` SELECTs. It **confirms every prior finding** and adds three live-DB checks
the earlier passes asserted but are now explicitly evidenced:

- **0 applied / all pending — confirmed.** Latest applied version is `20260623100504`; no
  `20260624*` row in `schema_migrations`. A 42-name existence probe returned **every** net-new
  baseball table as `missing`, and the enum `baseball_note_scope` as `missing`.
- **Pre-existing dependencies — confirmed present.** Helper fns `is_baseball_team_coach`,
  `is_baseball_team_coach_v2`, `get_my_coach_id`, `is_baseball_team_member` exist live (so files
  `000020`/`000040` that call them *before* `000050` runs are safe). All 13 prod tables the batch
  ALTERs exist. `baseball_players.user_id` **already has a unique constraint** (so file #44's
  `ON CONFLICT (user_id)` target is satisfied and its `ADD CONSTRAINT` DO-block is a safe no-op).
- **`handle_new_user` diff — re-confirmed.** Live body inserts only into `public.users` with no
  golf logic; the new body is a strict, gated superset (§S1 stands).

**Snapshot count note:** this pass observed **49** `20260624*.sql` files (first pass: 49; the
2026-06-24 re-validation at line 13: 48). The count is oscillating as the live build runs —
treat the per-file table as indicative and **re-list immediately before applying**. The two files
sharing version `20260624001400` (§R1) **have since been resolved** (PKT-16) → no duplicate
version keys remain; `db push` is unblocked.

Additional dependency edges verified safe under filename order (all referrers sort after their
target): `baseball_video_events` created in `000080` → ALTERed in `000221`/`000510`;
`baseball_lift_results` FK → `baseball_import_runs` (`000020`); `baseball_meeting_items` (`000230`)
→ ALTERed in `000310`; `baseball_practice_scrimmages` (`000200`) → `000211`. File `000010` adds
`import_run_id` as a **plain uuid + index (no FK)**, so it is safe despite sorting before `000020`.

**Net: SAFE TO APPLY in filename order, with the §R1 duplicate-version rename as the sole
must-do beforehand. No new blockers, no golf-object writes.**
