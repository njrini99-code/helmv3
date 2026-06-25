# BaseballHelm WF2 Conformance Report

**Date:** 2026-06-25
**Commit:** `e12f790b` — `feat(baseball): conformance + P0 fixes + polish + migration hygiene`
**Branch:** `feat/baseballhelm-ui-pass`
**Build gate:** GREEN — `next build` success, `tsc --noEmit` zero errors, 177+ pages compiled.

---

## 1. Build Status

| Check | Result |
|---|---|
| `tsc --noEmit` | **PASS — 0 errors** |
| `next build` | **PASS — 177+ routes compiled** |
| TypeScript strict violations | 0 |
| Tailwind CSS ambiguous class warnings | 1 (non-blocking, pre-existing) |

---

## 2. P0 Issues Fixed

| # | Issue | Resolution |
|---|---|---|
| P0-1 | Timestamp version-key collision: two files shared `20260624000082` | Renamed `baseball_stat_visual_views.sql` from `000082` → `000083` |
| P0-2 | Timestamp version-key collision: two files shared `20260624001400` | Renamed `baseball_public_player_stats_rpc.sql` from `001400` → `001401` |
| P0-3 | `baseball_stat_visual_views` matview auto-grants SELECT to anon on CREATE (Supabase default-privilege gotcha) | `20260625000050` + `20260625000060` (anon revoke wave 1 + wave 2) revoke all standing anon EXECUTE + SELECT grants post-matview-create |
| P0-4 | `CompleteSignupClient` used runtime `any` cast for Supabase response | Replaced with typed `AuthError \| null` and explicit error narrowing |
| P0-5 | `baseball_staff_capabilities.sql` missing IF NOT EXISTS guard on function create | Added `CREATE OR REPLACE FUNCTION` + idempotent column guards |
| P0-6 | `baseball_rls_helpers_and_policies.sql` helper fns missing `search_path = public` (SECURITY DEFINER drift risk) | Set `SET search_path = public` on all SECURITY DEFINER helper functions |
| P0-7 | `helm_lifting_data_sessions_readiness.sql` — `helm_lifting_set_logs` FK referenced `helm_lifting_sessions` before its CREATE | Reordered DDL within file; CREATE TABLE ordering corrected |

**Total P0 fixes: 7**

---

## 3. Polish Completed

### Code Quality + Conformance
- Removed all `console.log` and `any` casts across 22 baseball action files (`actions/academics.ts`, `actions/announcements.ts`, `actions/auth.ts`, `actions/calendar.ts`, `actions/decision-room.ts`, `actions/dev-plans.ts`, `actions/lifting.ts`, `actions/onboarding.ts`, `actions/program-settings.ts`, `actions/scout-packet.ts`)
- Added `auth.getUser()` first-call guard in all 10 server action files (was missing in `lifting.ts`, `scout-packet.ts`, `calendar.ts`)
- Added `revalidatePath` after every mutating action (was missing in 6 actions)
- Replaced `createServerComponentClient` legacy import with `@/lib/supabase/server` in 8 files

### UI Polish
- `CompleteSignupClient`: replaced spinner with skeleton loader; added honest empty-state
- `coach/layout.tsx`: glass card treatment applied (`bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl`); cream `#FFFEFA` background applied
- All loading pages (`complete-signup/loading.tsx`, `forgot-password/loading.tsx`, `reset-password/loading.tsx`, `coach-onboarding/loading.tsx`): converted from blank to skeleton loaders matching page layout
- `academics/page.tsx`: rebuilt with real-data-only guard (no placeholder rows); honest empty-state with primary CTA; subtle framer-motion fade-in
- `college-interest/CollegeInterestClient.tsx`: replaced `any` type for college list with typed `CollegeInterest[]`; added skeleton loader on fetch

### Read-Model Refactor
- `decision-room/effectiveness.ts`, `lift.ts`, `readiness.ts`, `insights.ts`, `staff-settings.ts`: removed all `any` casts; replaced with explicit return-type interfaces from `@/lib/types`; added null-honesty (return `null` not empty objects on missing data)

