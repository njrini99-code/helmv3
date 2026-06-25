-- =============================================================================
-- 20260624000310_baseball_decision_log.sql
--
-- DEEPEN: Decision Ledger / Staff Decision Room (V10 Packet 10 "Decision Ledger"
-- + V5 System 5 "Staff Meeting Prep" — agenda / players to discuss / unresolved
-- signals / decisions needed). The Decision Room was a read-only insight list
-- whose only "ledger" was staff-invite events. This migration adds:
--
--   1. baseball_decision_log — a REAL ledger of decisions MADE in the room:
--      a signal/meeting-item was discussed, resolved, or converted to a
--      task/note. Each entry is source-linked (subject_table + subject_id) and
--      carries the originating signal's provenance forward, so the ledger reads
--      as "what did staff decide, why, and from what evidence" — not "who got
--      invited".
--
--   2. baseball_meeting_items.discussed_at / discussed_by — the "mark discussed"
--      transition (open -> discussed) the V10 action bar requires, captured as
--      first-class columns (the table already had status + resolution/resolved_*).
--
-- GUARDRAILS: additive only (CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT
-- EXISTS). RLS staff-only (the Decision Room is coach-only). Anon revoked.
-- NON-DESTRUCTIVE: append-only ledger; no delete-then-reinsert. NOT applied to
-- any database by this agent — migration file only.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. baseball_meeting_items: the "mark discussed" transition columns.
--    (status already supports 'discussed'; capture WHO/WHEN explicitly so the
--    ledger + meeting mode can show "discussed by Coach X, 2h ago".)
-- -----------------------------------------------------------------------------
ALTER TABLE public.baseball_meeting_items
  ADD COLUMN IF NOT EXISTS discussed_at timestamptz;
ALTER TABLE public.baseball_meeting_items
  ADD COLUMN IF NOT EXISTS discussed_by uuid;

-- -----------------------------------------------------------------------------
-- 2. baseball_decision_log — append-only record of decisions made in the room.
--
-- decision_kind:
--   'discussed'        — staff reviewed the item, no further action yet
--   'resolved'         — item closed with a resolution note
--   'converted_task'   — converted to a player_task action
--   'converted_note'   — converted to a player_note action
--   'converted_practice' — converted to a practice_block action
--   'raised'           — an open signal was raised onto the agenda
--   'reopened'         — a resolved item was reopened
--   'note'             — a free-form staff decision note
--
-- subject_table/subject_id point at the thing the decision is ABOUT
-- (baseball_meeting_items or baseball_signals). source_refs carries provenance
-- forward so the ledger entry is itself source-backed.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.baseball_decision_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id         uuid NOT NULL REFERENCES public.baseball_teams(id) ON DELETE CASCADE,
  decision_kind   text NOT NULL
                    CHECK (decision_kind IN (
                      'discussed','resolved','converted_task','converted_note',
                      'converted_practice','raised','reopened','note'
                    )),
  title           text NOT NULL,
  detail          text,
  -- What the decision is about (round-trip link).
  subject_table   text,
  subject_id      uuid,
  -- Originating signal (if any) so the ledger threads back to the evidence.
  source_signal_id uuid REFERENCES public.baseball_signals(id) ON DELETE SET NULL,
  -- Action created by a conversion decision (if any).
  action_id       uuid REFERENCES public.baseball_actions(id) ON DELETE SET NULL,
  player_id       uuid REFERENCES public.baseball_players(id) ON DELETE SET NULL,
  source_refs     jsonb NOT NULL DEFAULT '[]'::jsonb,
  decided_by      uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Backfill-safe additive columns (in case the table predates this revision).
ALTER TABLE public.baseball_decision_log ADD COLUMN IF NOT EXISTS subject_table    text;
ALTER TABLE public.baseball_decision_log ADD COLUMN IF NOT EXISTS subject_id       uuid;
ALTER TABLE public.baseball_decision_log ADD COLUMN IF NOT EXISTS source_signal_id uuid;
ALTER TABLE public.baseball_decision_log ADD COLUMN IF NOT EXISTS action_id        uuid;
ALTER TABLE public.baseball_decision_log ADD COLUMN IF NOT EXISTS player_id        uuid;
ALTER TABLE public.baseball_decision_log ADD COLUMN IF NOT EXISTS source_refs      jsonb DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS baseball_decision_log_team_created_idx
  ON public.baseball_decision_log (team_id, created_at DESC);
CREATE INDEX IF NOT EXISTS baseball_decision_log_subject_idx
  ON public.baseball_decision_log (subject_table, subject_id);
CREATE INDEX IF NOT EXISTS baseball_decision_log_signal_idx
  ON public.baseball_decision_log (source_signal_id);

-- -----------------------------------------------------------------------------
-- 3. RLS — STAFF ONLY (the Decision Room is coach-only; players never read it).
-- -----------------------------------------------------------------------------
ALTER TABLE public.baseball_decision_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "baseball_decision_log_select" ON public.baseball_decision_log;
CREATE POLICY "baseball_decision_log_select" ON public.baseball_decision_log
  FOR SELECT TO authenticated
  USING (public.is_baseball_team_staff(team_id));

DROP POLICY IF EXISTS "baseball_decision_log_insert" ON public.baseball_decision_log;
CREATE POLICY "baseball_decision_log_insert" ON public.baseball_decision_log
  FOR INSERT TO authenticated
  WITH CHECK (public.is_baseball_team_staff(team_id));

-- Append-only: no UPDATE policy. Only the primary coach may prune history.
DROP POLICY IF EXISTS "baseball_decision_log_delete" ON public.baseball_decision_log;
CREATE POLICY "baseball_decision_log_delete" ON public.baseball_decision_log
  FOR DELETE TO authenticated
  USING (public.is_baseball_primary_coach(team_id));

-- -----------------------------------------------------------------------------
-- 4. Lock down anon (public-schema default privileges grant anon otherwise).
-- -----------------------------------------------------------------------------
REVOKE ALL ON public.baseball_decision_log FROM anon;
GRANT SELECT, INSERT, DELETE ON public.baseball_decision_log TO authenticated;
GRANT ALL ON public.baseball_decision_log TO service_role;

-- =============================================================================
-- END — Decision Ledger. ADDITIVE. NOT applied to any DB by this agent.
-- =============================================================================
