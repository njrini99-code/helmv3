-- CoachHelm v3 schema contracts.
-- Asserts that the 10 core v3 tables (1) exist, (2) have RLS enabled, and
-- (3) carry at least one policy. Catches accidental drops, RLS-disabled-by-
-- mistake migrations, and policy regressions.
--
-- Tables sourced from docs/HELM_DATABASE_VERCEL_COACHHELM_DEEP_DIVE_2026-05-27.md
-- "Live CoachHelm v3 Schema Mostly Exists" section.

BEGIN;
\i supabase/tests/rls/_helpers.sql

SELECT plan(30);

-- ============================================================
-- public.golf_metrics
-- ============================================================
SELECT ok(
  to_regclass('public.golf_metrics') IS NOT NULL,
  'table public.golf_metrics exists'
);

SELECT ok(
  (
    SELECT relrowsecurity
    FROM pg_class
    JOIN pg_namespace ON pg_namespace.oid = relnamespace
    WHERE nspname = 'public' AND relname = 'golf_metrics'
  ),
  'public.golf_metrics has RLS enabled'
);

SELECT ok(
  (
    SELECT count(*) > 0
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'golf_metrics'
  ),
  'public.golf_metrics has at least one RLS policy'
);

-- ============================================================
-- public.golf_pga_standards
-- ============================================================
SELECT ok(
  to_regclass('public.golf_pga_standards') IS NOT NULL,
  'table public.golf_pga_standards exists'
);

SELECT ok(
  (
    SELECT relrowsecurity
    FROM pg_class
    JOIN pg_namespace ON pg_namespace.oid = relnamespace
    WHERE nspname = 'public' AND relname = 'golf_pga_standards'
  ),
  'public.golf_pga_standards has RLS enabled'
);

SELECT ok(
  (
    SELECT count(*) > 0
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'golf_pga_standards'
  ),
  'public.golf_pga_standards has at least one RLS policy'
);

-- ============================================================
-- public.golf_player_standing
-- ============================================================
SELECT ok(
  to_regclass('public.golf_player_standing') IS NOT NULL,
  'table public.golf_player_standing exists'
);

SELECT ok(
  (
    SELECT relrowsecurity
    FROM pg_class
    JOIN pg_namespace ON pg_namespace.oid = relnamespace
    WHERE nspname = 'public' AND relname = 'golf_player_standing'
  ),
  'public.golf_player_standing has RLS enabled'
);

SELECT ok(
  (
    SELECT count(*) > 0
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'golf_player_standing'
  ),
  'public.golf_player_standing has at least one RLS policy'
);

-- ============================================================
-- public.golf_goals
-- ============================================================
SELECT ok(
  to_regclass('public.golf_goals') IS NOT NULL,
  'table public.golf_goals exists'
);

SELECT ok(
  (
    SELECT relrowsecurity
    FROM pg_class
    JOIN pg_namespace ON pg_namespace.oid = relnamespace
    WHERE nspname = 'public' AND relname = 'golf_goals'
  ),
  'public.golf_goals has RLS enabled'
);

SELECT ok(
  (
    SELECT count(*) > 0
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'golf_goals'
  ),
  'public.golf_goals has at least one RLS policy'
);

-- ============================================================
-- public.golf_coachhelm_llm_budget
-- ============================================================
SELECT ok(
  to_regclass('public.golf_coachhelm_llm_budget') IS NOT NULL,
  'table public.golf_coachhelm_llm_budget exists'
);

SELECT ok(
  (
    SELECT relrowsecurity
    FROM pg_class
    JOIN pg_namespace ON pg_namespace.oid = relnamespace
    WHERE nspname = 'public' AND relname = 'golf_coachhelm_llm_budget'
  ),
  'public.golf_coachhelm_llm_budget has RLS enabled'
);

SELECT ok(
  (
    SELECT count(*) > 0
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'golf_coachhelm_llm_budget'
  ),
  'public.golf_coachhelm_llm_budget has at least one RLS policy'
);

-- ============================================================
-- public.golf_coachhelm_llm_calls
-- ============================================================
SELECT ok(
  to_regclass('public.golf_coachhelm_llm_calls') IS NOT NULL,
  'table public.golf_coachhelm_llm_calls exists'
);

SELECT ok(
  (
    SELECT relrowsecurity
    FROM pg_class
    JOIN pg_namespace ON pg_namespace.oid = relnamespace
    WHERE nspname = 'public' AND relname = 'golf_coachhelm_llm_calls'
  ),
  'public.golf_coachhelm_llm_calls has RLS enabled'
);

SELECT ok(
  (
    SELECT count(*) > 0
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'golf_coachhelm_llm_calls'
  ),
  'public.golf_coachhelm_llm_calls has at least one RLS policy'
);

-- ============================================================
-- public.golf_coachhelm_chat_conversations
-- ============================================================
SELECT ok(
  to_regclass('public.golf_coachhelm_chat_conversations') IS NOT NULL,
  'table public.golf_coachhelm_chat_conversations exists'
);

SELECT ok(
  (
    SELECT relrowsecurity
    FROM pg_class
    JOIN pg_namespace ON pg_namespace.oid = relnamespace
    WHERE nspname = 'public' AND relname = 'golf_coachhelm_chat_conversations'
  ),
  'public.golf_coachhelm_chat_conversations has RLS enabled'
);

SELECT ok(
  (
    SELECT count(*) > 0
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'golf_coachhelm_chat_conversations'
  ),
  'public.golf_coachhelm_chat_conversations has at least one RLS policy'
);

-- ============================================================
-- public.golf_coachhelm_chat_messages
-- ============================================================
SELECT ok(
  to_regclass('public.golf_coachhelm_chat_messages') IS NOT NULL,
  'table public.golf_coachhelm_chat_messages exists'
);

SELECT ok(
  (
    SELECT relrowsecurity
    FROM pg_class
    JOIN pg_namespace ON pg_namespace.oid = relnamespace
    WHERE nspname = 'public' AND relname = 'golf_coachhelm_chat_messages'
  ),
  'public.golf_coachhelm_chat_messages has RLS enabled'
);

SELECT ok(
  (
    SELECT count(*) > 0
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'golf_coachhelm_chat_messages'
  ),
  'public.golf_coachhelm_chat_messages has at least one RLS policy'
);

-- ============================================================
-- public.golf_player_genome
-- ============================================================
SELECT ok(
  to_regclass('public.golf_player_genome') IS NOT NULL,
  'table public.golf_player_genome exists'
);

SELECT ok(
  (
    SELECT relrowsecurity
    FROM pg_class
    JOIN pg_namespace ON pg_namespace.oid = relnamespace
    WHERE nspname = 'public' AND relname = 'golf_player_genome'
  ),
  'public.golf_player_genome has RLS enabled'
);

SELECT ok(
  (
    SELECT count(*) > 0
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'golf_player_genome'
  ),
  'public.golf_player_genome has at least one RLS policy'
);

-- ============================================================
-- public.golf_drills
-- ============================================================
SELECT ok(
  to_regclass('public.golf_drills') IS NOT NULL,
  'table public.golf_drills exists'
);

SELECT ok(
  (
    SELECT relrowsecurity
    FROM pg_class
    JOIN pg_namespace ON pg_namespace.oid = relnamespace
    WHERE nspname = 'public' AND relname = 'golf_drills'
  ),
  'public.golf_drills has RLS enabled'
);

SELECT ok(
  (
    SELECT count(*) > 0
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'golf_drills'
  ),
  'public.golf_drills has at least one RLS policy'
);

SELECT * FROM finish();
ROLLBACK;
