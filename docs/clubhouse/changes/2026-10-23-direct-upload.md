# 2026-10-23 — Large uploads (Clubhouse A+ WP-9)

## 2026-10-23 — Hub documents go straight to Storage (UP-1)

```text
Design package: none (Clubhouse A+ handoff, W7 UP-1)
PR/commit: #2356
Contract IDs: none
Actions: prepareGolfDocumentUpload (new)
Data impact: none
Held items: preview-deploy acceptance (a 10 MB file, signed in; owner)
```

### Changed

- New server action `prepareGolfDocumentUpload`, beside
  `uploadGolfDocument`. It checks the caller coaches the team and the 25 MB
  limit, builds the object path on the server
  (`golf-documents/{team}/{uuid}.{ext}`), and signs that one path.
- Team Hub's upload now asks for that URL, sends the file straight to
  Storage, then records it with `createGolfDocument`, as Recruiting's
  documents do. The file never rides in a server action's body. Fairway's
  Documents and announcements keep `uploadGolfDocument`.
- Hardening from the security review: the team id must be a UUID and a file
  whose type nothing names is refused before signing; the action is blocked
  for the shared demo account; Storage's 415 reads as a type refusal, not a
  dropped connection. `createGolfDocument` now refuses a `storage_path`
  outside `golf-documents/{team}/` (a coach staffed on two teams could attach
  one team's file to the other's documents); Fairway's paths already match.
- Left for later (from the review): rebuilding `file_url` on the server, a
  complete step that checks the object exists (orphans when recording
  fails), and dropping SVG from the bucket's types. Fairway's Documents and
  announcements still send files in the action body, so live uploads over
  about 4.5 MB keep failing until they move to this action too.
- Classes import: an image the browser cannot downscale is refused when it
  would pass what one request can carry on Vercel (about 4.5 MB), with
  words, instead of failing with no answer. A downscaled screenshot is far
  under it.

### Why

- Vercel refuses a request body over about 4.5 MB before the action runs,
  so a Hub file over that failed in production although the Hub takes 25 MB.

### Verification

- `security-reviewer` on the diff: nothing blocking; production storage RLS
  (`documents_insert_manage_scope`, staff-strict) gates the signing too.
- New `document-direct-upload.test.ts` (coach only, server-built path, size,
  type and team id refused before signing, a file name cannot steer the
  path, `createGolfDocument` refuses another folder's object) and
  `hub/__tests__/upload.test.ts` (a 10 MB file goes prepare, signed PUT,
  record; a refusal sends or records nothing). `classes.test.tsx` pins the
  new ceiling. Not done: `npm run build`, and the 10 MB upload on a
  signed-in preview deploy, which needs the owner.