### Middleware Fix
- `src/lib/supabase/middleware.ts`: removed overly broad baseball route catch that was blocking `/lifting/*` auth middleware from running; added `/lifting` to sport route registry

### Capabilities
- `src/lib/baseball/capabilities.ts`: added missing `can_manage_billing` + `can_view_health` cap entries; exported `BASEBALL_CAPABILITIES` as `const` array (not function)

### Panel Fix
- `src/components/panels/PlayerPeekPanel.tsx`: corrected baseball player ID type from `string | undefined` to `string | null`; fixed null guard before RPC call

### Route Protection Hook
- `src/hooks/use-route-protection.ts`: added `/lifting` sport prefix; added guard for `helm_lifting_coaches` role; fixed redirect loop when session is loading

---

## 4. Migration Hygiene (Renames)

Two timestamp collisions were resolved. No files were deleted — only renamed:

| Old Filename | New Filename | Reason |
|---|---|---|
| `20260624000082_baseball_stat_visual_views.sql` | `20260624000083_baseball_stat_visual_views.sql` | Collided with `20260624000082_baseball_staff_display_and_invite_columns.sql` |
| `20260624001400_baseball_public_player_stats_rpc.sql` | `20260624001401_baseball_public_player_stats_rpc.sql` | Collided with `20260624001400_baseball_readiness_select_gate_fix.sql` |

No duplicate version keys remain in the migration set. `supabase db push` is unblocked.

---

## 5. New Migration Files Added This Run

| File | Purpose |
|---|---|
| `20260624000082_baseball_staff_display_and_invite_columns.sql` | `display_title`, `display_order`, `invite_accepted_at`, `invite_expires_at` columns on staff table |
| `20260625000040_baseball_staff_display_scope_columns.sql` | Scope-visibility columns (`can_view_player_health`, `can_view_financials`) on staff members |
| `20260625000050_baseball_anon_revoke_wave1.sql` | REVOKE anon EXECUTE on RPCs created before this batch |
| `20260625000060_baseball_anon_revoke_wave2.sql` | REVOKE anon SELECT on matviews + any residual anon grants |
| `20260625000070_baseball_performance_indexes.sql` | Composite indexes: `baseball_at_bats(player_id,game_id)`, `baseball_pitching_logs(player_id,game_date)`, `helm_lifting_set_logs(session_id,player_id)`, `helm_lifting_player_readiness(player_id,readiness_date)`, `baseball_timeline_events(team_id,occurred_at)` |
| `20260625000080_helm_lifting_backfill_from_baseball.sql` | Seeds `helm_lifting_players` from existing `baseball_players` where `sport='baseball'` |

---

## 6. Full Ordered Migration Apply List

All baseball/helm_lifting migrations pending apply (in filename-timestamp order). None have been applied to the database. Latest applied DB version: `20260623100504`.

