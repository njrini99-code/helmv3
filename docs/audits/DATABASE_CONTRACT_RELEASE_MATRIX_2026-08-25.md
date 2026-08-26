<!-- markdownlint-disable MD013 -->

# Database Contract Release Matrix

## Purpose

This is the decision record for the remaining local-versus-production schema
differences found by the 2026-08-25 drift audit. It is intentionally not a
migration plan that blindly makes either database look like the other.

The authoritative order for each decision is:

1. current deployed production behavior and data,
2. current application callers and their validation,
3. current migrations and local reset behavior,
4. generated types,
5. historical migration ledger entries.

## Verified baseline

- Production has 172 public RPC names; fresh local has the same 172 plus five
  local `helm_debug_*` flight-recorder RPCs.
- The focused Golf round/shot/qualifier policy definitions are identical.
- The prior 12 runtime-critical Baseball columns and the 17 additional active
  query fields now enforced by `scripts/db/check-supabase-drift.mjs` are
  present in the rebuilt local database. The active-query set intentionally
  fails against current production until the staged compatibility migrations
  are released.
- The local reset and all 71 pgTAP/RLS test files pass.
- Production was inspected read-only. No production DDL or data change was
  performed for this audit.

## Why the ledger is insufficient

The Baseball model migrations from 2026-06 used `CREATE TABLE IF NOT EXISTS`.
In production, older table shapes already existed, so PostgreSQL correctly
skipped those creates while still recording the migration version. Several
later additive releases restored runtime-critical columns under different
timestamps. A matching migration version is therefore not proof of a matching
table contract.

## Contract groups requiring an explicit release decision

These tables have at least one same-name field with an incompatible type,
nullability, or semantics. They cannot be reconciled safely with an additive
column-only patch.

| Group | Tables | Why a decision is required | Required next work |
| --- | --- | --- | --- |
| Official Baseball scorecards | `baseball_box_score_batting`, `baseball_box_score_pitching`, `baseball_player_season_stats` | Several counting/stat fields differ in nullability; pitching `complete_game` and `shutout` differ between numeric and boolean representations. | Choose the canonical scorecard semantics, write an explicit data conversion/backfill plan, then test imports, postgame, stats center, and CoachHelm. |
| Baseball event identity | `baseball_fielding_events`, `baseball_plate_appearances`, `baseball_swing_events`, `baseball_video_events`, `baseball_workload_events` | Player identity and event fields differ in requiredness and, for video tags, representation. | Define canonical event ownership and compatibility reads before any type/constraint change. |
| Baseball operational records | `baseball_actions`, `baseball_ai_audit`, `baseball_coach_notes`, `baseball_decision_log`, `baseball_coach_insights`, `baseball_integration_configs`, `baseball_signals` | Status/lifecycle, audit, and visibility semantics are not equivalent. | Reconcile against live producers and the related read models; use dual-read/write only where an active rollout needs it. |
| Baseball practice/postgame | `baseball_postgame_review_items`, `baseball_postgame_reviews`, `baseball_practice_block_objectives`, `baseball_practice_effectiveness_reviews`, `baseball_practice_lineup_slots`, `baseball_practice_scrimmages`, `baseball_settings_audit_log` | Production and local model different concepts under the same table names. | Make the product-model choice per workflow before altering data or constraints. |
| CRM | `crm_coaches` | `conference` nullability and contact-role fields differ. | Capture/validate production CRM behavior, then add an additive local compatibility migration or a controlled CRM rollout. |
| Golf account deletion | `golf_players` | Local deliberately makes `user_id` nullable and adds `anonymized_at`; production keeps user ownership required. | Treat as an account-deletion/data-retention feature, with foreign-key, RLS, and lifecycle test coverage. Do not force parity by dropping history preservation. |

## Additive compatibility groups

These tables have only column-presence differences in generated Row contracts.
Adding a column may be technically safe, but it is not automatically a release
decision: defaults, constraints, backfills, and code ownership still need
review.

