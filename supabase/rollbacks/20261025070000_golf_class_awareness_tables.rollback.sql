-- ROLLBACK CAPTURE for
-- supabase/migrations/20261025070000_golf_class_awareness_tables.sql
--
-- Forward change (held, not applied): adds golf_team_terms, golf_player_class_settings,
-- golf_class_exceptions, the definer helper golf_player_shares_class_status, the guard
-- functions, golf_player_classes.status_enabled, and puts golf_class_exceptions in the
-- supabase_realtime publication.
--
-- Prior definitions: none. Every object is new except golf_player_classes (gains one
-- column with a default) and the publication (gains one table). Run 070200 and 070100
-- rollbacks first: their functions and triggers read these tables.
--
-- What rolling back costs: coaches' confirmed term dates, players' no-class days, exam
-- blocks and sharing choices are deleted with the tables. The app treats missing tables
-- as "no class status" (PGRST202 / 42P01), so nothing breaks, and status disappears.
--
-- Metadata: forward change carried by the PR that adds this file (record its merge SHA
-- in the production rollout ledger); capture date 2026-10-25; approval record:
-- Production rollout ledger row on apply; Sentry watch window: the apply time plus 24
-- hours, surfaces classes.status and messages.

SET lock_timeout = '3s';

do $$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'golf_class_exceptions'
  ) then
    alter publication supabase_realtime drop table public.golf_class_exceptions;
  end if;
end $$;

drop table if exists public.golf_class_exceptions;
drop table if exists public.golf_player_class_settings;
drop table if exists public.golf_team_terms;

drop function if exists public.golf_player_shares_class_status(uuid, uuid);
drop function if exists public.golf_class_exceptions_guard();
drop function if exists public.golf_team_terms_guard();

alter table public.golf_player_classes drop column if exists status_enabled;
