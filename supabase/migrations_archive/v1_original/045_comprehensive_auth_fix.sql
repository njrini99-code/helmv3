-- ============================================================================
-- COMPREHENSIVE AUTH FIX MIGRATION
-- This migration fixes ALL auth/onboarding issues:
-- 1. Ensures trigger correctly creates ONLY sport-specific records
-- 2. Cleans up orphaned/duplicate records
-- 3. Adds RLS policies for self-update during onboarding
-- 4. Adds sport column to users table for tracking
-- ============================================================================

-- ============================================================================
-- PART 1: Add sport column to users table (if not exists)
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'sport'
  ) THEN
    ALTER TABLE public.users ADD COLUMN sport text DEFAULT 'baseball';
    COMMENT ON COLUMN public.users.sport IS 'Sport type: baseball or golf';
  END IF;
END $$;

-- ============================================================================
-- PART 2: Clean up orphaned records
-- Remove baseball player/coach records that were incorrectly created for golf users
-- ============================================================================

-- Find golf users who have baseball player records and delete those baseball records
DELETE FROM public.players
WHERE user_id IN (
  SELECT user_id FROM public.golf_players WHERE user_id IS NOT NULL
)
AND (first_name = '' OR first_name IS NULL)
AND (last_name = '' OR last_name IS NULL);

-- Find golf users who have baseball coach records and delete those baseball records
DELETE FROM public.coaches
WHERE user_id IN (
  SELECT user_id FROM public.golf_coaches WHERE user_id IS NOT NULL
)
AND (full_name = '' OR full_name IS NULL OR full_name = ' ');

-- Update users table sport column for golf users
UPDATE public.users
SET sport = 'golf'
WHERE id IN (
  SELECT user_id FROM public.golf_players WHERE user_id IS NOT NULL
  UNION
  SELECT user_id FROM public.golf_coaches WHERE user_id IS NOT NULL
);

-- ============================================================================
-- PART 3: Fix the user signup trigger
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
SECURITY DEFINER
SET search_path = public, auth
LANGUAGE plpgsql
AS $$
DECLARE
  user_role text;
  user_sport text;
  user_first_name text;
  user_last_name text;
