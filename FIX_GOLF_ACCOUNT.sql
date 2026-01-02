-- ═══════════════════════════════════════════════════════════════════════════
-- FIX: Golf Player Account with Wrong Sport
-- User signed up as golf player but users.sport = 'baseball'
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 1: Verify current state
-- ═══════════════════════════════════════════════════════════════════════════

-- Your users record (should show sport='baseball' but you signed up for golf)
SELECT
  id,
  email,
  role,
  sport,  -- This is WRONG - shows 'baseball' but should be 'golf'
  created_at
FROM users
WHERE email = 'rinin376@gmail.com';

-- Your golf_players record (exists because you signed up for golf)
SELECT
  id,
  user_id,
  email,
  first_name,
  last_name,
  created_at
FROM golf_players
WHERE email = 'rinin376@gmail.com';

-- Check if you also have a baseball players record (shouldn't exist)
SELECT
  id,
  user_id,
  first_name,
  last_name,
  created_at
FROM players
WHERE user_id = 'aa6746b8-2d05-4101-9bde-63ada5f186cf';

-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 2: FIX - Update users.sport from 'baseball' to 'golf'
-- ═══════════════════════════════════════════════════════════════════════════

UPDATE users
SET
  sport = 'golf',
  updated_at = NOW()
WHERE email = 'rinin376@gmail.com';

-- Verify the fix
SELECT
  id,
  email,
  role,
  sport,  -- Should now show 'golf'
  updated_at
FROM users
WHERE email = 'rinin376@gmail.com';

-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 3: Re-run Section 14 to confirm no longer orphaned
-- ═══════════════════════════════════════════════════════════════════════════

SELECT
  id,
  email,
  user_id,
  created_at
FROM golf_players
WHERE user_id IS NULL
   OR user_id NOT IN (SELECT id FROM users)
LIMIT 50;

-- Should now return 0 rows (or not include your record)

-- ═══════════════════════════════════════════════════════════════════════════
-- EXPLANATION: What went wrong?
-- ═══════════════════════════════════════════════════════════════════════════

/*
When you signed up:
1. ✅ auth.users was created correctly
2. ❌ users.sport was set to 'baseball' instead of 'golf'
3. ✅ golf_players was created correctly

This could happen if:
- The raw_user_meta_data->>'sport' was 'baseball' or NULL during signup
- The signup form had a bug
- The default in handle_new_user trigger kicked in:
  user_sport := COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'sport'), ''), 'baseball');
                                                                           ^^^^^^^^ default

The trigger defaults to 'baseball' if sport is empty/null, but then still created
golf_players because of some other logic path.

The fix above corrects users.sport to 'golf' which matches your golf_players record.
*/

-- ═══════════════════════════════════════════════════════════════════════════
-- END OF FIX
-- ═══════════════════════════════════════════════════════════════════════════
