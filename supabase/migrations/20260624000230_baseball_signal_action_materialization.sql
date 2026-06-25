-- =============================================================================
-- BaseballHelm — Action Conversion materialization targets
-- =============================================================================
-- Packet: signal-inbox / decision-room (CoachHelm engine wave).
--
-- WHY THIS MIGRATION EXISTS
--   V9 "Cross-Subsystem Data/Signal/Action Map" + V10 Packet 10 ("Staff action
--   queue replaces vague meeting output") require that converting a signal into
--   an action ACTUALLY CREATES THE OBJECT in the target subsystem — not just an
--   orphan ledger row. Before this, convertSignalToAction only inserted a generic
--   baseball_actions row regardless of action_type:
--     * practice_block      -> never wrote a practice planner block
--     * meeting_item        -> never read by the Decision Room
--     * player_note         -> no table to write to
--   This migration adds the two MISSING target subsystems so the dispatch in
--   signals.ts can materialize every action_type into a real domain object:
--
--     baseball_meeting_items       — the Decision Room agenda backlog. A
--       'meeting_item' conversion creates a real agenda row here; the Decision
--       Room reads it (V5 System 5: "unresolved signals become agenda items").
--
--     baseball_coach_player_notes  — staff-authored notes ON a player. A
--       'player_note' conversion writes a real note row (V9 "Player profile
--       note" target: player_id, note, visibility, source signal, staff author).
--
--   practice_block reuses the EXISTING baseball_practice_blocks (with its 0200
--   source_reason / source_insight_id columns) and lift_modification reuses the
--   EXISTING baseball_lift_assignments — no new tables for those.
--
-- ROUND-TRIP
--   Each materialized object stores the originating signal id (source_signal_id),
--   and the action row stores the created object's table+id (target_table /
--   target_id, already present on baseball_actions) so each subsystem can surface
--   "created from signal X" and the action ledger links forward to its object.
--
-- GUARANTEES
--   * Additive only: CREATE TABLE IF NOT EXISTS, ADD COLUMN IF NOT EXISTS,
--     CREATE INDEX IF NOT EXISTS, DROP POLICY IF EXISTS + CREATE. No DROP TABLE,
--     no destructive UPDATE/DELETE, no renames.
--   * RLS ENABLED on both new tables; anon REVOKEd explicitly (default-privilege
--     gotcha). Reuses existing SECURITY DEFINER helpers from 20260624000050.
--   * NOT applied to any database. Hand-written TS types live in
--     src/lib/types/baseball-signals.ts (shared prod DB — we cannot db:types
--     regen).
-- =============================================================================

-- =============================================================================
-- 1. baseball_meeting_items — Decision Room agenda backlog
-- =============================================================================
-- A staff-only, source-backed agenda item. A 'meeting_item' conversion creates
-- one of these AND links it to the source signal + the tracking action. The
-- Decision Room renders OPEN meeting items as the staff action queue.
--
-- status lifecycle: 'open' -> 'discussed' -> 'resolved' (or 'archived')
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.baseball_meeting_items (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id            uuid NOT NULL REFERENCES public.baseball_teams(id) ON DELETE CASCADE,
  -- The signal this agenda item was raised from (the source -> agenda edge).
  source_signal_id   uuid REFERENCES public.baseball_signals(id) ON DELETE SET NULL,
  -- The tracking action this item materialized from (round-trip back to ledger).
  source_action_id   uuid REFERENCES public.baseball_actions(id) ON DELETE SET NULL,
  -- Optional affected player (V9 "affected players" — single subject for now).
  player_id          uuid REFERENCES public.baseball_players(id) ON DELETE SET NULL,
  title              text NOT NULL,
  detail             text,
  -- Provenance carried from the signal so the agenda item is itself source-backed.
  source_refs        jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Who owns driving the item to a decision.
  owner_coach_id     uuid REFERENCES public.baseball_coaches(id) ON DELETE SET NULL,
  status             text NOT NULL DEFAULT 'open'
                       CHECK (status IN ('open','discussed','resolved','archived')),
  -- The decision recorded when the item is resolved (V10 Decision Ledger).
  resolution         text,
  resolved_at        timestamptz,
  resolved_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.baseball_meeting_items ADD COLUMN IF NOT EXISTS source_signal_id uuid;
ALTER TABLE public.baseball_meeting_items ADD COLUMN IF NOT EXISTS source_action_id uuid;
ALTER TABLE public.baseball_meeting_items ADD COLUMN IF NOT EXISTS player_id        uuid;
ALTER TABLE public.baseball_meeting_items ADD COLUMN IF NOT EXISTS title            text;
ALTER TABLE public.baseball_meeting_items ADD COLUMN IF NOT EXISTS detail           text;
ALTER TABLE public.baseball_meeting_items ADD COLUMN IF NOT EXISTS source_refs      jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.baseball_meeting_items ADD COLUMN IF NOT EXISTS owner_coach_id   uuid;
ALTER TABLE public.baseball_meeting_items ADD COLUMN IF NOT EXISTS status           text;
ALTER TABLE public.baseball_meeting_items ADD COLUMN IF NOT EXISTS resolution       text;
ALTER TABLE public.baseball_meeting_items ADD COLUMN IF NOT EXISTS resolved_at      timestamptz;
ALTER TABLE public.baseball_meeting_items ADD COLUMN IF NOT EXISTS resolved_by      uuid;
ALTER TABLE public.baseball_meeting_items ADD COLUMN IF NOT EXISTS created_by       uuid;
ALTER TABLE public.baseball_meeting_items ADD COLUMN IF NOT EXISTS created_at       timestamptz DEFAULT now();
ALTER TABLE public.baseball_meeting_items ADD COLUMN IF NOT EXISTS updated_at       timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS baseball_meeting_items_team_status_idx
  ON public.baseball_meeting_items (team_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS baseball_meeting_items_signal_idx
  ON public.baseball_meeting_items (source_signal_id);
CREATE INDEX IF NOT EXISTS baseball_meeting_items_action_idx
  ON public.baseball_meeting_items (source_action_id);

-- =============================================================================
-- 2. baseball_coach_player_notes — staff notes ON a player
-- =============================================================================
-- A 'player_note' conversion writes a row here (V9 "Player profile note"). The
-- note can be staff_only (default) or player-visible; player-visible notes are
-- the only ones a player may read.
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.baseball_coach_player_notes (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id            uuid NOT NULL REFERENCES public.baseball_teams(id) ON DELETE CASCADE,
  player_id          uuid NOT NULL REFERENCES public.baseball_players(id) ON DELETE CASCADE,
  -- The signal this note was raised from (source -> note edge).
  source_signal_id   uuid REFERENCES public.baseball_signals(id) ON DELETE SET NULL,
  source_action_id   uuid REFERENCES public.baseball_actions(id) ON DELETE SET NULL,
  title              text,
  body               text NOT NULL,
  source_refs        jsonb NOT NULL DEFAULT '[]'::jsonb,
  visibility         text NOT NULL DEFAULT 'staff_only'
                       CHECK (visibility IN ('team','player_only','staff_only')),
  author_coach_id    uuid REFERENCES public.baseball_coaches(id) ON DELETE SET NULL,
  created_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.baseball_coach_player_notes ADD COLUMN IF NOT EXISTS source_signal_id uuid;
ALTER TABLE public.baseball_coach_player_notes ADD COLUMN IF NOT EXISTS source_action_id uuid;
ALTER TABLE public.baseball_coach_player_notes ADD COLUMN IF NOT EXISTS title            text;
ALTER TABLE public.baseball_coach_player_notes ADD COLUMN IF NOT EXISTS body             text;
ALTER TABLE public.baseball_coach_player_notes ADD COLUMN IF NOT EXISTS source_refs      jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.baseball_coach_player_notes ADD COLUMN IF NOT EXISTS visibility       text;
ALTER TABLE public.baseball_coach_player_notes ADD COLUMN IF NOT EXISTS author_coach_id  uuid;
ALTER TABLE public.baseball_coach_player_notes ADD COLUMN IF NOT EXISTS created_by       uuid;
ALTER TABLE public.baseball_coach_player_notes ADD COLUMN IF NOT EXISTS created_at       timestamptz DEFAULT now();
ALTER TABLE public.baseball_coach_player_notes ADD COLUMN IF NOT EXISTS updated_at       timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS baseball_coach_player_notes_team_player_idx
  ON public.baseball_coach_player_notes (team_id, player_id, created_at DESC);
CREATE INDEX IF NOT EXISTS baseball_coach_player_notes_signal_idx
  ON public.baseball_coach_player_notes (source_signal_id);

-- =============================================================================
-- 3. Practice + lift round-trip columns
-- =============================================================================
-- baseball_practice_blocks already carries source_reason + source_insight_id
-- (migration 0200). Add source_signal_id so a block converted from a SIGNAL
-- (not an insight) round-trips to the originating signal too.
ALTER TABLE public.baseball_practice_blocks
  ADD COLUMN IF NOT EXISTS source_signal_id uuid;
CREATE INDEX IF NOT EXISTS baseball_practice_blocks_source_signal_idx
  ON public.baseball_practice_blocks (source_signal_id);

-- baseball_lift_assignments gets source provenance so a lift_modification
-- conversion round-trips to the originating signal + carries the WHY.
ALTER TABLE public.baseball_lift_assignments
  ADD COLUMN IF NOT EXISTS source_signal_id uuid;
ALTER TABLE public.baseball_lift_assignments
  ADD COLUMN IF NOT EXISTS source_reason text;
CREATE INDEX IF NOT EXISTS baseball_lift_assignments_source_signal_idx
  ON public.baseball_lift_assignments (source_signal_id);

-- baseball_practices gets an 'is_backlog' flag so the team's single
-- "Signal backlog" draft (where converted blocks land before scheduling) can be
-- found + reused instead of cloned on every conversion.
ALTER TABLE public.baseball_practices
  ADD COLUMN IF NOT EXISTS is_backlog boolean NOT NULL DEFAULT false;
-- One backlog practice per team (partial-unique on the flag).
CREATE UNIQUE INDEX IF NOT EXISTS baseball_practices_one_backlog_per_team_uidx
  ON public.baseball_practices (team_id)
  WHERE is_backlog = true;

-- =============================================================================
-- 4. RLS — staff manage; players read only their own player-visible objects
-- =============================================================================
ALTER TABLE public.baseball_meeting_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.baseball_coach_player_notes ENABLE ROW LEVEL SECURITY;

-- ---- baseball_meeting_items: STAFF ONLY (Decision Room is coach-only) --------
DROP POLICY IF EXISTS "baseball_meeting_items_select" ON public.baseball_meeting_items;
CREATE POLICY "baseball_meeting_items_select" ON public.baseball_meeting_items
  FOR SELECT TO authenticated
  USING (public.is_baseball_team_staff(team_id));

DROP POLICY IF EXISTS "baseball_meeting_items_insert" ON public.baseball_meeting_items;
CREATE POLICY "baseball_meeting_items_insert" ON public.baseball_meeting_items
  FOR INSERT TO authenticated
  WITH CHECK (public.is_baseball_team_staff(team_id));

DROP POLICY IF EXISTS "baseball_meeting_items_update" ON public.baseball_meeting_items;
CREATE POLICY "baseball_meeting_items_update" ON public.baseball_meeting_items
  FOR UPDATE TO authenticated
  USING (public.is_baseball_team_staff(team_id))
  WITH CHECK (public.is_baseball_team_staff(team_id));

DROP POLICY IF EXISTS "baseball_meeting_items_delete" ON public.baseball_meeting_items;
CREATE POLICY "baseball_meeting_items_delete" ON public.baseball_meeting_items
  FOR DELETE TO authenticated
  USING (public.is_baseball_primary_coach(team_id));

-- ---- baseball_coach_player_notes: staff manage; player reads own visible -----
DROP POLICY IF EXISTS "baseball_coach_player_notes_select" ON public.baseball_coach_player_notes;
CREATE POLICY "baseball_coach_player_notes_select" ON public.baseball_coach_player_notes
  FOR SELECT TO authenticated
  USING (
    public.is_baseball_team_staff(team_id)
    OR (
      visibility IN ('team','player_only')
      AND player_id IS NOT NULL
      AND player_id = public.get_my_baseball_player_id()
    )
  );

DROP POLICY IF EXISTS "baseball_coach_player_notes_insert" ON public.baseball_coach_player_notes;
CREATE POLICY "baseball_coach_player_notes_insert" ON public.baseball_coach_player_notes
  FOR INSERT TO authenticated
  WITH CHECK (public.is_baseball_team_staff(team_id));

DROP POLICY IF EXISTS "baseball_coach_player_notes_update" ON public.baseball_coach_player_notes;
CREATE POLICY "baseball_coach_player_notes_update" ON public.baseball_coach_player_notes
  FOR UPDATE TO authenticated
  USING (public.is_baseball_team_staff(team_id))
  WITH CHECK (public.is_baseball_team_staff(team_id));

DROP POLICY IF EXISTS "baseball_coach_player_notes_delete" ON public.baseball_coach_player_notes;
CREATE POLICY "baseball_coach_player_notes_delete" ON public.baseball_coach_player_notes
  FOR DELETE TO authenticated
  USING (public.is_baseball_primary_coach(team_id));

-- =============================================================================
-- 5. Lock down anon (RLS-enabled tables still default-grant via public-schema
--    default privileges — revoke anon explicitly).
-- =============================================================================
REVOKE ALL ON public.baseball_meeting_items FROM anon;
REVOKE ALL ON public.baseball_coach_player_notes FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.baseball_meeting_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.baseball_coach_player_notes TO authenticated;
GRANT ALL ON public.baseball_meeting_items TO service_role;
GRANT ALL ON public.baseball_coach_player_notes TO service_role;

-- =============================================================================
-- END — action materialization targets. ADDITIVE. NOT applied to any DB.
-- =============================================================================
