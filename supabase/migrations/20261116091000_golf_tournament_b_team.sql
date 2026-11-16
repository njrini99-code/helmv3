-- STATUS: WRITTEN, NOT APPLIED (HOLD, see HELD.md).
-- Written 16 Nov 2026 for launch readiness F-05, a B team in a tournament
--   (thread "Build coach table-stakes features", PR #2543). Not applied
--   anywhere, not run against any database.
--
-- Apply: npm run db:apply --
--   supabase/migrations/20261116091000_golf_tournament_b_team.sql
--   after npm run test:rls passes on a local stack (the pgTAP file is
--   supabase/tests/rls/golf_tournament_b_team.sql). Order: after
--   20261115250000 (independent of it and of 20261115230000/240000).
--
-- Risk: MEDIUM. Replaces two live functions (golf_tournament_set_entries
--   and golf_tournament_lock_lineup) and swaps the entries' slot index for
--   one per squad. Existing rows read as the A squad and keep their slots,
--   so every saved lineup, every lock and every team score is unchanged.
--
-- What:
--   golf_tournament_entries.squad and golf_tournament_round_lineups.squad,
--   'A' (default, every row today) or 'B'. A B-team player is stored with
--   role 'individual' (or 'alternate' for the B alternate), so every team
--   score, which reads role 'lineup' only, leaves the B team out: a B team
--   never counts in the team's record (D-92). B players keep a spot (slot)
--   for their order; the slot-role check and the slot index are per squad.
--   golf_tournament_set_entries takes an optional "squad" on each entry:
--   'B' must be an individual or an alternate (invalid otherwise), the B
--   team holds no more than players_per_team (too_many), each squad has at
--   most one alternate in a save (invalid). golf_tournament_lock_lineup
--   copies the squad and the slot into each round's lineup.
--   Both functions are otherwise the text of 20261024100200 (security
--   invoker, search_path '', the same refusals and the same grants).
--
-- Code that reads it: src/clubhouse/data/tournaments.ts (loadTournamentLineup
--   probes for the column) and src/app/golf/actions/tournaments.ts
--   (setTournamentEntries sends "squad" only for a B entry, and refuses a B
--   entry while the column is missing, so nothing is saved as an A
--   individual by the old function). Without this migration the lineup
--   builder offers no B team.
--
-- ROLLBACK (after deleting every B row, which the old index would refuse):
--   delete from public.golf_tournament_entries where squad = 'B';
--   delete from public.golf_tournament_round_lineups where squad = 'B';
--   then re-run sections 5 and 6 of 20261024100200 (the old functions),
--   drop index if exists public.golf_tournament_entries_squad_slot_uq;
--   create unique index golf_tournament_entries_slot_uq on
--     public.golf_tournament_entries (tournament_id, slot) where slot is not
-- null;
--   alter table public.golf_tournament_entries drop constraint if exists
--     golf_tournament_entries_squad_slot_role;
--   alter table public.golf_tournament_entries add constraint
--     golf_tournament_entries_slot_role check ((role = 'lineup') = (slot is not
-- null));
--   alter table public.golf_tournament_entries drop column if exists squad;
--   alter table public.golf_tournament_round_lineups drop column if exists
-- squad;
--
-- VERIFY: select 1 where exists (select 1 from information_schema.columns where
-- table_schema = 'public' and table_name = 'golf_tournament_entries' and
-- column_name = 'squad');
-- VERIFY: select 1 where exists (select 1 from information_schema.columns where
-- table_schema = 'public' and table_name = 'golf_tournament_round_lineups' and
-- column_name = 'squad');
-- VERIFY: select 1 where
-- to_regclass('public.golf_tournament_entries_squad_slot_uq') is not null and
-- to_regclass('public.golf_tournament_entries_slot_uq') is null;
-- VERIFY: select 1 where not exists (select 1 from
-- public.golf_tournament_entries where squad <> 'A');
-- VERIFY: select 1 where not has_function_privilege('anon',
-- 'public.golf_tournament_set_entries(uuid, jsonb, integer)', 'EXECUTE');
-- VERIFY: select 1 from pg_proc where oid =
-- 'public.golf_tournament_set_entries(uuid, jsonb, integer)'::regprocedure and
-- not prosecdef;

set local lock_timeout = '3s';

-- 1. The squad columns. Every existing row is the A squad.
alter table public.golf_tournament_entries
add column if not exists squad text not null default 'A';
alter table public.golf_tournament_round_lineups
add column if not exists squad text not null default 'A';

do $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'golf_tournament_entries_squad_check') THEN
    ALTER TABLE public.golf_tournament_entries
      ADD CONSTRAINT golf_tournament_entries_squad_check CHECK (squad in ('A', 'B'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'golf_trl_squad_check') THEN
    ALTER TABLE public.golf_tournament_round_lineups
      ADD CONSTRAINT golf_trl_squad_check CHECK (squad in ('A', 'B'));
  END IF;
  -- An A entry has a slot exactly when it is in the lineup (the old rule); a B
  -- entry is never in the lineup (it is an
  -- individual or the B alternate) and may keep a slot for its order.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'golf_tournament_entries_squad_slot_role') THEN
    ALTER TABLE public.golf_tournament_entries
      ADD CONSTRAINT golf_tournament_entries_squad_slot_role CHECK (
        (squad = 'A' AND (role = 'lineup') = (slot IS NOT NULL))
        OR (squad = 'B' AND role <> 'lineup')
      );
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'golf_tournament_entries_slot_role') THEN
    ALTER TABLE public.golf_tournament_entries DROP CONSTRAINT golf_tournament_entries_slot_role;
  END IF;