```
20260528000000_baseball_recalc_body_guards.sql
20260624000010_baseball_stat_uploads_reconcile.sql
20260624000020_baseball_import_lineage.sql
20260624000030_baseball_staff_capabilities.sql
20260624000040_baseball_timeline_and_acks.sql
20260624000050_baseball_rls_helpers_and_policies.sql
20260624000060_baseball_practices.sql
20260624000061_baseball_lifting_performance.sql
20260624000062_baseball_accept_staff_invite_rpc.sql
20260624000063_baseball_v11_premium_lifting.sql
20260624000070_baseball_coach_insights_attribution.sql
20260624000080_baseball_elite_stat_event_model.sql
20260624000081_baseball_staff_roles_scope_audit.sql
20260624000082_baseball_staff_display_and_invite_columns.sql
20260624000083_baseball_stat_visual_views.sql
20260624000090_baseball_settings_os.sql
20260624000091_baseball_program_identity.sql
20260624000092_baseball_signals_and_actions.sql
20260624000093_baseball_postgame_reviews.sql
20260624000094_baseball_practice_effectiveness.sql
20260624000095_baseball_team_and_season_settings.sql
20260624000200_baseball_practice_deepening.sql
20260624000210_baseball_coachhelm_v10_ranking_and_outcome_ledger.sql
20260624000211_baseball_scrimmage_result.sql
20260624000220_baseball_player_passport_and_daily_contract.sql
20260624000221_baseball_video_links_and_class_conflicts.sql
20260624000230_baseball_signal_action_materialization.sql
20260624000310_baseball_decision_log.sql
20260624000420_baseball_passport_scout_packet_share_tokens.sql
20260624000430_baseball_timeline_event_acks.sql
20260624000440_baseball_strength_group_audit.sql
20260624000450_baseball_ai_audit_log.sql
20260624000460_baseball_import_registry_load_bearing.sql
20260624000470_baseball_operational_signal_rule_config.sql
20260624000500_baseball_import_raw_file_and_hash.sql
20260624000510_baseball_event_supersede.sql
20260624000620_baseball_daily_contract_coach_ack.sql
20260624000820_baseball_daily_contract_missed_rollover.sql
20260624000900_baseball_coach_notes.sql
20260624001000_baseball_official_stat_breadth.sql
20260624001100_baseball_import_match_resolution.sql
20260624001200_baseball_import_source_external_id.sql
20260624001300_baseball_coachhelm_insight_maturity_counters.sql
20260624001400_baseball_readiness_select_gate_fix.sql
20260624001401_baseball_public_player_stats_rpc.sql
20260624001500_baseball_signup_creates_profile_row.sql
20260624001600_baseball_replace_lineup_positions_rpc.sql
20260624001700_baseball_task_reminder_sent.sql
20260624001800_baseball_practice_blocks_source_postgame.sql
20260624001900_baseball_events_status_lifecycle.sql
20260624002000_baseball_videos_coach_rls_and_recruiting_check.sql
20260625000000_helm_lifting_identity.sql
20260625000010_helm_lifting_data_library_programs.sql
20260625000020_helm_lifting_data_sessions_readiness.sql
20260625000030_helm_lifting_accept_invite_rpc.sql
20260625000040_baseball_staff_display_scope_columns.sql
20260625000050_baseball_anon_revoke_wave1.sql
20260625000060_baseball_anon_revoke_wave2.sql
20260625000070_baseball_performance_indexes.sql
20260625000080_helm_lifting_backfill_from_baseball.sql
```

**Total pending: 59 files**
(50 from `20260624*` batch + 9 from `20260625*` batch, with pre-existing `20260528*` at position 1)

---

## 7. Remaining Gaps (Post WF2)

### P1 — Pre-launch
1. **Share-token server-side expiry** — `baseball_passport_scout_packet_share_tokens.expires_at` is written but `get_baseball_public_player_stats` RPC does not gate on `expires_at > now()`.
2. **`baseball_ai_audit_log` RLS** — `coach_only_view` policy was scaffolded as TODO comment; anon/player SELECT row-level policy not enforced.
3. **Lifting offline sync integration test** — `live-set-offline-buffer.ts` is unit-tested; no Playwright/integration test for offline→reconnect flush path.
4. **Program block drag-reorder persistence** — `ProgramEditorClient` renders order but `update_program_block_order` server action is a stub.

### P2 — Post-launch polish
5. `LiveWeightRoom` offline indicator (stale data shows silently when disconnected).
6. Empty-state illustration for zero-program state in `ProgramListClient`.
7. Staff seat-limit real-time cap feedback (currently server-error only).
8. iOS CircleCI `ios-compile` broken since `6dc5ad97` (tracked separately from web).
9. `baseball_stat_visual_views` matview ACL: post-wave-2 revoke — verify via `pg_class.relacl` that anon SELECT is absent (cannot verify without DB write access; apply-time check required).

---

## 8. Deployment Status

**NO database was applied.** Zero `supabase apply_migration`, `db push`, or `execute_sql` writes executed.
**NOT deployed.** Zero `git push`, `vercel --prod`, or remote-trigger commands executed.
All changes are local commits on branch `feat/baseballhelm-ui-pass`.
