-- =============================================================================
-- BaseballHelm — Scoped Staff Notes (baseball_coach_notes)
-- =============================================================================
-- v7 Player Profile Snapshot System §"Staff Notes" — a player note carries a
-- VISIBILITY SCOPE so the same profile surface can hold a public-to-staff
-- observation, a private coach-group note, a strength-only or academic-only note,
-- a player-VISIBLE coaching point, or a hidden-from-player sensitive note — and
-- AI may only ever summarize notes within the viewer's visibility boundary.
--
-- The player/[id] profile previously hardcoded `const notes = []` ("table
-- doesn't exist yet"); this migration is that table, with RLS that ENFORCES the
-- 6 scopes (not just labels the UI hides).
--
-- WHY A NEW TABLE (not baseball_player_timeline_events):
--   The timeline is an APPEND-ONLY history (3 visibility values, no edit/delete).
--   A staff note is a living, EDITABLE, SOFT-DELETABLE record with a finer 6-way
--   scope. They are distinct concepts. Writing a note STILL appends a 'note'
--   timeline event (source -> signal -> action -> timeline loop) via the
--   timeline-writer; the note row is the editable source of record.
--
-- SCOPE -> WHO CAN READ (enforced in the SELECT policy below):
--   staff_public        any staff on the team
--   coach_group         staff holding can_view_private_notes (or head/primary)
--   strength            staff holding can_manage_lifting   (or head/primary)
--   academic            staff holding can_view_academics   (or head/primary)
--   player_visible      ALL staff + the SUBJECT player themselves
--   hidden_from_player  staff holding can_view_private_notes (or head/primary);
--                       NEVER the player (the strictest scope)
--
-- Head/primary coaches hold every capability (mirrors the app capability
-- resolver: is_head_coach / is_primary => full authority).
--
-- GUARANTEES:
--   * Idempotent / additive only: CREATE ... IF NOT EXISTS, ADD COLUMN IF NOT
--     EXISTS, CREATE INDEX IF NOT EXISTS, DROP POLICY IF EXISTS + CREATE.
--   * No DROP TABLE / DROP COLUMN, no destructive UPDATE/DELETE, no renames.
--   * SOFT DELETE only (deleted_at), never a hard row delete in the app path.
--   * RLS ENABLED with explicit, scope-aware policies. REVOKE ALL FROM anon.
-- =============================================================================

-- ── Scope enum ───────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'baseball_note_scope') THEN
    CREATE TYPE baseball_note_scope AS ENUM (
      'staff_public',
      'coach_group',
      'strength',
      'academic',
      'player_visible',
      'hidden_from_player'
    );
  END IF;
END $$;

-- ── Capability probe helper ──────────────────────────────────────────────────
-- True when the current auth user is staff on p_team_id AND (is head/primary OR
-- holds the named boolean capability column). SECURITY DEFINER so the policy can
-- read baseball_team_coach_staff without recursing through its own RLS. Defaults
-- to FALSE on any error (fail-closed). Mirrors the app capability resolver:
-- head/primary => full authority; otherwise the dedicated can_* column governs.
CREATE OR REPLACE FUNCTION public.baseball_staff_has_note_capability(
  p_team_id uuid,
  p_capability text
) RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_coach_id uuid;
  v_is_full  boolean := false;
  v_has_cap  boolean := false;
  v_status   text;
BEGIN
  SELECT id INTO v_coach_id
  FROM baseball_coaches
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_coach_id IS NULL THEN
    RETURN false;
  END IF;

  -- Resolve full-authority + the requested capability from the staff row.
  -- to_jsonb(tcs.*) lets us probe optionally-present columns tolerantly (some
  -- columns are added by later additive migrations).
  SELECT
    coalesce((row_data ->> 'is_head_coach')::boolean, false)
      OR coalesce((row_data ->> 'is_primary')::boolean, false),
    coalesce((row_data ->> p_capability)::boolean, false),
    row_data ->> 'status'
  INTO v_is_full, v_has_cap, v_status
  FROM (
    SELECT to_jsonb(tcs.*) AS row_data
    FROM baseball_team_coach_staff tcs
    WHERE tcs.team_id = p_team_id
      AND tcs.coach_id = v_coach_id
    LIMIT 1
  ) s;

  -- Not staff on this team.
  IF v_is_full IS NULL AND v_has_cap IS NULL THEN
    RETURN false;
  END IF;

  -- Suspended/removed/invited staff hold no capabilities.
  IF v_status IN ('suspended', 'removed', 'invited') THEN
    RETURN false;
  END IF;

  RETURN coalesce(v_is_full, false) OR coalesce(v_has_cap, false);
EXCEPTION WHEN OTHERS THEN
  RETURN false;  -- fail-closed
END;
$$;

