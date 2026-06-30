-- =============================================================================
-- BaseballHelm — Video Event References + Class-Conflict Automation
-- =============================================================================
-- Packet: video-classes (V6 §Video Automation + §Class Conflict Engine).
-- CONTROLLING SPEC:
--   docs/.../20_stats_integrations_coachhelm_deep_dive_v6/
--     v6_video_classes_automation_system.md
--
-- This migration does TWO additive things, both fully RLS-gated, both honoring
-- the V2 data contracts (team_id everywhere; source_type/source_label on
-- imported objects; visibility on sensitive rows; AI/automation rows carry
-- source refs + confidence + generated_at + disposition):
--
--   (A) EXTENDS the EXISTING baseball_video_events table (added by
--       20260624000080_baseball_elite_stat_event_model.sql) with the rest of the
--       V6 "Video Object" contract that the elite-stat model did not yet carry:
--         - source vendor + label + external owner provenance
--         - owner_kind / owner_coach_id / owner_player_id
--         - players_tagged[] (a clip can tag MORE than one player; player_id
--           stays the PRIMARY subject for the existing per-player RLS)
--         - clip title / thumbnail / duration / transcript / annotation author
--         - source_confidence (honest, never a false "high")
--         - source_refs jsonb (source -> signal -> action provenance ledger)
--         - linked_dev_plan_item_id + linked_meeting_item_id + linked_signal_id
--           (V6 §Video UI: convert clip to task / dev-plan item / meeting agenda)
--         - review lifecycle: needs_review / reviewed / approved (film queue)
--         - reviewed_by_player_at (V6 §"Mark clip as reviewed by player")
--         - disposition (automation lifecycle on auto-requested clips)
--       It is the SAME table — never cloned. Every change is ADD COLUMN IF NOT
--       EXISTS / CREATE INDEX IF NOT EXISTS. No column is dropped or retyped.
--       The per-player RLS the elite-stat model installed on this table
--       (baseball_video_events_select/insert/update/delete) is intentionally
--       UNTOUCHED; the new columns inherit it.
--
--   (B) CREATES baseball_class_conflicts — the durable output of the Class
--       Conflict Engine (V6 §Class Conflict Engine). One row per detected
--       conflict between a player's class (baseball_player_classes) and a team
--       calendar obligation (baseball_events / baseball_games / practice). Each
--       conflict carries severity (hard/soft/watch/informational per the spec),
--       source refs to BOTH sides, a recommended ops action, and a link to the
--       baseball_signals row it surfaced as. Conflicts are DERIVED + re-derivable
--       (dedupe_key UPSERT, never delete-then-reinsert).
--
-- The class-conflict engine SURFACES into the Signal Inbox by inserting/UPSERTing
-- baseball_signals rows (category 'academics', signal_type 'class_conflict_*').
-- That table + its RLS already exist (20260624000092_baseball_signals_and_actions.sql)
-- and are NOT modified here — we only INSERT/UPDATE through the server layer.
--
-- SAFETY CONTRACT (CLAUDE.md hard rules):
--   * ADDITIVE ONLY. CREATE TABLE IF NOT EXISTS, ADD COLUMN IF NOT EXISTS,
--     CREATE INDEX IF NOT EXISTS, DROP POLICY IF EXISTS then CREATE POLICY.
--     No DROP TABLE/COLUMN, no destructive UPDATE/DELETE, no renames.
--   * RLS ENABLED on the new table with explicit policies. No GRANT to anon.
--   * Reuses existing SECURITY DEFINER helpers (is_baseball_team_staff,
--     has_baseball_staff_capability, can_view_baseball_player,
--     get_my_baseball_player_id, is_baseball_primary_coach, get_my_coach_id).
--   * Every block guarded with to_regclass() so it is safe to (re)run even if a
--     sibling migration has not yet landed. Designed to apply AFTER 0080 + 0090.
--   * NOT applied to any database. Hand-written TS types live in
--     src/lib/types/baseball-video-classes.ts (we cannot db:types regen — the
--     DB is shared with prod GolfHelm).
-- =============================================================================

