-- =============================================================================
-- golf_recruits — coach-managed prospect records for the Recruiting HQ tab.
--
-- These are NOT users in auth.users. They're free-form prospect rows owned by
-- a coach so they can track high-school golfers through the funnel from
-- "Watched" -> "Recruiting" -> "Offered" -> "Committed" without forcing the
-- prospect to sign up first.
--
-- RLS: limited to the team's coach staff (no player visibility).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.golf_recruits (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id      uuid NOT NULL REFERENCES public.golf_teams(id) ON DELETE CASCADE,
  created_by   uuid REFERENCES public.golf_coaches(id) ON DELETE SET NULL,
  first_name   text NOT NULL,
  last_name    text,
  hs_class     integer, -- graduation year, e.g. 2027
  email        text,
  phone        text,
  hometown     text,
  state        text,    -- US state abbrev, kept separate from hometown for sort/filter
  notes        text,
  status       text NOT NULL DEFAULT 'recruiting'
                CHECK (status IN ('recruiting','watched','offered','committed')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_golf_recruits_team_status
  ON public.golf_recruits (team_id, status);
CREATE INDEX IF NOT EXISTS idx_golf_recruits_team_class
  ON public.golf_recruits (team_id, hs_class);

ALTER TABLE public.golf_recruits ENABLE ROW LEVEL SECURITY;

CREATE POLICY golf_recruits_select_coach
  ON public.golf_recruits FOR SELECT
  USING (public.is_golf_team_coach(team_id));

CREATE POLICY golf_recruits_insert_coach
  ON public.golf_recruits FOR INSERT
  WITH CHECK (public.is_golf_team_coach(team_id));

CREATE POLICY golf_recruits_update_coach
  ON public.golf_recruits FOR UPDATE
  USING (public.is_golf_team_coach(team_id))
  WITH CHECK (public.is_golf_team_coach(team_id));

CREATE POLICY golf_recruits_delete_coach
  ON public.golf_recruits FOR DELETE
  USING (public.is_golf_team_coach(team_id));
