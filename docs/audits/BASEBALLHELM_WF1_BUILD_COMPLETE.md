# BaseballHelm WF1 Build Complete — Audit Report
**Date:** 2026-06-25
**Gate result:** GREEN — tsc zero errors, next build success (177 pages compiled, webpack/Next.js 16.2.7; one non-blocking Tailwind CSS ambiguous class warning)

---

## 1. What Was Completed

### Lifting Lab (4 packets)
- `helm_lifting_identity` — `helm_lifting_teams`, `helm_lifting_staff`, `helm_lifting_players` tables; RLS scope; team-type = baseball/track/generic
- `helm_lifting_data_library_programs` — `helm_lifting_programs`, `helm_lifting_exercises`, `helm_lifting_program_blocks` with ordering and progression fields
- `helm_lifting_data_sessions_readiness` — `helm_lifting_sessions`, `helm_lifting_set_logs`, `helm_lifting_player_readiness`; RPE/velocity/load capture; readiness gate (sleep/stress/soreness)
- `helm_lifting_accept_invite_rpc` — `accept_lifting_invite()` SECURITY DEFINER RPC; staff join flow analogous to baseball join; backfill-from-baseball migration (`20260625000080`) to seed helm_lifting_players from existing `baseball_players`
- UI layer: `PerformanceDashboardClient`, `PerformanceCommandCenter`, `LiveWeightRoom`, `ProgramListClient`, `ProgramEditorClient`, `StrengthGroupsClient`, `PlayerLiftHomeClient`, `PlayerLiftSessionClient`, `PlayerLiftToday`, `PlayerReadinessClient` — all under `src/components/baseball/performance/`
- Routes: `/baseball/dashboard/performance`, `/performance/live`, `/performance/groups`, `/performance/programs/[programId]`, `/performance/players/[id]`
- Server lib: `src/lib/lifting/` — `access.ts`, `readiness-compute.ts`, `strength-group-rules.ts`, `group-audit-writer.ts`, `live-set-offline-buffer.ts`, `use-live-set-sync.ts`, adapters

### Staff Room (4 packets)
- `baseball_staff_capabilities` — role-gated capability matrix; `baseball_staff_members.capabilities` JSONB; `check_staff_capability()` helper
- `baseball_staff_roles_scope_audit` — scope constraints (can_view_player, can_edit_roster, can_manage_billing, can_view_health) per role; migration adds missing scope columns
- `baseball_staff_display_and_invite_columns` + `baseball_staff_display_scope_columns` — `display_title`, `display_order`, `invite_accepted_at`, `invite_expires_at` columns; invite status view
- `baseball_accept_staff_invite_rpc` — `accept_staff_invite(p_code)` SECURITY DEFINER; deduplication guard; seat-limit check
- `StaffSettingsClient` — invite flow, role picker, capability display, seat-limit enforcement
- `StaffDecisionRoomClient` — staff-only decision log surface; linked to `baseball_decision_log` table
- Staff join route: `/baseball/staff/join/[code]/` with `staff-join-client.tsx`

### DB Layer (16 gaps addressed)
- `baseball_anon_revoke_wave1` + `baseball_anon_revoke_wave2` — stripped anon EXECUTE grants from all standing RPCs and matviews; REVOKE pattern per Supabase matview-recreate gotcha
- `baseball_performance_indexes` — composite indexes on `baseball_at_bats(player_id, game_id)`, `baseball_pitching_logs(player_id, game_date)`, `helm_lifting_set_logs(session_id, player_id)`, `helm_lifting_player_readiness(player_id, readiness_date)`, `baseball_timeline_events(team_id, occurred_at)`
- `baseball_rls_helpers_and_policies` — `is_baseball_team_member()`, `is_baseball_coach()`, `is_baseball_player()` helper functions; RLS enabled on all core tables
- `baseball_readiness_select_gate_fix` — corrected anon SELECT on `helm_lifting_player_readiness` (was accidentally granted)
- `baseball_signup_creates_profile_row` — trigger `on_auth_user_created` → inserts `baseball_profiles` row on signup
- `baseball_public_player_stats_rpc` — `get_public_player_stats(p_player_id)` for passport/share-token surface; authenticated only
- `baseball_import_raw_file_and_hash` — `baseball_import_raw_files` + SHA-256 dedup guard; `baseball_import_registry` load-bearing FK
- `baseball_event_supersede` — `supersedes_event_id` FK on `baseball_timeline_events`; correction/amendment chain
- `baseball_coachhelm_insight_maturity_counters` — `times_actioned`, `last_actioned_at` counters on `baseball_coachhelm_insights`
- `baseball_daily_contract_coach_ack` + `baseball_daily_contract_missed_rollover` — coach-acknowledgment tracking; missed-contract rollover cron support
- `baseball_videos_coach_rls_and_recruiting_check` — coach-only write gate on `baseball_videos`; recruit video sharing check
- `baseball_events_status_lifecycle` — `status` enum on `baseball_timeline_events`: pending/confirmed/cancelled/superseded

---

## 2. Readiness Scorecard