-- =============================================================================
-- (A) EXTEND baseball_video_events — full V6 Video Object contract
-- =============================================================================
DO $$
BEGIN
  IF to_regclass('public.baseball_video_events') IS NOT NULL THEN

    -- ---- Source provenance (V6: "source: uploaded, phone, Synergy, AWRE,
    --      OnForm, external URL"). NO direct vendor integration — this records
    --      WHERE a clip came from via the adapter/source-settings contract only.
    ALTER TABLE public.baseball_video_events
      ADD COLUMN IF NOT EXISTS source_vendor text;          -- 'uploaded'|'phone'|'synergy'|'awre'|'onform'|'external_url'|'manual'
    ALTER TABLE public.baseball_video_events
      ADD COLUMN IF NOT EXISTS source_label text;           -- human label, e.g. 'Synergy — vs State 4/12'
    ALTER TABLE public.baseball_video_events
      ADD COLUMN IF NOT EXISTS source_external_id text;     -- vendor's clip id (no integration; just the ref)
    ALTER TABLE public.baseball_video_events
      ADD COLUMN IF NOT EXISTS source_confidence numeric;   -- [0,1] honest; never a fabricated "high"

    -- ---- Ownership (V6: "owner: team, staff member, player").
    ALTER TABLE public.baseball_video_events
      ADD COLUMN IF NOT EXISTS owner_kind text;             -- 'team'|'staff'|'player'
    ALTER TABLE public.baseball_video_events
      ADD COLUMN IF NOT EXISTS owner_coach_id uuid;
    ALTER TABLE public.baseball_video_events
      ADD COLUMN IF NOT EXISTS owner_player_id uuid;

    -- ---- Multi-player tagging (V6: "players tagged"). player_id remains the
    --      PRIMARY subject (drives the existing per-player RLS); this array
    --      records every tagged player for filtering / library views.
    ALTER TABLE public.baseball_video_events
      ADD COLUMN IF NOT EXISTS players_tagged uuid[] DEFAULT '{}'::uuid[];

    -- ---- Clip metadata (V6 UI: library cards, drawer).
    ALTER TABLE public.baseball_video_events
      ADD COLUMN IF NOT EXISTS clip_title text;
    ALTER TABLE public.baseball_video_events
      ADD COLUMN IF NOT EXISTS thumbnail_url text;
    ALTER TABLE public.baseball_video_events
      ADD COLUMN IF NOT EXISTS duration_seconds numeric;
    ALTER TABLE public.baseball_video_events
      ADD COLUMN IF NOT EXISTS captured_at timestamptz;

    -- ---- Annotation / transcript (V6: "transcript/annotation where available").
    ALTER TABLE public.baseball_video_events
      ADD COLUMN IF NOT EXISTS transcript text;
    ALTER TABLE public.baseball_video_events
      ADD COLUMN IF NOT EXISTS annotation_author_id uuid;

    -- ---- Source -> signal -> action provenance ledger (mirrors the signals
    --      contract; an AI-suggested clip cites the stat event that prompted it).
    ALTER TABLE public.baseball_video_events
      ADD COLUMN IF NOT EXISTS source_refs jsonb NOT NULL DEFAULT '[]'::jsonb;

    -- ---- Conversion links (V6 §Video UI Requirements:
    --      "Convert clip to task / dev plan item / meeting agenda").
    ALTER TABLE public.baseball_video_events
      ADD COLUMN IF NOT EXISTS linked_dev_plan_item_id uuid;
    ALTER TABLE public.baseball_video_events
      ADD COLUMN IF NOT EXISTS linked_meeting_item_id uuid;
    ALTER TABLE public.baseball_video_events
      ADD COLUMN IF NOT EXISTS linked_signal_id uuid;
    ALTER TABLE public.baseball_video_events
      ADD COLUMN IF NOT EXISTS linked_action_id uuid;

    -- ---- Film-queue review lifecycle (V6 §"Coach film queue: needs review …").
    ALTER TABLE public.baseball_video_events
      ADD COLUMN IF NOT EXISTS review_status text DEFAULT 'needs_review';  -- 'needs_review'|'reviewed'|'approved'|'archived'
    ALTER TABLE public.baseball_video_events
      ADD COLUMN IF NOT EXISTS reviewed_by uuid;
    ALTER TABLE public.baseball_video_events
      ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;
    ALTER TABLE public.baseball_video_events
      ADD COLUMN IF NOT EXISTS player_requested_feedback boolean DEFAULT false;
    -- V6: "Mark clip as reviewed by player."
    ALTER TABLE public.baseball_video_events
      ADD COLUMN IF NOT EXISTS reviewed_by_player_at timestamptz;

    -- ---- Automation disposition on auto-requested clips (every automation
    --      output is dismissible/resolvable per the zip non-negotiables).
    ALTER TABLE public.baseball_video_events
      ADD COLUMN IF NOT EXISTS disposition text DEFAULT 'active';  -- 'requested'|'active'|'dismissed'|'resolved'

    -- ---- Audit columns the elite model did not include.
    ALTER TABLE public.baseball_video_events
      ADD COLUMN IF NOT EXISTS created_by uuid;
    ALTER TABLE public.baseball_video_events
      ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

    -- CHECK constraints, added defensively (NOT VALID-free since the table is
    -- empty pre-apply; values are written only through the typed server layer).
    -- Guard each with a name probe so re-running does not error.
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'baseball_video_events_source_vendor_check'
    ) THEN
      ALTER TABLE public.baseball_video_events
        ADD CONSTRAINT baseball_video_events_source_vendor_check
        CHECK (source_vendor IS NULL OR source_vendor IN (
          'uploaded','phone','synergy','awre','onform','external_url','manual'));
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'baseball_video_events_owner_kind_check'
    ) THEN
      ALTER TABLE public.baseball_video_events
        ADD CONSTRAINT baseball_video_events_owner_kind_check
        CHECK (owner_kind IS NULL OR owner_kind IN ('team','staff','player'));
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'baseball_video_events_review_status_check'
    ) THEN
      ALTER TABLE public.baseball_video_events
        ADD CONSTRAINT baseball_video_events_review_status_check
        CHECK (review_status IS NULL OR review_status IN (
          'needs_review','reviewed','approved','archived'));
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'baseball_video_events_disposition_check'
    ) THEN
      ALTER TABLE public.baseball_video_events
        ADD CONSTRAINT baseball_video_events_disposition_check
        CHECK (disposition IS NULL OR disposition IN (
          'requested','active','dismissed','resolved'));
    END IF;

    -- Indexes for the film queue + clip drawer lookups.
    CREATE INDEX IF NOT EXISTS idx_baseball_video_review_status
      ON public.baseball_video_events(team_id, review_status);
    CREATE INDEX IF NOT EXISTS idx_baseball_video_game
      ON public.baseball_video_events(team_id, game_id);
    CREATE INDEX IF NOT EXISTS idx_baseball_video_pa
      ON public.baseball_video_events(plate_appearance_id);
    CREATE INDEX IF NOT EXISTS idx_baseball_video_signal
      ON public.baseball_video_events(linked_signal_id);
    -- GIN on the multi-tag array so "clips that tag player X" is fast.
    CREATE INDEX IF NOT EXISTS idx_baseball_video_players_tagged
      ON public.baseball_video_events USING gin (players_tagged);

  END IF;
