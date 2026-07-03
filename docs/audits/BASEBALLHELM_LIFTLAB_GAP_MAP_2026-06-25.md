# BaseballHelm + Helm Lift Lab — Consolidated Gap Map
**Date:** 2026-06-25  
**Source:** 5-reader parallel audit, 109 raw items → 71 deduped gaps  
**Method:** Deduplicated near-duplicates, re-prioritized (P0=blocking/security/data-loss, P1=core unbuilt feature, P2=polish), grouped into 9 parallel build waves.

---

## Summary Table

| Area | Category | P0 | P1 | P2 | Total |
|------|----------|----|----|----|-------|
| baseball | database | 7 | 6 | 1 | 14 |
| baseball | feature | 8 | 11 | 3 | 22 |
| baseball | ui_ux | 1 | 9 | 21 | 31 |
| lift_lab | database | 2 | 1 | 0 | 3 |
| lift_lab | feature | 4 | 8 | 1 | 13 |
| lift_lab | ui_ux | 0 | 4 | 3 | 7 |
| **Total** | | **22** | **39** | **29** | **90** |

*(Note: 19 raw items were merged into existing entries as near-duplicates.)*

---

## Build Wave Overview

| Wave | Bucket | P0 | P1 | P2 | Effort |
|------|--------|----|----|----|--------|
| W1 | DB Foundation — Apply Migrations + Regen Types | 3 | 0 | 0 | S |
| W2 | DB Security — RLS / Anon Grants / REVOKE | 4 | 3 | 1 | S–M |
| W3 | DB Schema Completions — Missing Tables + Columns | 5 | 5 | 0 | M–L |
| W4 | Baseball Auth + Signup Golden Path | 3 | 0 | 0 | S |
| W5 | Baseball Core Features — Stats, Analytics, Dev Plans | 1 | 6 | 1 | M–L |
| W6 | Baseball Recruiting + Discover + Signals | 0 | 4 | 2 | M–L |
| W7 | Lift Lab Core — Programs, Sessions, Exercise Library | 4 | 5 | 2 | M–L |
| W8 | Lift Lab Access — Onboarding, Invites, Settings | 0 | 5 | 0 | M |
| W9 | Cross-cutting UI Polish — Skeletons, Motion, A11y, Brand | 2 | 16 | 26 | S–M |

---

## W1 · DB Foundation — Apply Migrations + Regen Types

> **Entire feature set gated until these run.** Apply all pending migrations then regen Supabase types.

- [ ] **[W1] 59 pending migrations not applied to prod DB — all tables gated**  
  *Current:* Last applied migration `20260623100504`; 59 files from `20260528*`, `20260624*`, `20260625*` pending per `docs/archive/2026-06/audits/BASEBALLHELM_WF2_CONFORM_REPORT.md:97`.  
  *Build:* Run `supabase db push` for all pending migrations in order. Verify with `\dt baseball_*` and `\dt helm_lifting_*` on prod. Gate: no feature ticket ships until this is confirmed.  
  *Files:* `supabase/migrations/` (all 20260624* + 20260625* files)  
  *Priority:* **P0** · Effort: **S**

- [ ] **[W1] Lift Lab helm_lifting_* tables unapplied — entire Lab portal fails at runtime**  
  *Current:* Five `20260625*` migrations exist locally but are not confirmed applied; `helm_lifting_*` tables absent from generated types — code uses `fromUntyped` casts throughout.  
  *Build:* Part of the db-push above. After push: run `supabase gen types typescript --project-id <id> > src/types/database.ts`, remove all `as any` / `fromUntyped` casts from `performance/page.tsx`, `player-passport.ts`, `lifting.ts`, `coachhelm-actions.ts`.  
  *Files:* `supabase/migrations/20260625000000_helm_lifting_identity.sql`, `20260625000010_helm_lifting_data_library_programs.sql`, `20260625000020_helm_lifting_data_sessions_readiness.sql`, `20260625000030_helm_lifting_accept_invite_rpc.sql`, `20260625000080_helm_lifting_backfill_from_baseball.sql`, `src/app/baseball/(dashboard)/dashboard/performance/page.tsx`, `src/lib/baseball/read-models/player-passport.ts`  
  *Priority:* **P0** · Effort: **S**

- [ ] **[W1] supabase gen types not re-run — production paths cast to `any`**  
  *Current:* `performance/page.tsx:72–75` and `player-passport.ts:487–490` use `supabase as any`. Column-name drift is invisible at compile time.  
  *Build:* Regen types after W1 migrations applied; replace all `as any` / `fromUntyped` with typed calls. Add a CI step to detect `supabase as any` regressions.  
  *Files:* `src/app/baseball/(dashboard)/dashboard/performance/page.tsx`, `src/lib/baseball/read-models/player-passport.ts`, `src/app/baseball/actions/lifting.ts`, `src/app/baseball/actions/coachhelm-actions.ts`  
  *Priority:* **P0** · Effort: **S**

---

## W2 · DB Security — RLS / Anon Grants / REVOKE

> **Security defects. Fix before any public launch.**

- [ ] **[W2] baseball_notifications INSERT policy is `WITH CHECK (true)` — any authenticated user can insert for any user_id**  
  *Current:* `baseball_notifications_insert` has unconditional `WITH CHECK (true)` per `docs/BASEBALL_RLS_SECURITY_AUDIT.md`. Flagged by Supabase security advisor as `rls_policy_always_true`.  
  *Build:* Replace with `WITH CHECK (user_id = (SELECT auth.uid()))` or restrict inserts to `service_role` only via a `SECURITY DEFINER` function. Write a migration.  
  *Files:* `docs/BASEBALL_RLS_SECURITY_AUDIT.md`  
  *Priority:* **P0** · Effort: **S**

- [ ] **[W2] 8 baseball SECURITY DEFINER RPCs callable by anon — membership probing + stats leak**  
  *Current:* `get_baseball_conversations_with_details`, `get_baseball_public_player_stats`, `get_my_baseball_conversation_ids`, `is_baseball_team_coach`, `is_baseball_team_coach_v2`, `is_baseball_team_member_v2`, `is_baseball_team_player` all anon-callable per Supabase security advisor. `get_baseball_public_player_stats` exposes stats without auth context.  
  *Build:* `REVOKE EXECUTE ON FUNCTION <fn> FROM anon;` for all 8. Add a post-migration check script that fails CI if any SECURITY DEFINER function grants anon EXECUTE.  
  *Files:* `docs/BASEBALL_RLS_SECURITY_AUDIT.md`, `docs/audits/BASEBALLHELM_CANONICAL_SPEC.md`  
  *Priority:* **P0** · Effort: **S**

- [ ] **[W2] Share-token expiry not enforced server-side in get_baseball_public_player_stats RPC**  
  *Current:* `baseball_passport_scout_packet_share_tokens.expires_at` is written but the RPC never gates on `expires_at > now()`. Expired tokens still return all player stats per `docs/archive/2026-06/audits/BASEBALLHELM_WF2_CONFORM_REPORT.md:170`.  
  *Build:* Add `AND t.expires_at > now()` to the RPC's token validity check. Write a test that issues an expired token and asserts null result.  
  *Files:* `supabase/migrations/20260624001401_baseball_public_player_stats_rpc.sql`  
  *Priority:* **P1** · Effort: **S**

- [ ] **[W2] baseball_ai_audit_log RLS policy is a TODO comment — no enforcement**  
  *Current:* Coach-only view policy scaffolded as TODO in `20260624000450_baseball_ai_audit_log.sql`; migration unapplied per `docs/archive/2026-06/audits/BASEBALLHELM_WF2_CONFORM_REPORT.md:171`. Players and anon callers can read full AI audit log.  
  *Build:* Implement the policy: `USING (team_id IN (SELECT baseball_team_id FROM baseball_coaches WHERE user_id = (SELECT auth.uid())))`.  
  *Files:* `supabase/migrations/20260624000450_baseball_ai_audit_log.sql`, `src/app/baseball/actions/ai-governance.ts`  
  *Priority:* **P1** · Effort: **S**

- [ ] **[W2] Anon GRANT ALL on 5 baseball tables (box_score_batting, box_score_pitching, box_score_uploads, games, player_season_stats)**  
  *Current:* `information_schema.role_table_grants` shows anon has DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on all five tables per `docs/BASEBALL_RLS_SECURITY_AUDIT.md`. Wider than necessary despite RLS being enabled.  
  *Build:* `REVOKE ALL ON TABLE <each> FROM anon; GRANT SELECT ON TABLE <each> TO authenticated;` — write a migration.  
  *Files:* `docs/BASEBALL_RLS_SECURITY_AUDIT.md`  
  *Priority:* **P1** · Effort: **S**

