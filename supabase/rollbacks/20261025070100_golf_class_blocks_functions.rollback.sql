-- ROLLBACK CAPTURE for
-- supabase/migrations/20261025070100_golf_class_blocks_functions.sql
--
-- Forward change (held, not applied): adds the class-block functions. Prior
-- definitions: none; every function is new. Run the 070200 rollback first: it
-- re-creates golf_my_class_day and its triggers call golf_class_player_team.
--
-- What rolling back costs: no class status for any surface and no holds. The app
-- treats the missing RPCs as "no class status" (PGRST202).
--
-- Metadata: forward change carried by the PR that adds this file (record its merge SHA
-- in the production rollout ledger); capture date 2026-10-25; approval record:
-- Production rollout ledger row on apply; Sentry watch window: the apply time plus 24
-- hours, surfaces classes.status and pushes.

SET lock_timeout = '3s';

drop function if exists public.golf_class_hold_until(uuid, timestamptz);
drop function if exists public.golf_my_class_day(date);
drop function if exists public.golf_team_class_day(uuid, date);
drop function if exists public.golf_class_day_players_internal(uuid, date, uuid, timestamptz);
drop function if exists public.golf_class_blocks_internal(uuid, date, uuid);
drop function if exists public.golf_player_on_course(uuid, timestamptz);
drop function if exists public.golf_class_player_team(uuid);
drop function if exists public.golf_class_term_at(uuid, timestamptz);
drop function if exists public.golf_class_usable(public.golf_player_classes, public.golf_team_terms);
drop function if exists public.golf_class_in_term(text, timestamptz, public.golf_team_terms);
drop function if exists public.golf_safe_time_zone(text);
drop function if exists public.golf_day_token_dow(text);