END $$;

-- 2. One player a slot within a squad (the old index was one a slot in the
-- event).
create unique index if not exists golf_tournament_entries_squad_slot_uq
on public.golf_tournament_entries (tournament_id, squad, slot)
where slot is not null;
drop index if exists public.golf_tournament_entries_slot_uq;

-- 3. Save the entries (20261024100200 section 5, with the squad).
create or replace function public.golf_tournament_set_entries(
    p_id uuid, p_entries jsonb, p_version integer default null
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
DECLARE
  v_t public.golf_tournaments%ROWTYPE;
  v_lineup integer;
  v_b integer;
BEGIN
  SELECT * INTO v_t FROM public.golf_tournaments t WHERE t.id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0001';
  END IF;
  IF NOT public.is_golf_team_coach(v_t.team_id) THEN
    RAISE EXCEPTION 'not_coach' USING ERRCODE = 'P0001';
  END IF;
  IF p_version IS NOT NULL AND v_t.version <> p_version THEN
    RAISE EXCEPTION 'stale' USING ERRCODE = 'P0001';
  END IF;
  IF v_t.lineup_locked_at IS NOT NULL THEN
    RAISE EXCEPTION 'locked' USING ERRCODE = 'P0001';
  END IF;
  IF jsonb_typeof(coalesce(p_entries, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'invalid' USING ERRCODE = 'P0001';
  END IF;
  -- A squad is A or B; a B entry is an individual or the B alternate; each
  -- squad has one alternate at most.
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(coalesce(p_entries, '[]'::jsonb)) e
    WHERE coalesce(e->>'squad', 'A') NOT IN ('A', 'B')
       OR (coalesce(e->>'squad', 'A') = 'B' AND e->>'role' = 'lineup')
  ) OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(coalesce(p_entries, '[]'::jsonb)) e
    WHERE e->>'role' = 'alternate'
    GROUP BY coalesce(e->>'squad', 'A') HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'invalid' USING ERRCODE = 'P0001';
  END IF;
  SELECT count(*) FILTER (WHERE e->>'role' = 'lineup'),
         count(*) FILTER (WHERE coalesce(e->>'squad', 'A') = 'B' AND e->>'role' = 'individual')
  INTO v_lineup, v_b
  FROM jsonb_array_elements(coalesce(p_entries, '[]'::jsonb)) e;
  IF v_lineup > v_t.players_per_team OR v_b > v_t.players_per_team THEN
    RAISE EXCEPTION 'too_many' USING ERRCODE = 'P0001';
  END IF;

  DELETE FROM public.golf_tournament_entries en WHERE en.tournament_id = p_id;
  INSERT INTO public.golf_tournament_entries (tournament_id, team_id, player_id, role, slot, squad)
  SELECT p_id, v_t.team_id, (e->>'player_id')::uuid, e->>'role',
    CASE
      WHEN e->>'role' = 'lineup' THEN (e->>'slot')::smallint
      WHEN coalesce(e->>'squad', 'A') = 'B' AND e->>'role' = 'individual' THEN (e->>'slot')::smallint
    END,
    coalesce(e->>'squad', 'A')
  FROM jsonb_array_elements(coalesce(p_entries, '[]'::jsonb)) e;

  INSERT INTO public.golf_tournament_entry_notes (tournament_id, team_id, player_id, reasoning)
  SELECT p_id, v_t.team_id, (e->>'player_id')::uuid, left(e->>'reasoning', 500)
  FROM jsonb_array_elements(coalesce(p_entries, '[]'::jsonb)) e
  WHERE e ? 'reasoning'
  ON CONFLICT (tournament_id, player_id) DO UPDATE SET reasoning = excluded.reasoning;

  -- Touch the tournament so its version moves with the lineup.
  UPDATE public.golf_tournaments t SET updated_at = now() WHERE t.id = p_id;
  RETURN (SELECT t.version FROM public.golf_tournaments t WHERE t.id = p_id);
END $$;

-- 4. Lock (20261024100200 section 6, copying the squad).
create or replace function public.golf_tournament_lock_lineup(p_id uuid)
returns timestamptz
language plpgsql
security invoker
set search_path = ''
as $$
DECLARE
  v_t public.golf_tournaments%ROWTYPE;
  v_at timestamptz := now();
BEGIN
  SELECT * INTO v_t FROM public.golf_tournaments t WHERE t.id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0001';
  END IF;
  IF NOT public.is_golf_team_coach(v_t.team_id) THEN
    RAISE EXCEPTION 'not_coach' USING ERRCODE = 'P0001';
  END IF;
  IF v_t.lineup_locked_at IS NOT NULL THEN
    RAISE EXCEPTION 'locked' USING ERRCODE = 'P0001';
  END IF;
  IF v_t.format <> 'individual' AND NOT EXISTS (
    SELECT 1 FROM public.golf_tournament_entries en
    WHERE en.tournament_id = p_id AND en.role = 'lineup') THEN
    RAISE EXCEPTION 'lineup_empty' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.golf_tournament_round_lineups (round_event_id, team_id, player_id, role, slot, squad)
  SELECT r.round_event_id, v_t.team_id, en.player_id, en.role, en.slot, en.squad
  FROM public.golf_tournament_rounds r
  CROSS JOIN public.golf_tournament_entries en
  WHERE r.tournament_id = p_id AND en.tournament_id = p_id
  ON CONFLICT (round_event_id, player_id) DO NOTHING;
  UPDATE public.golf_tournaments t SET lineup_locked_at = v_at WHERE t.id = p_id;
  RETURN v_at;
END $$;

-- 5. Grants, as 20261024100200 section 12 (create or replace keeps them;
-- restated so the file stands alone).
revoke all on function public.golf_tournament_set_entries(
    uuid, jsonb, integer
) from public,
anon;
grant execute on function public.golf_tournament_set_entries(
    uuid, jsonb, integer
) to authenticated,
service_role;
revoke all on function public.golf_tournament_lock_lineup(uuid) from public,
anon;
grant execute on function public.golf_tournament_lock_lineup(
    uuid
) to authenticated,
service_role;

comment on column public.golf_tournament_entries.squad is
'F-05: A (every lineup, the team''s record) or B (a B team: individuals and '
'its alternate, never counted in the record).';
