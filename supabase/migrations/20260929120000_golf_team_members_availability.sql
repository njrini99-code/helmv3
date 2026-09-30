-- STATUS: WRITTEN — HOLD — NOT APPLIED
-- Held data plan: docs/clubhouse/held/data/roster-availability.md
--
-- Clubhouse Roster, owner decision on Q-1 (2026-09-29): "Inactive" in the
-- design means injured or away but still on the team. `status = 'inactive'`
-- already means something else: the member loses RLS access to team data
-- (is_team_player). Availability is a separate, display-only field, so marking
-- a
-- player injured never revokes their access.
--
-- Forward-only and additive: a new column with a safe default, nothing
-- dropped or rewritten. Writes stay under the existing golf_team_members
-- UPDATE policies (coaches on the team); no policy changes.
--
-- Written by an agent and NOT applied. Apply through `npm run db:apply` after
-- review (docs/operations/APPLY_PATH.md), then `npm run db:types`.
--
-- ROLLBACK: alter table public.golf_team_members drop column availability,
--   drop column availability_note, drop column availability_updated_at;
--   (the two check constraints go with the columns).
-- VERIFY: select availability, count(*) from public.golf_team_members group by
-- 1;
--   every existing row reads 'available'.

alter table public.golf_team_members
add column if not exists availability text not null default 'available',
add column if not exists availability_note text,
add column if not exists availability_updated_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'golf_team_members_availability_check'
      and conrelid = 'public.golf_team_members'::regclass
  ) then
    alter table public.golf_team_members
      add constraint golf_team_members_availability_check
      check (availability in ('available', 'injured', 'away'));
  end if;
end $$;

alter table public.golf_team_members
drop constraint if exists golf_team_members_availability_note_length;
alter table public.golf_team_members
add constraint golf_team_members_availability_note_length
check (
    availability_note is null or char_length(availability_note) <= 280
) not valid;
-- NOT VALID skips the scan of existing rows, which all have a null note (the
-- column is new above);
-- every insert and update is still checked.

comment on column public.golf_team_members.availability is
'Display-only availability (available, injured, away); not team access.';
comment on column public.golf_team_members.availability_note is
'Optional coach note on availability, up to 280 characters.';
comment on column public.golf_team_members.availability_updated_at is
'When availability last changed; set by the writer.';
