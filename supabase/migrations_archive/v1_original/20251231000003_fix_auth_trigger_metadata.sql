-- Migration: Fix handle_new_user trigger to properly use metadata
-- This ensures player_type and coach_type are correctly set from signup metadata

-- ============================================
-- UPDATED TRIGGER FUNCTION
-- ============================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_role user_role;
  user_sport text;
  player_type_val player_type;
  coach_type_val coach_type;
BEGIN
  -- Extract role and sport from metadata, with defaults
  user_role := COALESCE(
    (NEW.raw_user_meta_data->>'role')::user_role,
    'player'
  );
  
  user_sport := COALESCE(
    NEW.raw_user_meta_data->>'sport',
    'baseball'
  );

  -- Step 1: Always create the users table record
  INSERT INTO public.users (id, email, role, created_at, updated_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    user_role,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    role = EXCLUDED.role,
    updated_at = NOW();

  -- Step 2: Create sport-specific records based on role and sport
  
  -- BASEBALL PLAYER
  IF user_role = 'player' AND user_sport = 'baseball' THEN
    -- Get player_type from metadata, default to 'high_school'
    player_type_val := COALESCE(
      (NEW.raw_user_meta_data->>'player_type')::player_type,
      'high_school'
    );
    
    INSERT INTO public.players (
      user_id,
      player_type,
      first_name,
      last_name,
      email,
      created_at,
      updated_at
    )
    VALUES (
      NEW.id,
      player_type_val,
      COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
      COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
      NEW.email,
      NOW(),
      NOW()
    )
    ON CONFLICT (user_id) DO NOTHING;
  
  -- BASEBALL COACH
  ELSIF user_role = 'coach' AND user_sport = 'baseball' THEN
    -- Get coach_type from metadata, default to 'college'
    coach_type_val := COALESCE(
      (NEW.raw_user_meta_data->>'coach_type')::coach_type,
      'college'
    );
    
    INSERT INTO public.coaches (
      user_id,
      coach_type,
      full_name,
      email_contact,
      onboarding_completed,
      created_at,
      updated_at
    )
    VALUES (
      NEW.id,
      coach_type_val,
      CONCAT(
        COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
        ' ',
        COALESCE(NEW.raw_user_meta_data->>'last_name', '')
      ),
      NEW.email,
      false,
      NOW(),
      NOW()
    )
    ON CONFLICT (user_id) DO NOTHING;
  
  -- GOLF PLAYER
  ELSIF user_role = 'player' AND user_sport = 'golf' THEN
    INSERT INTO public.golf_players (
      user_id,
      first_name,
      last_name,
      email,
      status,
      onboarding_completed,
      created_at,
      updated_at
    )
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
      COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
      NEW.email,
      'active',
      false,
      NOW(),
      NOW()
    )
    ON CONFLICT (user_id) DO NOTHING;
  
  -- GOLF COACH
  ELSIF user_role = 'coach' AND user_sport = 'golf' THEN
    INSERT INTO public.golf_coaches (
      user_id,
      full_name,
      email,
      onboarding_completed,
      created_at,
      updated_at
    )
    VALUES (
      NEW.id,
      CONCAT(
        COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
        ' ',
        COALESCE(NEW.raw_user_meta_data->>'last_name', '')
      ),
      NEW.email,
      false,
      NOW(),
      NOW()
    )
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  RETURN NEW;
  
EXCEPTION WHEN OTHERS THEN
  -- Log error but don't fail - the application can handle creating records
  RAISE WARNING 'handle_new_user failed for user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

-- ============================================
-- RECREATE TRIGGER
-- ============================================

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- RLS POLICIES FOR SIGNUP FLOW
-- ============================================

-- Users table
DROP POLICY IF EXISTS "Users can insert own profile" ON public.users;
CREATE POLICY "Users can insert own profile" ON public.users
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated' AND auth.uid() = id);

-- Baseball coaches
DROP POLICY IF EXISTS "Users can create own coach profile" ON public.coaches;
CREATE POLICY "Users can create own coach profile" ON public.coaches
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated' AND auth.uid() = user_id);

-- Baseball players
DROP POLICY IF EXISTS "Users can create own player profile" ON public.players;
CREATE POLICY "Users can create own player profile" ON public.players
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated' AND auth.uid() = user_id);

-- Golf coaches
DROP POLICY IF EXISTS "Users can create own golf coach profile" ON public.golf_coaches;
CREATE POLICY "Users can create own golf coach profile" ON public.golf_coaches
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated' AND auth.uid() = user_id);

-- Golf players
DROP POLICY IF EXISTS "Users can create own golf player profile" ON public.golf_players;
CREATE POLICY "Users can create own golf player profile" ON public.golf_players
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated' AND auth.uid() = user_id);

-- Golf organizations (coaches need to create these during onboarding)
DROP POLICY IF EXISTS "Authenticated users can create golf organizations" ON public.golf_organizations;
CREATE POLICY "Authenticated users can create golf organizations" ON public.golf_organizations
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Golf teams (coaches need to create these during onboarding)
DROP POLICY IF EXISTS "Authenticated users can create golf teams" ON public.golf_teams;
CREATE POLICY "Authenticated users can create golf teams" ON public.golf_teams
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Baseball organizations (coaches need to create these during onboarding)
DROP POLICY IF EXISTS "Authenticated users can create organizations" ON public.organizations;
CREATE POLICY "Authenticated users can create organizations" ON public.organizations
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- ============================================
-- COMMENT
-- ============================================

COMMENT ON FUNCTION public.handle_new_user() IS
  'Creates user profile and sport-specific records when a new user signs up. 
   Uses metadata from auth.signUp() to determine:
   - role (player/coach)
   - sport (baseball/golf)
   - player_type (high_school/college/juco/showcase)
   - coach_type (college/high_school/juco/showcase)
   All types default to sensible values if not provided in metadata.';
