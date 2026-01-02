-- ============================================
-- REMOVE EMAIL VALIDATION CONSTRAINTS
-- Run this in Supabase SQL Editor
-- ============================================

-- 1. Check for CHECK constraints on email columns
SELECT
    conname AS constraint_name,
    conrelid::regclass AS table_name,
    pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE contype = 'c'
AND (
    pg_get_constraintdef(oid) ILIKE '%email%'
    OR conname ILIKE '%email%'
);

-- 2. Drop any email validation functions
DROP FUNCTION IF EXISTS validate_email(text) CASCADE;
DROP FUNCTION IF EXISTS check_email_format(text) CASCADE;
DROP FUNCTION IF EXISTS public.validate_email(text) CASCADE;
DROP FUNCTION IF EXISTS public.check_email_format(text) CASCADE;

-- 3. Check for triggers on auth.users
SELECT
    tgname AS trigger_name,
    tgrelid::regclass AS table_name,
    proname AS function_name
FROM pg_trigger
JOIN pg_proc ON pg_trigger.tgfoid = pg_proc.oid
WHERE tgrelid = 'auth.users'::regclass;

-- 4. Check for triggers on public.users
SELECT
    tgname AS trigger_name,
    tgrelid::regclass AS table_name,
    proname AS function_name
FROM pg_trigger
JOIN pg_proc ON pg_trigger.tgfoid = pg_proc.oid
WHERE tgrelid = 'public.users'::regclass;

-- 5. Drop any email validation triggers if found
-- Uncomment and modify if you find any triggers from step 3 or 4:
-- DROP TRIGGER IF EXISTS validate_email_trigger ON auth.users;
-- DROP TRIGGER IF EXISTS check_email_format_trigger ON public.users;

-- 6. Temporarily disable RLS on users table (for testing)
-- WARNING: This removes security. Only for debugging. Re-enable after testing!
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;

-- 7. Check all policies on users table
SELECT
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE tablename = 'users';

-- 8. Drop the restrictive INSERT policy that might be blocking signups
DROP POLICY IF EXISTS "Users can insert own data" ON public.users;

-- 9. Create a more permissive INSERT policy for signups
CREATE POLICY "Allow authenticated users to insert own profile"
ON public.users
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

-- 10. Also allow service_role to insert (for admin operations)
CREATE POLICY "Allow service role to insert users"
ON public.users
FOR INSERT
TO service_role
WITH CHECK (true);

-- 11. Re-enable RLS (IMPORTANT!)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- 12. Verify policies are correct
SELECT
    policyname,
    cmd,
    roles,
    qual,
    with_check
FROM pg_policies
WHERE tablename = 'users'
ORDER BY policyname;

-- ============================================
-- TROUBLESHOOTING NOTES:
-- ============================================
-- If signup still fails after running this:
-- 1. Check Supabase Dashboard > Authentication > Settings
-- 2. Ensure "Enable Email Signups" is ON
-- 3. Check for any custom SMTP settings that might block emails
-- 4. Try with a Gmail address first (most compatible)
-- ============================================
