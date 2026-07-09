-- =============================================================================
-- helm_lifting_sessions — DB-level dedupe for NULL-program sessions
-- Migration: 20260709000000_helm_lifting_sessions_null_program_dedupe.sql
--
-- src/app/baseball/actions/signals.ts (lift_modification conversion) writes
-- one-off helm_lifting_sessions rows NOT born of a program publish
-- (program_assignment_id IS NULL), guarded by an app-code check-then-insert
-- dedupe on (athlete_id, scheduled_date, title). The existing
-- uq_helm_lifting_session UNIQUE (program_assignment_id, athlete_id)
-- constraint (20260625000020) does NOT protect these rows: Postgres never
-- considers NULL = NULL for uniqueness purposes, so two concurrent
-- conversions can both pass the app-level check and insert duplicate rows.
--
-- Adds a partial unique index scoped to program_assignment_id IS NULL only —
-- publish-born sessions (which always have a program_assignment_id) are
-- untouched, so this cannot collide with the existing constraint or any
-- legitimate multi-session-per-day publish flow.
--
-- GOLF-SAFETY: purely additive index; ZERO ALTER/DROP of any golf_* or other
-- baseball_* object; helm_lifting_sessions already serves both sports and
-- this index applies identically (and safely) to golf rows.
-- =============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS helm_lifting_sessions_null_program_dedupe_uq
  ON public.helm_lifting_sessions (athlete_id, scheduled_date, title)
  WHERE program_assignment_id IS NULL;
