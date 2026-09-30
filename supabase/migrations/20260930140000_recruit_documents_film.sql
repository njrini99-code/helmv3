-- STATUS: WRITTEN — HOLD — NOT APPLIED
--
-- Recruiting (Clubhouse P014), owner decision Q-95 item 6 (2026-09-30): film
-- uploads are allowed, as a file drop.
-- The private `recruit-documents` bucket (20260614020000_recruit_documents.sql)
-- takes no video today and caps every
-- file at 25 MB, so a swing video cannot be attached to a prospect. This lets
-- the bucket take MP4, MOV and M4V and
-- raises its per-file cap to 100 MB.
--
-- What changes: one row of storage.buckets (`file_size_limit`,
-- `allowed_mime_types`). Nothing else. The four
-- coach-only, team-scoped storage.objects policies on this bucket already cover
-- any object path
-- {teamId}/{recruitId}/{uuid}.{ext}, so there is no policy change, no new table
-- and no grant.
--
-- Sizing (assumption, stated): 100 MB matches the `golf-attachments` bucket's
-- video cap
-- (20260801080000_golf_attachments_storage_bucket.sql,
-- lib/storage/attachments.ts). The project-wide upload limit
-- (Storage settings, not a table) could NOT be read from here: before applying,
-- confirm it is at least 100 MB
-- (Dashboard > Storage > Settings; the free tier is fixed at 50 MB). Below
-- that, Storage answers 413 for a large
-- film and the page says so ("Storage won't take a file this large"); nothing
-- breaks, but film over the project
-- limit cannot be attached. The page refuses a file over 25 MB (documents) or
-- 100 MB (film) before sending it
-- (src/app/golf/actions/recruit-documents-limits.ts holds the same numbers).
--
-- The bucket holds no objects today (read-only check 2026-09-30), so nothing
-- existing is affected.
--
-- Forward-only and idempotent: the allowlist is the current one plus the three
-- video types, de-duplicated, so a
-- re-run changes nothing. A bucket with no allowlist (null = any type) is left
-- without one.
--
-- Not applied by the author. Apply through `npm run db:apply` after review
-- (docs/operations/APPLY_PATH.md).
--
-- ROLLBACK:
--   update storage.buckets
--   set file_size_limit = 26214400,
--       allowed_mime_types = array[
--   'application/pdf',
--   'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/gif',
--   'text/plain', 'text/csv',
--   'application/msword',
--   'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
--   'application/vnd.ms-excel',
--   'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
--   'application/vnd.ms-powerpoint',
--   'application/vnd.openxmlformats-officedocument.presentationml.presentation'
--       ]
--   where id = 'recruit-documents';
--   (Film already stored stays readable; new film uploads are refused again.
--   Delete film objects through the
--   Storage API first if they should go.)
--
-- VERIFY: select 1 from storage.buckets where id = 'recruit-documents' and
-- file_size_limit = 104857600 and allowed_mime_types @> array['video/mp4',
-- 'video/quicktime', 'video/x-m4v', 'application/pdf'];

update storage.buckets
set
    file_size_limit = 104857600, -- 100 MB
    allowed_mime_types = case
        when allowed_mime_types is null then null
        else (
            select array_agg(distinct t order by t)
            from
                unnest(
                    allowed_mime_types
                    || array['video/mp4', 'video/quicktime', 'video/x-m4v']
                ) as t
        )
    end
where id = 'recruit-documents';
