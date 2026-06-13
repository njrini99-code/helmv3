-- ============================================================================
-- Cloud Course Library — PHASE 1: backend foundation (ADDITIVE, non-destructive)
-- ----------------------------------------------------------------------------
-- A "course" = a real facility (Pinehurst No. 2). A course has MANY tee sets
-- (Championship/Blue/White/Women's/custom). Today GolfHelm has golf_courses
-- (global, no tees, no dedup guard) + golf_course_holes (one par/yard per hole,
-- no tee dimension) + golf_player_courses (player-scoped JSON). This phase adds
-- the cloud library spine WITHOUT touching any existing data:
--   • golf_course_tees           — tee-set master per course
--   • golf_course_tee_holes      — per-tee hole pars/yards
--   • golf_team_saved_courses    — a team's pinned/saved courses + default tee
--   • golf_course_edit_history   — append-only audit (who/when/what)
--   • golf_course_tee_edit_history
--   • golf_courses               — additive audit/metadata/normalized columns
--   • golf_rounds.tee_id         — nullable FK (rounds STILL snapshot par/yards
--                                  into golf_holes; tee only feeds the defaults)
--
-- NOT in this phase (deferred to the gated dedup phase, since they touch live
-- data / could fail on existing rows): the normalized-name UNIQUE guard on
-- golf_courses, the course dedup + golf_rounds.course_name backfill, and the
-- golf_player_courses → golf_team_saved_courses migration.
--
-- Edit model (per product decision): OPEN contribution — any authenticated user
-- may add/edit cloud tee data; every write stamps last_edited_by + appends an
-- edit-history row. Team-saved rows are team-scoped (coach-managed, member-read).
-- Soft-delete (deleted_at) everywhere a round/stat could depend on the row.
-- ============================================================================

-- ── Name normalization helper (course + tee dedup keys) ─────────────────────
-- Lowercases, trims, drops "No."/"No"/"Number"/"#" tokens, collapses whitespace.
-- IMMUTABLE so it can back a generated column / unique index in the dedup phase.
-- "Pinehurst No. 2" = "Pinehurst #2" = "Pinehurst Number 2" = "Pinehurst 2" → "pinehurst 2".
CREATE OR REPLACE FUNCTION public.golf_normalize_name(p text)
  RETURNS text
  LANGUAGE sql IMMUTABLE
  SET search_path TO 'public', 'pg_temp'
  AS $$
  SELECT btrim(regexp_replace(
    regexp_replace(
      lower(btrim(coalesce(p, ''))),
      '(\ynumber\y|\yno\.?\y|#)', ' ', 'g'
    ),
    '\s+', ' ', 'g'
  ))
$$;

COMMENT ON FUNCTION public.golf_normalize_name(text) IS
  'Normalizes a course/tee name for dedup (lower, trim, drop No./#/Number, collapse spaces). IMMUTABLE.';

-- ── 1. golf_courses: additive cloud-library columns ─────────────────────────
ALTER TABLE public.golf_courses
  ADD COLUMN IF NOT EXISTS normalized_name        text,
  ADD COLUMN IF NOT EXISTS slug                   text,
  ADD COLUMN IF NOT EXISTS address                text,
  ADD COLUMN IF NOT EXISTS website                text,
  ADD COLUMN IF NOT EXISTS image_url              text,
  ADD COLUMN IF NOT EXISTS source                 text,
  ADD COLUMN IF NOT EXISTS created_by_user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_by_team_id     uuid REFERENCES public.golf_teams(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_edited_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_edited_by_team_id uuid REFERENCES public.golf_teams(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_edited_at         timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at             timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at             timestamptz DEFAULT now();

-- Backfill normalized_name for existing rows (used by the LATER dedup phase;
-- NOT yet uniquely constrained, so this cannot fail on current duplicates).
UPDATE public.golf_courses
  SET normalized_name = public.golf_normalize_name(name)
  WHERE normalized_name IS NULL;

-- Lookup index (non-unique on purpose; the unique guard lands in the dedup phase).
CREATE INDEX IF NOT EXISTS golf_courses_normalized_name_idx
  ON public.golf_courses (normalized_name) WHERE deleted_at IS NULL;

-- ── 2. golf_course_tees: tee-set master ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.golf_course_tees (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id              uuid NOT NULL REFERENCES public.golf_courses(id) ON DELETE CASCADE,
  tee_name               text NOT NULL,
  normalized_tee_name    text NOT NULL,
  tee_color              text,
  -- Free-form classification: 'mens' | 'womens' | 'tournament' | 'custom' |
  -- 'mixed' | … — intentionally NOT a binary-gender enum.
  category               text,
  total_yards            integer,
  total_par              integer,
  course_rating          numeric,
  slope_rating           integer,
  holes_count            integer NOT NULL DEFAULT 18 CHECK (holes_count IN (9, 18)),
  source                 text,
  -- Incomplete tee sets are drafts: visible/manageable, but not for official
  -- round tracking by default (enforced in the app layer).
  is_draft               boolean NOT NULL DEFAULT false,
  created_by_user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_team_id     uuid REFERENCES public.golf_teams(id) ON DELETE SET NULL,
  last_edited_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  last_edited_by_team_id uuid REFERENCES public.golf_teams(id) ON DELETE SET NULL,
  last_edited_at         timestamptz,
  deleted_at             timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

-- One ACTIVE tee per normalized name per course (soft-deleted excluded so a name
-- can be reused after archival). Dedupes "Blue" / "Blue Tees" only when their
-- normalized names collide; near-identical yard/par warnings live in the app.
CREATE UNIQUE INDEX IF NOT EXISTS golf_course_tees_course_norm_uidx
  ON public.golf_course_tees (course_id, normalized_tee_name) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS golf_course_tees_course_idx
  ON public.golf_course_tees (course_id) WHERE deleted_at IS NULL;

COMMENT ON TABLE public.golf_course_tees IS
  'Cloud tee sets for a course (Championship/Blue/White/Women''s/custom). Open-contribution + last-edited metadata + soft-delete. Rounds reference a tee via golf_rounds.tee_id but still snapshot par/yards into golf_holes.';

-- ── 3. golf_course_tee_holes: per-tee hole pars/yards ───────────────────────
CREATE TABLE IF NOT EXISTS public.golf_course_tee_holes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tee_id         uuid NOT NULL REFERENCES public.golf_course_tees(id) ON DELETE CASCADE,
  hole_number    integer NOT NULL CHECK (hole_number BETWEEN 1 AND 18),
  par            integer NOT NULL CHECK (par BETWEEN 3 AND 6),
  yardage        integer CHECK (yardage IS NULL OR yardage BETWEEN 30 AND 800),
  handicap_index integer CHECK (handicap_index IS NULL OR handicap_index BETWEEN 1 AND 18),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS golf_course_tee_holes_tee_hole_uidx
  ON public.golf_course_tee_holes (tee_id, hole_number);

-- ── 4. golf_team_saved_courses: a team's pinned/saved courses ───────────────
CREATE TABLE IF NOT EXISTS public.golf_team_saved_courses (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id            uuid NOT NULL REFERENCES public.golf_teams(id) ON DELETE CASCADE,
  course_id          uuid NOT NULL REFERENCES public.golf_courses(id) ON DELETE CASCADE,
  default_tee_id     uuid REFERENCES public.golf_course_tees(id) ON DELETE SET NULL,
  pinned             boolean NOT NULL DEFAULT false,
  last_played_at     timestamptz,
  times_played       integer NOT NULL DEFAULT 0,
  created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS golf_team_saved_courses_team_course_uidx
  ON public.golf_team_saved_courses (team_id, course_id);

-- ── 5. golf_rounds.tee_id (additive; rounds still snapshot into golf_holes) ──
ALTER TABLE public.golf_rounds
  ADD COLUMN IF NOT EXISTS tee_id uuid REFERENCES public.golf_course_tees(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS golf_rounds_tee_id_idx
  ON public.golf_rounds (tee_id) WHERE tee_id IS NOT NULL;

-- ── 6. Append-only edit history (course + tee) ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.golf_course_edit_history (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id         uuid NOT NULL REFERENCES public.golf_courses(id) ON DELETE CASCADE,
  edited_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  edited_by_team_id uuid REFERENCES public.golf_teams(id) ON DELETE SET NULL,
  action            text NOT NULL,    -- 'create' | 'update' | 'soft_delete' | 'restore'
  changes           jsonb,            -- { field: { from, to } }
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS golf_course_edit_history_course_idx
  ON public.golf_course_edit_history (course_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.golf_course_tee_edit_history (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tee_id            uuid NOT NULL REFERENCES public.golf_course_tees(id) ON DELETE CASCADE,
  edited_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  edited_by_team_id uuid REFERENCES public.golf_teams(id) ON DELETE SET NULL,
  action            text NOT NULL,
  changes           jsonb,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS golf_course_tee_edit_history_tee_idx
  ON public.golf_course_tee_edit_history (tee_id, created_at DESC);

-- ── 7. RLS ──────────────────────────────────────────────────────────────────
-- Cloud tables (tees, tee_holes, history): readable by ANY authenticated user;
-- open contribution on write (attribution enforced via *_by_user_id = auth.uid()).
-- Team-saved: team-scoped (members read, coaches write). anon has NO access.

ALTER TABLE public.golf_course_tees            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.golf_course_tee_holes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.golf_team_saved_courses     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.golf_course_edit_history    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.golf_course_tee_edit_history ENABLE ROW LEVEL SECURITY;

-- golf_course_tees
CREATE POLICY golf_course_tees_select ON public.golf_course_tees
  FOR SELECT TO authenticated USING (true);
CREATE POLICY golf_course_tees_insert ON public.golf_course_tees
  FOR INSERT TO authenticated WITH CHECK (created_by_user_id = auth.uid());
CREATE POLICY golf_course_tees_update ON public.golf_course_tees
  FOR UPDATE TO authenticated USING (true) WITH CHECK (last_edited_by_user_id = auth.uid());
-- (no DELETE policy — soft-delete via deleted_at UPDATE)

-- golf_course_tee_holes (part of editing a tee set; open to authenticated)
CREATE POLICY golf_course_tee_holes_select ON public.golf_course_tee_holes
  FOR SELECT TO authenticated USING (true);
CREATE POLICY golf_course_tee_holes_write ON public.golf_course_tee_holes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- golf_team_saved_courses (team-scoped)
CREATE POLICY golf_team_saved_courses_select ON public.golf_team_saved_courses
  FOR SELECT TO authenticated
  USING (public.is_golf_team_coach(team_id) OR public.is_golf_team_player(team_id));
CREATE POLICY golf_team_saved_courses_write ON public.golf_team_saved_courses
  FOR ALL TO authenticated
  USING (public.is_golf_team_coach(team_id))
  WITH CHECK (public.is_golf_team_coach(team_id));

-- edit history (append-only: insert + read, no update/delete)
CREATE POLICY golf_course_edit_history_select ON public.golf_course_edit_history
  FOR SELECT TO authenticated USING (true);
CREATE POLICY golf_course_edit_history_insert ON public.golf_course_edit_history
  FOR INSERT TO authenticated WITH CHECK (edited_by_user_id = auth.uid());

CREATE POLICY golf_course_tee_edit_history_select ON public.golf_course_tee_edit_history
  FOR SELECT TO authenticated USING (true);
CREATE POLICY golf_course_tee_edit_history_insert ON public.golf_course_tee_edit_history
  FOR INSERT TO authenticated WITH CHECK (edited_by_user_id = auth.uid());

-- ── 8. Grants (least privilege: anon gets NOTHING; authenticated per-RLS) ────
REVOKE ALL ON public.golf_course_tees            FROM anon;
REVOKE ALL ON public.golf_course_tee_holes       FROM anon;
REVOKE ALL ON public.golf_team_saved_courses     FROM anon;
REVOKE ALL ON public.golf_course_edit_history    FROM anon;
REVOKE ALL ON public.golf_course_tee_edit_history FROM anon;

GRANT SELECT, INSERT, UPDATE ON public.golf_course_tees TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.golf_course_tee_holes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.golf_team_saved_courses TO authenticated;
GRANT SELECT, INSERT ON public.golf_course_edit_history TO authenticated;
GRANT SELECT, INSERT ON public.golf_course_tee_edit_history TO authenticated;

GRANT ALL ON public.golf_course_tees TO service_role;
GRANT ALL ON public.golf_course_tee_holes TO service_role;
GRANT ALL ON public.golf_team_saved_courses TO service_role;
GRANT ALL ON public.golf_course_edit_history TO service_role;
GRANT ALL ON public.golf_course_tee_edit_history TO service_role;

REVOKE EXECUTE ON FUNCTION public.golf_normalize_name(text) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.golf_normalize_name(text) TO authenticated, service_role;
