-- Forward fix for 20260819080000: the subquery captured the WRONG `name`.
--
-- --- THE DEFECT -------------------------------------------------------------
--
-- 20260819080000 scoped course-image uploads with this WITH CHECK:
--
--   bucket_id = 'course-images'
--   and (storage.foldername(name))[1] = 'courses'
--   and exists (
--       select 1 from public.golf_courses c
--       where c.id::text = (storage.foldername(name))[2]
--   )
--
-- The two `name` references look identical and are not. Outside the subquery,
-- `name` resolves to storage.objects.name, which is intended. INSIDE the
-- subquery, Postgres resolves an unqualified column against the INNER scope
-- first -- and `golf_courses` also has a `name` column -- so it silently bound
-- to `c.name`, the course's own title. pg_policies stored it as:
--
--   EXISTS (SELECT 1 FROM golf_courses c
--           WHERE (c.id)::text = (storage.foldername(c.name))[2])
--
-- which asks whether some course's own NAME, split on '/', has a second
-- segment equal to that course's id. For a title like "Pebble Beach" there is
-- no '/' at all, so the array index yields NULL and the predicate is never
-- true. Net effect: every authenticated upload to `course-images` was
-- REJECTED. It fails closed, so this was a broken feature and not an exposure.
--
-- --- WHY NOTHING CAUGHT IT --------------------------------------------------
--
-- It is valid SQL that references real columns, so it parses, plans, lints and
-- replays without complaint. `Supabase lint + RLS tests` went green on the
-- commit carrying it. No test exercises a course-image upload, and the bucket
-- holds exactly one object, so no data contradicted it either. It was found by
-- reading back `pg_policies.with_check` after applying and noticing the stored
-- text said `c.name` where the source said `name` -- which is the only reason
-- this file exists. Read policies back after creating them; the source you
-- submitted is not necessarily the predicate you got.
--
-- --- THE FIX ----------------------------------------------------------------
--
-- Qualify the outer reference explicitly as `objects.name`, and alias the
-- inner table to `gc` so the two scopes cannot be confused by eye either.
-- Verified after applying, by evaluating the predicate against real paths:
-- a real `courses/<live course id>/f.jpg` passes; `courses/<unknown uuid>/…`,
-- `evil/…`, a bare filename and `courses/../…` all reject.
--
-- ROLLBACK: restore the 20260819080000 body (re-introduces the defect).
-- VERIFIED: select with_check from pg_policies
--           where policyname = 'course_images_authenticated_insert';
--           -- must read `storage.foldername(objects.name)`, NOT `c.name`.

begin;

drop policy if exists course_images_authenticated_insert on storage.objects;

create policy course_images_authenticated_insert on storage.objects
for insert
to authenticated
with check (
    bucket_id = 'course-images'
    and (storage.foldername(objects.name))[1] = 'courses'
    and exists (
        select 1
        from public.golf_courses gc
        where gc.id::text = (storage.foldername(objects.name))[2]
    )
);

commit;