| Group | Tables | Compatibility direction to assess |
| --- | --- | --- |
| Baseball event telemetry | `baseball_baserunning_events`, `baseball_batted_ball_events`, `baseball_catching_events` | Production retains older official-game fields while local adds newer practice/video/import fields. Establish a union contract only if both datasets must be served by the same table. |
| Pitch/workload telemetry | `baseball_pitch_events`, `baseball_workload_events` | **Confirmed production runtime defect.** Current CoachHelm and Stat Visuals selects reference missing rich-contract columns. `20260825223149_reconcile_baseball_event_telemetry_production_contract.sql` is additive, maps only unambiguous legacy values, and preserves null where historical meaning is unknown. Engine/baseline/outcome paths now emit structured warnings if a telemetry read fails. |
| Baseball sources, settings, and presentation | `baseball_import_sources`, `baseball_program_settings`, `baseball_seasons`, `baseball_stat_visual_views`, `baseball_staff_invitations`, `baseball_team_coach_staff`, `baseball_teams` | Determine whether legacy production fields remain supported, then capture them locally or formally deprecate them with a data migration. |
| Timeline acknowledgements | `baseball_timeline_event_acks` | **Confirmed production runtime defect.** Production required `team_id`, `player_id`, `acked_by`, and `acked_at`; the action wrote only fresh-local `user_id`/`acknowledged_at` fields. The compatibility migration preserves both aliases, backfills safely, restores the required event identity, and adds the missing owner-only DELETE policy. |
| Active Baseball read contracts | `baseball_camp_registrations`, `baseball_coach_notes`, `baseball_import_sources`, `baseball_signals`, `baseball_video_events` | `20260825224803_reconcile_baseball_active_read_contracts.sql` captures the small production/local subset needed by shipped camps, notes, import registry, Decision Room, and scout-packet flows. The camp timestamps are a genuine new persistence contract; the remaining additions make local reproduce deployed reads without dropping legacy fields. |
| Passport and lifting | `baseball_player_development_metrics`, `baseball_player_passport_share_tokens`, `helm_lifting_coaches` | Local has newer provenance/soft-delete fields; production has alternate sharing/metric metadata. Define one read/write surface before rollout. |
| Directly additive local candidates | `baseball_practice_blocks`, `baseball_signals` | Production has extra fields while local has no conflicting local-only fields. A local compatibility migration is potentially straightforward after caller review. |

## Historical and development-only differences

| Object | Classification | Action |
| --- | --- | --- |
| Five production backup tables and `v_crm_coaches_by_school` | Historical/operational | Keep production-only; they have no direct application table call. |
| `baseball_legacy_backfill_manifest` | Held one-time work | Keep local-only until the explicitly held backfill is approved. |
| `helm_debug_*` RPCs | Flight-recorder development work | Release separately with its own security and load review. |
| `gate_secdef_ownership_and_redemption` | Explicit hold | Do not apply as written; it can block valid backend/trigger writes. |

## Safe release sequence

1. Keep production read-only while this matrix is reviewed.
2. Choose one contract group only; do not mix Golf reliability work with
   Baseball model reconciliation.
3. Capture production metadata and row counts for that group.
4. Add a forward migration with a new CLI-generated version. Never modify or
   replay an old migration solely because its ledger row is missing.
5. Add a local pgTAP contract test and an application integration test that
   fails before the migration.
6. Rebuild local, regenerate types from production after deployment, and run
   the focused workflow.
7. Update this matrix and the drift audit with the new evidence.

## Guardrails now in place

- Type generation and production type-drift checks use the repository-pinned
  Supabase CLI.
- The read-only drift guard works against both TLS production poolers and
  non-TLS local Docker Postgres.
- The guard recognizes the approved `__admin_rollup_b_gate` helper rather than
  falsely reporting secured admin rollups as unsafe.
- The guard excludes aggregates before calling `pg_get_functiondef`, preventing
  a query-planning error from masquerading as a schema failure.

## Not yet authorized

No production migration has been selected or applied for the incompatible
contract groups above. That is deliberate: the remaining differences include
data types and business meanings that cannot be safely inferred from schema
text alone.