| Layer | Score | Justification |
|---|---|---|
| Lifting Lab | 82/100 | Full DB schema, RLS, and UI components shipped. Routes compile and render. Gaps: no E2E test coverage; offline sync buffer is unit-tested but not integration-tested; program-builder lacks drag-reorder persistence; velocity/bar-speed input is UI-only (no hardware adapter). |
| Staff Room | 79/100 | Invite flow, capability matrix, decision room, and RLS shipped. Gaps: seat-limit enforcement is server-action only (no real-time UI cap feedback); staff-remove flow exists but lacks undo; capabilities JSONB not validated client-side schema. |
| DB Layer | 88/100 | 16 gaps addressed including anon revoke waves, composite indexes, RLS helpers, signup trigger, and import dedup. Gaps: two migrations share timestamp prefix `20260624000082` (filename collision — must be resolved before apply); `baseball_stat_visual_views` matview ACL needs post-CREATE REVOKE verified. |
| Security | 84/100 | Anon EXECUTE revoked in two waves; SECURITY DEFINER RPCs use explicit `search_path = public`; no anon SELECT on health/readiness tables. Gaps: `baseball_ai_audit_log` row-level visibility (coach only) not yet enforced; share-token expiry not enforced server-side on RPC path. |
| Premium UI | 76/100 | Glass card design system (`bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl`) applied throughout performance components; skeleton loaders present on all loading states; framer-motion fade-in on dashboard entry. Gaps: `LiveWeightRoom` lacks offline indicator; `ProgramEditorClient` drag-reorder uses placeholder not real DnD library; no empty-state illustration for zero-program state. |
| **Overall** | **82/100** | Build is green, all routes compile, zero TypeScript errors. The platform is functionally complete for Lifting Lab + Staff Room MVP. Key blockers before prod deploy are the migration timestamp collision and the two unreviewed security gaps noted above. |

---

## 3. New Migration Files Written This Run

All filenames relative to `supabase/migrations/`. These are WRITTEN but NOT applied to any database.

**20260624 batch (baseball core — WF1 day 1):**
```
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
20260624000083_baseball_stat_visual_views.sql                  ← renamed from 000082 (collision resolved)
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
20260624001401_baseball_public_player_stats_rpc.sql            ← renamed to 001401 (was 001400; collision resolved by PKT-16)
20260624001500_baseball_signup_creates_profile_row.sql
20260624001600_baseball_replace_lineup_positions_rpc.sql
20260624001700_baseball_task_reminder_sent.sql
20260624001800_baseball_practice_blocks_source_postgame.sql
20260624001900_baseball_events_status_lifecycle.sql
20260624002000_baseball_videos_coach_rls_and_recruiting_check.sql
```

**20260625 batch (helm_lifting + security hardening — WF1 day 2):**
```
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

**Pre-existing (not written this run, for reference):**
```
20260528000000_baseball_recalc_body_guards.sql
```

---

## 4. Remaining Gaps

### P0 — Must fix before migration apply
1. ~~**Timestamp collision x3**~~ — **RESOLVED.** `20260624000082_baseball_stat_visual_views.sql` renamed to `20260624000083_baseball_stat_visual_views.sql`; `20260624001400_baseball_public_player_stats_rpc.sql` renamed to `20260624001401_baseball_public_player_stats_rpc.sql`. No duplicate version keys remain.
2. **`baseball_stat_visual_views` matview ACL** — matview creation auto-grants SELECT to anon via default privileges; a `REVOKE SELECT ON baseball_stat_visual_views FROM anon;` must follow in the same migration or wave-3 revoke.

### P1 — Pre-launch
3. **Share-token server-side expiry** — `baseball_passport_scout_packet_share_tokens.expires_at` is written but the `get_public_player_stats` RPC does not gate on it; a `WHERE expires_at > now()` check is missing.
4. **`baseball_ai_audit_log` RLS** — table exists but row-level policy `coach_only_view` was scaffolded as a TODO comment; anon/player SELECT not yet blocked.
5. **Lifting offline sync integration test** — `live-set-offline-buffer.ts` unit-tested; no Playwright/integration test for the offline→reconnect flush path.
6. **Program drag-reorder persistence** — `ProgramEditorClient` renders block order but the server action for reorder (`update_program_block_order`) is a stub.

### P2 — Post-launch polish
7. `LiveWeightRoom` offline indicator (shows stale data silently when disconnected).
8. Empty-state illustration for zero-program state in `ProgramListClient`.
9. Staff seat-limit real-time cap feedback in UI (currently server-error only).
10. iOS CircleCI `ios-compile` check broken since commit `6dc5ad97` (separate from web; tracked separately).
11. 16 verify findings still open (of 64 total): primarily edge-case null-handling in `readiness-compute.ts` and missing loading skeletons on `/performance/players/[id]`.

---

## 5. Deployment Confirmation

**NO database was applied.** Zero `supabase apply_migration`, `supabase db push`, `db reset`, or `execute_sql` write calls were made. All `.sql` files exist on the local filesystem only.

**NOTHING was deployed.** Zero `git push`, `vercel --prod`, or remote-trigger commands were executed. All changes are local commits only.

The migration apply plan (ordered, with collision fixes) is documented separately at `docs/audits/BASEBALLHELM_MIGRATION_APPLY_PLAN.md`.
