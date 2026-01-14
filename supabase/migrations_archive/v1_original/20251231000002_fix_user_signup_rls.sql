-- Migration: Fix user signup RLS policies
-- This ensures users can create their own profile if the trigger doesn't work

-- ============================================================================
-- FIX 1: Add INSERT policy for users table
-- ============================================================================

-- Drop if exists to avoid conflicts
DROP POLICY IF EXISTS "Users can insert own profile" ON public.users;

-- Users can insert their own profile (needed if trigger doesn't fire)
CREATE POLICY "Users can insert own profile" ON public.users
  FOR INSERT
  WITH CHECK (auth.uid() = id);

-- ============================================================================
-- FIX 2: Ensure trigger exists and works
-- ============================================================================

-- Recreate the function with better error handling
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, email, role, created_at, updated_at)
  VALUES (
    NEW.id, 
    COALESCE(NEW.email, ''),
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'player'),
    NOW(), 
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    updated_at = NOW();
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Log but don't fail - the app will handle creating the record
  RAISE WARNING 'handle_new_user failed: %', SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- FIX 3: Ensure golf tables have proper policies for signup
-- ============================================================================

-- Golf coaches - allow users to insert their own record
DROP POLICY IF EXISTS "Users can create own golf coach profile" ON public.golf_coaches;
CREATE POLICY "Users can create own golf coach profile" ON public.golf_coaches
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Golf players - allow users to insert their own record  
DROP POLICY IF EXISTS "Users can create own golf player profile" ON public.golf_players;
CREATE POLICY "Users can create own golf player profile" ON public.golf_players
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- FIX 4: Grant necessary permissions
-- ============================================================================

-- Ensure the trigger function can bypass RLS
ALTER FUNCTION public.handle_new_user() SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
