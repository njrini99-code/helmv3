-- =============================================================================
-- Shared Demo Coach Account
-- =============================================================================
-- PURPOSE: Creates a single shared demo coach login that visitors use at
--   /golf/demo. This is a CO-HEAD-COACH on the existing demo team; it does NOT
--   disturb njrini99@gmail.com (Nick Rini), who remains the primary head coach.
--
-- PLACEHOLDERS — the orchestrator MUST substitute these before executing:
--   __DEMO_EMAIL__    → the demo coach email   (e.g. demo-coach@helmsportslabs.com)
--   __DEMO_PASSWORD__ → a strong random password (min 20 chars recommended)
--
-- Idempotent: every block uses ON CONFLICT or an existence guard so re-running
-- is safe and will NOT create duplicate rows or overwrite existing data.
--
-- Applied via Supabase MCP (service-role / admin connection only — this script
-- writes to auth.* which requires superuser / service-role privileges).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. Helpers used throughout
-- ---------------------------------------------------------------------------
-- We need pgcrypto's crypt() for password hashing. It's loaded by default in
-- Supabase, but guard just in case.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. auth.users — the Supabase authentication row
-- ---------------------------------------------------------------------------
-- Risk note: inserting directly into auth.users is officially supported for
-- seeding via service-role; Supabase's own CLI seeding approach does the same.
-- The encrypted_password uses bcrypt (blowfish) via crypt() + gen_salt('bf').
-- If the user already exists (email conflict), we skip silently.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_user_id uuid;
BEGIN
  -- Check if a user with this email already exists.
  SELECT id INTO v_user_id
    FROM auth.users
   WHERE email = '__DEMO_EMAIL__'
   LIMIT 1;

  IF v_user_id IS NULL THEN
    -- Generate a fresh UUID for the new user.
    v_user_id := gen_random_uuid();

    INSERT INTO auth.users (
      id,
      instance_id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      is_super_admin,
      created_at,
      updated_at,
      last_sign_in_at,
      confirmation_token,
      recovery_token,
      email_change_token_new,
      email_change
    ) VALUES (
      v_user_id,
      '00000000-0000-0000-0000-000000000000',   -- instance_id (standard Supabase value)
      'authenticated',
      'authenticated',
      '__DEMO_EMAIL__',
      crypt('__DEMO_PASSWORD__', gen_salt('bf')),
      now(),                                     -- email_confirmed_at (pre-confirmed)
      '{"provider": "email", "providers": ["email"], "role": "coach"}'::jsonb,
      '{"role": "coach"}'::jsonb,
      false,
      now(),
      now(),
      NULL,
      '',
      '',
      '',
      ''
    );

    -- -----------------------------------------------------------------------
    -- 2. auth.identities — required for email+password sign-in to work
    -- -----------------------------------------------------------------------
    -- Supabase requires an auth.identities row with provider='email' and
    -- identity_data containing the email + sub (= user id) for
    -- signInWithPassword to resolve the user correctly.
    -- -----------------------------------------------------------------------
    INSERT INTO auth.identities (
      id,
      user_id,
      provider_id,
      provider,
      identity_data,
      last_sign_in_at,
      created_at,
      updated_at
    ) VALUES (
      gen_random_uuid(),
      v_user_id,
      v_user_id::text,       -- provider_id = user UUID (matches this project's email identities)
      'email',
      jsonb_build_object(
        'sub',   v_user_id::text,
        'email', '__DEMO_EMAIL__',
        'email_verified', true,
        'role',  'coach'
      ),
      now(),
      now(),
      now()
    );

    RAISE NOTICE 'Created demo coach auth.users + auth.identities: %', v_user_id;
  ELSE
    RAISE NOTICE 'Demo coach auth.users already exists (id=%); skipping auth insert.', v_user_id;
  END IF;

  -- -------------------------------------------------------------------------
  -- 3. public.users — the application-level user row
  -- -------------------------------------------------------------------------
  -- handle_new_user() trigger normally fires on INSERT INTO auth.users, but
  -- direct inserts to auth.users (bypassing the trigger) may or may not fire
  -- it depending on the Supabase version and trigger config. Insert explicitly
  -- with ON CONFLICT to be safe.
  -- -------------------------------------------------------------------------
  INSERT INTO public.users (
    id,
    email,
    role,
    created_at,
    updated_at
  )
  SELECT
    v_user_id,
    '__DEMO_EMAIL__',
    'coach'::public.user_role,
    now(),
    now()
  WHERE v_user_id IS NOT NULL
  ON CONFLICT (id) DO NOTHING;

  -- -------------------------------------------------------------------------
  -- 4. golf_coaches — coach profile row
  -- -------------------------------------------------------------------------
  INSERT INTO public.golf_coaches (
    id,
    user_id,
    organization_id,
    full_name,
    email,
    title,
    onboarding_completed,
    created_at,
    updated_at
  )
  SELECT
    gen_random_uuid(),
    v_user_id,
    'f97a9346-52ef-4f27-9ee7-4cf1e20fc79a',   -- Demo University org
    'Demo Coach',
    '__DEMO_EMAIL__',
    'Head Coach (Demo)',
    true,
    now(),
    now()
  WHERE v_user_id IS NOT NULL
  ON CONFLICT (user_id) DO NOTHING;

  -- -------------------------------------------------------------------------
  -- 5. golf_team_coach_staff — attach to the demo team as non-primary head coach
  -- -------------------------------------------------------------------------
  -- is_primary=false so Nick Rini (njrini99) stays the primary head coach.
  -- The RLS function is_golf_team_coach() checks for a row in this table,
  -- so this row is what gives the shared demo account visibility into all
  -- team data.
  -- -------------------------------------------------------------------------
  INSERT INTO public.golf_team_coach_staff (
    id,
    team_id,
    coach_id,
    role,
    is_primary,
    created_at
  )
  SELECT
    gen_random_uuid(),
    '6ecdd1a6-63fe-4beb-b094-00118f334163',    -- Demo University Golf team
    gc.id,
    'head_coach',
    false,                                       -- Nick Rini stays primary=true
    now()
  FROM public.golf_coaches gc
  WHERE gc.user_id = v_user_id
  ON CONFLICT (team_id, coach_id) DO NOTHING;

  RAISE NOTICE 'Demo coach setup complete for user_id=%', v_user_id;
END $$;
