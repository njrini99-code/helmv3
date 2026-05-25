-- W29-pt1 / Migration B: golf_qualifier_selections table + RLS.
--
-- One purpose: persist the per-player picks coaches make once a qualifier
-- enters the 'closed' state. selection_type distinguishes auto-locked
-- top-N positions ('top_score') from coach discretionary picks
-- ('coach_pick'). coach_reasoning captures the why for coach picks
-- (UX prompts for it; nullable on top_score rows).
--
-- RLS pattern: team-scoped via parent qualifier. Coaches can write,
-- players can read (the final selected roster IS visible to the team
-- once selection_state = 'selected' — surfaced by the chat travel-brief
-- push in W29-pt2's auto-brief trigger).
--
-- VERIFIED 2026-05-25 against prod project qmnssrrolpinvwjjnufo:
--   SELECT to_regclass('public.golf_qualifier_selections')::text;
--   -> null (safe to create)
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS public.golf_qualifier_selections;

CREATE TABLE IF NOT EXISTS public.golf_qualifier_selections (
  qualifier_id        uuid        NOT NULL REFERENCES public.golf_qualifiers(id) ON DELETE CASCADE,
  player_id           uuid        NOT NULL REFERENCES public.golf_players(id)    ON DELETE CASCADE,
  selection_type      text        NOT NULL,
  coach_reasoning     text,
  selected_at         timestamptz NOT NULL DEFAULT now(),
  selected_by_user_id uuid        NOT NULL REFERENCES public.users(id),

  PRIMARY KEY (qualifier_id, player_id),
  CONSTRAINT golf_qualifier_selections_type_check
    CHECK (selection_type IN ('top_score','coach_pick'))
);

COMMENT ON TABLE public.golf_qualifier_selections IS
  'v3 W29 per-player picks for a qualifier. selection_type=top_score is auto-locked from top-N position; coach_pick is discretionary (coach_reasoning expected).';

CREATE INDEX IF NOT EXISTS golf_qualifier_selections_player_idx
  ON public.golf_qualifier_selections(player_id);

ALTER TABLE public.golf_qualifier_selections ENABLE ROW LEVEL SECURITY;

-- Coaches of the qualifier's team can read + write picks.
DROP POLICY IF EXISTS qualifier_selections_coach_write
  ON public.golf_qualifier_selections;
CREATE POLICY qualifier_selections_coach_write
  ON public.golf_qualifier_selections
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.golf_qualifiers q
      WHERE q.id = golf_qualifier_selections.qualifier_id
        AND public.is_team_coach(q.team_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.golf_qualifiers q
      WHERE q.id = golf_qualifier_selections.qualifier_id
        AND public.is_team_coach(q.team_id)
    )
  );

-- Players on the qualifier's team can read final picks once selected.
-- (Reveals the roster after coach commits, not during deliberation.)
DROP POLICY IF EXISTS qualifier_selections_player_read
  ON public.golf_qualifier_selections;
CREATE POLICY qualifier_selections_player_read
  ON public.golf_qualifier_selections
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.golf_qualifiers q
      WHERE q.id = golf_qualifier_selections.qualifier_id
        AND q.selection_state = 'selected'
        AND public.is_team_player(q.team_id)
    )
  );