BEGIN
  -- Extract metadata with EXPLICIT defaults
  user_role := COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'role'), ''), 'player');
  user_sport := COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'sport'), ''), 'baseball');
  user_first_name := COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'first_name'), ''), '');
  user_last_name := COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'last_name'), ''), '');

  -- Log for debugging (visible in Supabase logs)
  RAISE LOG 'handle_new_user: user_id=%, email=%, role=%, sport=%, first_name=%, last_name=%',
    NEW.id, NEW.email, user_role, user_sport, user_first_name, user_last_name;

  -- Create base user record with sport
  INSERT INTO public.users (id, email, role, sport, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    user_role::user_role,
    user_sport,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    sport = EXCLUDED.sport,
    updated_at = NOW();

  -- ONLY create sport-specific profile based on metadata
  -- IMPORTANT: Only ONE branch should execute
  IF user_sport = 'golf' THEN
    -- Golf users ONLY get golf records
    IF user_role = 'player' THEN
      INSERT INTO public.golf_players (
        user_id,
        first_name,
        last_name,
        onboarding_completed,
        created_at,
        updated_at
      )
      VALUES (
        NEW.id,
        user_first_name,
        user_last_name,
        false,
        NOW(),
        NOW()
      )
      ON CONFLICT (user_id) DO NOTHING;

      RAISE LOG 'handle_new_user: Created golf_players record for user %', NEW.id;
    ELSIF user_role = 'coach' THEN
      INSERT INTO public.golf_coaches (
        user_id,
        full_name,
        onboarding_completed,
        created_at,
        updated_at
      )
      VALUES (
        NEW.id,
        NULLIF(TRIM(CONCAT(user_first_name, ' ', user_last_name)), ''),
        false,
        NOW(),
        NOW()
      )
      ON CONFLICT (user_id) DO NOTHING;

      RAISE LOG 'handle_new_user: Created golf_coaches record for user %', NEW.id;
    END IF;

  ELSIF user_sport = 'baseball' OR user_sport IS NULL THEN
    -- Baseball users ONLY get baseball records
    IF user_role = 'player' THEN
      INSERT INTO public.players (
        user_id,
        player_type,
        first_name,
        last_name,
        onboarding_completed,
        created_at,
        updated_at
      )
      VALUES (
        NEW.id,
        'high_school',
        user_first_name,
        user_last_name,
        false,
        NOW(),
        NOW()
      )
      ON CONFLICT (user_id) DO NOTHING;

      RAISE LOG 'handle_new_user: Created players record for user %', NEW.id;
    ELSIF user_role = 'coach' THEN
      INSERT INTO public.coaches (
        user_id,
        coach_type,
        full_name,
        onboarding_completed,
        created_at,
        updated_at
      )
      VALUES (
        NEW.id,
        'college',
        NULLIF(TRIM(CONCAT(user_first_name, ' ', user_last_name)), ''),
        false,
        NOW(),
        NOW()
      )
      ON CONFLICT (user_id) DO NOTHING;

      RAISE LOG 'handle_new_user: Created coaches record for user %', NEW.id;
    END IF;
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the auth signup
    RAISE WARNING 'handle_new_user error for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

-- Recreate trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- PART 4: RLS Policies for self-update during onboarding
-- ============================================================================

-- Golf Players - allow users to update their own record
DROP POLICY IF EXISTS "Users can update own golf_players record" ON public.golf_players;
CREATE POLICY "Users can update own golf_players record"
  ON public.golf_players
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Golf Players - allow users to insert their own record (for onboarding)
DROP POLICY IF EXISTS "Users can insert own golf_players record" ON public.golf_players;
CREATE POLICY "Users can insert own golf_players record"
  ON public.golf_players
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Golf Players - allow users to read their own record
DROP POLICY IF EXISTS "Users can read own golf_players record" ON public.golf_players;
CREATE POLICY "Users can read own golf_players record"
  ON public.golf_players
  FOR SELECT
  USING (auth.uid() = user_id);

-- Golf Coaches - allow users to update their own record
DROP POLICY IF EXISTS "Users can update own golf_coaches record" ON public.golf_coaches;
CREATE POLICY "Users can update own golf_coaches record"
  ON public.golf_coaches
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Golf Coaches - allow users to insert their own record (for onboarding)
DROP POLICY IF EXISTS "Users can insert own golf_coaches record" ON public.golf_coaches;
CREATE POLICY "Users can insert own golf_coaches record"
  ON public.golf_coaches
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Golf Coaches - allow users to read their own record
DROP POLICY IF EXISTS "Users can read own golf_coaches record" ON public.golf_coaches;
CREATE POLICY "Users can read own golf_coaches record"
  ON public.golf_coaches
  FOR SELECT
  USING (auth.uid() = user_id);

-- Baseball Players - same policies
DROP POLICY IF EXISTS "Users can update own players record" ON public.players;
CREATE POLICY "Users can update own players record"
  ON public.players
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own players record" ON public.players;
CREATE POLICY "Users can insert own players record"
  ON public.players
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can read own players record" ON public.players;
CREATE POLICY "Users can read own players record"
  ON public.players
  FOR SELECT
  USING (auth.uid() = user_id);

-- Baseball Coaches - same policies
DROP POLICY IF EXISTS "Users can update own coaches record" ON public.coaches;
CREATE POLICY "Users can update own coaches record"
  ON public.coaches
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own coaches record" ON public.coaches;
CREATE POLICY "Users can insert own coaches record"
  ON public.coaches
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can read own coaches record" ON public.coaches;
CREATE POLICY "Users can read own coaches record"
  ON public.coaches
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users table - allow self-update and insert
DROP POLICY IF EXISTS "Users can update own record" ON public.users;
CREATE POLICY "Users can update own record"
  ON public.users
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own record" ON public.users;
CREATE POLICY "Users can insert own record"
  ON public.users
  FOR INSERT
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can read own record" ON public.users;
CREATE POLICY "Users can read own record"
  ON public.users
  FOR SELECT
  USING (auth.uid() = id);

-- ============================================================================
-- PART 5: Add comment documenting the fix
-- ============================================================================
COMMENT ON FUNCTION public.handle_new_user() IS
  'Creates user and sport-specific profile records when auth.users record is created.
   SECURITY DEFINER bypasses RLS. Creates ONLY one sport profile based on metadata.
   Fixed: No longer creates duplicate records across sports.
   v2.0 - Comprehensive fix 2025-01-01';
