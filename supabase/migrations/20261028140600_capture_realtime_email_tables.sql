-- DECLARATIVE: exempt publication membership is not declared in
-- supabase/schemas; production's supabase_realtime list is the source
-- STATUS: WRITTEN, NOT APPLIED. Replay capture: production's supabase_realtime
-- publication already includes both tables (verified read-only 2026-10-28).
-- See HELD.md (row 20261028140600) and
-- docs/operations/2026-10-28-prod-drift-capture.md.
-- Risk: LOW. Adds two admin email tables to Realtime on a replayed database;
-- RLS still decides which rows a subscriber receives.
--
-- Why: public.emails and public.email_clicks were added to supabase_realtime
-- in production with no repo file, so the admin email views get no live
-- updates on staging or a branch.
--
-- ROLLBACK: alter publication supabase_realtime drop table public.emails,
-- ROLLBACK: public.email_clicks (only on a replayed database).
--
-- VERIFY: select 1 from pg_publication_tables
-- VERIFY: where pubname = 'supabase_realtime' and schemaname = 'public'
-- VERIFY: and tablename = 'emails';
-- VERIFY: select 1 from pg_publication_tables
-- VERIFY: where pubname = 'supabase_realtime' and schemaname = 'public'
-- VERIFY: and tablename = 'email_clicks';

DO $capture$
DECLARE
  t text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RETURN;
  END IF;
  FOREACH t IN ARRAY ARRAY['emails', 'email_clicks'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                   WHERE pubname = 'supabase_realtime'
                     AND schemaname = 'public'
                     AND tablename = t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END
$capture$;
