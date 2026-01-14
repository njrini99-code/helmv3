-- ═══════════════════════════════════════════════════════════════════════════
-- INVESTIGATION: Orphaned Golf Player Account (rinin376@gmail.com)
-- Run this in Supabase Dashboard → SQL Editor
-- URL: https://supabase.com/dashboard/project/dgvlnelygibgrrjehbyc/sql/new
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 1: Check if user exists in auth.users (Supabase Auth)
-- ═══════════════════════════════════════════════════════════════════════════

SELECT
  id,
  email,
  created_at,
  email_confirmed_at,
  last_sign_in_at,
  raw_app_meta_data,
  raw_user_meta_data
FROM auth.users
WHERE email = 'rinin376@gmail.com';

-- Expected: Should return 1 row with your auth user ID
-- If empty: You don't have an auth account (login issue)
-- If exists: Note the 'id' value - this is your real auth user ID

-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 2: Check if user exists in public.users table
-- ═══════════════════════════════════════════════════════════════════════════

SELECT *
FROM users
WHERE email = 'rinin376@gmail.com';

-- Expected: Should return 1 row linked to auth.users
-- If empty: The sync between auth.users and users table failed
-- If exists: Note the 'id' value - should match auth.users.id

-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 3: Check the specific user_id referenced by golf_players
-- ═══════════════════════════════════════════════════════════════════════════

SELECT COUNT(*) as user_exists
FROM users
WHERE id = 'aa6746b8-2d05-4101-9bde-63ada5f186cf';

-- Expected: Should return 0 (this is why you're orphaned)
-- If 1: The user exists, something else is wrong

-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 4: Check your golf_players record
-- ═══════════════════════════════════════════════════════════════════════════

SELECT
  id,
  email,
  user_id,
  created_at,
  updated_at
FROM golf_players
WHERE email = 'rinin376@gmail.com';

-- This should show:
-- user_id = aa6746b8-2d05-4101-9bde-63ada5f186cf (the orphaned reference)

-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 5: Check if that orphaned user_id exists ANYWHERE
-- ═══════════════════════════════════════════════════════════════════════════

SELECT
  id,
  email,
  created_at
FROM auth.users
WHERE id = 'aa6746b8-2d05-4101-9bde-63ada5f186cf';

-- Expected: Probably empty (the user was deleted or never existed)

-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 6: Check ALL users in auth.users vs users table sync
-- ═══════════════════════════════════════════════════════════════════════════

-- Auth users WITHOUT a matching users record
SELECT
  au.id as auth_user_id,
  au.email,
  au.created_at as auth_created_at,
  'Missing from users table' as issue
FROM auth.users au
LEFT JOIN users u ON au.id = u.id
WHERE u.id IS NULL;

-- Users records WITHOUT a matching auth user
SELECT
  u.id as user_id,
  u.email,
  u.created_at as user_created_at,
  'Missing from auth.users' as issue
FROM users u
LEFT JOIN auth.users au ON u.id = au.id
WHERE au.id IS NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 7: Check the handle_new_user trigger (if it exists)
-- ═══════════════════════════════════════════════════════════════════════════

SELECT
  trigger_name,
  event_manipulation,
  event_object_table,
  action_statement
FROM information_schema.triggers
WHERE trigger_name LIKE '%new_user%'
   OR trigger_name LIKE '%auth%';

-- This shows if there's a trigger that should auto-create users records

-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 8: Check if there's a function to sync auth.users → users
-- ═══════════════════════════════════════════════════════════════════════════

SELECT
  p.proname as function_name,
  pg_get_functiondef(p.oid) as function_definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND (p.proname LIKE '%new_user%' OR p.proname LIKE '%handle%user%');

-- This shows the actual function code that creates users records

-- ═══════════════════════════════════════════════════════════════════════════
-- DIAGNOSIS SUMMARY
-- ═══════════════════════════════════════════════════════════════════════════

-- Based on results above, the issue is likely ONE of these:
--
-- 🔴 SCENARIO A: auth.users exists, users table missing
--    → The handle_new_user trigger failed or doesn't exist
--    → Solution: Manually insert record into users table
--
-- 🔴 SCENARIO B: auth.users exists, users exists, golf_players has wrong user_id
--    → golf_players.user_id was set incorrectly during signup
--    → Solution: Update golf_players.user_id to match auth.users.id
--
-- 🔴 SCENARIO C: Multiple auth accounts with same email
--    → You signed up twice, golf_players points to deleted account
--    → Solution: Update golf_players.user_id to current auth.users.id
--
-- 🔴 SCENARIO D: No auth.users at all
--    → Your account was deleted from auth
--    → Solution: Re-signup or recover account

-- ═══════════════════════════════════════════════════════════════════════════
-- NEXT STEPS (Run these AFTER diagnosis)
-- ═══════════════════════════════════════════════════════════════════════════

-- If auth.users exists but users table missing (SCENARIO A):
-- Uncomment and run this (replace <YOUR_AUTH_ID> with actual ID from Step 1):

-- INSERT INTO users (id, email, role, sport, created_at, updated_at)
-- SELECT
--   id,
--   email,
--   'player' as role,
--   'golf' as sport,
--   created_at,
--   NOW() as updated_at
-- FROM auth.users
-- WHERE email = 'rinin376@gmail.com';

-- Then update golf_players to reference the correct user_id:
-- UPDATE golf_players
-- SET user_id = (SELECT id FROM auth.users WHERE email = 'rinin376@gmail.com')
-- WHERE email = 'rinin376@gmail.com';


-- If auth.users exists AND users exists, just wrong user_id (SCENARIO B):
-- Uncomment and run this:

-- UPDATE golf_players
-- SET user_id = (SELECT id FROM auth.users WHERE email = 'rinin376@gmail.com')
-- WHERE email = 'rinin376@gmail.com';

-- ═══════════════════════════════════════════════════════════════════════════
-- END OF INVESTIGATION
-- ═══════════════════════════════════════════════════════════════════════════
