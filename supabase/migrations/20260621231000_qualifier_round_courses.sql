-- =============================================================================
-- Feature G · Qualifiers — per-round course assignment
-- -----------------------------------------------------------------------------
-- A qualifier can now span multiple rounds, and the coach assigns a golf course
-- to EACH round. This migration adds:
--   1. golf_qualifiers.num_rounds            — how many rounds the qualifier runs.
--   2. golf_qualifier_round_courses          — the per-round course assignment,
--      one row per (qualifier, round_number).
--
-- The qualifier's team_id lives on golf_qualifiers, so every policy on the child
-- table scopes through the parent — EXACTLY mirroring the existing
-- golf_qualifier_entries policies (copied verbatim):
--   SELECT → team members (coach OR active player) of the qualifier's team
--   ALL    → coaches of the qualifier's team
-- via the SECURITY DEFINER helpers public.is_golf_team_coach(team_uuid) and
-- public.is_golf_team_player(team_uuid) (is_golf_team_player checks
-- golf_team_members.status = 'active' internally).
--
-- Idempotent: ADD COLUMN IF NOT EXISTS / CREATE TABLE IF NOT EXISTS / policy
-- guards wrapped in DO blocks. NOT yet applied — server actions type the new
-- table via fromUntyped / local casts until generated types catch up.
-- =============================================================================

-- 1 · How many rounds the qualifier runs (defaults to the legacy single round).
ALTER TABLE public.golf_qualifiers
  ADD COLUMN IF NOT EXISTS num_rounds int NOT NULL DEFAULT 1;

-- 2 · Per-round course assignment.
CREATE TABLE IF NOT EXISTS public.golf_qualifier_round_courses (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  qualifier_id  uuid        NOT NULL REFERENCES public.golf_qualifiers(id) ON DELETE CASCADE,
  round_number  int         NOT NULL,
  course_id     uuid        REFERENCES public.golf_courses(id),
  course_name   text,
  tee_id        uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (qualifier_id, round_number)
);

COMMENT ON TABLE public.golf_qualifier_round_courses IS
  'Feature G: the course (and optional tee) a coach assigns to each round of a '
  'multi-round qualifier. One row per (qualifier_id, round_number). Team-scoped '
  'through golf_qualifiers.team_id — same predicate as golf_qualifier_entries.';

-- Speed the by-qualifier lookups (the read path always filters on qualifier_id).
CREATE INDEX IF NOT EXISTS idx_golf_qualifier_round_courses_qualifier_id
  ON public.golf_qualifier_round_courses (qualifier_id);

-- ── Grants — least privilege. anon gets nothing; authenticated reads (RLS still
--    gates rows); service_role does everything (bypasses RLS anyway). ──────────
REVOKE ALL ON public.golf_qualifier_round_courses FROM anon, public;
GRANT SELECT ON public.golf_qualifier_round_courses TO authenticated;
GRANT ALL    ON public.golf_qualifier_round_courses TO service_role;

-- ── RLS — scope through the parent qualifier's team (copied verbatim from the
--    golf_qualifier_entries policies). ─────────────────────────────────────────
ALTER TABLE public.golf_qualifier_round_courses ENABLE ROW LEVEL SECURITY;

-- SELECT: any team member (coach OR active player) of the qualifier's team.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'golf_qualifier_round_courses'
      AND policyname = 'golf_qualifier_round_courses_select_team'
  ) THEN
    CREATE POLICY "golf_qualifier_round_courses_select_team"
      ON public.golf_qualifier_round_courses
      FOR SELECT
      USING (EXISTS (
        SELECT 1
        FROM public.golf_qualifiers q
        WHERE q.id = golf_qualifier_round_courses.qualifier_id
          AND (public.is_golf_team_coach(q.team_id) OR public.is_golf_team_player(q.team_id))
      ));
  END IF;
END $$;

-- INSERT: coaches of the qualifier's team only.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'golf_qualifier_round_courses'
      AND policyname = 'golf_qualifier_round_courses_insert_coach'
  ) THEN
    CREATE POLICY "golf_qualifier_round_courses_insert_coach"
      ON public.golf_qualifier_round_courses
      FOR INSERT
      WITH CHECK (EXISTS (
        SELECT 1
        FROM public.golf_qualifiers q
        WHERE q.id = golf_qualifier_round_courses.qualifier_id
          AND public.is_golf_team_coach(q.team_id)
      ));
  END IF;
END $$;

-- UPDATE: coaches of the qualifier's team only.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'golf_qualifier_round_courses'
      AND policyname = 'golf_qualifier_round_courses_update_coach'
  ) THEN
    CREATE POLICY "golf_qualifier_round_courses_update_coach"
      ON public.golf_qualifier_round_courses
      FOR UPDATE
      USING (EXISTS (
        SELECT 1
        FROM public.golf_qualifiers q
        WHERE q.id = golf_qualifier_round_courses.qualifier_id
          AND public.is_golf_team_coach(q.team_id)
      ));
  END IF;
END $$;

-- DELETE: coaches of the qualifier's team only.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'golf_qualifier_round_courses'
      AND policyname = 'golf_qualifier_round_courses_delete_coach'
  ) THEN
    CREATE POLICY "golf_qualifier_round_courses_delete_coach"
      ON public.golf_qualifier_round_courses
      FOR DELETE
      USING (EXISTS (
        SELECT 1
        FROM public.golf_qualifiers q
        WHERE q.id = golf_qualifier_round_courses.qualifier_id
          AND public.is_golf_team_coach(q.team_id)
      ));
  END IF;
END $$;
