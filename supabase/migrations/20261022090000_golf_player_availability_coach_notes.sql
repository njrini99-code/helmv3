-- STATUS: WRITTEN, HOLD, NOT APPLIED. Written 2026-10-22 for Clubhouse roster
-- availability (P003): the coach-only note beside Available, Injured or Away.
-- Registered in supabase/migrations/HELD.md; applied by the Production
-- rollout thread when the owner lifts the migration freeze.
-- Apply (one line):
--   npm run db:apply --
--   supabase/migrations/20261022090000_golf_player_availability_coach_notes.sql
-- Risk: LOW. One new table, no data, no change to any existing table or policy.
--
-- ORDER: no prerequisite. The app (src/clubhouse/data/roster.ts, the
-- setPlayerAvailabilityCoachNote action) treats a missing table (42P01 /
-- PGRST205) as "notes not available": the note field simply does not draw.
-- It may ship before or after this apply, and the field appears by itself once
-- the table exists.
--
-- WHY: golf_team_members.availability_note (20260929120000) cannot hold a
-- reason: golf_team_members_select_v5 lets every active teammate read every
-- column of their team's rows, and "injured, concussion protocol" about a
-- minor must not reach teammates. That column stays unused (the app never
-- selects or writes it). This table is the coach-only store: one note per
-- player per team, readable and writable only by a coach of that team.
--
-- WHO MAY TOUCH IT: an authenticated coach of team_id (is_golf_team_coach),
-- for a player who is a member of that team. A player, a teammate, anon and
-- PUBLIC get nothing (no policy admits them; anon has no grant). Super admins
-- have no special path here: support reads go through the service role.
--
-- ROLLBACK: drop table if exists public.golf_player_availability_coach_notes;
-- (loses only the notes; availability words live in golf_team_members and are
-- untouched, and the app falls back to the word only).
--
-- `npm run test:rls` could not run where this was written (no Docker); the
-- pgTAP file supabase/tests/rls/golf_player_availability_coach_notes.sql is
-- written but unrun.
--
-- VERIFY: select 1 where to_regclass(
-- VERIFY: 'public.golf_player_availability_coach_notes') is not null;
-- VERIFY: select 1 from pg_class where oid =
-- VERIFY: 'public.golf_player_availability_coach_notes'::regclass
-- VERIFY: and relrowsecurity;
-- VERIFY: select 1 where not has_table_privilege('anon',
-- VERIFY: 'public.golf_player_availability_coach_notes', 'SELECT');
-- VERIFY: select 1 from pg_indexes where indexname =
-- VERIFY: 'idx_golf_player_availability_coach_notes_updated_by';

-- The updated_by reference to auth.users takes a SHARE ROW EXCLUSIVE lock on
-- auth.users for this transaction; cap the wait so sign-in is never queued.
set lock_timeout = '3s';

create table if not exists public.golf_player_availability_coach_notes (
    team_id uuid not null
    references public.golf_teams (id) on delete cascade,
    player_id uuid not null
    references public.golf_players (id) on delete cascade,
    note text not null
    constraint golf_player_availability_coach_notes_length
    check (char_length(note) between 1 and 280),
    updated_by uuid
    references auth.users (id) on delete set null,
    updated_at timestamptz not null default now(),
    primary key (team_id, player_id)
);

comment on table public.golf_player_availability_coach_notes is
'Clubhouse roster availability: the coach-only reason beside Injured or Away '
'(at most 280 characters), one per player per team. Coaches of the team only; '
'never readable by a teammate, unlike golf_team_members.availability_note.';

create index if not exists idx_golf_player_availability_coach_notes_player
on public.golf_player_availability_coach_notes (player_id);

create index if not exists idx_golf_player_availability_coach_notes_updated_by
on public.golf_player_availability_coach_notes (updated_by);

alter table public.golf_player_availability_coach_notes
enable row level security;

drop policy if exists golf_player_availability_coach_notes_select
on public.golf_player_availability_coach_notes;
create policy golf_player_availability_coach_notes_select
on public.golf_player_availability_coach_notes
for select
to authenticated
using (public.is_golf_team_coach(team_id));

drop policy if exists golf_player_availability_coach_notes_insert
on public.golf_player_availability_coach_notes;
create policy golf_player_availability_coach_notes_insert
on public.golf_player_availability_coach_notes
for insert
to authenticated
with check (
    public.is_golf_team_coach(team_id)
    and updated_by = (select auth.uid())
    and exists (
        select 1
        from public.golf_team_members as gtm
        where
            gtm.team_id = golf_player_availability_coach_notes.team_id
            and gtm.player_id = golf_player_availability_coach_notes.player_id
    )
);

drop policy if exists golf_player_availability_coach_notes_update
on public.golf_player_availability_coach_notes;
create policy golf_player_availability_coach_notes_update
on public.golf_player_availability_coach_notes
for update
to authenticated
using (public.is_golf_team_coach(team_id))
with check (
    public.is_golf_team_coach(team_id)
    and updated_by = (select auth.uid())
);

drop policy if exists golf_player_availability_coach_notes_delete
on public.golf_player_availability_coach_notes;
create policy golf_player_availability_coach_notes_delete
on public.golf_player_availability_coach_notes
for delete
to authenticated
using (public.is_golf_team_coach(team_id));

revoke all on public.golf_player_availability_coach_notes from public, anon;
revoke all on public.golf_player_availability_coach_notes from authenticated;
grant select, insert, update, delete
on public.golf_player_availability_coach_notes to authenticated;
grant all on public.golf_player_availability_coach_notes to service_role;