REVOKE ALL ON FUNCTION public.baseball_staff_has_note_capability(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.baseball_staff_has_note_capability(uuid, text) TO authenticated;

-- ── Table ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS baseball_coach_notes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id       uuid NOT NULL REFERENCES baseball_players(id) ON DELETE CASCADE,
  team_id         uuid NOT NULL REFERENCES baseball_teams(id)   ON DELETE CASCADE,
  author_coach_id uuid REFERENCES baseball_coaches(id) ON DELETE SET NULL,
  body            text NOT NULL,
  scope           baseball_note_scope NOT NULL DEFAULT 'staff_public',
  -- Soft delete + non-destructive edit audit (the row is never hard-deleted by
  -- the app; editing updates body + edited_at and never discards prior history).
  edited_at       timestamptz,
  deleted_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Additive guards for partial/earlier versions of the table.
ALTER TABLE baseball_coach_notes ADD COLUMN IF NOT EXISTS author_coach_id uuid;
ALTER TABLE baseball_coach_notes ADD COLUMN IF NOT EXISTS scope baseball_note_scope NOT NULL DEFAULT 'staff_public';
ALTER TABLE baseball_coach_notes ADD COLUMN IF NOT EXISTS edited_at timestamptz;
ALTER TABLE baseball_coach_notes ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE baseball_coach_notes ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_baseball_coach_notes_player_team
  ON baseball_coach_notes (player_id, team_id);
CREATE INDEX IF NOT EXISTS idx_baseball_coach_notes_team_created
  ON baseball_coach_notes (team_id, created_at DESC);
-- Live (not soft-deleted) notes are the common read.
CREATE INDEX IF NOT EXISTS idx_baseball_coach_notes_live
  ON baseball_coach_notes (player_id, team_id, created_at DESC)
  WHERE deleted_at IS NULL;

ALTER TABLE baseball_coach_notes ENABLE ROW LEVEL SECURITY;

-- ── SELECT: scope-aware visibility ───────────────────────────────────────────
-- A row is visible when the viewer is allowed by its scope. The subject PLAYER
-- can ONLY ever read 'player_visible' rows for THEMSELVES; every other scope is
-- staff-gated. Soft-deleted rows are filtered in the app read path (kept here for
-- audit/history reads), so the policy does not hide deleted_at rows by itself.
DROP POLICY IF EXISTS "baseball_coach_notes_select" ON baseball_coach_notes;
CREATE POLICY "baseball_coach_notes_select"
  ON baseball_coach_notes FOR SELECT
  USING (
    -- Subject player sees ONLY their own player_visible notes.
    (
      scope = 'player_visible'
      AND player_id = (
        SELECT id FROM baseball_players WHERE user_id = auth.uid() LIMIT 1
      )
    )
    -- Staff visibility, gated per scope.
    OR (
      is_baseball_team_coach_v2(team_id)
      AND CASE scope
        WHEN 'staff_public'       THEN true
        WHEN 'player_visible'     THEN true
        WHEN 'coach_group'        THEN baseball_staff_has_note_capability(team_id, 'can_view_private_notes')
        WHEN 'hidden_from_player' THEN baseball_staff_has_note_capability(team_id, 'can_view_private_notes')
        WHEN 'strength'           THEN baseball_staff_has_note_capability(team_id, 'can_manage_lifting')
        WHEN 'academic'           THEN baseball_staff_has_note_capability(team_id, 'can_view_academics')
        ELSE false
      END
    )
  );

-- ── INSERT: any staff on the team may author a note ──────────────────────────
-- The author must be a coach on the team; the author_coach_id (when set) must be
-- the writer's own coach id. Scope is validated/normalized in the server action;
-- RLS guarantees only team staff can write at all.
DROP POLICY IF EXISTS "baseball_coach_notes_insert" ON baseball_coach_notes;
CREATE POLICY "baseball_coach_notes_insert"
  ON baseball_coach_notes FOR INSERT
  WITH CHECK (
    is_baseball_team_coach_v2(team_id)
    AND (
      author_coach_id IS NULL
      OR author_coach_id = (
        SELECT id FROM baseball_coaches WHERE user_id = auth.uid() LIMIT 1
      )
    )
  );

-- ── UPDATE: the author edits/soft-deletes their own note; head/primary may too ─
-- Non-destructive: edit changes body/scope/edited_at; soft-delete sets
-- deleted_at. No hard delete policy exists by design.
DROP POLICY IF EXISTS "baseball_coach_notes_update" ON baseball_coach_notes;
CREATE POLICY "baseball_coach_notes_update"
  ON baseball_coach_notes FOR UPDATE
  USING (
    is_baseball_team_coach_v2(team_id)
    AND (
      author_coach_id = (
        SELECT id FROM baseball_coaches WHERE user_id = auth.uid() LIMIT 1
      )
      OR baseball_staff_has_note_capability(team_id, 'is_head_coach')
    )
  )
  WITH CHECK (
    is_baseball_team_coach_v2(team_id)
  );

-- No DELETE policy: notes are soft-deleted (deleted_at) only. A hard row delete
-- is impossible for any non-service role.

-- No anon access. RLS is the boundary; belt-and-suspenders REVOKE.
REVOKE ALL ON baseball_coach_notes FROM anon;

COMMENT ON TABLE baseball_coach_notes IS
  'Scoped staff notes on a baseball player (v7 Staff Notes). scope enum gates visibility per RLS: staff_public/coach_group/strength/academic/player_visible/hidden_from_player. Soft-delete via deleted_at; non-destructive edit via edited_at. AI summary ingests ONLY rows the viewer can see.';
COMMENT ON COLUMN baseball_coach_notes.scope IS
  'Visibility boundary. player_visible is the ONLY scope the subject player can read; hidden_from_player is the strictest (private-notes capability, never the player).';