- [ ] **[W2] helm_lifting_is_head_coach_viewer callable by anon — org membership probe**  
  *Current:* Supabase security advisor: `helm_lifting_is_head_coach_viewer(p_org uuid)` callable by anon via `/rest/v1/rpc/`.  
  *Build:* `REVOKE EXECUTE ON FUNCTION helm_lifting_is_head_coach_viewer FROM anon;`  
  *Files:* `docs/audits/BASEBALLHELM_CANONICAL_SPEC.md`  
  *Priority:* **P1** · Effort: **S**

- [ ] **[W2] baseball_players RLS INSERT policy uses inline auth.uid() — sub-optimal (auth_rls_initplan)**  
  *Current:* `baseball_players_insert_own` policy re-evaluates `auth.uid()` per row. Flagged by Supabase performance advisor as `auth_rls_initplan`.  
  *Build:* Replace `auth.uid()` with `(SELECT auth.uid())` in the policy definition. Audit all other baseball table policies for the same pattern.  
  *Files:* `docs/BASEBALL_RLS_SECURITY_AUDIT.md`  
  *Priority:* **P2** · Effort: **S**

---

## W3 · DB Schema Completions — Missing Tables + Columns

> **Core data model gaps that block multiple features.**

- [ ] **[W3] 5 import/source-trust tables entirely absent from live DB**  
  *Current:* `baseball_import_lineage`, `baseball_import_match_resolution`, `baseball_import_source_external_id`, `baseball_import_registry`, `baseball_import_raw_file_and_hash` do not exist per `docs/audits/BASEBALLHELM_CANONICAL_SPEC.md §4.2`. Import deduplication, rollback, and the 11-step import dossier cannot function.  
  *Build:* Write a single migration creating all five tables with appropriate FKs, RLS (team-scoped), and anon REVOKE. Required before reprocessUpload and resolveUnmatchedPlayers can be implemented properly.  
  *Files:* `docs/audits/BASEBALLHELM_CANONICAL_SPEC.md`  
  *Priority:* **P0** · Effort: **M**

- [ ] **[W3] baseball_signals missing 8 spec-required columns (event_id, owner_id, due_at, recommended_action, why_it_matters, evidence, limitation, created_by)**  
  *Current:* Existing columns confirmed; missing columns per spec §3.4 + §3.8. CoachHelm signal surfaces (Command Center, Signals inbox, Player Profile) require `recommended_action`, `why_it_matters`, `evidence`, `limitation` to render. `owner_id`/`due_at` block Board view + action assignment. `event_id` blocks game/practice attachment.  
  *Build:* `ALTER TABLE baseball_signals ADD COLUMN event_id uuid REFERENCES baseball_games(id), owner_id uuid REFERENCES auth.users(id), due_at timestamptz, recommended_action text, why_it_matters text, evidence jsonb, limitation text, created_by uuid REFERENCES auth.users(id);` Migration + update all signal-write paths.  
  *Files:* `docs/audits/BASEBALLHELM_CANONICAL_SPEC.md`  
  *Priority:* **P0** · Effort: **S**

- [ ] **[W3] 3 CoachHelm AI support tables absent (signal_action_materialization, insight_maturity_counters, operational_signal_rule_config)**  
  *Current:* `baseball_signal_action_materialization`, `baseball_coachhelm_insight_maturity_counters`, `baseball_operational_signal_rule_config` all absent per spec §3.4. Maturity gating, Board view convert action, and non-hardcoded rule config all blocked.  
  *Build:* Create all three with appropriate columns, RLS, and anon REVOKE in a single migration.  
  *Files:* `docs/audits/BASEBALLHELM_CANONICAL_SPEC.md`  
  *Priority:* **P0** · Effort: **M**

- [ ] **[W3] 5 operational tables absent (team_season_settings, daily_contract_coach_ack, daily_contract_missed_rollover, task_reminder_sent, practice_blocks_source_postgame)**  
  *Current:* All five absent per spec §4.8–4.9 + §3.5. Season-level settings OS, player Today coach-ack flow, rollover logic, dedup guard for task reminders, and postgame-to-practice-block sourcing all blocked.  
  *Build:* Single migration for all five; team-scoped RLS on each; anon REVOKE.  
  *Files:* `docs/audits/BASEBALLHELM_CANONICAL_SPEC.md`  
  *Priority:* **P1** · Effort: **S**

- [ ] **[W3] baseball_official_stat_breadth table absent — extended official stat columns have no home**  
  *Current:* Created by migration `001000` which is in the unapplied block per spec §4.3 + §6 P0-1. Stats Lab official-stat surfaces missing.  
  *Build:* Ensure migration 001000 is included in the db-push (W1). If not in migration set, write it fresh.  
  *Files:* `docs/audits/BASEBALLHELM_CANONICAL_SPEC.md`  
  *Priority:* **P1** · Effort: **S**

- [ ] **[W3] organization_facilities and program_commitments tables absent — public college program profile always shows empty sections**  
  *Current:* `src/app/baseball/(public)/program/[id]/page.tsx:70-71,159-160` has fully built UI for facilities and NIL/scholarship commitments; arrays always `[]` because backing tables don't exist.  
  *Build:* Create `organization_facilities` and `program_commitments` with org_id FK, appropriate columns, and public SELECT policy (these are marketing-facing). Wire the page.tsx fetch.  
  *Files:* `src/app/baseball/(public)/program/[id]/page.tsx`  
  *Priority:* **P1** · Effort: **L**

- [ ] **[W3] Helm Lifting spec/live table name mismatch — helm_lifting_program_weeks vs helm_lifting_weeks (and 2 others)**  
  *Current:* Spec §4.7 canonical list uses `helm_lifting_program_weeks`; live DB has `helm_lifting_weeks`. Same mismatch for `_program_days`/`_days` and `_program_sections`/`_sections`.  
  *Build:* Decide canonical name (live wins to avoid data loss). Update all spec references and any code that uses the spec names. Add a lint/grep CI check for `program_weeks|program_days|program_sections` to catch regressions.  
  *Files:* `docs/audits/BASEBALLHELM_CANONICAL_SPEC.md`  
  *Priority:* **P1** · Effort: **S**

- [ ] **[W3] game_id FK unindexed on 6 high-volume event tables — full table scans on game queries**  
  *Current:* `baseball_batted_ball_events`, `baseball_baserunning_events`, `baseball_catching_events`, `baseball_fielding_events`, `baseball_pitch_events`, `baseball_workload_events` all have unindexed `game_id` FK per Supabase performance advisor.  
  *Build:* Single migration: `CREATE INDEX CONCURRENTLY` on `game_id` for each of the 6 tables.  
  *Files:* `docs/audits/BASEBALLHELM_CANONICAL_SPEC.md`  
  *Priority:* **P1** · Effort: **S**

- [ ] **[W3] baseball_stat_facts player_id and game_id FKs unindexed — stat engine will seq-scan**  
  *Current:* `baseball_stat_facts` has no index on `player_id` or `game_id` per Supabase performance advisor. Most performance-critical unindexed FK in the schema.  
  *Build:* `CREATE INDEX CONCURRENTLY idx_stat_facts_player_id ON baseball_stat_facts(player_id); CREATE INDEX CONCURRENTLY idx_stat_facts_game_id ON baseball_stat_facts(game_id);`  
  *Files:* `docs/audits/BASEBALLHELM_CANONICAL_SPEC.md`  
  *Priority:* **P1** · Effort: **S**

- [ ] **[W3] 95+ unindexed FK columns across baseball event, lift, meeting, and decision tables**  
  *Current:* Supabase performance advisor reports 95+ `unindexed_foreign_keys` across `baseball_actions`, `baseball_decision_log`, `baseball_meeting_items`, `baseball_lift_program_assignments`, all `baseball_lift_*`, `baseball_strength_prs`, and more.  
  *Build:* Generate a full unindexed-FK report from `pg_constraint`/`pg_index`, write a single migration with `CREATE INDEX CONCURRENTLY` for all missing. Run as a background maintenance migration (CONCURRENTLY is non-blocking).  
  *Files:* `docs/audits/BASEBALLHELM_CANONICAL_SPEC.md`  
  *Priority:* **P2** · Effort: **M**

