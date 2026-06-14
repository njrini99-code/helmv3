-- Per-recruit documents for Recruiting HQ (coach-only).
--
-- VERIFIED: applied to prod (qmnssrrolpinvwjjnufo) 2026-06-14. Confirmed:
--   table + 4 coach-only RLS policies (no player policy), private bucket + 4
--   team-scoped storage.objects policies, same-team trigger rejects a mismatched
--   team_id, and a full upload→list→delete browser pass left 0 rows / 0 storage
--   objects (no orphans). Purely additive — no existing object is modified.
-- ROLLBACK: see the commented block at the foot of this file.
--
-- WHY A DEDICATED TABLE + BUCKET (not golf_documents):
-- Recruiting material — notes, schedules, transcripts, film — is coach-confidential.
-- The Recruiting HQ page already bounces players. golf_documents is the WRONG home:
-- its select policy `golf_documents_select_team` lets ANY team player read every row,
-- which would leak recruit notes. So recruit docs get their own coach-only table and a
-- dedicated PRIVATE storage bucket with team-scoped, coach-only object policies.

-- ── Table ────────────────────────────────────────────────────────────────────
create table if not exists public.golf_recruit_documents (
  id           uuid primary key default gen_random_uuid(),
  recruit_id   uuid not null references public.golf_recruits(id) on delete cascade,
  team_id      uuid not null references public.golf_teams(id) on delete cascade,
  title        text not null,
  category     text not null default 'note',
  file_name    text not null,
  storage_path text not null,
  file_type    text,
  file_size    bigint,
  uploaded_by  uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists golf_recruit_documents_recruit_id_idx
  on public.golf_recruit_documents (recruit_id);
create index if not exists golf_recruit_documents_team_id_idx
  on public.golf_recruit_documents (team_id);

-- ── Same-team trigger ────────────────────────────────────────────────────────
-- team_id must equal the recruit's team. Prevents filing a doc under a team the
-- coach staffs but a recruit they don't own. Mirrors golf_event_documents_assert_same_team.
create or replace function public.golf_recruit_documents_assert_same_team()
returns trigger
language plpgsql
as $$
declare
  v_recruit_team uuid;
begin
  select team_id into v_recruit_team from public.golf_recruits where id = new.recruit_id;
  if v_recruit_team is null then
    raise exception 'Recruit % not found', new.recruit_id;
  end if;
  if new.team_id is distinct from v_recruit_team then
    raise exception 'Document team_id (%) must match recruit team_id (%)', new.team_id, v_recruit_team;
  end if;
  return new;
end;
$$;

drop trigger if exists golf_recruit_documents_same_team on public.golf_recruit_documents;
create trigger golf_recruit_documents_same_team
  before insert or update on public.golf_recruit_documents
  for each row execute function public.golf_recruit_documents_assert_same_team();

-- ── updated_at maintenance ───────────────────────────────────────────────────
create or replace function public.golf_recruit_documents_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists golf_recruit_documents_touch on public.golf_recruit_documents;
create trigger golf_recruit_documents_touch
  before update on public.golf_recruit_documents
  for each row execute function public.golf_recruit_documents_touch_updated_at();

-- ── RLS: coach-only (players never see recruiting). Admins read. ──────────────
alter table public.golf_recruit_documents enable row level security;

drop policy if exists golf_recruit_documents_select_coach on public.golf_recruit_documents;
create policy golf_recruit_documents_select_coach on public.golf_recruit_documents
  for select to authenticated
  using (public.is_golf_team_coach(team_id) or public.is_admin());

drop policy if exists golf_recruit_documents_insert_coach on public.golf_recruit_documents;
create policy golf_recruit_documents_insert_coach on public.golf_recruit_documents
  for insert to authenticated
  with check (public.is_golf_team_coach(team_id));

drop policy if exists golf_recruit_documents_update_coach on public.golf_recruit_documents;
create policy golf_recruit_documents_update_coach on public.golf_recruit_documents
  for update to authenticated
  using (public.is_golf_team_coach(team_id))
  with check (public.is_golf_team_coach(team_id));

drop policy if exists golf_recruit_documents_delete_coach on public.golf_recruit_documents;
create policy golf_recruit_documents_delete_coach on public.golf_recruit_documents
  for delete to authenticated
  using (public.is_golf_team_coach(team_id));

-- ── Private storage bucket ───────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'recruit-documents',
  'recruit-documents',
  false,
  26214400, -- 25 MB
  array[
    'application/pdf',
    'image/jpeg','image/png','image/webp','image/heic','image/gif',
    'text/plain','text/csv',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Object policies: only coaches of the team that owns the path may touch files.
-- Path convention: {teamId}/{recruitId}/{uuid}.{ext}  ->  foldername[1] = teamId.
drop policy if exists recruit_documents_coach_select on storage.objects;
create policy recruit_documents_coach_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'recruit-documents'
    and public.is_golf_team_coach(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists recruit_documents_coach_insert on storage.objects;
create policy recruit_documents_coach_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'recruit-documents'
    and public.is_golf_team_coach(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists recruit_documents_coach_update on storage.objects;
create policy recruit_documents_coach_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'recruit-documents'
    and public.is_golf_team_coach(((storage.foldername(name))[1])::uuid)
  )
  with check (
    bucket_id = 'recruit-documents'
    and public.is_golf_team_coach(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists recruit_documents_coach_delete on storage.objects;
create policy recruit_documents_coach_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'recruit-documents'
    and public.is_golf_team_coach(((storage.foldername(name))[1])::uuid)
  );

-- ── ROLLBACK ─────────────────────────────────────────────────────────────────
-- Reverses everything above. Drops the storage object policies, empties + removes
-- the bucket, then drops the table (which removes its policies/triggers) and the
-- trigger functions. Storage objects must be cleared before the bucket is deleted.
--
--   drop policy if exists recruit_documents_coach_select on storage.objects;
--   drop policy if exists recruit_documents_coach_insert on storage.objects;
--   drop policy if exists recruit_documents_coach_update on storage.objects;
--   drop policy if exists recruit_documents_coach_delete on storage.objects;
--   delete from storage.objects where bucket_id = 'recruit-documents';
--   delete from storage.buckets where id = 'recruit-documents';
--   drop table if exists public.golf_recruit_documents;            -- drops its policies + triggers
--   drop function if exists public.golf_recruit_documents_assert_same_team();
--   drop function if exists public.golf_recruit_documents_touch_updated_at();
