-- STATUS: WRITTEN, NOT APPLIED. Replay capture of production ledger rows
-- 20260617023948 crm_coaches_conference_nullable and the CRM half of
-- 20260703212357 advisor_low_risk_hardening_20260703. Production already
-- matches (verified read-only 2026-10-28). See HELD.md (row 20261028140300)
-- and docs/operations/2026-10-28-prod-drift-capture.md.
-- Risk: LOW. Drops a NOT NULL only if still set, removes anon grants on an
-- admin-only table, and creates the admin grouping view production has only
-- if it is missing, so production (which has both) takes no table lock.
--
-- Why: neither production change has a repo file. A replayed database keeps
-- crm_coaches.conference NOT NULL (bulk uploads of JUCO/NAIA coaches with no
-- known conference fail there), grants anon ALL on crm_coaches, and has no
-- v_crm_coaches_by_school view at all. The view body is production's, as
-- supabase/schemas/views/shared.sql holds it; it runs as the caller
-- (security_invoker), so crm_coaches RLS decides what it returns.
--
-- ROLLBACK: drop view if exists public.v_crm_coaches_by_school (only on a
-- ROLLBACK: replayed database; production had it before this file). The NOT
-- ROLLBACK: NULL and the anon grant are not restored: both were removed in
-- ROLLBACK: production on purpose.
--
-- VERIFY: select 1 from information_schema.columns
-- VERIFY: where table_schema = 'public' and table_name = 'crm_coaches'
-- VERIFY: and column_name = 'conference' and is_nullable = 'YES';
-- VERIFY: select 1 where not has_table_privilege('anon',
-- VERIFY: 'public.crm_coaches', 'SELECT');
-- VERIFY: select 1 from pg_views where schemaname = 'public'
-- VERIFY: and viewname = 'v_crm_coaches_by_school';

SET LOCAL lock_timeout = '5s';

-- ALTER TABLE takes ACCESS EXCLUSIVE before it looks at the column, so the
-- DROP NOT NULL runs only when the column is still NOT NULL. Production has
-- had it nullable since 2026-06-17, so crm_coaches is not locked there.
DO $capture$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_attribute
             WHERE attrelid = 'public.crm_coaches'::regclass
               AND attname = 'conference'
               AND attnotnull) THEN
    -- squawk-ignore ban-drop-not-null
    ALTER TABLE public.crm_coaches ALTER COLUMN conference DROP NOT NULL;
  END IF;
END
$capture$;

REVOKE ALL ON TABLE public.crm_coaches FROM anon;

-- CREATE OR REPLACE VIEW would redefine the view and lock it even when the
-- body matches, so the view is created only when it does not exist yet.
DO $capture$
BEGIN
  IF to_regclass('public.v_crm_coaches_by_school') IS NULL THEN
    EXECUTE $view$
      CREATE VIEW public.v_crm_coaches_by_school
      WITH (security_invoker = true) AS
      SELECT
          division,
          school,
          conference,
          program,
          role_level,
          is_primary_contact,
          name,
          title,
          email,
          phone,
          status,
          email_status,
          is_starred,
          priority,
          count(*) OVER (PARTITION BY school, division) AS coaches_at_school,
          id
      FROM public.crm_coaches
      WHERE is_archived IS NOT true
      ORDER BY
          division, school, program, is_primary_contact DESC,
          CASE role_level
              WHEN 'head_coach'::text THEN 0
              WHEN 'director'::text THEN 1
              WHEN 'associate_head_coach'::text THEN 2
              WHEN 'unknown'::text THEN 3
              WHEN 'other'::text THEN 4
              WHEN 'volunteer'::text THEN 5
              WHEN 'assistant_coach'::text THEN 6
              ELSE 7
          END, name
    $view$;
  END IF;
END
$capture$;

REVOKE ALL ON TABLE public.v_crm_coaches_by_school FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
ON TABLE public.v_crm_coaches_by_school FROM authenticated;
GRANT SELECT ON TABLE public.v_crm_coaches_by_school TO authenticated;
GRANT ALL ON TABLE public.v_crm_coaches_by_school TO service_role;
