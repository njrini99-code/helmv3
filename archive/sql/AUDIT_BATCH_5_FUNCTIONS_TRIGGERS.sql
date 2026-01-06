-- ═══════════════════════════════════════════════════════════════════════════
-- AUDIT BATCH 5: FUNCTIONS & TRIGGERS
-- Sections 9-10: Custom Functions and Triggers
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 9: CUSTOM FUNCTIONS
-- Lists all custom functions with their properties
-- ═══════════════════════════════════════════════════════════════════════════

SELECT
  p.proname as function_name,
  pg_get_function_arguments(p.oid) as arguments,
  CASE p.provolatile
    WHEN 'i' THEN 'IMMUTABLE'
    WHEN 's' THEN 'STABLE'
    WHEN 'v' THEN 'VOLATILE'
  END as volatility,
  CASE p.prosecdef
    WHEN true THEN 'SECURITY DEFINER'
    ELSE 'SECURITY INVOKER'
  END as security
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
ORDER BY p.proname;

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 10: TRIGGERS
-- Shows all triggers and what they execute
-- ═══════════════════════════════════════════════════════════════════════════

SELECT
  event_object_table as table_name,
  trigger_name,
  action_timing,
  event_manipulation,
  action_statement
FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY event_object_table, trigger_name;

-- ═══════════════════════════════════════════════════════════════════════════
-- BONUS: Get full definition of handle_new_user trigger function
-- ═══════════════════════════════════════════════════════════════════════════

SELECT pg_get_functiondef(oid)
FROM pg_proc
WHERE proname = 'handle_new_user';

-- ═══════════════════════════════════════════════════════════════════════════
-- EXPECTED RESULTS:
-- - Should see handle_new_user function (creates users record from auth.users)
-- - Triggers on auth.users for automatic account setup
-- - Security DEFINER functions should be carefully reviewed
-- ═══════════════════════════════════════════════════════════════════════════
