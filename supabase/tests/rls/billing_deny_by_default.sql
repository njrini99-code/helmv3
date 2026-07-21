-- pgTAP contract for the Stripe billing tables
-- (migration 20260715120000_billing_invoices_stripe.sql).
--
-- These are PLATFORM-PLANE tables: billing_customers (org -> Stripe customer
-- mapping) and billing_invoices (local mirror of Stripe invoices). They are
-- deliberately DENY-BY-DEFAULT: RLS enabled + forced, ZERO policies, and no
-- table grants to anon/authenticated. All legitimate access is via the
-- service-role admin client (BYPASSRLS) behind requireSuperAdmin() and the
-- signature-verified Stripe webhook. No tenant (player/coach) may ever read or
-- write billing rows.
--
-- This suite is the POSITIVE PROOF of that intent, so the missing-policy state
-- is verified-correct rather than an oversight (see .coderabbit.yaml RLS rule).
--
-- Schema-light: asserts over pg_class / pg_policies / has_table_privilege
-- without seeding data (matches the deferral note in _helpers.sql).

BEGIN;
\ir _helpers.sql

SELECT plan(12);

-- ============================================================================
-- 1. RLS is ENABLED and FORCED on both tables.
-- ============================================================================
SELECT ok(
  (SELECT relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'billing_customers'),
  'RLS is ENABLED on billing_customers'
);
SELECT ok(
  (SELECT relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'billing_customers'),
  'RLS is FORCED on billing_customers'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'billing_invoices'),
  'RLS is ENABLED on billing_invoices'
);
SELECT ok(
  (SELECT relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'billing_invoices'),
  'RLS is FORCED on billing_invoices'
);

-- ============================================================================
-- 2. Deny-by-default: ZERO policies exist on either table.
-- ============================================================================
SELECT is(
  (SELECT COUNT(*)::int FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'billing_customers'),
  0,
  'billing_customers has no RLS policies (deny-by-default)'
);
SELECT is(
  (SELECT COUNT(*)::int FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'billing_invoices'),
  0,
  'billing_invoices has no RLS policies (deny-by-default)'
);

-- ============================================================================
-- 3. No table grants to tenant roles (anon / authenticated) on either table.
-- ============================================================================
SELECT isnt(has_table_privilege('anon', 'public.billing_customers', 'SELECT'), true,
  'anon cannot SELECT billing_customers');
SELECT isnt(has_table_privilege('authenticated', 'public.billing_customers', 'SELECT'), true,
  'authenticated cannot SELECT billing_customers');
SELECT isnt(has_table_privilege('anon', 'public.billing_invoices', 'SELECT'), true,
  'anon cannot SELECT billing_invoices');
SELECT isnt(has_table_privilege('authenticated', 'public.billing_invoices', 'SELECT'), true,
  'authenticated cannot SELECT billing_invoices');
SELECT isnt(has_table_privilege('authenticated', 'public.billing_invoices', 'INSERT'), true,
  'authenticated cannot INSERT billing_invoices');
SELECT isnt(has_table_privilege('authenticated', 'public.billing_invoices', 'UPDATE'), true,
  'authenticated cannot UPDATE billing_invoices');

SELECT * FROM finish();
ROLLBACK;
