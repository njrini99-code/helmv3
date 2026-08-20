-- Wave K2 — covering indexes for three unindexed baseball FKs.
--
-- Same change class as 20260710004200_fk_covering_indexes_batch2_baseball_p_z
-- (advisor cleanup, unindexed_foreign_keys). All three are confirmed live via
-- pg_constraint + pg_indexes (2026-08-19) and independently flagged right now
-- by Supabase's own performance advisor (unindexed_foreign_keys).
--
-- 1. baseball_postgame_review_items.timeline_event_id
--    FK: FOREIGN KEY (timeline_event_id) REFERENCES
--        baseball_player_timeline_events(id) ON DELETE SET NULL
--    Table's 5 existing indexes (pkey, player_idx, review_idx, team_id_idx,
--    uq_baseball_postgame_item) cover none of it. 9 rows.
--
-- 2. baseball_postgame_reviews.coach_id
--    FK: FOREIGN KEY (coach_id) REFERENCES baseball_coaches(id)  [NO ACTION]
--    This table also carries a SECOND, already-indexed coach FK column,
--    created_by_coach_id (baseball_postgame_reviews_created_by_coach_id_idx,
--    idx_scan=0) — that column is schema drift from the table's pre-V10
--    shape (20260624000090's original CREATE TABLE) and is not read or
--    written by any app code for this table; it is a dead-baseball-lane
--    cleanup candidate, not a Wave K indexing question, and is intentionally
--    left untouched here. `coach_id` is the column the app actually writes
--    (src/app/baseball/actions/postgame.ts:151, every postgame-review
--    upsert) and simply postdates 20260710004200's FK-covering-index batch:
--    it was added the next day by 20260711180000_baseball_postgame_shape_
--    reconcile.sql, whose own header explains prod's older schema already
--    had created_by_coach_id and the reconcile additively bolted coach_id on
--    top, leaving created_by_coach_id "untouched — no backfill, no drop."
--    2 rows.
--
-- 3. baseball_settings_audit_log.actor_coach_id
--    FK: FOREIGN KEY (actor_coach_id) REFERENCES baseball_coaches(id)
--        ON DELETE SET NULL
--    Table's 4 existing indexes (pkey, changed_by_idx, event_type_idx
--    (team_id,event_type), team_idx(team_id,created_at)) cover none of it.
--    2 rows.
--
-- Column provenance (all three migration-tracked, safe for a fresh CI shadow
-- replay with no column-existence guard needed):
--   timeline_event_id and coach_id: added by 20260711180000_baseball_
--     postgame_shape_reconcile.sql via ADD COLUMN IF NOT EXISTS.
--   actor_coach_id: declared in the ORIGINAL CREATE TABLE IF NOT EXISTS
--     (20260624000090_baseball_settings_os.sql) AND redundantly reconciled
--     via ADD COLUMN IF NOT EXISTS in 20260710020000_baseball_settings_
--     audit_log_column_reconcile.sql — guaranteed present on every replay
--     path (fresh CREATE, or prod's pre-existing drifted table).
--
-- Plain CREATE INDEX IF NOT EXISTS (no CONCURRENTLY): matches
-- 20260710004200's precedent for this exact change class; CONCURRENTLY
-- cannot run inside a transaction-wrapped migration apply and these tables
-- are 2-9 rows, so it buys nothing.
--
-- BASEBALL-ONLY. NOT applied to any database by this agent — migration file
-- only, for the lead to review and apply.

CREATE INDEX IF NOT EXISTS baseball_postgame_review_items_timeline_event_id_idx
  ON public.baseball_postgame_review_items (timeline_event_id);

CREATE INDEX IF NOT EXISTS baseball_postgame_reviews_coach_id_idx
  ON public.baseball_postgame_reviews (coach_id);

CREATE INDEX IF NOT EXISTS baseball_settings_audit_log_actor_coach_id_idx
  ON public.baseball_settings_audit_log (actor_coach_id);
