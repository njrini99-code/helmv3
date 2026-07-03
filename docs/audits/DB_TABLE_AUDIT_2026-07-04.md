# Database Table Audit — 2026-07-04

15-agent read-only classification of all 291 `public` tables (code references
across src/scripts/e2e, `pg_proc` function bodies, `pg_views`, `cron.job`,
inbound FKs, row counts + freshness), with an adversarial skeptic pass over
every DEAD verdict. Run as part of the clean-slate train.

**Result: 272 KEEP · 9 DEAD (graveyarded) · 10 UNSURE (kept, listed below).**

## Graveyard mechanism

Dead tables are MOVED, not dropped: `ALTER TABLE public.<t> SET SCHEMA graveyard`.
The `graveyard` schema has no role grants and is not exposed via PostgREST, so
the tables vanish from the app surface but every row is preserved.
**Restore any table:** `ALTER TABLE graveyard.<t> SET SCHEMA public;`
Hard-drop is a deliberate later decision after a soak period.

## Phase 1 — moved 2026-07-04 (`20260704060000_graveyard_dead_tables_phase1.sql`)

| Table | Rows | Why dead |
|---|---|---|
| crm_activity_log | 0 | Zero refs anywhere; no function/view/cron use |
| baseball_import_field_mappings | 0 | Only ref is a comment in generated types |
| baseball_soreness_maps | 0 | Explicitly "legacy" in lifting-v11.ts; superseded by helm_lifting_soreness_maps |
| baseball_stat_facts | 0 | stat-layer-manifest.ts: "schema exists, no importer writes to it" |
| golf_validations | 3 | Superseded by golf_prediction_validations; zero live refs |
| golf_percentile_cache | 0 | CoachHelm v3 scaffold, never wired |
| golf_player_attendance_stats | 0 | Orphaned table (originally a view); zero refs |
| golf_player_baselines | 0 | CoachHelm v3 scaffold, never wired |
| golf_tracer_health_snapshot | 0 | Zero refs (TracerHealthOverview computes live) |

## Phase 2 — legacy Lift Lab tables (24) — move AFTER the rewire deploys

`helm_lifting_*` (31 tables) is canonical — confirmed by migration history
(20260625000080 backfill), code banners in lifting.ts / player-today-lift.ts /
loaders-v10.ts, and data freshness (organic writes land only in helm_lifting_*;
every baseball_lift_* row is a single 2026-06-25 demo seed).

Legacy set: `baseball_lift_*` (15) + `baseball_readiness_checkins` +
`baseball_strength_group_audit/group_members/groups/maxes/prs` +
`baseball_soreness_maps` (already phase 1) + `baseball_bodyweight_entries` +
`baseball_availability_statuses`.

**Blocked on the code rewire in this train** — live code still touching legacy:

- `src/lib/baseball/coachhelm/engine-run.ts:403,410` — engine reads legacy (blind to real data)
- `src/lib/baseball/read-models/live-weight-room.ts:100,147,190` — staff screen renders empty
- `src/lib/baseball/read-models/decision-room/lift.ts:5,86` — same blindness
- `src/lib/baseball/read-models/strength-groups.ts:264` — compliance reads legacy
- `src/app/baseball/actions/signals.ts:369+` — **silent data-loss**: lift_modification conversions write only legacy → invisible to players
- `src/app/baseball/actions/lifting-v11.ts:1538+` — publishLiftDay double-writes legacy-then-helm
- `src/app/baseball/actions/lifting.ts:2094+` — dead legacy fallback reads
- `src/components/baseball/player-today/PlayerTodayClient.tsx` — stale comments only

No data migration needed first: the only populated legacy tables
(baseball_lift_assignments 44 / baseball_lift_results 22 /
baseball_readiness_checkins 22) are orphaned demo-seed rows with zero readers;
helm_lifting_* holds its own seeded + organic data for the same team.

## UNSURE — kept in public, revisit deliberately

| Table | Rows | Note |
|---|---|---|
| baseball_lift_exercise_substitutions | 0 | V11 sibling; goes with phase 2 legacy set |
| baseball_lift_import_rows / _runs | 0 | Lift import scaffolding, never wired; phase 2 candidates |
| baseball_exercises | 7 | Seed scripts write it; lifting.ts calls it legacy — verify then retire |
| baseball_staff_audit_events | 0 | Migration defines trigger+RPC writers but LIVE db has neither — schema drift to reconcile, not a drop |
| golf_course_holes | 0 | Writer explicitly DEPRECATED; superseded by course-library. Retire with course-management read path |
| helm_lifting_exercise_substitutions | 0 | Possibly future feature stub — confirm intent |
| admin_api_perf_log | 0 | No writer exists; only a passive realtime listener. Either wire a writer or retire + remove listener |
| admin_client_errors | 0 | Same as above |
| golf_practice_sessions | 0 | Deliberate W41 TrackMan ingest target — KEEP until ingest ships or is cancelled |

## Never-drop list (standing)

golf_predictions, golf_prediction_validations, golf_prediction_model_performance,
golf_insight_effectiveness, golf_insight_drill_attachments,
golf_insight_generation_log, golf_insight_player_feedback, golf_patterns_v2,
golf_team_coach_staff, golf_player_stats_cache, users, organizations.
