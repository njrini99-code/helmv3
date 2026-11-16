-- STATUS: WRITTEN, NOT APPLIED (HOLD, see HELD.md).
-- Written 16 Nov 2026 for launch readiness F-06, qualifier exemptions
--   (thread "Build coach table-stakes features", PR #2543). Not applied
--   anywhere, not run against any database.
--
-- Apply: npm run db:apply --
--   supabase/migrations/20261116100000_golf_qualifier_exemptions.sql
--   after npm run test:rls passes on a local stack (the pgTAP file is
--   supabase/tests/rls/golf_qualifier_exemptions.sql). Apply after
--   20261116091000 (independent of it).
--
-- Risk: LOW. Additive only: one new table, its indexes and policies. No
--   existing table, column, policy, grant or function changes.
--
-- What:
--   golf_qualifier_exemptions: one row a player the coach exempted from a
--   qualifier before it started (owner, 16 Nov 2026: "Exempt before, from
--   coach picks"). The player is entered but need not play: when selection
--   closes, each exemption becomes one of the qualifier's coach's picks, with
--   the reason, so places on score are untouched and Q-115 (a pick needs a
--   scored round) is waived only for an exempt player. reason is required
--   (1 to 280 characters), like a coach's pick reasoning.
--
-- RLS: coach-only, read and write (is_golf_team_coach), because the reason is
--   coach-only like a pick's reasoning (D-33). Players learn the outcome from
--   the squad, as with any coach's pick. The qualifier must be the same team's
--   and the player an entrant of it (both checked in the policies). anon has
--   nothing; authenticated has table privileges, the policies decide.
--
-- Code that reads it: src/lib/golf/qualifier-exemptions.ts (the Qualifiers
--   form and detail, and the selection service) and
--   src/app/golf/actions/qualifier-exemptions.ts. Everything runs WITHOUT this
--   migration: on 42P01 / PGRST205 nobody is exempt and the form says
--   exempting a player waits on this update.
--
-- ROLLBACK:
--   drop table if exists public.golf_qualifier_exemptions;
--   (no other object depends on it; picks already written stay as coach's
--   picks with their reasons)
--
-- VERIFY: select 1 where to_regclass('public.golf_qualifier_exemptions') is not
-- null;
-- VERIFY: select 1 where (select relrowsecurity from pg_class where oid =
-- 'public.golf_qualifier_exemptions'::regclass);
-- VERIFY: select 1 where (select count(*) from pg_policies where schemaname =
-- 'public' and tablename = 'golf_qualifier_exemptions') = 4;
-- VERIFY: select 1 where not has_table_privilege('anon',
-- 'public.golf_qualifier_exemptions', 'SELECT');

create table if not exists public.golf_qualifier_exemptions (
    qualifier_id uuid not null references public.golf_qualifiers (
        id
    ) on delete cascade,
    team_id uuid not null references public.golf_teams (id) on delete cascade,
    player_id uuid not null references public.golf_players (
        id
    ) on delete cascade,
    reason text not null check (char_length(btrim(reason)) between 1 and 280),
    created_by uuid references auth.users (id) on delete set null,
    created_at timestamptz not null default now(),
    primary key (qualifier_id, player_id)
);

comment on table public.golf_qualifier_exemptions is
'F-06: players a coach exempted from a qualifier before it started; each '
'becomes a coach''s pick when selection closes. Coach-only (the reason is like '
'a pick''s reasoning, D-33).';

create index if not exists golf_qualifier_exemptions_team_idx
on public.golf_qualifier_exemptions (
    team_id
);
create index if not exists golf_qualifier_exemptions_player_idx
on public.golf_qualifier_exemptions (
    player_id
);
create index if not exists golf_qualifier_exemptions_created_by_idx
on public.golf_qualifier_exemptions (
    created_by
);

alter table public.golf_qualifier_exemptions enable row level security;

drop policy if exists golf_qualifier_exemptions_select
on public.golf_qualifier_exemptions;
create policy golf_qualifier_exemptions_select
on public.golf_qualifier_exemptions
for select to authenticated
using (public.is_golf_team_coach(team_id));

drop policy if exists golf_qualifier_exemptions_insert
on public.golf_qualifier_exemptions;
create policy golf_qualifier_exemptions_insert
on public.golf_qualifier_exemptions
for insert to authenticated
with check (
    public.is_golf_team_coach(team_id)
    and exists (
        select 1
        from public.golf_qualifiers q
        where
            q.id = qualifier_id
            and q.team_id = golf_qualifier_exemptions.team_id
    )
    and exists (
        select 1
        from public.golf_qualifier_entries e
        where
            e.qualifier_id = golf_qualifier_exemptions.qualifier_id
            and e.player_id = golf_qualifier_exemptions.player_id
    )
);

drop policy if exists golf_qualifier_exemptions_update
on public.golf_qualifier_exemptions;
create policy golf_qualifier_exemptions_update
on public.golf_qualifier_exemptions
for update to authenticated
using (public.is_golf_team_coach(team_id))
with check (
    public.is_golf_team_coach(team_id)
    and exists (
        select 1
        from public.golf_qualifiers q
        where
            q.id = qualifier_id
            and q.team_id = golf_qualifier_exemptions.team_id
    )
    and exists (
        select 1
        from public.golf_qualifier_entries e
        where
            e.qualifier_id = golf_qualifier_exemptions.qualifier_id
            and e.player_id = golf_qualifier_exemptions.player_id
    )
);

drop policy if exists golf_qualifier_exemptions_delete
on public.golf_qualifier_exemptions;
create policy golf_qualifier_exemptions_delete
on public.golf_qualifier_exemptions
for delete to authenticated
using (public.is_golf_team_coach(team_id));

revoke all on table public.golf_qualifier_exemptions from anon, public;
grant select,
insert,
update,
delete on table public.golf_qualifier_exemptions to authenticated;
