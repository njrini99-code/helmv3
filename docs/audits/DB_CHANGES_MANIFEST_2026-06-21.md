# DB Changes Manifest — Premium Remediation (Phase 3/4 + CoachHelm)

_Scan of all remediation agent transcripts + `supabase/migrations/`. Re-run `scripts/scan_db_changes.py` to refresh._

> Purpose: ONE apply-to-prod checklist so no schema change drifts. Nothing here is auto-applied to prod by this manifest.

## 1. Applied to LIVE prod during the run (verify each has a committed migration file)

| Migration | Table | Safe? | From | SQL (head) |
|---|---|---|---|---|
| `chat_client_turn_id` | `golf_coachhelm_chat_messages` | ✅ additive | P1-11, P210, P317, P324, P325 | `ALTER TABLE public.golf_coachhelm_chat_messages ADD COLUMN IF NOT EXISTS client_turn_id text; CREATE UNIQUE INDEX IF NOT` |
| `chat_message_status` | `golf_coachhelm_chat_messages` | ✅ additive | P1-11, P210, P317, P324, P325 | `ALTER TABLE public.golf_coachhelm_chat_messages ADD COLUMN IF NOT EXISTS status text;` |

## 2. Migration files in repo (apply to prod if not yet applied)

| File | In git? | Applied to prod? | Table | Safe? |
|---|---|---|---|---|
| `20260621041824_harden_get_golf_conversations_rpc.sql` | yes | ❌ **NOT APPLIED** | `?` | ✅ |
| `20260621041833_golf_documents_select_is_public.sql` | yes | ❌ **NOT APPLIED** | `?` | ⚠️ |
| `20260621041839_focus_areas_player_self_update.sql` | yes | ❌ **NOT APPLIED** | `their` | ✅ |
| `20260621041844_relock_anon_grants_reviews_patterns.sql` | yes | ❌ **NOT APPLIED** | `?` | ⚠️ |
| `20260621041849_focus_areas_progress_notes_default.sql` | yes | ❌ **NOT APPLIED** | `golf_player_focus_areas` | ✅ |
| `20260621120000_chat_client_turn_id.sql` | yes | ✅ yes | `golf_coachhelm_chat_messages` | ✅ |
| `20260621130000_ingest_external_round_atomic.sql` | yes | ❌ **NOT APPLIED** | `golf_rounds` | ✅ |
| `20260621140000_focus_areas_outcome_status.sql` | yes | ❌ **NOT APPLIED** | `golf_player_focus_areas` | ✅ |
| `20260621150000_player_classes_semester.sql` | yes | ❌ **NOT APPLIED** | `golf_player_classes` | ✅ |
| `20260621160000_insight_event_ledger.sql` | yes | ❌ **NOT APPLIED** | `golf_insight_exposure` | ⚠️ |
| `20260621170000_retire_stranded_predictions.sql` | yes | ❌ **NOT APPLIED** | `golf_predictions` | ✅ |

## 3. Every DB directive in the CoachHelm audit — cross-checked to status

_Source of truth = `COACHHELM_MASTER_ENGINE_FEATURE_REMEDIATION_AUDIT_2026-06-21.md` (Tables/Fix sections + Batch table). Each schema/data directive and what actually happened:_

| Finding | DB directive (from doc) | Status |
|---|---|---|
| P1-11 | `golf_coachhelm_chat_messages.client_turn_id` + unique index | ✅ APPLIED to prod · file `20260621120000` is **UNTRACKED → commit it** |
| P1-11 | `golf_coachhelm_chat_messages.status` (complete/failed terminal state) | ✅ APPLIED to prod · captured in file `20260621120000` (UNTRACKED → commit it) |
| P1-11 | Persist `tool` call/result messages (data-grounded answers) | CODE (persistence.ts) — verify; no schema column |
| P0-04 | `golf_rounds.analysis_status` (complete/partial/gated/failed) + per-generator receipts + retry state; OR new `golf_coachhelm_analysis_runs` table | ⚠️ **DIVERGED** — shipped via existing `coachhelm_failure_reason='engine_partial_failure'`; doc's first-class `analysis_status` column + receipts table **NOT created** (optional follow-up) |
| P0-05 | `golf_coach_insights.evidence.diagnosis` (symptom/root_cause/drivers/confidence_reason) | ✅ DONE in code (JSON evidence field — no schema change needed) |
| P0-01 | `golf_insight_outcome_attribution` store normalized `improvement_lift` by metric direction | ✅ DONE in code (existing delta/lift columns) |
| P0-01 | Rebuild `golf_coachhelm_coach_weights` from corrected history | 🔁 BACKFILL needed (see §4) |
| P0-02 | Retire stranded same-day `golf_predictions`; recompute `golf_prediction_model_performance` | CODE retires NEW rows (error_category='invalid_horizon'); 🔁 **~623 existing stranded rows need a BACKFILL** (see §4) |
| P1-07 | `golf_goals` snapshot + evaluation columns | ✅ NO MIGRATION NEEDED — golf_goals already has baseline_value/current_value/target_value/state/outcome_evaluated_at/snapshots; only the evaluator CODE remains |
| P1-08 | `golf_goal_suggestions` cap to ≤2 active pending/player | CODE (suggestion-writer/loader) — no schema |
| P1-09 | `golf_insight_player_feedback` read state affects all player surfaces | CODE (insight-visibility/delivery) — no schema |
| P1-10 | Route every category through `golf_player_notification_state` | CODE (router/dispatch) — table exists; verify delivery wired |
| P1-12 | Unified event ledger — 3 tables `golf_insight_exposure`/`action`/`outcome` | ✅ TABLES APPLIED to prod (RLS enabled, 0 advisor flags) + file 20260621160000; ledger + trust-chips + Effectiveness UI built |
| P2-21 | `golf_player_genome` — only persist valid dimensions (no all-null vectors) | CODE (Pin) — no schema |
| P094 | `golf_player_focus_areas.outcome_status` column | ✅ APPLIED to prod + file 20260621140000 |
| P231 | `golf_player_classes.semester` column | ✅ APPLIED to prod + file 20260621150000 |

## 4. Data backfills (one-time, no schema change)
- **P0-01** — Rebuild `golf_coachhelm_coach_weights` from corrected attribution history. ⏳ POST-DEPLOY — needs the direction-fix code live; run the attribution cron after the merge.
- **P0-02** — Retire stranded same-day predictions. ✅ DONE — 623 rows stamped error_category='invalid_horizon' + validated_at (file 20260621170000). Rollups self-correct on the next writer run.

## Apply order (recommended)
1. Commit untracked migration files so repo == intent.
2. For each §2 row marked **NOT APPLIED**: review SQL → apply via `supabase` MCP/CLI (additive first).
3. Confirm §1 prod-applied columns each have a matching committed file (close the drift).
4. Write + apply §3 deferred migrations only after you approve the schema.
5. Run §4 backfills last (after the direction-fix code is deployed).

_Verify prod truth with read-only `information_schema` / `list_migrations` before applying._