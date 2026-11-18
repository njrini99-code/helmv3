-- STATUS: WRITTEN, NOT APPLIED (HOLD, see HELD.md).
-- Written 15 Nov 2026 for launch readiness F-04, the qualifier tie rule
--   (thread "Build coach table-stakes features", PR #2543). Not applied
--   anywhere, not run against any database.
--
-- Apply: npm run db:apply --
--   supabase/migrations/20261115240000_golf_qualifier_rules.sql
--   after npm run test:rls passes on a local stack (the pgTAP file is
--   supabase/tests/rls/golf_qualifier_rules.sql).
--
-- Risk: LOW. Additive only: one new table, its index and policies. No
--   existing table, column, policy, grant or function changes.
--
-- What:
--   golf_qualifier_rules: one row a qualifier, its standings rules. tie_rule
--   is how players level on to par and strokes are separated: 'coach' (they
--   share a place and the coach decides a tie at the cut, the rule every
--   qualifier had before) or 'last_round' (the lower last round, then the
--   round before; still level, they share a place). A qualifier with no row
--   ranks by 'coach', so applying this changes no qualifier already running.
--   The form saves 'last_round' for a new qualifier unless the coach picks
--   otherwise (owner, 15 Nov 2026).
--   count_best (F-06, added 16 Nov 2026 before this file was ever applied):
--   count each player's best N rounds, so a qualifier can drop the worst
--   round; null counts every round, as every qualifier does today.
--
-- RLS: the row is the qualifier's team's. A coach of the team
--   (is_golf_team_coach) reads and writes; an active player of the team
--   (is_golf_team_player) reads, so a player's standings rank the same way.
--   The qualifier must be the same team's (checked in the policy). A coach
--   may delete a row (back to the default). anon has nothing; authenticated
--   has table privileges, the policies decide.
--
-- Code that reads it: src/lib/golf/qualifier-rules.ts (the Qualifiers board,
--   list and form, the selection workspace and its confirm) and
--   src/app/golf/actions/qualifier-rules.ts. Everything runs WITHOUT this
--   migration: on 42P01 / PGRST205 every qualifier ranks by 'coach' and the
--   form says choosing a tie rule waits on this update.
--
-- ROLLBACK:
--   drop table if exists public.golf_qualifier_rules;
--   (no other object depends on it; the app reads it as missing again)
--
-- VERIFY: select 1 where to_regclass('public.golf_qualifier_rules') is not
-- null;
-- VERIFY: select 1 where (select relrowsecurity from pg_class where oid =
-- 'public.golf_qualifier_rules'::regclass);
-- VERIFY: select 1 where (select count(*) from pg_policies where schemaname =
-- 'public' and tablename = 'golf_qualifier_rules') = 4;
-- VERIFY: select 1 where not has_table_privilege('anon',
-- 'public.golf_qualifier_rules', 'SELECT');
-- VERIFY: select 1 where exists (select 1 from information_schema.columns where
-- table_schema = 'public' and table_name = 'golf_qualifier_rules' and
-- column_name = 'count_best');

create table if not exists public.golf_qualifier_rules (
    qualifier_id uuid primary key references public.golf_qualifiers (
        id
    ) on delete cascade,
    team_id uuid not null references public.golf_teams (id) on delete cascade,
    tie_rule text not null default 'coach' check (
        tie_rule in ('coach', 'last_round')
    ),
    -- F-06: count each player's best N rounds (null: every round, the rule
    -- every qualifier had before).
    -- a small bounded value (its check holds it far below the smallint limit).
    -- squawk-ignore prefer-bigint-over-smallint
    count_best smallint check (count_best between 1 and 10),
    updated_by uuid references auth.users (id) on delete set null,
    updated_at timestamptz not null default now()
);

comment on table public.golf_qualifier_rules is
'F-04: a qualifier''s standings rules (its tie rule). One row a qualifier; '
'absent means coach (level players share a place, the coach decides a tie at '
'the cut).';

create index if not exists golf_qualifier_rules_team_idx
on public.golf_qualifier_rules (
    team_id
);
create index if not exists golf_qualifier_rules_updated_by_idx
on public.golf_qualifier_rules (
    updated_by
);

alter table public.golf_qualifier_rules enable row level security;

drop policy if exists golf_qualifier_rules_select
on public.golf_qualifier_rules;
create policy golf_qualifier_rules_select on public.golf_qualifier_rules
for select to authenticated
using (
    public.is_golf_team_coach(team_id) or public.is_golf_team_player(team_id)
);

drop policy if exists golf_qualifier_rules_insert
on public.golf_qualifier_rules;
create policy golf_qualifier_rules_insert on public.golf_qualifier_rules
for insert to authenticated
with check (
    public.is_golf_team_coach(team_id)
    and exists (
        select 1
        from public.golf_qualifiers q
        where q.id = qualifier_id and q.team_id = golf_qualifier_rules.team_id
    )
);

drop policy if exists golf_qualifier_rules_update
on public.golf_qualifier_rules;
create policy golf_qualifier_rules_update on public.golf_qualifier_rules
for update to authenticated
using (public.is_golf_team_coach(team_id))
with check (
    public.is_golf_team_coach(team_id)
    and exists (
        select 1
        from public.golf_qualifiers q
        where q.id = qualifier_id and q.team_id = golf_qualifier_rules.team_id
    )
);

drop policy if exists golf_qualifier_rules_delete
on public.golf_qualifier_rules;
create policy golf_qualifier_rules_delete on public.golf_qualifier_rules
for delete to authenticated
using (public.is_golf_team_coach(team_id));

revoke all on table public.golf_qualifier_rules from anon, public;
grant select,
insert,
update,
delete on table public.golf_qualifier_rules to authenticated;
