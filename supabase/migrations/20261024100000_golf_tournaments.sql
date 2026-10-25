-- STATUS: WRITTEN — HOLD — NOT APPLIED
-- P016 Clubhouse Tournaments, held migration 1 of 6: the tables. Written
-- 2026-10-23 from handoff 4.33 section 11.2; revised 2026-10-24 (Round 6:
-- delete-safe foreign keys, team scoping trigger). Registered in
-- supabase/migrations/HELD.md; the owner applies it (OQ-65: D-80 to D-101
-- approve the product, not the apply). Plan:
-- docs/clubhouse/held/data/tournaments.md.
--
-- Decisions: D-80 (page P016), D-81 (one tournament row per team, each round
-- an ordinary golf_events row), D-82 (one player-round row per player per
-- round; golf_rounds is never updated).
--
-- APPLY ALL SIX TOGETHER, IN THIS ORDER, IN ONE SESSION:
--   1 20261024100000_golf_tournaments.sql (this file)
--   2 20261024100100_golf_tournaments_rls.sql
--   3 20261024100200_golf_tournaments_rpcs.sql
--   4 20261024100300_golf_tournaments_player_moments.sql
--   5 20261024100400_notification_preferences_push_tournaments.sql
--   6 20261024100500_golf_tournament_live.sql
-- Each through npm run db:apply (it wraps the file in one transaction; no
-- BEGIN/COMMIT here), each file's VERIFY passing before the next. Nothing
-- reads these tables until golf_tournaments_v1 is on.
--
-- Risk: LOW on its own. New tables only, no data. RLS is enabled here with
-- no policy (deny all) so the tables are closed until 100100.
--
-- FOREIGN KEYS, ON DELETE, one by one (why each):
--   * golf_tournaments.team_id -> golf_teams CASCADE: a tournament is the
--     team's; deleting the team deletes its tournaments and, through the
--     composite (tournament_id, team_id) keys, every child row (CASCADE on
--     all of them). Nothing outlives its tournament.
--   * golf_tournament_rounds.round_event_id -> golf_events NO ACTION
--     DEFERRABLE INITIALLY DEFERRED (was RESTRICT). Tested on the local
--     stack 2026-10-24: with RESTRICT, and also with plain NO ACTION, a team
--     delete fails whenever the golf_teams cascade reaches golf_events before
--     it reaches the rounds (the cascaded delete's check runs at the end of
--     that inner statement). Deferred to commit, a team delete removes both
--     sides and passes, while deleting a round-day event on its own still
--     fails at commit, so the calendar cannot silently drop a round with its
--     lineups and scores (CASCADE would). SET NULL is impossible: it is the
--     primary key. golf_tournament_delete (100200) deletes the tournament
--     first, then the events it owns.
--   * course_id, tee_id -> golf_courses, golf_course_tees SET NULL: a course
--     edit must not delete results; the round keeps its scores.
--   * every player_id -> golf_players CASCADE: a deleted player (account
--     deletion of a minor) takes their tournament rows with them, as their
--     golf_rounds already go. substituted_for and with_player_id SET NULL:
--     the row is about someone else and stays.
--   * golf_tournament_player_rounds.round_id -> golf_rounds SET NULL: a
--     deleted GolfHelm round leaves an unlinked slot ("no score yet"), never
--     a deleted tournament row (golf_tpr_one_source allows both empty).
--   * golf_tournament_result_marks (round_event_id, team_id) ->
--     golf_tournament_rounds SET NULL (round_event_id): the append-only
--     trust log survives a removed round; only the round reference is
--     cleared, team_id stays (plain SET NULL would null the NOT NULL team_id).
--   * created_by, updated_by, dismissed_by -> auth.users SET NULL: authorship
--     is cleared, the record stays. owner_id, user_id, coach_user_id ->
--     auth.users CASCADE: the row is that person's (a saved comparison,
--     advice-giver seat, presence) and means nothing without them.
--   * golf_tournament_link_dismissals.round_id -> golf_rounds CASCADE: a
--     dismissal of a deleted round is meaningless.
--
-- TEAM SCOPING. Every table carries team_id; the policies (100100) gate on
-- is_golf_team_coach / is_golf_team_player (golf_team_coach_staff and
-- golf_team_members). Composite keys stop a child claiming another team's
-- tournament or round. helm_private.guard_tournament_team() (below) closes
-- the remaining cross-references, for every role including service_role:
-- a round's golf_events row is the same team's; every player_id,
-- substituted_for and with_player_id has a golf_team_members row on that
-- team (any status, so alumni rows stay editable); a linked golf_rounds row
-- is that player's; a dismissed round is a team player's; advice givers and
-- presence rows are coaches of the team; a result mark's round is in its
-- tournament.
--
-- ROLLBACK: drop the tables in reverse dependency order, then the functions:
--   drop table if exists public.golf_tournament_link_dismissals,
--     public.golf_team_seasons, public.golf_saved_comparisons,
--     public.golf_tournament_coach_presence,
--     public.golf_tournament_advice_givers,
--     public.golf_tournament_reflections, public.golf_tournament_player_notes,
--     public.golf_tournament_reviews, public.golf_tournament_entry_notes,
--     public.golf_tournament_result_marks, public.golf_tournament_field_scores,
--     public.golf_tournament_field_teams,
--     public.golf_tournament_player_rounds,
--     public.golf_tournament_round_lineups, public.golf_tournament_entries,
--     public.golf_tournament_rounds, public.golf_tournaments;
--   drop function if exists helm_private.touch_tournament_version();
--   drop function if exists helm_private.guard_tournament_team(),
--     helm_private.tournament_assert_member(uuid, uuid),
--     helm_private.tournament_assert(boolean, text);
-- Nothing else references them, and no existing row changes.
--
-- VERIFY: select 1 where to_regclass('public.golf_tournaments') is not null;
-- VERIFY: select 1 where to_regclass('public.golf_tournament_rounds')
-- VERIFY: is not null;
-- VERIFY: select 1 from pg_class where oid =
-- VERIFY: 'public.golf_tournament_player_rounds'::regclass
-- VERIFY: and relrowsecurity;
-- VERIFY: select 1 where not has_table_privilege('anon',
-- VERIFY: 'public.golf_tournaments', 'SELECT');
-- VERIFY: select 1 from pg_constraint where conname =
-- VERIFY: 'golf_tournament_rounds_round_event_id_fkey' and confdeltype = 'a'
-- VERIFY: and condeferred;