END $$;

-- =============================================================================
-- (B) baseball_class_conflicts — Class Conflict Engine output
-- =============================================================================
-- One row per detected (player_class x obligation) conflict. The obligation is
-- a calendar event / game / practice the player is expected at. Conflicts are
-- DERIVED and re-derivable: a re-run UPSERTs on dedupe_key so a refresh updates
-- the open row instead of cloning it (V6 automation graph: re-derivable, never
-- destructive). A conflict can carry a link to the baseball_signals row it
-- surfaced as (so the Signal Inbox and the conflict list stay in sync).
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.baseball_class_conflicts (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id            uuid NOT NULL REFERENCES public.baseball_teams(id) ON DELETE CASCADE,
  player_id          uuid NOT NULL REFERENCES public.baseball_players(id) ON DELETE CASCADE,

  -- The academic side of the conflict (the class that overlaps).
  class_id           uuid REFERENCES public.baseball_player_classes(id) ON DELETE CASCADE,
  class_name         text,                 -- denormalized label for stable display
  class_day          text,                 -- 'Mon'..'Sun' (the specific overlapping day)
  class_start        time,
  class_end          time,

  -- The obligation side (exactly one of these identifies the team commitment).
  obligation_kind    text NOT NULL DEFAULT 'event'
                       CHECK (obligation_kind IN ('event','game','practice','lift','travel','study_hall')),
  event_id           uuid,                 -- baseball_events.id when kind='event'/'lift'/'travel'
  game_id            uuid,                 -- baseball_games.id when kind='game'
  practice_id        uuid,                 -- baseball_practices.id when kind='practice'
  obligation_label   text,                 -- denormalized, e.g. 'Bus departs 2:20'
  obligation_start   timestamptz,
  obligation_end     timestamptz,
  is_mandatory       boolean DEFAULT false,

  -- Severity ladder (V6 §Severity): hard / soft / watch / informational.
  severity           text NOT NULL DEFAULT 'informational'
                       CHECK (severity IN ('hard','soft','watch','informational')),
  -- Minutes of temporal overlap (0 for back-to-back/soft proximity conflicts).
  overlap_minutes    integer,
  -- Honest [0,1] confidence — partial/derived schedule data caps this below 0.7.
  confidence         numeric,
  why_it_matters     text,                 -- transparent, source-cited reason
  -- Source -> signal -> action provenance: refs to BOTH the class row AND the
  -- obligation row the conflict was computed from. NEVER empty for a real conflict.
  source_refs        jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- Recommended ops action (V6 automation examples: travel-letter task, etc.).
  recommended_action_label text,
  recommended_action_type  text
                       CHECK (recommended_action_type IS NULL OR recommended_action_type IN (
                         'player_task','meeting_item','message','player_note',
                         'practice_block','none')),

  -- The Signal Inbox row this conflict surfaced as (kept in sync with disposition).
  signal_id          uuid,

  -- Visibility ladder (mirrors signals/timeline). Academic detail is staff-gated;
  -- a player sees only their own non-staff_only conflict (their daily schedule).
  visibility         text NOT NULL DEFAULT 'staff_only'
                       CHECK (visibility IN ('team','player_only','staff_only')),
  -- Triage lifecycle.
  disposition        text NOT NULL DEFAULT 'open'
                       CHECK (disposition IN ('open','acknowledged','resolved','dismissed','expired')),

  -- Stable (team, player, class, obligation, day) key so a re-run UPSERTs.
  dedupe_key         text,
  -- Audit / lifecycle.
  acknowledged_by    uuid,
  acknowledged_at    timestamptz,
  resolved_at        timestamptz,
  expires_at         timestamptz,
  created_by         uuid,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.baseball_class_conflicts ENABLE ROW LEVEL SECURITY;

-- Additive guards (in case a partial table already exists).
ALTER TABLE public.baseball_class_conflicts ADD COLUMN IF NOT EXISTS class_id                 uuid;
ALTER TABLE public.baseball_class_conflicts ADD COLUMN IF NOT EXISTS class_name               text;
ALTER TABLE public.baseball_class_conflicts ADD COLUMN IF NOT EXISTS class_day                text;
ALTER TABLE public.baseball_class_conflicts ADD COLUMN IF NOT EXISTS class_start              time;
ALTER TABLE public.baseball_class_conflicts ADD COLUMN IF NOT EXISTS class_end                time;
ALTER TABLE public.baseball_class_conflicts ADD COLUMN IF NOT EXISTS obligation_kind          text;
ALTER TABLE public.baseball_class_conflicts ADD COLUMN IF NOT EXISTS event_id                 uuid;
ALTER TABLE public.baseball_class_conflicts ADD COLUMN IF NOT EXISTS game_id                  uuid;
ALTER TABLE public.baseball_class_conflicts ADD COLUMN IF NOT EXISTS practice_id              uuid;
ALTER TABLE public.baseball_class_conflicts ADD COLUMN IF NOT EXISTS obligation_label         text;
ALTER TABLE public.baseball_class_conflicts ADD COLUMN IF NOT EXISTS obligation_start         timestamptz;
ALTER TABLE public.baseball_class_conflicts ADD COLUMN IF NOT EXISTS obligation_end           timestamptz;
ALTER TABLE public.baseball_class_conflicts ADD COLUMN IF NOT EXISTS is_mandatory             boolean DEFAULT false;
ALTER TABLE public.baseball_class_conflicts ADD COLUMN IF NOT EXISTS severity                 text;
ALTER TABLE public.baseball_class_conflicts ADD COLUMN IF NOT EXISTS overlap_minutes          integer;
ALTER TABLE public.baseball_class_conflicts ADD COLUMN IF NOT EXISTS confidence               numeric;
ALTER TABLE public.baseball_class_conflicts ADD COLUMN IF NOT EXISTS why_it_matters           text;
ALTER TABLE public.baseball_class_conflicts ADD COLUMN IF NOT EXISTS source_refs              jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.baseball_class_conflicts ADD COLUMN IF NOT EXISTS recommended_action_label text;
ALTER TABLE public.baseball_class_conflicts ADD COLUMN IF NOT EXISTS recommended_action_type  text;
ALTER TABLE public.baseball_class_conflicts ADD COLUMN IF NOT EXISTS signal_id                uuid;
ALTER TABLE public.baseball_class_conflicts ADD COLUMN IF NOT EXISTS visibility               text;
ALTER TABLE public.baseball_class_conflicts ADD COLUMN IF NOT EXISTS disposition              text;
ALTER TABLE public.baseball_class_conflicts ADD COLUMN IF NOT EXISTS dedupe_key               text;
ALTER TABLE public.baseball_class_conflicts ADD COLUMN IF NOT EXISTS acknowledged_by          uuid;
ALTER TABLE public.baseball_class_conflicts ADD COLUMN IF NOT EXISTS acknowledged_at          timestamptz;
ALTER TABLE public.baseball_class_conflicts ADD COLUMN IF NOT EXISTS resolved_at              timestamptz;
ALTER TABLE public.baseball_class_conflicts ADD COLUMN IF NOT EXISTS expires_at               timestamptz;
ALTER TABLE public.baseball_class_conflicts ADD COLUMN IF NOT EXISTS created_by               uuid;
ALTER TABLE public.baseball_class_conflicts ADD COLUMN IF NOT EXISTS created_at               timestamptz DEFAULT now();
ALTER TABLE public.baseball_class_conflicts ADD COLUMN IF NOT EXISTS updated_at               timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS baseball_class_conflicts_team_disposition_idx
  ON public.baseball_class_conflicts (team_id, disposition, severity, obligation_start);
CREATE INDEX IF NOT EXISTS baseball_class_conflicts_team_player_idx
  ON public.baseball_class_conflicts (team_id, player_id);
CREATE INDEX IF NOT EXISTS baseball_class_conflicts_event_idx
  ON public.baseball_class_conflicts (event_id);
CREATE INDEX IF NOT EXISTS baseball_class_conflicts_signal_idx
  ON public.baseball_class_conflicts (signal_id);
-- Partial-unique on OPEN rows so a re-derivation UPSERTs the live conflict
-- instead of cloning it; a resolved/dismissed history row never blocks a new one.
CREATE UNIQUE INDEX IF NOT EXISTS baseball_class_conflicts_dedupe_open_uidx
  ON public.baseball_class_conflicts (team_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL
    AND disposition IN ('open','acknowledged');

-- =============================================================================
-- RLS — academic conflict is staff-gated; player sees only their OWN
--        non-staff_only conflict (their daily schedule). Class detail is
--        academic-adjacent, so STAFF read requires can_view_academics.
-- =============================================================================

-- SELECT: staff with academics capability who can view the player; OR the
-- player themselves on their own non-staff_only conflict. No path lets a player
-- read a staff_only conflict, and no path lets a non-academic staffer read
-- class detail. (can_view_academics is enforced ON TOP OF team-scope.)
DROP POLICY IF EXISTS "baseball_class_conflicts_select" ON public.baseball_class_conflicts;
CREATE POLICY "baseball_class_conflicts_select" ON public.baseball_class_conflicts
  FOR SELECT TO authenticated
  USING (
    (
      public.get_my_coach_id() IS NOT NULL
      AND public.has_baseball_staff_capability(team_id, 'can_view_academics')
      AND public.can_view_baseball_player(team_id, player_id)
    )
    OR (
      player_id = public.get_my_baseball_player_id()
      AND visibility <> 'staff_only'
    )
  );

-- INSERT: staff with can_view_academics (the engine/ops coach). System/AI
-- derivation runs through service_role (bypasses RLS for system provenance only).
DROP POLICY IF EXISTS "baseball_class_conflicts_insert" ON public.baseball_class_conflicts;
CREATE POLICY "baseball_class_conflicts_insert" ON public.baseball_class_conflicts
  FOR INSERT TO authenticated
  WITH CHECK (
    public.get_my_coach_id() IS NOT NULL
    AND public.has_baseball_staff_capability(team_id, 'can_view_academics')
    AND public.can_view_baseball_player(team_id, player_id)
  );

-- UPDATE: staff with can_view_academics (triage: acknowledge/dismiss/resolve).
-- Players cannot mutate conflict triage (read-only on their own schedule view).
DROP POLICY IF EXISTS "baseball_class_conflicts_update" ON public.baseball_class_conflicts;
CREATE POLICY "baseball_class_conflicts_update" ON public.baseball_class_conflicts
  FOR UPDATE TO authenticated
  USING (
    public.get_my_coach_id() IS NOT NULL
    AND public.has_baseball_staff_capability(team_id, 'can_view_academics')
    AND public.can_view_baseball_player(team_id, player_id)
  )
  WITH CHECK (
    public.get_my_coach_id() IS NOT NULL
    AND public.has_baseball_staff_capability(team_id, 'can_view_academics')
    AND public.can_view_baseball_player(team_id, player_id)
  );

-- DELETE: primary coach only (conflicts are append-mostly; dispositions, not deletes).
DROP POLICY IF EXISTS "baseball_class_conflicts_delete" ON public.baseball_class_conflicts;
CREATE POLICY "baseball_class_conflicts_delete" ON public.baseball_class_conflicts
  FOR DELETE TO authenticated
  USING (public.is_baseball_primary_coach(team_id));

-- =============================================================================
-- Lock down anon (RLS-enabled tables still default-grant via public-schema
-- default privileges; revoke explicitly). authenticated + service_role only.
-- =============================================================================
REVOKE ALL ON public.baseball_class_conflicts FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.baseball_class_conflicts TO authenticated;
GRANT ALL ON public.baseball_class_conflicts TO service_role;

-- =============================================================================
-- END — video links + class conflicts. ADDITIVE. RLS-complete. NOT applied.
-- =============================================================================