---

## W4 · Baseball Auth + Signup Golden Path

> **New signups are broken end-to-end until all three items are complete.**

- [ ] **[W4] Player signup never seeds baseball_players row — all downstream queries fail**  
  *Current:* `src/app/baseball/actions/auth.ts` — `CompleteSignupClient` path does not INSERT into `baseball_players`. Migration `20260624001500_baseball_signup_creates_profile_row.sql` exists but is unapplied. `get_my_baseball_player_id()` returns null for every new player.  
  *Build:* Apply migration 001500 (trigger on `auth.users` INSERT that creates `baseball_players` row). Also wire the client-side `CompleteSignupClient` to call the explicit insert action as a belt-and-suspenders fallback.  
  *Files:* `src/app/baseball/actions/auth.ts`, `supabase/migrations/20260624001500_baseball_signup_creates_profile_row.sql`  
  *Priority:* **P0** · Effort: **S**

- [ ] **[W4] Announcements action writes wrong schema columns (body/created_by vs content/created_by_id)**  
  *Current:* `src/app/baseball/actions/announcements.ts` inserts into golf-schema column names (`body`, `created_by`). Baseball table columns are `content` and `created_by_id`. Every announcement post silently fails or corrupts data.  
  *Build:* Update the action to use correct column names. Write an integration test that verifies round-trip announcement create → read.  
  *Files:* `src/app/baseball/actions/announcements.ts`  
  *Priority:* **P0** · Effort: **S**

- [ ] **[W4] Dev-plan status filter uses wrong enum value ('active' vs 'sent'/'in_progress') — lists always empty**  
  *Current:* `src/app/baseball/actions/dev-plans.ts` filters `.eq('status', 'active')` but enum only has `draft`, `sent`, `in_progress`, `completed`, `archived`. No row ever matches.  
  *Build:* Change filter to `.in('status', ['sent', 'in_progress'])`. Audit all other status filters in the baseball action layer for similar enum mismatches.  
  *Files:* `src/app/baseball/actions/dev-plans.ts`  
  *Priority:* **P0** · Effort: **S**

---

## W5 · Baseball Core Features — Stats, Analytics, Dev Plans, Programs

- [ ] **[W5] Coach video upload always 403 — no INSERT RLS policy on baseball_videos**  
  *Current:* `baseball_videos` has SELECT policies but no INSERT/UPDATE for coaches. Migration `20260624002000_baseball_videos_coach_rls_and_recruiting_check.sql` is written but unapplied. Video library also calls Supabase directly (no `withBaseballAction` wrapper).  
  *Build:* Apply migration 002000. Refactor `videos/page.tsx` to use server actions via `withBaseballAction` + `getActiveBaseballContext()` for all reads and writes.  
  *Files:* `src/app/baseball/(dashboard)/dashboard/videos/page.tsx`, `supabase/migrations/20260624002000_baseball_videos_coach_rls_and_recruiting_check.sql`  
  *Priority:* **P0** · Effort: **S**

- [ ] **[W5] stats reprocessUpload and resolveUnmatchedPlayers are no-op stubs — return success without acting**  
  *Current:* `src/app/baseball/actions/stats.ts:~310` — `reprocessUpload` returns `{ success: true }` with comment "would require storing the original CSV". `resolveUnmatchedPlayers` at `:302–327` also returns `{ success: true }` without writing any rows. Import Wizard shows success toasts for actions that do nothing.  
  *Build:* Requires W3 import tables first. Store raw CSV content in `baseball_import_raw_file_and_hash` on initial upload. `reprocessUpload` re-reads that stored file and re-runs the parser. `resolveUnmatchedPlayers` updates `baseball_import_match_resolution` rows and triggers a partial re-ingest.  
  *Files:* `src/app/baseball/actions/stats.ts`, `src/components/baseball/import-center/ManualMapPanel.tsx`  
  *Priority:* **P1** · Effort: **L**

- [ ] **[W5] Group-only lift assignment silently no-ops — success toast, no DB write**  
  *Current:* `src/app/baseball/actions/lifting.ts:252–270` — when no `playerId` provided, returns `{ success: true }` without writing. Comment: "Return a synthetic id placeholder so the caller gets a success response without a DB write."  
  *Build:* Implement multi-player materialization: for a group assignment, fetch all players in the group and bulk-insert individual `helm_lifting_program_assignments` rows. Remove the synthetic-success path.  
  *Files:* `src/app/baseball/actions/lifting.ts`, `src/components/baseball/performance/PerformanceDashboardClient.tsx`  
  *Priority:* **P1** · Effort: **M**

- [ ] **[W5] baseball_program_block drag-reorder server action (update_program_block_order) does not exist**  
  *Current:* `ProgramEditorClient` references the action by name but it is absent from `src/`. Lifting portal reorder actions exist but baseball practice program blocks have no equivalent persistence.  
  *Build:* Create `update_program_block_order` server action in `program-settings.ts` that updates an `order_index` column on `baseball_practice_blocks`. Wire it into `ProgramEditorClient` drag-end handler.  
  *Files:* `src/components/baseball/performance/ProgramEditorClient.tsx`, `src/app/baseball/actions/program-settings.ts`  
  *Priority:* **P1** · Effort: **S**

- [ ] **[W5] TimeRange filter in GameVsPracticePanel renders UI but never filters data — silent mislead**  
  *Current:* `src/components/baseball/command-center/analytics/GameVsPracticePanel.tsx:262,382` — `timeRange` state set by `<TimeRangeFilter>` but never read in the `useMemo` that computes `pressureData`. All data is career-aggregate regardless of selector.  
  *Build:* Thread `timeRange` into the `useMemo` filter predicate. If data is not yet period-sliced in the DB, add a `created_at` range filter on the underlying fetch.  
  *Files:* `src/components/baseball/command-center/analytics/GameVsPracticePanel.tsx`, `src/components/baseball/command-center/analytics/TimeRangeFilter.tsx`  
  *Priority:* **P1** · Effort: **M**

- [ ] **[W5] Per-period stat breakdowns absent — all analytics read only career aggregates**  
  *Current:* `TrendAnalysisPanel`, `TeamBattingOverview`, `PlayerPerformanceGrid` all read only `baseball_player_aggregates`. `AnalyticsCoachView.tsx:114` explicitly defers per-period to "a future update." `TimeRangeFilter` is a dummy.  
  *Build:* Add a `period` dimension to `baseball_player_aggregates` (or a new `baseball_player_period_stats` view). Update all three panel components to slice by the selected period.  
  *Files:* `src/components/baseball/command-center/analytics/TrendAnalysisPanel.tsx`, `src/components/baseball/command-center/analytics/TeamBattingOverview.tsx`, `src/components/baseball/command-center/analytics/PlayerPerformanceGrid.tsx`  
  *Priority:* **P1** · Effort: **L**

- [ ] **[W5] CoachHelm insight generator ignores coach philosophy configuration**  
  *Current:* `src/app/baseball/actions/insights.ts:334` — `analyzeTeam()` receives `BaseballCoachPhilosophy` as `_config` but never references it. All thresholds are hardcoded.  
  *Build:* Remove the `_` prefix and thread the config weights into each threshold expression in `analyzeTeam()`. Add a test that proves different philosophy configs produce different insight sets on the same stat data.  
  *Files:* `src/app/baseball/actions/insights.ts`  
  *Priority:* **P1** · Effort: **M**

- [ ] **[W5] AnalyticsCoachView and AnalyticsPlayerView are dead code — never imported**  
  *Current:* Both files exist in `analytics/` but are never imported. `analytics/page.tsx` has its own inline implementation. `AnalyticsCoachView` also has incomplete per-period support.  
  *Build:* Delete both orphaned files. If the inline `page.tsx` implementation is incomplete, use the best parts of each as a starting point for a refactored surface.  
  *Files:* `src/app/baseball/(dashboard)/dashboard/analytics/AnalyticsCoachView.tsx`, `src/app/baseball/(dashboard)/dashboard/analytics/AnalyticsPlayerView.tsx`, `src/app/baseball/(dashboard)/dashboard/analytics/page.tsx`  
  *Priority:* **P2** · Effort: **S**

---

## W6 · Baseball Recruiting + Discover + Signals

