# HELD DATA PLAN — Recruiting film uploads

```text
Plan ID: HD-recruit-documents-film
Status: HELD
Pages: Recruiting (P014): a prospect's Documents (the upload dialog and the file drop)
Feature: recruiting (memory/registry.yml)
Migration: supabase/migrations/20260930140000_recruit_documents_film.sql
Date: 2026-09-30
```

## Requirement

Owner decision Q-95 item 6 (2026-09-30): film uploads are allowed, as a file drop. The boards' sample document is
`Swing, down the line.mov`. The private `recruit-documents` bucket takes no video and caps every file at 25 MB, so a
coach cannot attach film to a prospect today.

## Current schema

Read-only check on the production project (2026-09-30): `storage.buckets` row `recruit-documents` is private, has
`file_size_limit = 26214400` and an `allowed_mime_types` list of fourteen types (PDF, JPEG, PNG, WebP, HEIC, GIF, plain
text, CSV, Word, Excel and PowerPoint in both formats). The bucket holds no objects. Its four `storage.objects`
policies (`recruit_documents_coach_select`, `_insert`, `_update`, `_delete`) are coach-only and team-scoped by the
first folder of the object path.

## Proposed schema

One `storage.buckets` row updated for `id = 'recruit-documents'`:

- `file_size_limit` from 26214400 (25 MB) to 104857600 (100 MB). The page keeps documents and images at 25 MB and lets
  only film use the rest (`src/app/golf/actions/recruit-documents-limits.ts`).
- `allowed_mime_types` gains `video/mp4`, `video/quicktime` and `video/x-m4v`, de-duplicated and sorted; a bucket with
  no allowlist is left without one.

## Tables / columns

None. No table or column changes.

## Relationships

None.

## RLS / permissions

No policy change. The existing coach-only, team-scoped storage policies already cover any object path
`{teamId}/{recruitId}/{uuid}.{ext}`. The page sends film to Storage on a signed upload URL the server makes for the
signed-in coach and that coach's own recruit, so the bucket's policies are what decide the write.

## Indexes

None.

## Backfill

None.

## Compatibility

Additive: nothing already stored or allowed stops working, and the current Fairway page (which sends a file through a
server action, capped well below 100 MB by the request body) is unchanged.

## Privacy / sensitive data

Film of recruits, who are often minors, is coach-confidential like the rest of the bucket: private, never served by a
public URL, opened only through a link that expires. Widening the file types does not widen who can read them.

## Project upload limit (unverified)

The project-wide Storage upload limit is a project setting, not a table, and could not be read when this was written.
It must be at least 100 MB for a 100 MB film to go through; below that Storage answers 413 and the page says so in the
upload dialog (CH-14108). Confirm it (Dashboard, Storage, Settings) before applying.

## Rollback concept

```sql
update storage.buckets
set file_size_limit = 26214400,
    allowed_mime_types = array[
      'application/pdf',
      'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/gif',
      'text/plain', 'text/csv',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    ]
where id = 'recruit-documents';
```

Film already stored stays readable; new film uploads are refused again.

## UI behavior while held

The page is built for film and is shown as if it worked: the picker and the drop accept MP4, MOV and M4V up to 100 MB and
the page hint says so. Until the migration is applied Storage refuses a film, and the upload dialog says so honestly:
"Storage won't take that file type" (CH-14107) or "a file this large" (CH-14108), with nothing added and no Retry. Documents
and images up to 25 MB work throughout.

## SQL preparation status

```text
WRITTEN — HOLD — NOT APPLIED
```

The file's first line is `-- STATUS: WRITTEN — HOLD — NOT APPLIED`. The new allowlist expression was evaluated read-only
against the live row (2026-09-30): it returns the fourteen old types plus the three video types, and the file's own
`-- VERIFY:` query is true of that result. `squawk` (the CI lint, version 2.64.0) reports 0 issues. No pgTAP: the change is
bucket configuration, not a policy.

## HELD.md registration

```text
Required: yes
Registered: not yet. The coordinator adds the row to supabase/migrations/HELD.md (HOLD, linking this plan). The author
was told to leave HELD.md alone.
```

## Activation checklist

- [ ] current schema re-read
- [ ] project Storage upload limit confirmed at least 100 MB
- [ ] migration reviewed
- [ ] conflicts resolved
- [ ] owner authorization
- [ ] sanctioned apply path
- [ ] RLS verified
- [ ] a real film uploaded, opened and removed on a test prospect
- [ ] held status discharged
