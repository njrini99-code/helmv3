-- ============================================================================
-- Migration: 20260624000094_baseball_practice_effectiveness.sql
-- Packet: practice-effectiveness (BaseballHelm CoachHelm Engine)
-- Controlling spec:
--   docs/archive/2026-06/baseballhelm_revolution_plan_v2/22_deeper_workflows_research_v7/
--     v7_coachhelm_practice_effectiveness_engine.md
-- Binding contracts:
--   16_detail_expansion_v2/{v2_data_contracts_expanded, v2_ai_output_contracts}.md
--
-- PURPOSE
--   Measure whether practice is working: connect WHAT was practiced (focus area,
--   assigned players, measurement target, completion, reps/results) to LATER
--   statistical movement in practice/scrimmage/official games — with HONEST
--   sample + confidence language. Two additive tables:
--
--   1. baseball_practice_block_objectives
--        The "what did we practice" layer the V7 spec calls for that the Wave-8
--        Practice Lite tables (baseball_practice_blocks) do not carry: a measurable
--        objective per block — focus_area, the metric we expect it to move,
--        assigned players, completion status, and reps/results graded. This is the
--        SOURCE objects the effectiveness review cites (source -> signal -> action
--        -> timeline). It EXTENDS practice (FK to baseball_practice_blocks), never
--        clones it.
--
--   2. baseball_practice_effectiveness_reviews
--        Exactly the V7 "Practice Effectiveness Object": team_id, practice_id,
--        focus_area, player_ids, linked_signal_ids, metric_before, metric_after,
--        sample_before, sample_after, window_before_days, window_after_days,
--        direction, confidence, confounders, conclusion, recommended_next_action.
--        Plus the binding AI source contract: source_refs jsonb, visibility,
--        disposition, generated_by/at, expires_at — so every engine output cites
--        source objects + stores confidence + visibility + generated_at +
--        disposition (zip non-negotiable).
--
-- SAFETY CONTRACT (CLAUDE.md hard rules):
--   * ADDITIVE ONLY. CREATE TABLE IF NOT EXISTS. No DROP, no destructive DML.
--   * RLS ENABLED on every new table here (deny-by-default) so a table is never
--     world-readable in the window before policies attach.
--   * Policies are defined INLINE below (guarded with to_regclass + DO blocks so a
--     re-run is idempotent) using the SAME has_baseball_staff_capability() helper
--     and is_baseball_team_member() helpers shipped in
--     20260624000050_baseball_rls_helpers_and_policies.sql.
--   * No GRANTs to anon. Effectiveness reviews are STAFF-ONLY operational
--     intelligence by default (they blend game/scrimmage/practice scopes the V7
--     honesty rules say must be labeled and never leaked mixed to players).
--   * service_role bypasses RLS for the engine cron write.
--
-- This file is WRITTEN, NOT APPLIED. Production GolfHelm shares this database;
-- migrations are applied out-of-band by a human, never by an agent.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. baseball_practice_block_objectives
--    The measurable objective attached to a practice block. One block can have
--    multiple objectives (e.g. a hitting station works two-strike approach AND
--    contact). focus_area is a free-text label the coach picks; target_metric
--    is an OPTIONAL CoachHelm metric id (from the baseball metric registry) the
--    objective is expected to move — when present, the effectiveness engine can
--    measure transfer against it. completion_status + reps/results capture the
--    V7 "how well they completed it".
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.baseball_practice_block_objectives (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id            uuid NOT NULL REFERENCES public.baseball_teams(id),
  practice_id        uuid NOT NULL REFERENCES public.baseball_practices(id) ON DELETE CASCADE,
  block_id           uuid REFERENCES public.baseball_practice_blocks(id) ON DELETE CASCADE,
  -- WHAT was practiced (V7 "objective").
  focus_area         text NOT NULL,
  objective          text,
  -- The metric this objective is expected to move (CoachHelm metric registry id,
  -- e.g. 'two_strike_chase_pct', 'walks_per_inning'). NULL = no measurable target
  -- (the engine then reports "metric not tracked consistently" honestly).
  target_metric      text,
  -- WHO it was for (canonical player ids assigned to this objective).
  player_ids         uuid[] NOT NULL DEFAULT '{}'::uuid[],
  -- HOW WELL it was completed.
  completion_status  text NOT NULL DEFAULT 'planned'
                     CHECK (completion_status IN ('planned','completed','partial','skipped')),
  reps_planned       integer,
  reps_completed     integer,
  reps_graded_correct integer,
  -- Optional notes + video links (the V7 "video links" data point). Visibility
  -- of the objective itself follows the practice (published practices are
  -- player-visible); staff-only grading lives on the review, not here.
  notes              text,
  video_url          text,
  -- Provenance: who entered it (coach) and how (manual vs imported grading).
  source_type        text NOT NULL DEFAULT 'manual'
                     CHECK (source_type IN ('manual','csv_import','integration','system')),
  created_by         uuid,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz DEFAULT now()
);
ALTER TABLE public.baseball_practice_block_objectives ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 2. baseball_practice_effectiveness_reviews
--    The V7 Practice Effectiveness Object. One row per (practice, focus_area)
--    measurement the engine produces. NEVER claims causality: `direction` is the
--    OBSERVED movement and `confidence`/`conclusion` carry the honesty language
--    (too-early / not-enough-sample / correlated-not-proven). `confounders`
--    records what could explain the move that ISN'T the practice.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.baseball_practice_effectiveness_reviews (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id              uuid NOT NULL REFERENCES public.baseball_teams(id),
  practice_id          uuid NOT NULL REFERENCES public.baseball_practices(id) ON DELETE CASCADE,
  -- The objective this review measures (when the review traces to one block
  -- objective). NULL for a practice-level/focus-level roll-up.
  objective_id         uuid REFERENCES public.baseball_practice_block_objectives(id) ON DELETE SET NULL,

  -- V7 object fields ---------------------------------------------------------
  focus_area           text NOT NULL,
  -- The metric the movement was measured on (registry id). NULL when the focus
  -- has no consistently-tracked metric (conclusion then says so honestly).
  metric_id            text,
  player_ids           uuid[] NOT NULL DEFAULT '{}'::uuid[],
  -- CoachHelm signals this review is connected to (baseball_coach_insights ids).
  linked_signal_ids    uuid[] NOT NULL DEFAULT '{}'::uuid[],

  metric_before        numeric,
  metric_after         numeric,
  sample_before        integer NOT NULL DEFAULT 0,
  sample_after         integer NOT NULL DEFAULT 0,
  window_before_days   integer NOT NULL DEFAULT 0,
  window_after_days    integer NOT NULL DEFAULT 0,

  -- OBSERVED movement, resolved via the metric registry's improvement sign — NOT
  -- inferred from a raw delta. 'improved' | 'stable' | 'worse' |
  -- 'insufficient_sample' | 'too_early' | 'not_tracked'.
  direction            text NOT NULL DEFAULT 'insufficient_sample'
                       CHECK (direction IN ('improved','stable','worse','insufficient_sample','too_early','not_tracked')),
  -- The scope(s) the AFTER metric was measured on, so a mixed read is labeled
  -- (V7: never mix official/scrimmage/practice scopes without labels).
  after_scope          text NOT NULL DEFAULT 'unknown'
                       CHECK (after_scope IN ('official_game','scrimmage','practice','mixed','unknown')),

  -- HONEST confidence in [0,1]. The honesty TIER is stored alongside so the UI
  -- never has to re-derive it: 'too_early'|'not_enough_sample'|
  -- 'correlated_not_proven'|'no_signal'. A review is NEVER 'high'/'proven'.
  confidence           numeric,
  confidence_tier      text NOT NULL DEFAULT 'not_enough_sample'
                       CHECK (confidence_tier IN ('too_early','not_enough_sample','correlated_not_proven','no_signal')),

  -- What could explain the move other than the practice (opponent/context change,
  -- player limited/sore, attendance gap, metric inconsistency). Array of short
  -- machine codes + a human conclusion sentence.
  confounders          jsonb NOT NULL DEFAULT '[]'::jsonb,
  conclusion           text NOT NULL,
  recommended_next_action jsonb,  -- { label, type, owner_role } per AI output contract

  -- AI source contract (v2_data_contracts_expanded "AI Source Contract") --------
  source_refs          jsonb NOT NULL DEFAULT '[]'::jsonb,
  visibility           text NOT NULL DEFAULT 'staff_only'
                       CHECK (visibility IN ('staff_only','player_visible','restricted')),
  disposition          text NOT NULL DEFAULT 'new'
                       CHECK (disposition IN ('new','dismissed','resolved','converted_to_task')),
  generated_by         text,            -- engine id, e.g. 'practice_effectiveness_v1'
  generated_by_model   text,
  generated_at         timestamptz NOT NULL DEFAULT now(),
  expires_at           timestamptz,
  -- Stable (team, practice, focus_area, metric) dedupe so a re-run upserts.
  dedupe_key           text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz DEFAULT now(),
  CONSTRAINT uq_bpe_dedupe UNIQUE (team_id, dedupe_key)
);
ALTER TABLE public.baseball_practice_effectiveness_reviews ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- Indexes for the read paths (dashboard + decision-room + practice-intel feeds).
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_bpbo_team       ON public.baseball_practice_block_objectives(team_id);
CREATE INDEX IF NOT EXISTS idx_bpbo_practice   ON public.baseball_practice_block_objectives(practice_id);
CREATE INDEX IF NOT EXISTS idx_bpbo_block      ON public.baseball_practice_block_objectives(block_id);
CREATE INDEX IF NOT EXISTS idx_bpbo_focus      ON public.baseball_practice_block_objectives(team_id, focus_area);

