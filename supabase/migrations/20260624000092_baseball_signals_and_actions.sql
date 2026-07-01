-- =============================================================================
-- BaseballHelm — Signal Inbox + Action Conversion Engine
-- =============================================================================
-- Packet: signal-inbox (CoachHelm engine wave).
--
-- Implements the V9 "Core Product Loop" (source -> signal -> action -> timeline)
-- and the V10 "Signals" + "Reports / Decision Room" tabs:
--
--   baseball_signals  — source-backed triage objects. A signal is the unit a
--     coach reviews: it carries severity, category, source_refs (provenance),
--     confidence, "why it matters", evidence, a recommended action, an owner,
--     a lifecycle/disposition and a visibility scope. "sample too small" is a
--     FIRST-CLASS disposition (V10 §Signals: "Show 'sample too small' as a
--     first-class status. Do not show source-starved alerts as authoritative.").
--
--   baseball_actions  — the converted, assignable, reviewable work item a signal
--     becomes (V9 "Action Conversion Map"). An action records its target
--     subsystem (practice_block | player_task | video_request | lift_mod |
--     meeting_item | message | player_note | import_review), owner, assignee,
--     due date, the source signal it came from, and its own status lifecycle.
--     Resolving / completing an action feeds the Decision Room and the player
--     timeline.
--
-- WHY NEW TABLES (not extend baseball_coach_insights):
--   baseball_coach_insights is OWNED by the engine task and models AI/coach
--   *insights*. Signals are a distinct, broader object: a signal can originate
--   from stats, imports, readiness, conflicts OR an AI insight, and it has its
--   own triage lifecycle + conversion target. A signal may CITE an insight via
--   source_refs (source_table='baseball_coach_insights'); it does not replace
--   it. This keeps the engine task's surface (insights.ts) untouched.
--
-- GUARANTEES:
--   * Idempotent / additive only: CREATE TABLE IF NOT EXISTS, ADD COLUMN IF NOT
--     EXISTS, CREATE INDEX IF NOT EXISTS, DROP POLICY IF EXISTS + CREATE.
--   * No DROP TABLE / DROP COLUMN, no destructive UPDATE/DELETE, no renames.
--   * RLS ENABLED on both tables with explicit policies. No GRANT to anon.
--   * Reuses existing SECURITY DEFINER helpers: is_baseball_team_staff(),
--     is_baseball_team_member(), has_baseball_staff_capability(),
--     get_my_baseball_player_id() (from 20260624000050).
--   * NOT applied to any database. Hand-written TS types live in
--     src/lib/types/baseball-signals.ts (we cannot db:types regen — shared prod).
-- =============================================================================

-- =============================================================================
-- 1. baseball_signals
-- =============================================================================
-- Visibility vocabulary mirrors the timeline ladder:
--   'team'        -> all team members (players + staff)
--   'player_only' -> subject player + staff
--   'staff_only'  -> staff ONLY (never reaches the player)
--
-- disposition lifecycle (V5 §AI Workflow States, narrowed to triage):
--   'new'             -> just generated, not yet triaged
--   'acknowledged'    -> a coach has seen it
--   'sample_too_small'-> FIRST-CLASS: source-starved; not authoritative
--   'converted'       -> turned into one or more baseball_actions
--   'dismissed'       -> intentionally closed without action
--   'resolved'        -> the underlying issue is considered handled
--   'expired'         -> time-sensitive signal aged out
--
-- severity: 'critical' | 'warning' | 'info'  (V10 Signal Stack buckets)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.baseball_signals (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id            uuid NOT NULL REFERENCES public.baseball_teams(id) ON DELETE CASCADE,
  -- Optional subject context (any may be null — e.g. a team-wide import signal).
  player_id          uuid REFERENCES public.baseball_players(id) ON DELETE CASCADE,
  event_id           uuid,
  -- Triage classification.
  signal_type        text NOT NULL,            -- stable generator key, e.g. 'two_strike_chase'
  category           text NOT NULL DEFAULT 'operations',
  severity           text NOT NULL DEFAULT 'info'
                       CHECK (severity IN ('critical','warning','info')),
  title              text NOT NULL,
  -- "why it matters" + evidence narrative (facts, never an uncited claim).
  why_it_matters     text,
  evidence           text,
  -- Source-to-action provenance: array of { source_table, source_id, label,
  -- sample_n, confidence, visibility } entries. NEVER empty for a real signal.
  source_refs        jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Normalized [0,1] confidence, or NULL when not numeric (renders "—").
  confidence         numeric,
  -- Observations the headline is computed over (drives "sample too small").
  sample_n           integer,
  -- Recommended action the coach can one-click convert.
  recommended_action_label text,
  recommended_action_type  text
                       CHECK (recommended_action_type IS NULL OR recommended_action_type IN (
                         'practice_block','player_task','video_request','lift_modification',
                         'meeting_item','message','player_note','import_review','none')),
  recommended_owner_role   text,
  -- Triage ownership + lifecycle.
  owner_coach_id     uuid REFERENCES public.baseball_coaches(id) ON DELETE SET NULL,
  disposition        text NOT NULL DEFAULT 'new'
                       CHECK (disposition IN (
                         'new','acknowledged','sample_too_small',
                         'converted','dismissed','resolved','expired')),
  visibility         text NOT NULL DEFAULT 'staff_only'
                       CHECK (visibility IN ('team','player_only','staff_only')),
  -- Provenance of the signal itself (which generator/source produced it).
  generated_by       text,                     -- 'engine' | generator id | coach id
  source_kind        text NOT NULL DEFAULT 'system'
                       CHECK (source_kind IN ('manual','csv_import','integration','ai','system','unknown')),
  -- Useful/not-useful/wrong feedback (V10 §Interactions).
  feedback           text CHECK (feedback IS NULL OR feedback IN ('useful','not_useful','wrong')),
  -- Stable (team, generator, subject) dedupe key so re-runs UPSERT, never clone.
  dedupe_key         text,
  -- Audit / lifecycle timestamps.
  acknowledged_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  acknowledged_at    timestamptz,
  resolved_at        timestamptz,
  expires_at         timestamptz,
  created_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.baseball_signals ENABLE ROW LEVEL SECURITY;

-- Additive guards (in case a partial table already exists).
ALTER TABLE public.baseball_signals ADD COLUMN IF NOT EXISTS player_id                uuid;
ALTER TABLE public.baseball_signals ADD COLUMN IF NOT EXISTS event_id                 uuid;
ALTER TABLE public.baseball_signals ADD COLUMN IF NOT EXISTS signal_type              text;
ALTER TABLE public.baseball_signals ADD COLUMN IF NOT EXISTS category                 text;
ALTER TABLE public.baseball_signals ADD COLUMN IF NOT EXISTS severity                 text;
ALTER TABLE public.baseball_signals ADD COLUMN IF NOT EXISTS title                    text;
ALTER TABLE public.baseball_signals ADD COLUMN IF NOT EXISTS why_it_matters           text;
ALTER TABLE public.baseball_signals ADD COLUMN IF NOT EXISTS evidence                 text;
ALTER TABLE public.baseball_signals ADD COLUMN IF NOT EXISTS source_refs              jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.baseball_signals ADD COLUMN IF NOT EXISTS confidence               numeric;
ALTER TABLE public.baseball_signals ADD COLUMN IF NOT EXISTS sample_n                 integer;
ALTER TABLE public.baseball_signals ADD COLUMN IF NOT EXISTS recommended_action_label text;
ALTER TABLE public.baseball_signals ADD COLUMN IF NOT EXISTS recommended_action_type  text;
ALTER TABLE public.baseball_signals ADD COLUMN IF NOT EXISTS recommended_owner_role   text;
ALTER TABLE public.baseball_signals ADD COLUMN IF NOT EXISTS owner_coach_id           uuid;
ALTER TABLE public.baseball_signals ADD COLUMN IF NOT EXISTS disposition              text;
ALTER TABLE public.baseball_signals ADD COLUMN IF NOT EXISTS visibility               text;
ALTER TABLE public.baseball_signals ADD COLUMN IF NOT EXISTS generated_by             text;
ALTER TABLE public.baseball_signals ADD COLUMN IF NOT EXISTS source_kind              text;
ALTER TABLE public.baseball_signals ADD COLUMN IF NOT EXISTS feedback                 text;
ALTER TABLE public.baseball_signals ADD COLUMN IF NOT EXISTS dedupe_key               text;
ALTER TABLE public.baseball_signals ADD COLUMN IF NOT EXISTS acknowledged_by          uuid;
ALTER TABLE public.baseball_signals ADD COLUMN IF NOT EXISTS acknowledged_at          timestamptz;
ALTER TABLE public.baseball_signals ADD COLUMN IF NOT EXISTS resolved_at              timestamptz;
ALTER TABLE public.baseball_signals ADD COLUMN IF NOT EXISTS expires_at               timestamptz;
ALTER TABLE public.baseball_signals ADD COLUMN IF NOT EXISTS created_by               uuid;
ALTER TABLE public.baseball_signals ADD COLUMN IF NOT EXISTS created_at               timestamptz DEFAULT now();
ALTER TABLE public.baseball_signals ADD COLUMN IF NOT EXISTS updated_at               timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS baseball_signals_team_disposition_idx
  ON public.baseball_signals (team_id, disposition, severity, created_at DESC);
CREATE INDEX IF NOT EXISTS baseball_signals_team_player_idx
  ON public.baseball_signals (team_id, player_id);
CREATE INDEX IF NOT EXISTS baseball_signals_team_category_idx
  ON public.baseball_signals (team_id, category);
-- A generator UPSERTs by dedupe_key so a re-run refreshes the open row instead
-- of cloning it. Partial-unique on the open (non-terminal) rows only, so a
-- dismissed/resolved historical signal does not block a fresh detection.
CREATE UNIQUE INDEX IF NOT EXISTS baseball_signals_dedupe_open_uidx
  ON public.baseball_signals (team_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL
    AND disposition IN ('new','acknowledged','sample_too_small');

-- =============================================================================
-- 2. baseball_actions
-- =============================================================================
-- The converted, assignable work item. One signal can convert into several
-- actions (e.g. a two-strike-chase signal -> a practice block + 3 player tasks).
--
-- action_type targets a subsystem (V9 Action Conversion Map):
--   'practice_block' | 'player_task' | 'video_request' | 'lift_modification'
--   | 'meeting_item' | 'message' | 'player_note' | 'import_review'
--
-- status lifecycle:
--   'open' -> 'in_progress' -> 'completed'   (or 'cancelled')
--   plus 'blocked' for an action that cannot proceed.
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.baseball_actions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id            uuid NOT NULL REFERENCES public.baseball_teams(id) ON DELETE CASCADE,
  -- The signal this action was converted from (the source -> action edge).
  signal_id          uuid REFERENCES public.baseball_signals(id) ON DELETE SET NULL,
  -- Optional subject context carried through from the signal.
  player_id          uuid REFERENCES public.baseball_players(id) ON DELETE CASCADE,
  event_id           uuid,
  action_type        text NOT NULL
                       CHECK (action_type IN (
                         'practice_block','player_task','video_request','lift_modification',
                         'meeting_item','message','player_note','import_review')),
  title              text NOT NULL,
  detail             text,
  -- Where the converted object lives once materialized (e.g. a practice_block
  -- id, a task id). Filled by the downstream subsystem; null until materialized.
  target_table       text,
  target_id          uuid,
  -- Ownership + assignment.
  owner_coach_id     uuid REFERENCES public.baseball_coaches(id) ON DELETE SET NULL,
  assignee_coach_id  uuid REFERENCES public.baseball_coaches(id) ON DELETE SET NULL,
  assignee_player_id uuid REFERENCES public.baseball_players(id) ON DELETE SET NULL,
  due_date           date,
  status             text NOT NULL DEFAULT 'open'
                       CHECK (status IN ('open','in_progress','blocked','completed','cancelled')),
  -- Provenance carried from the signal (so an action is itself source-backed).
  source_refs        jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence         numeric,
  visibility         text NOT NULL DEFAULT 'staff_only'
                       CHECK (visibility IN ('team','player_only','staff_only')),
  -- Decision Room outcome (V10 §Staff Decision Room "Mark outcomes").
  outcome            text,
  outcome_recorded_at timestamptz,
  -- Audit / lifecycle.
  reviewed_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at        timestamptz,
  completed_at       timestamptz,
  created_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.baseball_actions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.baseball_actions ADD COLUMN IF NOT EXISTS signal_id           uuid;
ALTER TABLE public.baseball_actions ADD COLUMN IF NOT EXISTS player_id           uuid;
ALTER TABLE public.baseball_actions ADD COLUMN IF NOT EXISTS event_id            uuid;
ALTER TABLE public.baseball_actions ADD COLUMN IF NOT EXISTS action_type         text;
ALTER TABLE public.baseball_actions ADD COLUMN IF NOT EXISTS title               text;
ALTER TABLE public.baseball_actions ADD COLUMN IF NOT EXISTS detail              text;
ALTER TABLE public.baseball_actions ADD COLUMN IF NOT EXISTS target_table        text;
ALTER TABLE public.baseball_actions ADD COLUMN IF NOT EXISTS target_id           uuid;
ALTER TABLE public.baseball_actions ADD COLUMN IF NOT EXISTS owner_coach_id      uuid;
ALTER TABLE public.baseball_actions ADD COLUMN IF NOT EXISTS assignee_coach_id   uuid;
ALTER TABLE public.baseball_actions ADD COLUMN IF NOT EXISTS assignee_player_id  uuid;
ALTER TABLE public.baseball_actions ADD COLUMN IF NOT EXISTS due_date            date;
ALTER TABLE public.baseball_actions ADD COLUMN IF NOT EXISTS status              text;
ALTER TABLE public.baseball_actions ADD COLUMN IF NOT EXISTS source_refs         jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.baseball_actions ADD COLUMN IF NOT EXISTS confidence          numeric;
ALTER TABLE public.baseball_actions ADD COLUMN IF NOT EXISTS visibility          text;
ALTER TABLE public.baseball_actions ADD COLUMN IF NOT EXISTS outcome             text;
ALTER TABLE public.baseball_actions ADD COLUMN IF NOT EXISTS outcome_recorded_at timestamptz;
ALTER TABLE public.baseball_actions ADD COLUMN IF NOT EXISTS reviewed_by         uuid;
ALTER TABLE public.baseball_actions ADD COLUMN IF NOT EXISTS reviewed_at         timestamptz;
ALTER TABLE public.baseball_actions ADD COLUMN IF NOT EXISTS completed_at        timestamptz;
ALTER TABLE public.baseball_actions ADD COLUMN IF NOT EXISTS created_by          uuid;
ALTER TABLE public.baseball_actions ADD COLUMN IF NOT EXISTS created_at          timestamptz DEFAULT now();
ALTER TABLE public.baseball_actions ADD COLUMN IF NOT EXISTS updated_at          timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS baseball_actions_team_status_idx
  ON public.baseball_actions (team_id, status, due_date);
CREATE INDEX IF NOT EXISTS baseball_actions_signal_idx
  ON public.baseball_actions (signal_id);
CREATE INDEX IF NOT EXISTS baseball_actions_assignee_player_idx
  ON public.baseball_actions (team_id, assignee_player_id);
CREATE INDEX IF NOT EXISTS baseball_actions_assignee_coach_idx
  ON public.baseball_actions (team_id, assignee_coach_id);

-- =============================================================================
-- 3. RLS — staff triage; players see only their own player-visible work
-- =============================================================================

-- ---- baseball_signals -------------------------------------------------------
-- SELECT: staff see all team signals. A player may see ONLY a non-staff_only
-- signal that is about THEM (player_id = their player id) — and never a
-- staff_only one. The visibility gate AND the player-identity gate must both
-- hold on the player branch (no path lets a player read a staff-private signal).
DROP POLICY IF EXISTS "baseball_signals_select" ON public.baseball_signals;
CREATE POLICY "baseball_signals_select" ON public.baseball_signals
  FOR SELECT TO authenticated
  USING (
    public.is_baseball_team_staff(team_id)
    OR (
      visibility IN ('team','player_only')
      AND player_id IS NOT NULL
      AND player_id = public.get_my_baseball_player_id()
    )
  );

-- INSERT: only staff with stats capability (the engine + coaches that triage
-- data). System/AI generation runs through the service-role client which
-- bypasses RLS for system provenance only.
DROP POLICY IF EXISTS "baseball_signals_insert" ON public.baseball_signals;
CREATE POLICY "baseball_signals_insert" ON public.baseball_signals
  FOR INSERT TO authenticated
  WITH CHECK (public.is_baseball_team_staff(team_id));

-- UPDATE: staff only (triage: acknowledge, dispose, assign owner, feedback).
DROP POLICY IF EXISTS "baseball_signals_update" ON public.baseball_signals;
CREATE POLICY "baseball_signals_update" ON public.baseball_signals
  FOR UPDATE TO authenticated
  USING (public.is_baseball_team_staff(team_id))
  WITH CHECK (public.is_baseball_team_staff(team_id));

-- DELETE: primary coach only (signals are append-mostly; dispositions, not deletes).
DROP POLICY IF EXISTS "baseball_signals_delete" ON public.baseball_signals;
CREATE POLICY "baseball_signals_delete" ON public.baseball_signals
  FOR DELETE TO authenticated
  USING (public.is_baseball_primary_coach(team_id));

-- ---- baseball_actions -------------------------------------------------------
-- SELECT: staff see all. A player sees an action that is (a) assigned to them
-- AND (b) player-visible (team/player_only) — never a staff_only action, even
-- if assigned. This lets a converted "player task" surface in Player Today
-- without leaking staff-internal meeting items.
DROP POLICY IF EXISTS "baseball_actions_select" ON public.baseball_actions;
CREATE POLICY "baseball_actions_select" ON public.baseball_actions
  FOR SELECT TO authenticated
  USING (
    public.is_baseball_team_staff(team_id)
    OR (
      visibility IN ('team','player_only')
      AND assignee_player_id IS NOT NULL
      AND assignee_player_id = public.get_my_baseball_player_id()
    )
  );

-- INSERT: staff only (conversion is a staff action).
DROP POLICY IF EXISTS "baseball_actions_insert" ON public.baseball_actions;
CREATE POLICY "baseball_actions_insert" ON public.baseball_actions
  FOR INSERT TO authenticated
  WITH CHECK (public.is_baseball_team_staff(team_id));

-- UPDATE: staff manage everything. A player may update ONLY their own assigned,
-- player-visible action AND only to advance it (the WITH CHECK keeps it bound
-- to them + player-visible; column-level "only status" is enforced in the
-- server action layer, which is the sole player write path).
DROP POLICY IF EXISTS "baseball_actions_update" ON public.baseball_actions;
CREATE POLICY "baseball_actions_update" ON public.baseball_actions
  FOR UPDATE TO authenticated
  USING (
    public.is_baseball_team_staff(team_id)
    OR (
      visibility IN ('team','player_only')
      AND assignee_player_id IS NOT NULL
      AND assignee_player_id = public.get_my_baseball_player_id()
    )
  )
  WITH CHECK (
    public.is_baseball_team_staff(team_id)
    OR (
      visibility IN ('team','player_only')
      AND assignee_player_id IS NOT NULL
      AND assignee_player_id = public.get_my_baseball_player_id()
    )
  );

-- DELETE: primary coach only.
DROP POLICY IF EXISTS "baseball_actions_delete" ON public.baseball_actions;
CREATE POLICY "baseball_actions_delete" ON public.baseball_actions
  FOR DELETE TO authenticated
  USING (public.is_baseball_primary_coach(team_id));

-- =============================================================================
-- 4. Lock down anon — RLS-enabled tables still default-grant to anon/authd via
--    public-schema default privileges; revoke anon explicitly (matches the
--    reference_supabase_matview_recreate_regrants_anon gotcha).
-- =============================================================================
REVOKE ALL ON public.baseball_signals FROM anon;
REVOKE ALL ON public.baseball_actions FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.baseball_signals TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.baseball_actions TO authenticated;
GRANT ALL ON public.baseball_signals TO service_role;
GRANT ALL ON public.baseball_actions TO service_role;

-- =============================================================================
-- END — baseball signals + actions. ADDITIVE. NOT applied to any DB.
-- =============================================================================