-- The auth.users and golf_* references lock those tables briefly while the
-- foreign keys are created; cap the wait so sign-in and round saves are
-- never queued behind this file.
set local lock_timeout = '3s';

-- 1. The tournament edition (one team, one gender: D-81)
create table if not exists public.golf_tournaments (
    id uuid primary key default gen_random_uuid(),
    team_id uuid not null
    references public.golf_teams (id) on delete cascade,
    name text not null check (char_length(name) between 1 and 120),
    start_date date not null,
    end_date date not null,
    course_id uuid references public.golf_courses (id) on delete set null,
    format text not null default '5c4'
    check (
        format in (
            '5c4', '6c5', '6c4', 'custom', 'match', 'medal_match',
            'individual'
        )
    ),
    players_per_team bigint not null default 5
    check (players_per_team between 1 and 9),
    counting bigint not null default 4 check (counting between 1 and 9),
    holes_per_round bigint not null default 18
    check (holes_per_round in (9, 18)),
    rounds_count bigint not null default 3
    check (rounds_count between 1 and 6),
    event_kind text not null default 'regular'
    check (
        event_kind in (
            'regular', 'conference', 'ncaa_regional', 'ncaa_championship',
            'exhibition'
        )
    ),
    tiebreak text not null default 'ties_stand'
    check (tiebreak in ('ties_stand', 'ncaa', 'playoff', 'card_playoff')),
    field_size bigint check (field_size between 1 and 40),
    line_kind text check (line_kind in ('advance', 'cut', 'match_play')),
    line_value bigint check (line_value between 1 and 40),
    substitutions boolean not null default false,
    lock_minutes bigint not null default 10
    check (lock_minutes between 0 and 1440),
    lineup_locked_at timestamptz,
    lineup_published_at timestamptz,
    official_at timestamptz,
    results_url text
    check (results_url is null or results_url ~ '^https://'),
    host text check (char_length(host) <= 120),
    created_by uuid references auth.users (id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    -- Bounded optimistic-lock counter; matches the integer RPC version contract.
    -- squawk-ignore prefer-bigint-over-int
    version integer not null default 1,
    constraint golf_tournaments_counting_le_players
    check (counting <= players_per_team),
    constraint golf_tournaments_dates check (end_date >= start_date),
    constraint golf_tournaments_id_team_uq unique (id, team_id)
);
alter table public.golf_tournaments enable row level security;

-- 2. Competition rounds. Each is an ordinary golf_events row
-- (event_type 'tournament', parent_event_id left NULL). Deferred NO ACTION
-- (see the header): a round-day event cannot be deleted from the calendar on
-- its own while it belongs to a tournament, but a team delete removes both.
create table if not exists public.golf_tournament_rounds (
    round_event_id uuid primary key
    references public.golf_events (id) on delete no action
    deferrable initially deferred,
    tournament_id uuid not null,
    team_id uuid not null,
    round_number bigint not null check (round_number between 1 and 6),
    course_id uuid references public.golf_courses (id) on delete set null,
    tee_id uuid references public.golf_course_tees (id) on delete set null,
    start_type text not null default 'tee_times'
    check (start_type in ('tee_times', 'shotgun', 'two_tees')),
    first_tee_at timestamptz,
    status text not null default 'upcoming'
    check (
        status in (
            'upcoming', 'live', 'suspended_weather', 'suspended_other',
            'final'
        )
    ),
    status_changed_at timestamptz not null default now(),
    event_adopted boolean not null default false,
    foreign key (tournament_id, team_id)
    references public.golf_tournaments (id, team_id) on delete cascade,
    unique (tournament_id, round_number),
    unique (round_event_id, team_id)
);
alter table public.golf_tournament_rounds enable row level security;

-- 3. Entries: who is in the event (lineup, alternate or individual)
create table if not exists public.golf_tournament_entries (
    tournament_id uuid not null,
    team_id uuid not null,
    player_id uuid not null
    references public.golf_players (id) on delete cascade,
    role text not null check (role in ('lineup', 'alternate', 'individual')),
    slot bigint check (slot between 1 and 9),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (tournament_id, player_id),
    foreign key (tournament_id, team_id)
    references public.golf_tournaments (id, team_id) on delete cascade,
    constraint golf_tournament_entries_slot_role
    check ((role = 'lineup') = (slot is not null))
);
alter table public.golf_tournament_entries enable row level security;
create unique index if not exists golf_tournament_entries_slot_uq
on public.golf_tournament_entries (tournament_id, slot)
where slot is not null;

-- 4. Per-round lineup: the snapshot taken at lock; a substitution changes
-- it for that round and the later ones
create table if not exists public.golf_tournament_round_lineups (
    round_event_id uuid not null,
    team_id uuid not null,
    player_id uuid not null
    references public.golf_players (id) on delete cascade,
    role text not null check (role in ('lineup', 'alternate', 'individual')),
    slot bigint check (slot between 1 and 9),
    substituted_for uuid
    references public.golf_players (id) on delete set null,
    substituted_at timestamptz,
    primary key (round_event_id, player_id),
    foreign key (round_event_id, team_id)
    references public.golf_tournament_rounds (round_event_id, team_id)
    on delete cascade
);
alter table public.golf_tournament_round_lineups enable row level security;

-- 5. A player's score in a tournament round: a linked GolfHelm round, or an
-- entered score (D-82). golf_rounds itself is never updated.
create table if not exists public.golf_tournament_player_rounds (
    round_event_id uuid not null,
    team_id uuid not null,
    player_id uuid not null
    references public.golf_players (id) on delete cascade,
    round_id uuid unique
    references public.golf_rounds (id) on delete set null,
    entered_total bigint check (entered_total between 20 and 200),
    entered_front bigint check (entered_front between 10 and 100),
    entered_back bigint check (entered_back between 10 and 100),
    status text not null default 'ok'
    check (status in ('ok', 'wd', 'dq', 'dq_pending')),
    wd_after_hole bigint check (wd_after_hole between 0 and 18),
    link_source text check (link_source in ('coach', 'auto', 'player')),
    note text check (char_length(note) <= 280),
    updated_by uuid references auth.users (id) on delete set null,
    updated_at timestamptz not null default now(),
    primary key (round_event_id, player_id),
    foreign key (round_event_id, team_id)
    references public.golf_tournament_rounds (round_event_id, team_id)
    on delete cascade,
    constraint golf_tpr_one_source
    check (not (round_id is not null and entered_total is not null))
);
alter table public.golf_tournament_player_rounds enable row level security;

-- 6. The field: the other teams (and us), and their totals per round
create table if not exists public.golf_tournament_field_teams (
    id uuid primary key default gen_random_uuid(),
    tournament_id uuid not null,
    team_id uuid not null,
    name text not null check (char_length(name) between 1 and 80),
    is_us boolean not null default false,
    is_b_team boolean not null default false,
    same_division boolean not null default true,
    seed bigint,
    final_place bigint,
    final_place_tied boolean not null default false,
    final_total bigint,
    foreign key (tournament_id, team_id)
    references public.golf_tournaments (id, team_id) on delete cascade,
    unique (id, team_id)
);
alter table public.golf_tournament_field_teams enable row level security;
create unique index if not exists golf_tournament_field_us_uq
on public.golf_tournament_field_teams (tournament_id)
where is_us;

create table if not exists public.golf_tournament_field_scores (
    field_team_id uuid not null,
    team_id uuid not null,
    round_number bigint not null check (round_number between 1 and 6),
    total bigint check (total between 60 and 800),
    thru bigint check (thru between 0 and 18),
    entered_at timestamptz not null default now(),
    primary key (field_team_id, round_number),
    foreign key (field_team_id, team_id)
    references public.golf_tournament_field_teams (id, team_id)
    on delete cascade
);
alter table public.golf_tournament_field_scores enable row level security;

-- 7. Result trust log (D-84), append-only: final, official, reopened
create table if not exists public.golf_tournament_result_marks (
    id uuid primary key default gen_random_uuid(),
    tournament_id uuid not null,
    team_id uuid not null,
    round_event_id uuid,
    state text not null check (state in ('final', 'official', 'reopened')),
    reason text check (char_length(reason) <= 280),
    snapshot jsonb not null default '{}'::jsonb,
    created_by uuid references auth.users (id) on delete set null,
    created_at timestamptz not null default now(),
    foreign key (tournament_id, team_id)
    references public.golf_tournaments (id, team_id) on delete cascade,
    constraint golf_trm_round_fkey foreign key (round_event_id, team_id)
    references public.golf_tournament_rounds (round_event_id, team_id)
    on delete set null (round_event_id)
);
alter table public.golf_tournament_result_marks enable row level security;

-- 8. Coach-only reasoning and review; per-player debrief; the player's own
-- reflection
create table if not exists public.golf_tournament_entry_notes (
    tournament_id uuid not null,
    team_id uuid not null,
    player_id uuid not null
    references public.golf_players (id) on delete cascade,
    reasoning text check (char_length(reasoning) <= 500),
    updated_at timestamptz not null default now(),
    primary key (tournament_id, player_id),
    foreign key (tournament_id, team_id)
    references public.golf_tournaments (id, team_id) on delete cascade
);
alter table public.golf_tournament_entry_notes enable row level security;

create table if not exists public.golf_tournament_reviews (
    tournament_id uuid primary key,
    team_id uuid not null,
    observation text check (char_length(observation) <= 4000),
    hypothesis text check (char_length(hypothesis) <= 4000),
    evidence jsonb not null default '[]'::jsonb,
    updated_by uuid references auth.users (id) on delete set null,
    updated_at timestamptz not null default now(),
    foreign key (tournament_id, team_id)
    references public.golf_tournaments (id, team_id) on delete cascade
);
alter table public.golf_tournament_reviews enable row level security;

create table if not exists public.golf_tournament_player_notes (
    tournament_id uuid not null,
    team_id uuid not null,
    player_id uuid not null
    references public.golf_players (id) on delete cascade,
    shot_of_day text check (char_length(shot_of_day) <= 280),
    decision text check (char_length(decision) <= 280),
    next_focus text check (char_length(next_focus) <= 280),
    shared_at timestamptz,
    updated_at timestamptz not null default now(),
    primary key (tournament_id, player_id),
    foreign key (tournament_id, team_id)
    references public.golf_tournaments (id, team_id) on delete cascade
);
alter table public.golf_tournament_player_notes enable row level security;

create table if not exists public.golf_tournament_reflections (
    tournament_id uuid not null,
    team_id uuid not null,
    player_id uuid not null
    references public.golf_players (id) on delete cascade,
    body text not null check (char_length(body) between 1 and 2000),
    updated_at timestamptz not null default now(),
    primary key (tournament_id, player_id),
    foreign key (tournament_id, team_id)
    references public.golf_tournaments (id, team_id) on delete cascade
);
alter table public.golf_tournament_reflections enable row level security;

-- 9. Staff on course: the two advice givers, and who a coach is with
create table if not exists public.golf_tournament_advice_givers (
    tournament_id uuid not null,
    team_id uuid not null,
    user_id uuid not null references auth.users (id) on delete cascade,
    primary key (tournament_id, user_id),
    foreign key (tournament_id, team_id)
    references public.golf_tournaments (id, team_id) on delete cascade
);
alter table public.golf_tournament_advice_givers enable row level security;

create table if not exists public.golf_tournament_coach_presence (
    round_event_id uuid not null,
    team_id uuid not null,
    coach_user_id uuid not null
    references auth.users (id) on delete cascade,
    with_player_id uuid
    references public.golf_players (id) on delete set null,
    updated_at timestamptz not null default now(),
    primary key (round_event_id, coach_user_id),
    foreign key (round_event_id, team_id)
    references public.golf_tournament_rounds (round_event_id, team_id)
    on delete cascade
);
alter table public.golf_tournament_coach_presence enable row level security;

-- 10. Saved comparisons and the team's season profile
create table if not exists public.golf_saved_comparisons (
    id uuid primary key default gen_random_uuid(),
    team_id uuid not null
    references public.golf_teams (id) on delete cascade,
    owner_id uuid not null references auth.users (id) on delete cascade,
    name text not null check (char_length(name) between 1 and 60),
    scope_a text not null check (char_length(scope_a) <= 400),
    scope_b text not null check (char_length(scope_b) <= 400),
    bench text not null default 'team'
    check (bench in ('team', 'field', 'd1', 'top25', 'none')),
    metric_group text not null default 'scoring'
    check (char_length(metric_group) <= 40),
    shared boolean not null default false,
    created_at timestamptz not null default now()
);
alter table public.golf_saved_comparisons enable row level security;

create table if not exists public.golf_team_seasons (
    team_id uuid not null
    references public.golf_teams (id) on delete cascade,
    season text not null check (season ~ '^\d{4}-\d{2}$'),
    division text
    check (division in ('d1', 'd2', 'd3', 'naia', 'njcaa', 'other')),
    conference text check (char_length(conference) <= 80),
    official_rank bigint check (official_rank between 1 and 400),
    official_rank_at date,
    primary key (team_id, season)
);
alter table public.golf_team_seasons enable row level security;

create table if not exists public.golf_tournament_link_dismissals (
    team_id uuid not null
    references public.golf_teams (id) on delete cascade,
    round_id uuid not null
    references public.golf_rounds (id) on delete cascade,
    dismissed_by uuid references auth.users (id) on delete set null,
    dismissed_at timestamptz not null default now(),
    primary key (team_id, round_id)
);
alter table public.golf_tournament_link_dismissals enable row level security;

-- 11. Indexes for the loaders and for every foreign key without a leading
-- index of its own (.claude/rules/database.md)
create index if not exists golf_tournaments_team_idx
on public.golf_tournaments (team_id, start_date desc);
create index if not exists golf_tournaments_course_idx
on public.golf_tournaments (course_id);
create index if not exists golf_tournaments_created_by_idx
on public.golf_tournaments (created_by);
create index if not exists golf_tournament_rounds_parent_idx
on public.golf_tournament_rounds (tournament_id, team_id);
create index if not exists golf_tournament_rounds_team_idx
on public.golf_tournament_rounds (team_id);
create index if not exists golf_tournament_rounds_course_idx
on public.golf_tournament_rounds (course_id);
create index if not exists golf_tournament_rounds_tee_idx
on public.golf_tournament_rounds (tee_id);
create index if not exists golf_tournament_entries_team_idx
on public.golf_tournament_entries (team_id);
create index if not exists golf_tournament_entries_parent_idx
on public.golf_tournament_entries (tournament_id, team_id);
create index if not exists golf_tournament_entries_player_idx
on public.golf_tournament_entries (player_id);
create index if not exists golf_trl_round_team_idx
on public.golf_tournament_round_lineups (round_event_id, team_id);
create index if not exists golf_trl_team_idx
on public.golf_tournament_round_lineups (team_id);
create index if not exists golf_trl_player_idx
on public.golf_tournament_round_lineups (player_id);
create index if not exists golf_trl_substituted_for_idx
on public.golf_tournament_round_lineups (substituted_for);
create index if not exists golf_tpr_round_team_idx
on public.golf_tournament_player_rounds (round_event_id, team_id);
create index if not exists golf_tpr_team_idx
on public.golf_tournament_player_rounds (team_id);
create index if not exists golf_tpr_player_idx
on public.golf_tournament_player_rounds (player_id);
create index if not exists golf_tpr_updated_by_idx
on public.golf_tournament_player_rounds (updated_by);
create index if not exists golf_tft_parent_idx
on public.golf_tournament_field_teams (tournament_id, team_id);
create index if not exists golf_tft_team_idx
on public.golf_tournament_field_teams (team_id);
create index if not exists golf_tfs_field_team_idx
on public.golf_tournament_field_scores (field_team_id, team_id);
create index if not exists golf_tfs_team_idx
on public.golf_tournament_field_scores (team_id);
create index if not exists golf_trm_parent_idx
on public.golf_tournament_result_marks (tournament_id, team_id);
create index if not exists golf_trm_team_idx
on public.golf_tournament_result_marks (team_id);
create index if not exists golf_trm_round_idx
on public.golf_tournament_result_marks (round_event_id, team_id);
create index if not exists golf_trm_created_by_idx
on public.golf_tournament_result_marks (created_by);
create index if not exists golf_ten_parent_idx
on public.golf_tournament_entry_notes (tournament_id, team_id);
create index if not exists golf_ten_team_idx
on public.golf_tournament_entry_notes (team_id);
create index if not exists golf_ten_player_idx
on public.golf_tournament_entry_notes (player_id);
create index if not exists golf_trev_parent_idx
on public.golf_tournament_reviews (tournament_id, team_id);
create index if not exists golf_trev_team_idx
on public.golf_tournament_reviews (team_id);
create index if not exists golf_trev_updated_by_idx
on public.golf_tournament_reviews (updated_by);
create index if not exists golf_tpn_parent_idx
on public.golf_tournament_player_notes (tournament_id, team_id);
create index if not exists golf_tpn_team_idx
on public.golf_tournament_player_notes (team_id);
create index if not exists golf_tpn_player_idx
on public.golf_tournament_player_notes (player_id);
create index if not exists golf_tref_parent_idx
on public.golf_tournament_reflections (tournament_id, team_id);
create index if not exists golf_tref_team_idx
on public.golf_tournament_reflections (team_id);
create index if not exists golf_tref_player_idx
on public.golf_tournament_reflections (player_id);
create index if not exists golf_tag_parent_idx
on public.golf_tournament_advice_givers (tournament_id, team_id);
create index if not exists golf_tag_team_idx
on public.golf_tournament_advice_givers (team_id);
create index if not exists golf_tag_user_idx
on public.golf_tournament_advice_givers (user_id);
create index if not exists golf_tcp_round_team_idx
on public.golf_tournament_coach_presence (round_event_id, team_id);
create index if not exists golf_tcp_team_idx
on public.golf_tournament_coach_presence (team_id);
create index if not exists golf_tcp_coach_idx
on public.golf_tournament_coach_presence (coach_user_id);
create index if not exists golf_tcp_with_player_idx
on public.golf_tournament_coach_presence (with_player_id);
create index if not exists golf_saved_comparisons_owner_idx
on public.golf_saved_comparisons (team_id, owner_id);
create index if not exists golf_saved_comparisons_owner_id_idx
on public.golf_saved_comparisons (owner_id);
create index if not exists golf_tld_round_idx
on public.golf_tournament_link_dismissals (round_id);
create index if not exists golf_tld_dismissed_by_idx
on public.golf_tournament_link_dismissals (dismissed_by);

-- 12. updated_at and version. golf_tournaments bumps version as well as
-- updated_at (compare-and-set in golf_tournament_update); every other table
-- with updated_at reuses public.touch_updated_at().
create or replace function helm_private.touch_tournament_version()
returns trigger
language plpgsql
set search_path = ''
as $$
BEGIN
  NEW.updated_at := now();
  NEW.version := OLD.version + 1;
  RETURN NEW;
END $$;
revoke all on function helm_private.touch_tournament_version()
from public, anon, authenticated;

create or replace trigger golf_tournaments_touch
before update on public.golf_tournaments
for each row execute function helm_private.touch_tournament_version();
create or replace trigger golf_tournament_entries_touch
before update on public.golf_tournament_entries
for each row execute function public.touch_updated_at();
create or replace trigger golf_tpr_touch
before update on public.golf_tournament_player_rounds
for each row execute function public.touch_updated_at();
create or replace trigger golf_ten_touch
before update on public.golf_tournament_entry_notes
for each row execute function public.touch_updated_at();
create or replace trigger golf_tournament_reviews_touch
before update on public.golf_tournament_reviews
for each row execute function public.touch_updated_at();
create or replace trigger golf_tpn_touch
before update on public.golf_tournament_player_notes
for each row execute function public.touch_updated_at();
create or replace trigger golf_tref_touch
before update on public.golf_tournament_reflections
for each row execute function public.touch_updated_at();
create or replace trigger golf_tcp_touch
before update on public.golf_tournament_coach_presence
for each row execute function public.touch_updated_at();

-- 12b. Team scoping for cross-references the composite keys cannot express
-- (header, TEAM SCOPING). SECURITY DEFINER so the check reads the roster and
-- calendar whatever the caller may see, and binds service_role too. On
-- UPDATE it re-checks only when a checked column changes, so a player who
-- later leaves the roster does not freeze their old rows.
create or replace function helm_private.tournament_assert(
    p_ok boolean, p_message text
)
returns void
language plpgsql
immutable
set search_path = ''
as $$
BEGIN
  IF NOT coalesce(p_ok, false) THEN
    RAISE EXCEPTION '%', p_message USING ERRCODE = '23514';
  END IF;
END $$;
revoke all on function helm_private.tournament_assert(boolean, text)
from public, anon, authenticated;

create or replace function helm_private.tournament_assert_member(
    p_team_id uuid, p_player_id uuid
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.golf_team_members m
    WHERE m.team_id = p_team_id AND m.player_id = p_player_id) THEN
    RAISE EXCEPTION 'player % is not on team %', p_player_id, p_team_id
      USING ERRCODE = '23514';
  END IF;
END $$;
revoke all on function helm_private.tournament_assert_member(uuid, uuid)
from public, anon, authenticated;

create or replace function helm_private.guard_tournament_team()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
DECLARE
  v_ins boolean := TG_OP = 'INSERT';
  v_team_changed boolean := TG_OP = 'INSERT' OR NEW.team_id IS DISTINCT FROM OLD.team_id;
BEGIN
  -- Field access on NEW is only evaluated inside the branch for a table that
  -- has the field (plpgsql resolves record fields per expression).
  CASE TG_TABLE_NAME
  WHEN 'golf_tournament_rounds' THEN
    IF v_team_changed OR NEW.round_event_id IS DISTINCT FROM OLD.round_event_id THEN
      PERFORM helm_private.tournament_assert(EXISTS (
        SELECT 1 FROM public.golf_events e
        WHERE e.id = NEW.round_event_id AND e.team_id = NEW.team_id),
        format('tournament round %s is not an event of team %s',
          NEW.round_event_id, NEW.team_id));
    END IF;

  WHEN 'golf_tournament_advice_givers' THEN
    IF v_team_changed OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      PERFORM helm_private.tournament_assert(EXISTS (
        SELECT 1 FROM public.golf_team_coach_staff s
        JOIN public.golf_coaches c ON c.id = s.coach_id
        WHERE s.team_id = NEW.team_id AND c.user_id = NEW.user_id),
        format('user %s is not a coach of team %s', NEW.user_id, NEW.team_id));
    END IF;

  WHEN 'golf_tournament_coach_presence' THEN
    IF v_team_changed OR NEW.coach_user_id IS DISTINCT FROM OLD.coach_user_id THEN
      PERFORM helm_private.tournament_assert(EXISTS (
        SELECT 1 FROM public.golf_team_coach_staff s
        JOIN public.golf_coaches c ON c.id = s.coach_id
        WHERE s.team_id = NEW.team_id AND c.user_id = NEW.coach_user_id),
        format('user %s is not a coach of team %s', NEW.coach_user_id,
          NEW.team_id));
    END IF;
    IF NEW.with_player_id IS NOT NULL AND (v_team_changed
        OR NEW.with_player_id IS DISTINCT FROM OLD.with_player_id) THEN
      PERFORM helm_private.tournament_assert_member(NEW.team_id,
        NEW.with_player_id);
    END IF;

  WHEN 'golf_tournament_link_dismissals' THEN
    IF v_team_changed OR NEW.round_id IS DISTINCT FROM OLD.round_id THEN
      PERFORM helm_private.tournament_assert(EXISTS (
        SELECT 1 FROM public.golf_rounds r
        JOIN public.golf_team_members m ON m.player_id = r.player_id
        WHERE r.id = NEW.round_id AND m.team_id = NEW.team_id),
        format('round %s is not a round of a team %s player', NEW.round_id,
          NEW.team_id));
    END IF;

  WHEN 'golf_tournament_result_marks' THEN
    IF NEW.round_event_id IS NOT NULL THEN
      PERFORM helm_private.tournament_assert(EXISTS (
        SELECT 1 FROM public.golf_tournament_rounds r
        WHERE r.round_event_id = NEW.round_event_id
          AND r.tournament_id = NEW.tournament_id),
        format('round %s is not in tournament %s', NEW.round_event_id,
          NEW.tournament_id));
    END IF;

  ELSE
    -- entries, round lineups, player rounds, entry notes, player notes,
    -- reflections: player_id is on the team.
    IF v_team_changed OR NEW.player_id IS DISTINCT FROM OLD.player_id THEN
      PERFORM helm_private.tournament_assert_member(NEW.team_id,
        NEW.player_id);
    END IF;
    IF TG_TABLE_NAME = 'golf_tournament_round_lineups' THEN
      IF NEW.substituted_for IS NOT NULL AND (v_team_changed
          OR NEW.substituted_for IS DISTINCT FROM OLD.substituted_for) THEN
        PERFORM helm_private.tournament_assert_member(NEW.team_id,
          NEW.substituted_for);
      END IF;
    ELSIF TG_TABLE_NAME = 'golf_tournament_player_rounds' THEN
      IF NEW.round_id IS NOT NULL AND (v_ins
          OR NEW.round_id IS DISTINCT FROM OLD.round_id
          OR NEW.player_id IS DISTINCT FROM OLD.player_id) THEN
        PERFORM helm_private.tournament_assert(EXISTS (
          SELECT 1 FROM public.golf_rounds r
          WHERE r.id = NEW.round_id AND r.player_id = NEW.player_id),
          format('round %s is not player %s''s', NEW.round_id,
            NEW.player_id));
      END IF;
    END IF;
  END CASE;
  RETURN NEW;
END $$;
revoke all on function helm_private.guard_tournament_team()
from public, anon, authenticated;

do $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'golf_tournament_rounds', 'golf_tournament_entries',
    'golf_tournament_round_lineups', 'golf_tournament_player_rounds',
    'golf_tournament_result_marks', 'golf_tournament_entry_notes',
    'golf_tournament_player_notes', 'golf_tournament_reflections',
    'golf_tournament_advice_givers', 'golf_tournament_coach_presence',
    'golf_tournament_link_dismissals'
  ]
  LOOP
    EXECUTE format(
      'create or replace trigger %I before insert or update on public.%I '
      || 'for each row execute function helm_private.guard_tournament_team()',
      t || '_team_guard', t);
  END LOOP;