- [ ] **[W6] 28 orphaned nav routes registered but no pages exist — all 404**  
  *Current:* `src/lib/baseball/nav-registry.ts` declares 28 routes (e.g. `/baseball/dashboard/data`, `/baseball/dashboard/reports`, several sub-tabs) with no corresponding `page.tsx`. `useTeamRouteProtection` not called in the baseball shell so missing routes 404 without gating.  
  *Build:* For each of the 28 routes: either (a) create a minimal `page.tsx` with a proper coming-soon state, or (b) remove the nav entry and hide the link until the page exists. Also wire `useTeamRouteProtection` into the baseball shell (see W6 item below).  
  *Files:* `src/lib/baseball/nav-registry.ts`, `src/app/baseball/(dashboard)/layout.tsx`  
  *Priority:* **P0** · Effort: **L**

- [ ] **[W6] useTeamRouteProtection never called in baseball shell — unauthenticated users can reach all routes**  
  *Current:* Hook exists at `src/hooks/use-route-protection.ts` but is absent from the baseball dashboard shell/layout. Any user who knows a URL can reach it without active team context.  
  *Build:* Mount `useTeamRouteProtection()` in `src/app/baseball/(dashboard)/layout.tsx`. Verify redirects work for missing team context and wrong-sport sessions.  
  *Files:* `src/hooks/use-route-protection.ts`, `src/app/baseball/(dashboard)/layout.tsx`  
  *Priority:* **P0** · Effort: **S**

- [ ] **[W6] Video library has 1 view (flat grid) instead of 5 spec'd views (Library/Player/Event/Tagged/Evidence)**  
  *Current:* `src/app/baseball/(dashboard)/dashboard/videos/page.tsx` — single grid; no Player, Event, Tagged, or Evidence tab/view; filter button has no filter logic.  
  *Build:* Add tab navigation for 5 views. Tagged view: link videos to `baseball_stat_events`. Evidence view: link to signal timelines. Implement filter logic. Note: requires W5 video RLS fix first.  
  *Files:* `src/app/baseball/(dashboard)/dashboard/videos/page.tsx`  
  *Priority:* **P1** · Effort: **L**

- [ ] **[W6] CoachHelm signal source drawer absent — signals have no drill-down to generating evidence**  
  *Current:* `src/components/baseball/signals/SignalInboxClient.tsx` — signal cards show severity + summary but no source-drill drawer or expand action.  
  *Build:* Add a detail slide-over panel triggered from signal card. Panel shows: raw stat events (`source_refs`), import lineage (`baseball_import_lineage`), and the generator logic rule. Requires W3 signal columns (`evidence`, `why_it_matters`) and W3 import tables.  
  *Files:* `src/components/baseball/signals/SignalInboxClient.tsx`  
  *Priority:* **P2** · Effort: **M**

- [ ] **[W6] Discover state-count filter ignores coach type — all coaches see same pool**  
  *Current:* `src/app/baseball/actions/discover.ts:591` — `getStateCounts()` accepts `_coachType` but it is unused; identical counts returned for all coach types.  
  *Build:* Thread `coachType` into the query: JUCO coaches see JUCO-eligible players, college coaches see HS + JUCO + transfer eligible, HS coaches see their own region pool.  
  *Files:* `src/app/baseball/actions/discover.ts`  
  *Priority:* **P2** · Effort: **S**

- [ ] **[W6] Arm Board and Speed/Decision Board premium charts absent**  
  *Current:* Absent from `src/components/baseball/stat-visuals/index.ts` and all exports. `FieldingVisuals.tsx` exports related boards but not Arm Board or Speed/Decision Board.  
  *Build:* Create `ArmBoard` (arm-strength scatter by position + throw distance vs velocity) and `SpeedDecisionBoard` (sprint splits + decision-making efficiency) as `StatVisualFrame`-wrapped SVG components.  
  *Files:* `src/components/baseball/stat-visuals/index.ts`, `src/components/baseball/stat-visuals/FieldingVisuals.tsx`  
  *Priority:* **P1** · Effort: **M**

- [ ] **[W6] Decision Room missing 'convert to practice block' action**  
  *Current:* `StaffDecisionRoomClient.tsx` action bar has 7 actions; `convertSignalToAction` in `decision-room.ts` handles `meeting_item`/`player_task`/`player_note` but not `converted_practice`. Enum type includes `converted_practice` but the action + button are absent.  
  *Build:* Add a `converted_practice` branch to `convertSignalToAction` that creates a `baseball_practice_blocks_source_postgame` row (W3). Add the "Convert to practice block" button in `AgendaDetailPane` action bar.  
  *Files:* `src/components/baseball/staff-decision-room/StaffDecisionRoomClient.tsx`, `src/app/baseball/actions/decision-room.ts`  
  *Priority:* **P2** · Effort: **M**

---

## W7 · Lift Lab Core — Programs, Sessions, Exercise Library

- [ ] **[W7] Program editor is read-only — add/edit/delete of weeks, days, sections, prescriptions unbuilt**  
  *Current:* `src/components/lifting/programs/ProgramEditorClient.tsx:226–307` renders existing structure but has no UI to add weeks, days, sections, or prescriptions. Server actions `addLiftWeek`, `addLiftDay`, `addLiftSection`, `addLiftPrescription`, `updateLiftPrescription`, `reorderLiftSections`, `reorderLiftPrescriptions`, `duplicateLiftDay`, `duplicateLiftWeek` are fully implemented but not wired. Left rail empty state says "Add weeks via the program builder" with no button.  
  *Build:* Add "Add week" button → calls `addLiftWeek`. Per-week "Add day" → `addLiftDay`. Per-day "Add section" → `addLiftSection`. Section prescription row "+ Add exercise" → `addLiftPrescription` with an exercise picker. Drag handles that call `reorderLiftSections`/`reorderLiftPrescriptions`. Duplicate and delete affordances on week/day rows.  
  *Files:* `src/components/lifting/programs/ProgramEditorClient.tsx`, `src/app/lifting/actions/programs.ts`  
  *Priority:* **P0** · Effort: **L**

- [ ] **[W7] Exercise library management entirely absent — no create/edit/delete UI or CRUD actions**  
  *Current:* `helm_lifting_exercises` rows are referenced by prescriptions and the live room, but no exercise library page, no CRUD server actions, and no exercise search/picker exist. Coaches cannot add exercises. Program editor shows "Unknown exercise" for any exercise not in the name map.  
  *Build:* Create `src/app/lifting/(dashboard)/dashboard/exercises/` page with list + create/edit form. Write server actions: `createExercise`, `updateExercise`, `archiveExercise`. Wire an exercise search/picker into the program editor `addLiftPrescription` flow.  
  *Files:* `src/app/lifting/actions/programs.ts`, `src/components/lifting/programs/ProgramEditorClient.tsx`  
  *Priority:* **P0** · Effort: **L**

- [ ] **[W7] Baseball performance dashboard reads legacy baseball_lift_* tables — W2-G rewire incomplete**  
  *Current:* `src/app/baseball/(dashboard)/dashboard/performance/page.tsx:92–106` queries `baseball_lift_assignments` and `baseball_lift_exercises` directly. `PerformanceDashboardClient.tsx:163` references `BaseballLift*` types. `player-today-lift.ts` reads `baseball_lift_sessions`. New data is written to `helm_lifting_*` via partially-rewired actions but the UI reads the legacy tables — coaches see stale/empty view.  
  *Build:* Update `performance/page.tsx` and `PerformanceDashboardClient.tsx` to use the resolver+adapter pattern in `src/lib/lifting/adapters/baseball-view-adapter.ts`. Update `player-today-lift.ts` to read from `helm_lifting_sessions`.  
  *Files:* `src/app/baseball/(dashboard)/dashboard/performance/page.tsx`, `src/components/baseball/performance/PerformanceDashboardClient.tsx`, `src/app/baseball/actions/player-today-lift.ts`, `src/lib/lifting/adapters/baseball-view-adapter.ts`  
  *Priority:* **P0** · Effort: **L**

