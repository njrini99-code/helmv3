-- Scope uploads into the PUBLIC course-images bucket.
--
-- --- THE DEFECT --------------------------------------------------------------
--
-- `course_images_authenticated_insert` has, in full:
--
--   WITH CHECK (bucket_id = 'course-images'::text)
--
-- That is the entire predicate. It constrains the bucket and nothing else -- no
-- path shape, no owner, no relationship to any course. Any authenticated user
-- can write any object to any path in it.
--
-- The bucket is PUBLIC (storage.buckets.public = true), so every object in
-- it is served unauthenticated from the project's own domain. The
-- combination is an open image-hosting endpoint on company infrastructure
-- that requires only an account: 5 MB per object, four image MIME types, no
-- quota, no cleanup.
--
-- --- THE SECOND HALF, WHICH THE REPO ALREADY DOCUMENTS -----------------------
--
-- Uploads land BEFORE any authorization on the course is evaluated. The client
-- uploads directly (src/lib/golf/upload-course-image.ts:31) and only afterwards
-- calls setCourseImageUrl, which validates the URL. The comment at
-- src/app/golf/actions/course-library.ts:1319-1331 records what that cost in
-- production on 2026-08-09, verbatim:
--
--   "The file was already in the bucket by then: the upload succeeded, and only
--    the check on the way back failed, so the coach saw a red toast for a photo
--    that had in fact been stored."
--
-- So a rejected upload still persists, publicly, forever. There is no cleanup
-- path for orphans anywhere in the repository.
--
-- --- WHAT THIS FIXES, AND WHAT IT DELIBERATELY DOES NOT ----------------------
--
-- Fixes: the namespace. Objects must now live under `courses/<id>/` where <id>
-- is a real `golf_courses` row. Arbitrary paths are refused, which removes the
-- open-hosting shape -- an uploader can no longer choose where the file
-- lands or invent a namespace, and every object is attributable to a course
-- that exists.
--
-- Does NOT fix, deliberately, because it is a product decision rather than a
-- defect: WHO may upload. The policy still admits any authenticated user, not
-- only coaches. Restricting it to coaches would be the stronger control, but
-- course editing authority was not established during this audit, and silently
-- narrowing it could break a legitimate uploader whose role was never verified.
-- Flagged for the owner instead.
--
-- Also unaddressed: orphan cleanup. An upload whose setCourseImageUrl call
-- fails still persists. That needs a scheduled sweep of objects under
-- `courses/<id>/` not referenced by `golf_courses.image_url` -- a deletion
-- path, and therefore not something to introduce tonight.
--
-- --- COMPATIBILITY -----------------------------------------------------------
--
-- The client already writes exactly this shape:
--
--   `courses/${courseId}/${crypto.randomUUID()}.${ext}`
--   (upload-course-image.ts:31)
--
-- so the only uploads this refuses are ones that do not match what the
-- application produces.
--
-- I checked this against live data and MY FIRST CLAIM HERE WAS WRONG, which is
-- worth recording rather than quietly correcting. I wrote that no existing
-- object is invalidated. The bucket holds exactly one object:
--
--   courses/13d2c110-bee4-496e-b390-e523a4bd0fbb/37d40dee-....jpg
--
-- and there is NO `golf_courses` row with that id. The one object already in
-- this bucket is an orphan -- its course is gone and the image is still being
-- served publicly. So the second half of this migration's own premise (uploads
-- persist with no cleanup path) is not hypothetical; the single existing object
-- IS an instance of it.
--
-- This does not block the change. An INSERT policy governs new writes only, so
-- nothing currently stored stops serving. But the stated verification below had
-- to be rewritten: a naive "expected: 0" would fail on day one and read as a
-- broken migration rather than as the pre-existing orphan it actually is.
--
-- NOT APPLIED BY THE AUTHORING SESSION.

begin;

drop policy if exists course_images_authenticated_insert on storage.objects;

create policy course_images_authenticated_insert on storage.objects
for insert
to authenticated
with check (
    bucket_id = 'course-images'
    and (storage.foldername(name))[1] = 'courses'
    and exists (
        select 1
        from public.golf_courses c
        where c.id::text = (storage.foldername(name))[2]
    )
);

commit;

-- --- VERIFICATION (run after applying) ---------------------------------------
--
-- Both directions, because testing only the refusal would pass against a policy
-- that blocks every upload:
--
--   1. A well-formed upload to `courses/<real-course-id>/<uuid>.jpg` succeeds.
--   2. An upload to `evil.jpg`, or to `courses/<random-uuid>/x.jpg` where no
--      such course exists, is refused.
--
-- 3. Confirm nothing currently served broke. NOTE THE EXPECTED VALUE IS 1, NOT
--    0 -- there is one pre-existing orphan whose course row no longer exists,
--    and it predates this migration:
--
--   select count(*) from storage.objects
--    where bucket_id = 'course-images'
--      and ((storage.foldername(name))[1] is distinct from 'courses'
--        or not exists (select 1 from public.golf_courses c
--                        where c.id::text = (storage.foldername(name))[2]));
--   -- expected: 1 (the known orphan). A value of 2+ means a new orphan
--   -- appeared and the cleanup gap is still producing them.
