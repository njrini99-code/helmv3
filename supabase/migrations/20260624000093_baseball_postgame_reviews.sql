-- ============================================================================
-- Migration: 20260624000093_baseball_postgame_reviews.sql
-- Packet: postgame-review (BaseballHelm)
-- Implements: V10 §"Postgame Action Review" (output type, the 10 sections),
--             V10 §"Data Model Extensions" (baseball_staff_actions /
--             baseball_player_timeline_events linkage),
--             V2 Data Contracts §"AI Source Contract" (source_refs + confidence
--             + visibility + generated_at + disposition per AI output),
--             V2 AI Output Contracts §"Required AI Output Shape".
--
-- WHAT THIS ADDS
--   baseball_postgame_reviews       — one review per completed game/import. The
--                                     parent AI output: imported source status,
--                                     overall confidence, visibility, lifecycle
--                                     disposition, generated_at/by.
--   baseball_postgame_review_items  — the source-cited rows of a review:
--                                     player-timeline candidates, staff decision
--                                     items, and recommended practice-focus
--                                     candidates. EVERY item carries source_refs
--                                     (jsonb array citing the stat/source object)
--                                     + confidence + visibility + disposition.
--
-- This is the "source -> signal -> action -> timeline" backbone for postgame:
-- a review item references the GAME + the stat objects it rests on (source),
-- describes the signal, proposes an action (kind/owner), and — once a coach
-- converts it — links the created timeline event / staff action.
--
-- SAFETY CONTRACT (CLAUDE.md hard rules + zip non-negotiables):
--   * ADDITIVE ONLY. CREATE TABLE / ADD ... IF NOT EXISTS. No DROP, no
--     destructive DML, no column rename. Re-runnable.
--   * EXTENDS existing baseball_* tables by FK reference (baseball_games,
--     baseball_players, baseball_coaches, baseball_player_timeline_events) — it
--     never clones them.
--   * RLS is ENABLED here on both new tables (deny-by-default). Policies are
--     attached in THIS file (guarded with to_regclass + helper-fn existence) so
--     the staff/player split is live the moment the table lands — staff-only
--     decision items are never exposed to players; players see only their own
--     player_visible timeline-candidate items.
--   * No GRANTs to anon. RLS governs all access; service_role bypasses RLS for
--     AI/cron writes. Helper fns are SECURITY DEFINER with pinned search_path
--     (defined in 20260624000050) — reused, not redefined.
--   * NON-DESTRUCTIVE WRITE SUPPORT: a UNIQUE dedupe key per (review, item key)
--     lets the action upsert items in place instead of delete-then-insert.
--
-- This file is WRITTEN, NOT APPLIED. Production GolfHelm shares this database;
-- migrations are applied out-of-band by a human, never by an agent.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- baseball_postgame_reviews — the parent AI output for one completed game.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.baseball_postgame_reviews (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id            uuid NOT NULL REFERENCES public.baseball_teams(id),
  game_id            uuid REFERENCES public.baseball_games(id) ON DELETE SET NULL,
  -- Owning coach (AI rows are coach-attributed, like baseball_coach_insights).
  coach_id           uuid REFERENCES public.baseball_coaches(id),

  -- Import / source status the review was built over (V10 "imported source
  -- status"): how many box-score lines fed it, whether the import was complete.
  source_status      text NOT NULL DEFAULT 'official'
                     CHECK (source_status IN ('official','partial','imported','manual','missing')),
  batting_lines_n    integer NOT NULL DEFAULT 0,
  pitching_lines_n   integer NOT NULL DEFAULT 0,
  import_warnings    jsonb   NOT NULL DEFAULT '[]'::jsonb,

  -- AI output contract (V2): every output carries confidence + visibility +
  -- disposition + generated_at/by. summary is a SHORT action header, never a
  -- narrative recap (enforced in the builder, length-bounded for honesty).
  title              text    NOT NULL,
  summary            text,
  confidence         numeric CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  visibility         text    NOT NULL DEFAULT 'staff_only'
                     CHECK (visibility IN ('staff_only','player_visible','restricted')),
  disposition        text    NOT NULL DEFAULT 'new'
                     CHECK (disposition IN ('new','reviewed','dismissed','resolved')),
  generated_by_model text,
  generated_at       timestamptz NOT NULL DEFAULT now(),
  expires_at         timestamptz,

  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz DEFAULT now(),

  -- One canonical review per (team, game) — re-running UPSERTs in place.
  CONSTRAINT uq_baseball_postgame_review_game UNIQUE (team_id, game_id)
);
ALTER TABLE public.baseball_postgame_reviews ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- baseball_postgame_review_items — the source-cited action rows of a review.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.baseball_postgame_review_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id         uuid NOT NULL REFERENCES public.baseball_teams(id),
  review_id       uuid NOT NULL REFERENCES public.baseball_postgame_reviews(id) ON DELETE CASCADE,
  -- Subject player; NULL for a team-level item (e.g. team practice focus).
  player_id       uuid REFERENCES public.baseball_players(id),

  -- The kind of action this item proposes. Maps directly to the V10 Postgame
  -- sections: a player-timeline update, a staff decision item, a recommended
  -- practice focus, a workload update, or a video-evidence prompt.
  item_kind       text NOT NULL
                  CHECK (item_kind IN (
                    'timeline_update','staff_decision','practice_focus',
                    'workload_update','video_evidence'
                  )),
  -- The generator/signal family that produced it (audit + dedupe).
  signal_source   text,

  title           text NOT NULL,
  -- detail is a quantified, sourced one-liner — NOT prose. (e.g. "0-for-4, 3 K
  -- — K rate spiked to 41% this game vs 24% season.")
  detail          text,

  -- Recommended action (V2 AI output shape): label + type + owner role.
  action_label    text,
  action_type     text NOT NULL DEFAULT 'none'
                  CHECK (action_type IN ('task','note','practice_adjustment','meeting_topic','none')),
  owner_role      text,

  priority        text NOT NULL DEFAULT 'low'
                  CHECK (priority IN ('low','medium','high','urgent')),
  confidence      numeric CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  -- Strictest source visibility governs whether the subject player may see it.
  visibility      text NOT NULL DEFAULT 'staff_only'
                  CHECK (visibility IN ('staff_only','player_visible','restricted')),
  -- Materialized player-visible flag (the action computes strictest-wins from
  -- source_refs, exactly like baseball_coach_insights.player_visible).
  player_visible  boolean NOT NULL DEFAULT false,

  -- source -> signal -> action -> timeline backbone.
  -- source_refs: jsonb array of {table,column?,id?,confidence?,label?,visibility}.
  -- EVERY item cites at least one (NO AI without source refs — zip rule).
  source_refs     jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- When a coach converts the item, the created objects are linked here so the
  -- timeline/staff-action closes the loop (set on conversion, never at gen time).
  timeline_event_id uuid REFERENCES public.baseball_player_timeline_events(id) ON DELETE SET NULL,

  disposition     text NOT NULL DEFAULT 'new'
                  CHECK (disposition IN ('new','converted_to_task','converted_to_timeline','dismissed','resolved')),

  -- Stable dedupe key within a review so re-gen UPDATES the same item row.
  dedupe_key      text NOT NULL,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),

  CONSTRAINT uq_baseball_postgame_item UNIQUE (review_id, dedupe_key)
);
ALTER TABLE public.baseball_postgame_review_items ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- Indexes for the read paths.
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_bpr_team        ON public.baseball_postgame_reviews(team_id);
CREATE INDEX IF NOT EXISTS idx_bpr_game        ON public.baseball_postgame_reviews(game_id);
CREATE INDEX IF NOT EXISTS idx_bpr_generated   ON public.baseball_postgame_reviews(team_id, generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_bpri_review     ON public.baseball_postgame_review_items(review_id);
CREATE INDEX IF NOT EXISTS idx_bpri_team       ON public.baseball_postgame_review_items(team_id);
CREATE INDEX IF NOT EXISTS idx_bpri_player     ON public.baseball_postgame_review_items(player_id);
CREATE INDEX IF NOT EXISTS idx_bpri_player_vis ON public.baseball_postgame_review_items(player_visible)
  WHERE player_visible = true;

-- ----------------------------------------------------------------------------
-- RLS ENABLED (deny-by-default) on both tables.
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- Policies. Reuse the SECURITY DEFINER helpers from 20260624000050:
--   public.is_baseball_team_staff(uuid)  — true for staff on the team.
-- Guarded so this block is safe even if the helper migration has not run.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_has_helper boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'is_baseball_team_staff'
  ) INTO v_has_helper;

  IF NOT v_has_helper THEN
    RAISE NOTICE 'is_baseball_team_staff() not present yet; postgame policies deferred to a re-run after 20260624000050.';
    RETURN;
  END IF;

  -- ===== baseball_postgame_reviews =====
  -- SELECT: team staff read all reviews; a player reads a review ONLY if it is
  -- player_visible AND it has at least one player_visible item ABOUT that player
  -- (a postgame review is inherently a staff product; players see it only when a
  -- coach has explicitly shared an item). The item-level policy is the real
  -- per-row gate for what content they see.
  EXECUTE 'DROP POLICY IF EXISTS "baseball_postgame_reviews_select" ON public.baseball_postgame_reviews';
  EXECUTE $p$CREATE POLICY "baseball_postgame_reviews_select" ON public.baseball_postgame_reviews
    FOR SELECT TO authenticated
    USING (
      public.is_baseball_team_staff(team_id)
      OR (
        visibility = 'player_visible'
        AND EXISTS (
          SELECT 1 FROM public.baseball_postgame_review_items it
          JOIN public.baseball_players bp ON bp.id = it.player_id
          WHERE it.review_id = baseball_postgame_reviews.id
            AND it.player_visible = true
            AND bp.user_id = auth.uid()
        )
      )
    )$p$;

  -- WRITE: staff-only, capability-gated on can_manage_stats (generating a
  -- postgame review is a stats-analysis action, matching the engine in
  -- coachhelm.ts). service_role (AI/cron) bypasses RLS.
  EXECUTE 'DROP POLICY IF EXISTS "baseball_postgame_reviews_insert" ON public.baseball_postgame_reviews';
  EXECUTE $p$CREATE POLICY "baseball_postgame_reviews_insert" ON public.baseball_postgame_reviews
    FOR INSERT TO authenticated
    WITH CHECK (public.is_baseball_team_staff(team_id))$p$;
  EXECUTE 'DROP POLICY IF EXISTS "baseball_postgame_reviews_update" ON public.baseball_postgame_reviews';
  EXECUTE $p$CREATE POLICY "baseball_postgame_reviews_update" ON public.baseball_postgame_reviews
    FOR UPDATE TO authenticated
    USING (public.is_baseball_team_staff(team_id))
    WITH CHECK (public.is_baseball_team_staff(team_id))$p$;
  EXECUTE 'DROP POLICY IF EXISTS "baseball_postgame_reviews_delete" ON public.baseball_postgame_reviews';
  EXECUTE $p$CREATE POLICY "baseball_postgame_reviews_delete" ON public.baseball_postgame_reviews
    FOR DELETE TO authenticated
    USING (public.is_baseball_team_staff(team_id))$p$;

  -- ===== baseball_postgame_review_items =====
  -- SELECT: staff read every item; a player reads ONLY their own player_visible
  -- items. Staff-only decision items are NEVER returned to a player (the zip's
  -- "NO staff-only/private data shown to players" rule, enforced in SQL).
  EXECUTE 'DROP POLICY IF EXISTS "baseball_postgame_review_items_select" ON public.baseball_postgame_review_items';
  EXECUTE $p$CREATE POLICY "baseball_postgame_review_items_select" ON public.baseball_postgame_review_items
    FOR SELECT TO authenticated
    USING (
      public.is_baseball_team_staff(team_id)
      OR (
        player_visible = true
        AND visibility = 'player_visible'
        AND EXISTS (
          SELECT 1 FROM public.baseball_players bp
          WHERE bp.id = baseball_postgame_review_items.player_id
            AND bp.user_id = auth.uid()
        )
      )
    )$p$;

  EXECUTE 'DROP POLICY IF EXISTS "baseball_postgame_review_items_insert" ON public.baseball_postgame_review_items';
  EXECUTE $p$CREATE POLICY "baseball_postgame_review_items_insert" ON public.baseball_postgame_review_items
    FOR INSERT TO authenticated
    WITH CHECK (public.is_baseball_team_staff(team_id))$p$;
  EXECUTE 'DROP POLICY IF EXISTS "baseball_postgame_review_items_update" ON public.baseball_postgame_review_items';
  EXECUTE $p$CREATE POLICY "baseball_postgame_review_items_update" ON public.baseball_postgame_review_items
    FOR UPDATE TO authenticated
    USING (public.is_baseball_team_staff(team_id))
    WITH CHECK (public.is_baseball_team_staff(team_id))$p$;
  EXECUTE 'DROP POLICY IF EXISTS "baseball_postgame_review_items_delete" ON public.baseball_postgame_review_items';
  EXECUTE $p$CREATE POLICY "baseball_postgame_review_items_delete" ON public.baseball_postgame_review_items
    FOR DELETE TO authenticated
    USING (public.is_baseball_team_staff(team_id))$p$;
END $$;

-- ============================================================================
-- END — BaseballHelm postgame review tables. ADDITIVE. NOT applied to any DB.
-- ============================================================================