- [ ] **[W7] Player session execution routes absent — /lifting/dashboard/lift and /lifting/dashboard/lift/[sessionId] return 404**  
  *Current:* `PlayerLiftHomeClient`, `PlayerLiftSessionClient`, `PlayerLiftToday` reference these routes but no `page.tsx` exists. `player-sessions.ts` action is written but never mounted.  
  *Build:* Create `src/app/lifting/(dashboard)/dashboard/lift/page.tsx` (today's session list for the athlete) and `src/app/lifting/(dashboard)/dashboard/lift/[sessionId]/page.tsx` (session execution form). Mount `player-sessions.ts` actions.  
  *Files:* `src/components/lifting/players/PlayerLiftHomeClient.tsx`, `src/components/lifting/players/PlayerLiftSessionClient.tsx`, `src/components/lifting/players/PlayerLiftToday.tsx`, `src/app/lifting/actions/player-sessions.ts`  
  *Priority:* **P0** · Effort: **M**

- [ ] **[W7] Live weight room has no realtime updates — stale on page load only**  
  *Current:* `src/components/lifting/sessions/LiveWeightRoomClient.tsx:58–438` — no Supabase realtime subscription, no polling, no `useEffect` refresh. Sets logged by athletes on phones never appear in coach view without a full reload.  
  *Build:* Add `supabase.channel('live-session-<id>').on('postgres_changes', ...)` subscription on `helm_lifting_set_results` and `helm_lifting_session_athletes` filtered by `session_id`. Update local athlete state on each change event.  
  *Files:* `src/components/lifting/sessions/LiveWeightRoomClient.tsx`, `src/app/lifting/(dashboard)/dashboard/sessions/live/page.tsx`  
  *Priority:* **P1** · Effort: **M**

- [ ] **[W7] Data import UI absent — no import page or file-upload surface for coaches**  
  *Current:* `src/app/lifting/actions/imports.ts` has `initiateImportRun`, `commitImportRun`, `rollbackImportRun` but no dashboard page. Nav has no Imports link.  
  *Build:* Create `src/app/lifting/(dashboard)/dashboard/import/page.tsx` with a CSV upload form, preview/match step, and commit/rollback controls. Add "Imports" to `LabNav.tsx`.  
  *Files:* `src/app/lifting/actions/imports.ts`, `src/components/lifting/shell/LabNav.tsx`  
  *Priority:* **P1** · Effort: **L**

- [ ] **[W7] Lift Lab standalone app has no player-facing lift session route**  
  *Current:* `/lifting` has coach session management and readiness board but no `/lifting/player/*` route. Athletes invited via `/lifting/join/[token]` have no surface to log lifts in the standalone app.  
  *Build:* Create a `/lifting/(player)/` layout + `/lifting/player/today` route using the same `PlayerLiftToday` component built for W7's player-session routes. Wire the join flow to set role on landing.  
  *Files:* `src/app/lifting/(dashboard)/dashboard/sessions/live/page.tsx`, `src/app/lifting/join/[token]/page.tsx`  
  *Priority:* **P1** · Effort: **L**

- [ ] **[W7] Athlete roster sync not automatic — roster goes stale; no sync button on athletes page itself**  
  *Current:* `src/components/lifting/athletes/AthleteRosterClient.tsx` — sync button is only in Settings; no automatic trigger when baseball/golf player joins/leaves a team; coaches must navigate to Settings and know to press Sync per team.  
  *Build:* Add a "Sync roster" button to the athletes page. Consider a webhook/DB trigger on `baseball_team_players` insert/delete that enqueues a roster sync via an Edge Function.  
  *Files:* `src/components/lifting/athletes/AthleteRosterClient.tsx`, `src/app/lifting/actions/assignments.ts`  
  *Priority:* **P1** · Effort: **M**

- [ ] **[W7] Strength group dynamic rule_json — no rule engine or builder UI**  
  *Current:* `src/components/lifting/groups/StrengthGroupsClient.tsx:116` — `rule_json` initialized to `{}` for new groups; no rule builder, no rule evaluation engine, no UI to define dynamic membership criteria.  
  *Build:* Either remove `dynamic` from `group_type` enum until a rule engine is built (honest), or build a simple rule builder (position = X, max bench > Y) with server-side evaluation on group load.  
  *Files:* `src/components/lifting/groups/StrengthGroupsClient.tsx`, `src/app/lifting/actions/groups.ts`  
  *Priority:* **P2** · Effort: **L**

---

## W8 · Lift Lab Access — Onboarding, Invites, Settings

- [ ] **[W8] Onboarding page falls back to listing all 100 orgs when no invite exists — any coach can claim any org**  
  *Current:* `src/app/lifting/(onboarding)/coach/page.tsx:70–79` — if no invite for coach's email, renders all organizations in a dropdown. Invite-verified path is bypassed.  
  *Build:* Remove the all-orgs fallback. If no invite, show "Enter your invite code or ask your head coach to send you an invite" with no org picker. The uninvited path should not allow org selection.  
  *Files:* `src/app/lifting/(onboarding)/coach/page.tsx`  
  *Priority:* **P1** · Effort: **S**

- [ ] **[W8] Head-coach invite management UI absent — no send/revoke/resend surface in baseball or golf dashboard**  
  *Current:* `inviteLiftingCoach`, `revokeLiftingInvite`, `resendLiftingInvite` actions in `src/app/lifting/actions/invites.ts` are fully implemented but no UI surfaces them anywhere. Head coaches who want to change their lifting coach post-onboarding have no path.  
  *Build:* Add a "Lift Lab" card in the baseball and golf coach dashboard settings panels (or a top-level Lift Lab settings section) that shows current invitation state, pending invite email, and Revoke/Resend actions.  
  *Files:* `src/app/lifting/actions/invites.ts`, `src/app/lifting/(dashboard)/dashboard/settings/settings-client.tsx`  
  *Priority:* **P1** · Effort: **M**

- [ ] **[W8] Settings page redirects org-viewer head coaches away — no path to flip to 'yes' mode post-onboarding**  
  *Current:* `src/app/lifting/(dashboard)/dashboard/settings/page.tsx:30–33` — redirects any non-coach user back to `/lifting/dashboard`. Blueprint §3.2 allows a viewer to flip to yes later (sends invite, downgrades can_edit). No route exposes this.  
  *Build:* Create a `ViewerSettingsPanel` for the settings page that shows the viewer's current mode, an "Upgrade to active program" button (triggers the invite flow), and a pending-invite status display. Remove the unconditional redirect.  
  *Files:* `src/app/lifting/(dashboard)/dashboard/settings/page.tsx`  
  *Priority:* **P1** · Effort: **M**

- [ ] **[W8] Golf coach onboarding has no lifting step — setLiftingMode never called for golf coaches**  
  *Current:* `src/app/golf/(onboarding)/coach/page.tsx` has zero lifting references. Baseball onboarding already has the 'Do you have a S&C coach?' step. Golf coaches complete onboarding without a `helm_lifting_org_viewers` row.  
  *Build:* Mirror the baseball lifting onboarding step in golf onboarding. Import and call `setLiftingMode` on the final step with the golf org_id.  
  *Files:* `src/app/golf/(onboarding)/coach/page.tsx`  
  *Priority:* **P1** · Effort: **M**

- [ ] **[W8] Team assignment UI uses raw UUID input — no team picker or search**  
  *Current:* `src/app/lifting/(dashboard)/dashboard/settings/settings-client.tsx:354–415` — "Add team" form requires typing a raw UUID. Coaches cannot complete this without out-of-band lookup of their team ID.  
  *Build:* Replace the UUID input with a team-search combobox that calls a server action returning teams the lifting coach is eligible to manage (based on org). Show team name + sport as search result.  
  *Files:* `src/app/lifting/(dashboard)/dashboard/settings/settings-client.tsx`  
  *Priority:* **P1** · Effort: **M**

- [ ] **[W8] Lift Lab missing Today Board route (/lifting/dashboard/today)**  
  *Current:* No `today/` subdirectory in `src/app/lifting/(dashboard)/dashboard/`. Home dashboard shows aggregate KPIs but not per-athlete today view.  
  *Build:* Create `src/app/lifting/(dashboard)/dashboard/today/page.tsx` showing today's scheduled sessions, per-athlete readiness check-in status, and pending weight-room assignments.  
  *Files:* `src/app/lifting/(dashboard)/dashboard/`  
  *Priority:* **P1** · Effort: **M**

---

## W9 · Cross-cutting UI Polish — Skeletons, Motion, A11y, Brand

### W9-A: Missing loading.tsx and content-matched skeletons

- [ ] **[W9] team/high-school page uses Math.random() placeholder data — fabricated numbers shown to coaches**  
  *Current:* `src/app/baseball/(dashboard)/dashboard/team/high-school/page.tsx:209–211` — `completed_goals: Math.floor(Math.random()*5)`, `progress_percentage: Math.floor(Math.random()*100)`. Numbers re-randomize on every render.  
  *Build:* Replace with real DB query for dev-plan progress aggregates. Add `loading.tsx` to the route. This is data integrity, not just UX.  
  *Files:* `src/app/baseball/(dashboard)/dashboard/team/high-school/page.tsx`  
  *Priority:* **P0** · Effort: **S**

- [ ] **[W9] 37 baseball client-component pages use GenericPageSkeleton (shape-mismatched) on auth-loading**  
  *Current:* High-traffic pages including all 4 player dashboard types, pipeline, tasks, academics, announcements, journey, settings root call `PageLoading` → `GenericPageSkeleton` (4 generic shimmer rows) while awaiting `useAuth()` / client-side data.  
  *Build:* Create content-matched skeleton components for each high-traffic page. Start with the 4 player dashboards and the 3 most-used coach pages (pipeline, roster, command-center). Wire each page to show its skeleton during the auth-gate check.  
  *Files:* `src/app/baseball/(player-dashboard)/player/high-school/page.tsx`, `src/app/baseball/(player-dashboard)/player/college/page.tsx`, `src/app/baseball/(player-dashboard)/player/showcase/page.tsx`, `src/app/baseball/(player-dashboard)/player/juco/page.tsx`, `src/app/baseball/(dashboard)/dashboard/pipeline/page.tsx`, `src/app/baseball/(dashboard)/dashboard/tasks/page.tsx`, `src/app/baseball/(dashboard)/dashboard/announcements/page.tsx`, `src/components/ui/loading.tsx`  
  *Priority:* **P1** · Effort: **M**

- [ ] **[W9] Player dashboard routes (college/hs/showcase/juco) missing loading.tsx entirely**  
  *Current:* All 4 player-type dashboard routes have only `page.tsx`; no `loading.tsx`. Previous route freezes until `getUser` + all client data resolves.  
  *Build:* Add a content-matched `loading.tsx` to each of the 4 player dashboard directories.  
  *Files:* `src/app/baseball/(player-dashboard)/player/high-school/page.tsx`, `src/app/baseball/(player-dashboard)/player/college/page.tsx`, `src/app/baseball/(player-dashboard)/player/showcase/page.tsx`, `src/app/baseball/(player-dashboard)/player/juco/page.tsx`  
  *Priority:* **P1** · Effort: **S**

- [ ] **[W9] join/[code] missing loading.tsx; join-team-client uses raw SVG spinner; staff/join/[code] missing loading.tsx + error.tsx**  
  *Current:* `src/app/baseball/join/[code]/` has only `error.tsx` + `page.tsx`. `join-team-client.tsx:267` has hand-rolled SVG spinner. `src/app/baseball/staff/join/[code]/` has no `loading.tsx` or `error.tsx`.  
  *Build:* Add `loading.tsx` to both join routes. Replace inline SVG spinner with `Button` component's `loading` prop. Add `error.tsx` to staff/join.  
  *Files:* `src/app/baseball/join/[code]/page.tsx`, `src/app/baseball/join/[code]/join-team-client.tsx`, `src/app/baseball/staff/join/[code]/page.tsx`, `src/app/baseball/staff/join/[code]/staff-join-client.tsx`  
  *Priority:* **P1** · Effort: **S**

- [ ] **[W9] public/team/[id] missing loading.tsx and error.tsx — blank flash + unhandled errors for scouts/recruits**  
  *Current:* `src/app/baseball/(public)/team/[id]/` — only `page.tsx`; no animation, no framer-motion, no skeleton.  
  *Build:* Add `loading.tsx` (skeleton matching team card + roster grid), `error.tsx`, and `m.div` entry animations. Public surfaces are the product face to recruits.  
  *Files:* `src/app/baseball/(public)/team/[id]/page.tsx`  
  *Priority:* **P1** · Effort: **S**

- [ ] **[W9] players/[id]/profile missing loading.tsx**  
  *Current:* `src/app/baseball/(dashboard)/dashboard/players/[id]/profile/` — `error.tsx` exists but no `loading.tsx`. High-traffic surface (coaches open from roster peek panel).  
  *Build:* Add content-matched `loading.tsx`.  
  *Files:* `src/app/baseball/(dashboard)/dashboard/players/[id]/profile/page.tsx`  
  *Priority:* **P1** · Effort: **S**

- [ ] **[W9] JucoTeamDashboard inline error uses raw bg-red-50 div — no retry, no icon**  
  *Current:* `src/app/baseball/(dashboard)/dashboard/team/JucoTeamDashboard.tsx:71–74` — raw red div with verbatim error string.  
  *Build:* Replace with system error component pattern: icon + friendly copy + retry button that re-calls `getTeamDashboardData`.  
  *Files:* `src/app/baseball/(dashboard)/dashboard/team/JucoTeamDashboard.tsx`  
  *Priority:* **P1** · Effort: **S**

- [ ] **[W9] PlayerProfileClient snapshot panel shows raw italic 'Not yet available' text (no EmptyState)**  
  *Current:* `src/components/baseball/player-profile/PlayerProfileClient.tsx:641,666,690,718` — italic `<p>` tags and plain dimmed divs for Pressure, Trend Velocity, and Exit Velocity fallback states.  
  *Build:* Replace with `EmptyState` (or `StatVisualFrame`'s honest empty state) for consistency with all other metric-missing states in the app.  
  *Files:* `src/components/baseball/player-profile/PlayerProfileClient.tsx`  
  *Priority:* **P1** · Effort: **S**

- [ ] **[W9] PlayerRow inline action menu — no focus-trap, no role='menu', no Escape dismiss (WCAG 2.1 AA violation)**  
  *Current:* `src/components/baseball/roster/PlayerRow.tsx:290` — quick-action popover opens via CSS animate-in with no `role='menu'`, no `aria-expanded` on trigger, no focus-trap, no Escape handler.  
  *Build:* Refactor to use a `Popover` or `DropdownMenu` from the system UI lib that includes focus management and keyboard dismiss. Add `aria-label` to each action button.  
  *Files:* `src/components/baseball/roster/PlayerRow.tsx`  
  *Priority:* **P1** · Effort: **M**

- [ ] **[W9] Lift Lab: LiveWeightRoom, ProgramListClient, ProgramEditorClient, StrengthGroupsClient have no Skeleton or EmptyState**  
  *Current:* None of the 4 primary Lift Lab coach-facing components import `Skeleton` or `EmptyState`. Tab switches and data refreshes show nothing.  
  *Build:* Add skeleton variants to all four. Add `EmptyState` to `ProgramListClient` ("Create your first program →") and `StrengthGroupsClient` ("No groups yet — create one").  
  *Files:* `src/components/baseball/performance/LiveWeightRoom.tsx`, `src/components/baseball/performance/ProgramListClient.tsx`, `src/components/baseball/performance/ProgramEditorClient.tsx`, `src/components/baseball/performance/StrengthGroupsClient.tsx`  
  *Priority:* **P1** · Effort: **M**

- [ ] **[W9] Lift Lab: PerformanceDashboardClient and PerformanceCommandCenter have no Skeleton or EmptyState**  
  *Current:* `src/components/baseball/performance/PerformanceDashboardClient.tsx`, `PerformanceCommandCenter.tsx` — no `Skeleton` import, no `EmptyState`. Blank panels when team has no lift data.  
  *Build:* Add layout-matched skeletons for data-loading states. Add `EmptyState` ("No lift sessions recorded yet — create a program to get started") for the zero-data state.  
  *Files:* `src/components/baseball/performance/PerformanceDashboardClient.tsx`, `src/components/baseball/performance/PerformanceCommandCenter.tsx`  
  *Priority:* **P1** · Effort: **M**

- [ ] **[W9] Lift Lab: PlayerReadinessClient has no Skeleton loading state**  
  *Current:* `src/components/baseball/performance/PlayerReadinessClient.tsx` — fetches readiness data client-side with no visual feedback during load. First thing a player sees on the Performance tab.  
  *Build:* Add a skeleton matching the readiness card layout. Show skeleton during the data fetch.  
  *Files:* `src/components/baseball/performance/PlayerReadinessClient.tsx`  
  *Priority:* **P1** · Effort: **S**

- [ ] **[W9] Lift Lab: Dashboard home readiness stat reads 0-100 score but displays as 'X/10'**  
  *Current:* `src/app/lifting/(dashboard)/dashboard/page.tsx:67–70` — averages `readiness_score` and displays as `X/10`. Schema stores 0–100. Shows e.g. '75/10' for a healthy team.  
  *Build:* Divide the average by 10 before display, or change the display label to `/100`. Verify the DB schema constraint confirms the 0–100 range.  
  *Files:* `src/app/lifting/(dashboard)/dashboard/page.tsx`  
  *Priority:* **P1** · Effort: **S**

### W9-B: Off-brand colors

- [ ] **[W9] Off-palette indigo/sky color chips in baseball stat badges**  
  *Current:* `StatsCenterClient.tsx`, `SignalInboxClient.tsx` — `indigo-600`, `sky-500` used instead of `primary-*` and `warm-*` tokens.  
  *Build:* Search-replace `indigo-` and `sky-` classes in baseball components with `primary-*` equivalents. Add a lint rule to block `indigo-` and `sky-` in `src/components/baseball/`.  
  *Files:* `src/components/baseball/stats-center/StatsCenterClient.tsx`, `src/components/baseball/signals/SignalInboxClient.tsx`  
  *Priority:* **P2** · Effort: **S**

- [ ] **[W9] PositionPlanner and PositionPlayerPill use emerald (off-brand) for 'committed' stage**  
  *Current:* `PositionPlanner.tsx:49` — `bg-emerald-500`; `PositionPlayerPill.tsx:46–51` — emerald-50/300/800/500; `PlayerQuickView.tsx:275` — `color='emerald'`.  
  *Build:* Replace all emerald references with `primary-600`/`primary-700` (or a designated "committed" design token if one is added).  
  *Files:* `src/components/baseball/position-planner/PositionPlanner.tsx`, `src/components/baseball/position-planner/PositionPlayerPill.tsx`, `src/components/baseball/position-planner/PlayerQuickView.tsx`, `src/components/baseball/recruiting-philosophy/MatchScoreBadge.tsx`  
  *Priority:* **P2** · Effort: **S**

- [ ] **[W9] SignalCard uses Badge tone='emerald' for resolved signals (off-brand)**  
  *Current:* `src/components/baseball/signals/SignalCard.tsx:110` — `<Badge tone='emerald'>`.  
  *Build:* Change to `tone='primary'` or the system's positive/success token.  
  *Files:* `src/components/baseball/signals/SignalCard.tsx`  
  *Priority:* **P2** · Effort: **S**

- [ ] **[W9] BatchVideoUpload and StatVisualFrame use raw bg-green-* success states (off-brand)**  
  *Current:* `BatchVideoUpload.tsx:217–223` — `border-green-200 bg-green-50 text-green-800`. `StatVisualFrame.tsx:177` — `high: 'bg-green-50 text-green-700 ring-green-600/20'`.  
  *Build:* Replace with `primary-50`/`primary-700`/`primary-600` equivalents.  
  *Files:* `src/components/baseball/team/BatchVideoUpload.tsx`, `src/components/baseball/stat-visuals/StatVisualFrame.tsx`  
  *Priority:* **P2** · Effort: **S**

### W9-C: Motion + animation consistency

- [ ] **[W9] AnimatePresence tab transitions missing across Stats Center, Signal Inbox, Decision Room**  
  *Current:* `StatsCenterClient.tsx`, `SignalInboxClient.tsx`, `StaffDecisionRoomClient.tsx` — tab content swaps are instant DOM swaps; `useReducedMotionGuard` exists but is not applied.  
  *Build:* Wrap tab content in `<AnimatePresence mode='wait'>` with a `m.div` fade/slide variant. Apply `useReducedMotionGuard` to disable motion when `prefers-reduced-motion: reduce`.  
  *Files:* `src/components/baseball/stats-center/StatsCenterClient.tsx`, `src/components/baseball/signals/SignalInboxClient.tsx`, `src/components/baseball/staff-decision-room/StaffDecisionRoomClient.tsx`  
  *Priority:* **P2** · Effort: **S**

- [ ] **[W9] Roster and pipeline pages have no framer-motion entry animations**  
  *Current:* `roster/page.tsx` and `pipeline/page.tsx` — no `framer-motion` import; cards and table rows appear instantly. Dashboard, command-center, signals all use `LazyMotion/m.div`.  
  *Build:* Add staggered `m.div` entry animations with `useReducedMotionGuard` check to the roster card grid and pipeline column cards.  
  *Files:* `src/app/baseball/(dashboard)/dashboard/roster/page.tsx`, `src/app/baseball/(dashboard)/dashboard/pipeline/page.tsx`  
  *Priority:* **P2** · Effort: **M**

- [ ] **[W9] Discover mobile filter drawer uses CSS keyframe animations (not framer-motion) — no reduced-motion guard**  
  *Current:* `src/app/baseball/(dashboard)/dashboard/discover/page.tsx:449,452` — `animate-fade-in`, `animate-slide-in-left` CSS classes. No `@media (prefers-reduced-motion)` check. `bg-white` instead of system cream background.  
  *Build:* Replace with `AnimatePresence` + `m.div` slide-in. Apply `useReducedMotionGuard`. Fix background to `bg-warm-50` or equivalent system surface.  
  *Files:* `src/app/baseball/(dashboard)/dashboard/discover/page.tsx`  
  *Priority:* **P2** · Effort: **S**

- [ ] **[W9] RosterBoards player chips appear statically — no framer-motion**  
  *Current:* `src/components/baseball/roster/RosterBoards.tsx` — no framer-motion import; player chips render without entry or stagger animation.  
  *Build:* Add staggered `m.div` entrance for player chips in all three board views (Position/Status/Dev).  
  *Files:* `src/components/baseball/roster/RosterBoards.tsx`  
  *Priority:* **P2** · Effort: **S**

### W9-D: A11y fixes

- [ ] **[W9] PlayerCard (roster mobile) uses role='button' on div with no accessible name**  
  *Current:* `src/components/baseball/roster/PlayerCard.tsx:151` — `div` with `role='button'` and `tabIndex={0}` but no `aria-label`. Screen reader announces the full card content as the button name.  
  *Build:* Add `aria-label={`Open ${player.full_name} profile`}` to the card div.  
  *Files:* `src/components/baseball/roster/PlayerCard.tsx`  
  *Priority:* **P2** · Effort: **S**

- [ ] **[W9] PositionPriorityRanker drag-list has no keyboard reordering**  
  *Current:* `src/components/baseball/recruiting-philosophy/PositionPriorityRanker.tsx:123` — mouse-only drag. eslint-disable comment notes keyboard not yet implemented.  
  *Build:* Add `onKeyDown` handler: Arrow Up/Down moves item, Space commits the move. Wire into the existing reorder state.  
  *Files:* `src/components/baseball/recruiting-philosophy/PositionPriorityRanker.tsx`  
  *Priority:* **P2** · Effort: **S**

### W9-E: Minor UX polish

- [ ] **[W9] 10+ settings sub-route loading.tsx files are generic PageLoading (not shape-matched)**  
  *Current:* `audit/loading.tsx`, `imports/loading.tsx`, `integrations/loading.tsx`, `notifications/loading.tsx`, `permissions/loading.tsx`, `philosophy/loading.tsx`, `privacy/loading.tsx`, `recruiting-preferences/loading.tsx`, `roles/loading.tsx`, `season/loading.tsx`, `teams/loading.tsx` all render `PageLoading`.  
  *Build:* Replace with form-style skeletons (section header shimmer + input-row shimmers) matching the actual settings page layout.  
  *Files:* `src/app/baseball/(dashboard)/dashboard/settings/` (all loading.tsx files)  
  *Priority:* **P2** · Effort: **M**

- [ ] **[W9] Staff seat-limit cap has no real-time UI feedback — server error only**  
  *Current:* `src/components/baseball/staff/StaffInviteForm.tsx` — remaining seat count not shown; seat-limit only surfaced as a post-submit server error.  
  *Build:* Fetch current staff count and plan seat limit on form load. Display "X seats remaining" inline. Disable submit and show a warning when at the limit.  
  *Files:* `src/components/baseball/staff/StaffInviteForm.tsx`  
  *Priority:* **P2** · Effort: **S**

- [ ] **[W9] LiveWeightRoom offline indicator absent — stale data shows silently**  
  *Current:* `src/app/lifting/(dashboard)/dashboard/sessions/` — no offline state banner per `docs/archive/2026-06/audits/BASEBALLHELM_WF2_CONFORM_REPORT.md:176`.  
  *Build:* Add `useOnlineStatus()` hook (or `navigator.onLine` listener) and show a sticky banner "You're offline — data may be stale" when connection is lost.  
  *Files:* `src/app/lifting/(dashboard)/dashboard/sessions/`  
  *Priority:* **P2** · Effort: **S**

- [ ] **[W9] Zero-program empty state missing illustration in ProgramListClient**  
  *Current:* `src/components/lifting/programs/ProgramListClient.tsx` — blank area with no empty-state illustration or "Create your first program" CTA per `docs/archive/2026-06/audits/BASEBALLHELM_WF2_CONFORM_REPORT.md:177`.  
  *Build:* Add `EmptyState` component with dumbbell/program icon and "Create your first program" primary action button.  
  *Files:* `src/components/lifting/programs/ProgramListClient.tsx`  
  *Priority:* **P2** · Effort: **S**

- [ ] **[W9] Animate-spin loading spinners used instead of spec'd Skeleton loaders across baseball pages**  
  *Current:* Several baseball `loading.tsx` files and suspense fallbacks render a centered animate-spin div instead of layout-matching skeletons.  
  *Build:* Systematically replace all standalone `animate-spin` loading states (that aren't button-internal) with `Skeleton` components matching page layout.  
  *Files:* `src/app/baseball/(dashboard)/dashboard/`  
  *Priority:* **P2** · Effort: **S**

- [ ] **[W9] _VideosClient.tsx is orphaned near-duplicate of videos/page.tsx — dead code**  
  *Current:* `src/app/baseball/(dashboard)/dashboard/videos/_VideosClient.tsx:87` exports `VideosClient`; never imported anywhere. Slightly shorter body than the live page.tsx.  
  *Build:* Delete the file.  
  *Files:* `src/app/baseball/(dashboard)/dashboard/videos/_VideosClient.tsx`  
  *Priority:* **P2** · Effort: **S**

- [ ] **[W9] Public player profile and BaseballInviteButton use hand-rolled animate-spin divs**  
  *Current:* `src/app/baseball/(public)/player/[id]/PlayerProfileClient.tsx:282` and `src/components/baseball/command-center/BaseballInviteButton.tsx:212` — inline CSS spinner divs instead of `Button` component's `loading` prop.  
  *Build:* Replace both with `<Button loading={isSharing}>` and `<Button loading={isGenerating}>` respectively.  
  *Files:* `src/app/baseball/(public)/player/[id]/PlayerProfileClient.tsx`, `src/components/baseball/command-center/BaseballInviteButton.tsx`  
  *Priority:* **P2** · Effort: **S**

- [ ] **[W9] Roster empty state uses bespoke inline div instead of EmptyState component**  
  *Current:* `src/app/baseball/(dashboard)/dashboard/roster/page.tsx:612–641` — hand-built `<div className='text-center py-12'>` for "Build your roster" and "No players found" states.  
  *Build:* Replace with `<EmptyState>` component with appropriate icon and CTA.  
  *Files:* `src/app/baseball/(dashboard)/dashboard/roster/page.tsx`  
  *Priority:* **P2** · Effort: **S**

- [ ] **[W9] Discover page error banner uses variant='danger' Button for Dismiss — wrong semantic**  
  *Current:* `src/app/baseball/(dashboard)/dashboard/discover/page.tsx:386–392` — `<Button variant='danger'>` for Dismiss.  
  *Build:* Change to `variant='ghost'` or `variant='secondary'`.  
  *Files:* `src/app/baseball/(dashboard)/dashboard/discover/page.tsx`  
  *Priority:* **P2** · Effort: **S**

- [ ] **[W9] Lift Lab: LabNav missing 'Imports' and 'Exercise Library' nav links**  
  *Current:* `src/components/lifting/shell/LabNav.tsx:24–29` — lists Home, Athletes, Programs, Sessions, Readiness, Groups, Settings. No Imports or Exercise Library entries.  
  *Build:* Add both nav entries once the pages are built (W7). Conditionally show based on coach vs viewer role.  
  *Files:* `src/components/lifting/shell/LabNav.tsx`  
  *Priority:* **P2** · Effort: **S**

- [ ] **[W9] Lift Lab: Session list page shows only past 30 days with no pagination or date range filter**  
  *Current:* `src/app/lifting/(dashboard)/dashboard/sessions/page.tsx:36–45` — hard-coded 30-day lookback, cap at 100 rows, no UI for pagination or date range.  
  *Build:* Add date range picker (default: last 30 days), pagination (next/prev), and filter by athlete/status/sport. Update the underlying query to accept these parameters.  
  *Files:* `src/app/lifting/(dashboard)/dashboard/sessions/page.tsx`, `src/components/lifting/sessions/SessionListClient.tsx`  
  *Priority:* **P2** · Effort: **M**

- [ ] **[W9] Lift Lab: Athlete detail page shows exercise maxes without resolving exercise_id to exercise name**  
  *Current:* `src/app/lifting/(dashboard)/dashboard/athletes/[athleteId]/page.tsx:228–236` — renders `max_type.replace(/_/g,' ')` but ignores `exercise_id`. Shows "1 rep max" with no indication of which exercise.  
  *Build:* Fetch exercise names in the same query (join to `helm_lifting_exercises`). Display exercise name prominently alongside the max type and value.  
  *Files:* `src/app/lifting/(dashboard)/dashboard/athletes/[athleteId]/page.tsx`  
  *Priority:* **P2** · Effort: **S**

- [ ] **[W9] Performance route missing loading.tsx for players/[id] sub-route**  
  *Current:* `src/app/baseball/(dashboard)/dashboard/performance/players/[id]/` — only `page.tsx` (redirect); no `loading.tsx`. Parent `/performance/` has loading.tsx but sub-routes are inconsistent.  
  *Build:* Add minimal `loading.tsx` to `performance/players/[id]/`.  
  *Files:* `src/app/baseball/(dashboard)/dashboard/performance/players/[id]/page.tsx`  
  *Priority:* **P2** · Effort: **S**

- [ ] **[W9] PracticeIntelligenceBoard uses inline spinning icon during insight-to-action conversion**  
  *Current:* `src/components/baseball/practice-planner/PracticeIntelligenceBoard.tsx:42` — per-card convert button shows spinning icon indicator instead of button loading state.  
  *Build:* Use the convert button's `loading` prop during the conversion in-flight state.  
  *Files:* `src/components/baseball/practice-planner/PracticeIntelligenceBoard.tsx`  
  *Priority:* **P2** · Effort: **S**

- [ ] **[W9] Dev-plans PlanDetail and ProgressTracker have no loading state or EmptyState**  
  *Current:* `src/components/baseball/dev-plans/PlanDetail.tsx` and `ProgressTracker.tsx` — no Skeleton, no loading prop, no EmptyState. Goals array typed as `unknown` and cast unsafely.  
  *Build:* Add skeleton variants. Fix the `goals` type to the actual shape. Show EmptyState when `goals.length === 0`.  
  *Files:* `src/components/baseball/dev-plans/PlanDetail.tsx`, `src/components/baseball/dev-plans/ProgressTracker.tsx`  
  *Priority:* **P2** · Effort: **S**

- [ ] **[W9] Additional client-side PageLoading mismatches (journey, messages/[id], travel, CollegeInterest, PlayerCard mobile, RosterBoards)**  
  *Current:* `journey/page.tsx:206–212`, `messages/[id]/page.tsx:43`, `travel/page.tsx:96`, `CollegeInterestClient.tsx:236` all use `PageLoading` during client-side data fetches. `PlayerCard.tsx` and `RosterBoards.tsx` have no skeleton variants for mobile and board views.  
  *Build:* Create shape-matched inline skeletons for each (chat-bubble rows for messages, school-card columns for journey, itinerary rows for travel). Mobile card skeleton for `PlayerCard`. Stagger skeleton for board chips in `RosterBoards`.  
  *Files:* `src/app/baseball/(dashboard)/dashboard/journey/page.tsx`, `src/app/baseball/(dashboard)/dashboard/messages/[id]/page.tsx`, `src/app/baseball/(dashboard)/dashboard/travel/page.tsx`, `src/app/baseball/(dashboard)/dashboard/college-interest/CollegeInterestClient.tsx`, `src/components/baseball/roster/PlayerCard.tsx`, `src/components/baseball/roster/RosterBoards.tsx`  
  *Priority:* **P2** · Effort: **M**

---

*Generated: 2026-06-25. Next review: after W1–W4 are complete.*
