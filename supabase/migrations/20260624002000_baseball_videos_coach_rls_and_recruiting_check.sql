-- =============================================================================
-- 20260624002000_baseball_videos_coach_rls_and_recruiting_check.sql
--
-- Two additive guards for BaseballHelm:
--
--   (1) baseball_videos — coach INSERT policy
--       The existing "baseball_videos_insert_own" policy only allows a player to
--       insert rows where player_id == their own auth uid.  Staff who use
--       BatchVideoUpload to tag video against roster players were getting 403,
--       and the already-uploaded storage object was left orphaned.  This policy
--       allows an authenticated staff member (one with at least the
--       can_manage_roster capability on the team) to insert video rows for any
--       player who is a member of that team.  The application layer
--       (batchUploadStaffVideos server action) also enforces the same capability
--       gate before touching storage, providing defence-in-depth.
--
--   (2) baseball_players — college-player recruiting_activated CHECK constraint
--       College players (player_type = 'college') cannot activate recruiting
--       (CLAUDE.md: "College players cannot activate").  This constraint makes
--       that business rule load-bearing at the DB layer so it cannot be bypassed
--       by any code path that writes to baseball_players directly.
--       Written as an idempotent DO $$ block so re-running the migration (e.g.
--       during a schema reset) is safe.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- (1) Coach INSERT policy on baseball_videos
-- ---------------------------------------------------------------------------
-- Guard: only add the policy if it does not already exist (idempotent).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'baseball_videos'
      AND policyname = 'baseball_videos_insert_staff'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "baseball_videos_insert_staff"
        ON public.baseball_videos
        FOR INSERT
        TO authenticated
        WITH CHECK (
          -- The inserting coach must hold can_manage_roster on the team the
          -- video is being tagged to.  has_baseball_staff_capability() is
          -- defined in 20260624000050_baseball_rls_helpers_and_policies.sql and
          -- mirrors the application-side resolution in capabilities.ts:
          --   head/primary coach → all caps;
          --   suspended/removed  → no caps;
          --   otherwise          → dedicated column or jsonb key.
          team_id IS NOT NULL
          AND public.has_baseball_staff_capability(team_id, 'can_manage_roster')
        );
    $policy$;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- (2) CHECK constraint: college players cannot have recruiting_activated = true
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.baseball_players'::regclass
      AND conname   = 'baseball_players_college_no_recruiting'
  ) THEN
    ALTER TABLE public.baseball_players
      ADD CONSTRAINT baseball_players_college_no_recruiting
        CHECK (
          player_type != 'college'
          OR recruiting_activated IS NOT TRUE
        );
  END IF;
END;
$$;