END $$;

-- 13. Closed until 100100 adds the policies: RLS on with no policy denies
-- every row to authenticated. anon and PUBLIC hold nothing on any of them.
do $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'golf_tournaments', 'golf_tournament_rounds', 'golf_tournament_entries',
    'golf_tournament_round_lineups', 'golf_tournament_player_rounds',
    'golf_tournament_field_teams', 'golf_tournament_field_scores',
    'golf_tournament_result_marks', 'golf_tournament_entry_notes',
    'golf_tournament_reviews', 'golf_tournament_player_notes',
    'golf_tournament_reflections', 'golf_tournament_advice_givers',
    'golf_tournament_coach_presence', 'golf_saved_comparisons',
    'golf_team_seasons', 'golf_tournament_link_dismissals'
  ]
  LOOP
    EXECUTE format('alter table public.%I enable row level security', t);
    EXECUTE format('revoke all on public.%I from public, anon', t);
    EXECUTE format(
      'grant select, insert, update, delete on public.%I to authenticated', t);
    EXECUTE format('grant all on public.%I to service_role', t);
  END LOOP;
END $$;

comment on table public.golf_tournaments is
'P016 Tournaments (D-81): one tournament edition for one GolfHelm team. Each '
'competition round is a golf_events row linked through '
'golf_tournament_rounds. version is bumped on every update '
'(compare-and-set). HELD 20261024100000.';
comment on table public.golf_tournament_player_rounds is
'P016 Tournaments (D-82): one row per player per tournament round, linking '
'a golf_rounds row or holding an entered score. golf_rounds is never '
'updated by tournaments. HELD 20261024100000.';
