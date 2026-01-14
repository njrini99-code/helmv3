-- ============================================================================
-- Fix: Add SECURITY DEFINER to handle_new_user() trigger function
-- This allows the trigger to bypass RLS when creating the initial user record
-- Issue: Without SECURITY DEFINER, the trigger runs with the privileges of
--        the new user (who doesn't exist yet), causing RLS violations
-- ============================================================================

-- Drop existing function and recreate with SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
SECURITY DEFINER
SET search_path = public, auth
LANGUAGE plpgsql
AS $$
DECLARE
  user_role text;
  user_sport text;
BEGIN
  -- Extract role and sport from user metadata
  user_role := COALESCE(NEW.raw_user_meta_data->>'role', 'player');
  user_sport := COALESCE(NEW.raw_user_meta_data->>'sport', 'baseball');

  -- Create base user record
  INSERT INTO public.users (id, email, role, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    user_role::user_role,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    updated_at = NOW();

  -- Auto-create sport-specific profile based on metadata
  IF user_sport = 'baseball' THEN
    IF user_role = 'player' THEN
      INSERT INTO public.players (user_id, player_type, first_name, last_name, created_at, updated_at)
      VALUES (
        NEW.id,
        'high_school',
        COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
        COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
        NOW(),
        NOW()
      )
      ON CONFLICT (user_id) DO NOTHING;
    ELSIF user_role = 'coach' THEN
      INSERT INTO public.coaches (user_id, coach_type, full_name, created_at, updated_at)
      VALUES (
        NEW.id,
        'college',
        CONCAT(
          COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
          ' ',
          COALESCE(NEW.raw_user_meta_data->>'last_name', '')
        ),
        NOW(),
        NOW()
      )
      ON CONFLICT (user_id) DO NOTHING;
    END IF;
  ELSIF user_sport = 'golf' THEN
    IF user_role = 'player' THEN
      INSERT INTO public.golf_players (
        user_id,
        first_name,
        last_name,
        created_at,
        updated_at
      )
      VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
        COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
        NOW(),
        NOW()
      )
      ON CONFLICT (user_id) DO NOTHING;
    ELSIF user_role = 'coach' THEN
      INSERT INTO public.golf_coaches (
        user_id,
        full_name,
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
        NOW(),
        NOW()
      )
      ON CONFLICT (user_id) DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the auth signup
    RAISE WARNING 'handle_new_user error: %', SQLERRM;
    RETURN NEW;
END;
$$;

-- Recreate trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Add comment
COMMENT ON FUNCTION public.handle_new_user() IS
  'Creates user profile records when auth.users record is created.
   SECURITY DEFINER bypasses RLS. Auto-creates sport-specific profiles based on metadata.';
