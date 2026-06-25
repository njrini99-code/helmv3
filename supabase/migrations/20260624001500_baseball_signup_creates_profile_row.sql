-- =============================================================================
-- 20260624001500_baseball_signup_creates_profile_row.sql
--
-- FIX (critical golden-path): Player web email/password signup created no
-- baseball_players row, so player onboarding's UPDATE matched 0 rows, silently
-- no-op'd, never set onboarding_completed, and the player was trapped in an
-- onboarding bounce loop and could never reach Player Today.
--
-- ROOT CAUSE: signupAction()/signupAndCompleteCoachOnboarding() pass
-- raw_user_meta_data { sport: 'baseball', role: 'player'|'coach' }, and the
-- auth.ts comment claimed "sport: baseball // Tells trigger to create
-- baseball-only records" — but handle_new_user() only ever inserted into
-- public.users and ignored the 'sport' metadata entirely.
--
-- FIX: extend handle_new_user() so that when raw_user_meta_data->>'sport'
-- = 'baseball' it ALSO seeds the matching baseball profile shell row:
--   * role 'player'  -> public.baseball_players  (player_type defaults to
--                       'high_school'; the onboarding "type" step overwrites it)
--   * role 'coach'   -> NO row here. Coach profiles require an organization_id
--                       chain that only the onboarding server action can build,
--                       and completeCoachOnboarding() already inserts the coach
--                       row idempotently. Seeding an org-less coach shell here
--                       would race that flow, so coaches are intentionally left
--                       to the server action (which is reached by both the email
--                       and OAuth coach paths).
--
-- Seeding the player shell at signup ALSO unblocks the in-onboarding team join
-- (player/page.tsx handleJoinTeam early-returns on !player?.id) and makes the
-- onboarding completion a real UPDATE/UPSERT against an existing row.
--
-- This migration is additive and idempotent:
--   * ON CONFLICT (user_id) DO NOTHING — never clobbers a row the server action
--     (completeBaseballSignup / a future completePlayerOnboarding) may have
--     already created, and never errors if re-run.
--   * Wrapped so a baseball insert failure can never break the core
--     public.users insert (golf signups, OAuth, etc. are unaffected).
--
-- NOTE: NOT applied to any database by this agent (migration .sql only). Apply
-- via the normal migration pipeline.
-- =============================================================================

CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  user_role_value user_role;
  user_email TEXT;
  user_sport TEXT;
  meta_first_name TEXT;
  meta_last_name TEXT;
BEGIN
  -- Extract data from raw_user_meta_data
  user_email := NEW.email;

  -- Get role from metadata, default to 'player'
  user_role_value := COALESCE(
    (NEW.raw_user_meta_data->>'role')::user_role,
    'player'::user_role
  );

  user_sport := NEW.raw_user_meta_data->>'sport';
  meta_first_name := COALESCE(NEW.raw_user_meta_data->>'first_name', '');
  meta_last_name := COALESCE(NEW.raw_user_meta_data->>'last_name', '');

  -- Insert into users table (without full_name since column doesn't exist).
  -- Idempotent so a retried trigger / pre-seeded row never errors.
  INSERT INTO public.users (
    id,
    email,
    role,
    created_at,
    updated_at
  ) VALUES (
    NEW.id,
    user_email,
    user_role_value,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;

  -- Baseball player shell row. Only for sport='baseball' + role='player'.
  -- The onboarding "type" step overwrites player_type; the default here exists
  -- solely to satisfy the NOT NULL column at signup time. Guarded so a baseball
  -- insert failure can never block the core users insert above for other flows.
  IF user_sport = 'baseball' AND user_role_value = 'player'::user_role THEN
    BEGIN
      INSERT INTO public.baseball_players (
        user_id,
        player_type,
        first_name,
        last_name,
        email,
        recruiting_activated,
        onboarding_completed,
        profile_completion_percent
      ) VALUES (
        NEW.id,
        'high_school'::public.baseball_player_type,
        NULLIF(meta_first_name, ''),
        NULLIF(meta_last_name, ''),
        user_email,
        false,
        false,
        0
      )
      ON CONFLICT (user_id) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
      -- Never let baseball seeding break auth-user creation. The onboarding
      -- server action upserts the row as a backstop.
      RAISE WARNING 'handle_new_user: baseball_players seed failed for %: %', NEW.id, SQLERRM;
    END;
  END IF;

  RETURN NEW;
END;
$$;

-- handle_new_user relies on a unique constraint on baseball_players.user_id for
-- the ON CONFLICT target. Add it if the baseline didn't already (idempotent).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.baseball_players'::regclass
      AND contype = 'u'
      AND conname = 'baseball_players_user_id_key'
  ) AND NOT EXISTS (
    -- also tolerate a pre-existing unique index on (user_id)
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'baseball_players'
      AND indexdef ILIKE '%UNIQUE%(user_id)%'
  ) THEN
    ALTER TABLE public.baseball_players
      ADD CONSTRAINT baseball_players_user_id_key UNIQUE (user_id);
  END IF;
END
$$;
