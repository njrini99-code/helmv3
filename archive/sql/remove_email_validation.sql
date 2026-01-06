-- Remove any email validation constraints
-- Run this in your Supabase SQL Editor

-- Check for any CHECK constraints on email columns
SELECT
    conname AS constraint_name,
    conrelid::regclass AS table_name,
    pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE contype = 'c'
AND pg_get_constraintdef(oid) ILIKE '%email%';

-- Drop any custom email validation functions if they exist
DROP FUNCTION IF EXISTS validate_email(text) CASCADE;
DROP FUNCTION IF EXISTS check_email_format(text) CASCADE;

-- Ensure auth.users table has no extra validation
-- (Supabase manages this table, but we can check)
SELECT * FROM pg_constraint
WHERE conrelid = 'auth.users'::regclass
AND contype = 'c';

-- Check users table for email constraints
SELECT * FROM pg_constraint
WHERE conrelid = 'public.users'::regclass
AND contype = 'c';

-- If you find any email CHECK constraints, drop them like this:
-- ALTER TABLE public.users DROP CONSTRAINT IF EXISTS <constraint_name>;