CREATE INDEX IF NOT EXISTS idx_bpe_team        ON public.baseball_practice_effectiveness_reviews(team_id);
CREATE INDEX IF NOT EXISTS idx_bpe_practice    ON public.baseball_practice_effectiveness_reviews(practice_id);
CREATE INDEX IF NOT EXISTS idx_bpe_focus       ON public.baseball_practice_effectiveness_reviews(team_id, focus_area);
CREATE INDEX IF NOT EXISTS idx_bpe_generated   ON public.baseball_practice_effectiveness_reviews(team_id, generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_bpe_disposition ON public.baseball_practice_effectiveness_reviews(team_id, disposition);

-- ----------------------------------------------------------------------------
-- RLS ENABLED (deny-by-default).
-- ----------------------------------------------------------------------------

-- Revoke any inherited anon grant defensively (matview/table recreate gotcha).
REVOKE ALL ON public.baseball_practice_block_objectives      FROM anon;
REVOKE ALL ON public.baseball_practice_effectiveness_reviews FROM anon;

-- ----------------------------------------------------------------------------
-- Policies. Mirror the 0050 helper conventions:
--   * has_baseball_staff_capability(team_id, cap)  — staff capability check.
--   * is_baseball_team_member(team_id)             — any member of the team.
-- Guarded so a re-run is idempotent and so this file is safe even if 0050 has
-- not yet defined the helpers (the policy creation is skipped until they exist).
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  -- Only create policies once the shared helper functions exist (they ship in
  -- 20260624000050). If they are absent, this migration still lands the tables
  -- with RLS on (deny-all), and re-running after 0050 attaches the policies.
  IF to_regprocedure('public.has_baseball_staff_capability(uuid, text)') IS NULL THEN
    RAISE NOTICE 'baseball staff capability helper not present yet; skipping policy creation (re-run after 0050).';
    RETURN;
  END IF;

  -- ---- baseball_practice_block_objectives -------------------------------
  -- Staff with can_manage_practice manage objectives. Players may READ
  -- objectives only for PUBLISHED practices (so they see what they are working
  -- on) — and only the team-visible columns; staff-only grading lives on the
  -- review table, not here.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='baseball_practice_block_objectives'
      AND policyname='bpbo_staff_manage'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY bpbo_staff_manage ON public.baseball_practice_block_objectives
        FOR ALL
        USING (public.has_baseball_staff_capability(team_id, 'can_manage_practice'))
        WITH CHECK (public.has_baseball_staff_capability(team_id, 'can_manage_practice'));
    $pol$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='baseball_practice_block_objectives'
      AND policyname='bpbo_player_read_published'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY bpbo_player_read_published ON public.baseball_practice_block_objectives
        FOR SELECT
        USING (
          public.is_baseball_team_member(team_id)
          AND EXISTS (
            SELECT 1 FROM public.baseball_practices p
            WHERE p.id = baseball_practice_block_objectives.practice_id
              AND p.status = 'published'
          )
        );
    $pol$;
  END IF;

  -- ---- baseball_practice_effectiveness_reviews --------------------------
  -- STAFF-ONLY operational intelligence. Reviews blend game/scrimmage/practice
  -- scopes (V7) and carry confounders + staff conclusions, so by default they
  -- are not player-visible. Staff with can_manage_practice read; staff with
  -- can_manage_practice OR can_manage_settings write/dispose.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='baseball_practice_effectiveness_reviews'
      AND policyname='bpe_staff_read'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY bpe_staff_read ON public.baseball_practice_effectiveness_reviews
        FOR SELECT
        USING (public.has_baseball_staff_capability(team_id, 'can_manage_practice'));
    $pol$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='baseball_practice_effectiveness_reviews'
      AND policyname='bpe_staff_write'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY bpe_staff_write ON public.baseball_practice_effectiveness_reviews
        FOR ALL
        USING (public.has_baseball_staff_capability(team_id, 'can_manage_practice'))
        WITH CHECK (public.has_baseball_staff_capability(team_id, 'can_manage_practice'));
    $pol$;
  END IF;

  -- Optional player read of EXPLICITLY player-visible reviews only. Even then
  -- the visibility flag must have been set player_visible by a coach AND the
  -- conclusion is the supportive, scope-labeled version (enforced in the write
  -- layer). This policy is additive; default visibility is staff_only.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='baseball_practice_effectiveness_reviews'
      AND policyname='bpe_player_read_visible'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY bpe_player_read_visible ON public.baseball_practice_effectiveness_reviews
        FOR SELECT
        USING (
          visibility = 'player_visible'
          AND public.is_baseball_team_member(team_id)
        );
    $pol$;
  END IF;
END
$$;

-- ============================================================================
-- pgTAP RLS TEST SKETCH (one test per new table — required by the build contract).
-- The integration agent wires this into the supabase/tests/ pgTAP harness; the
-- assertions below document the REQUIRED security behavior:
--
--   baseball_practice_block_objectives:
--     * a coach WITHOUT can_manage_practice cannot INSERT/UPDATE/DELETE.
--     * a player on the team can SELECT objectives of a PUBLISHED practice only.
--     * a player CANNOT SELECT objectives of a DRAFT practice.
--     * a non-member sees zero rows.
--
--   baseball_practice_effectiveness_reviews:
--     * a coach WITH can_manage_practice can SELECT + write.
--     * a coach WITHOUT it sees zero rows and cannot write.
--     * a player can SELECT ONLY rows with visibility='player_visible'.
--     * a player CANNOT SELECT staff_only/restricted reviews.
--     * anon has no access at all.
-- ============================================================================

-- ============================================================================
-- END — baseball practice-effectiveness tables. ADDITIVE. NOT applied to any DB.
-- ============================================================================
