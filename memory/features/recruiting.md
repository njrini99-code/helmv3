# Feature: Recruiting HQ

## Status

- active

## Current State

Recruiting HQ is the coach-only prospect tracker: high-school golfers a coach is
following through the recruiting funnel, with per-recruit documents. It is a
**tracker, not a CRM** — there is no outreach sequencing, no email sending and no
pipeline automation in this feature. The runtime observability registry makes the
same distinction explicitly, labelling this surface
"Recruiting HQ (coach tracker — NOT CRM)".

Recruits carry a four-value status vocabulary — `watched`, `recruiting`,
`offered`, `committed` — defined on the actions module and re-expressed for
rendering in Fairway's tone vocabulary. Everything is scoped to one team: the
actions resolve the coach's team from the session and filter every read and write
on `team_id`; RLS restricts the tables to that team's coach staff, so players
cannot see this data at all.

The page is server-rendered once and then filtered, searched and sorted client
side over the fetched array. The coach's chosen filter and sort persist per
browser through `useLocalStorage`, not per account.

Documents live in a **private** `recruit-documents` storage bucket and are only
ever reached through short-lived signed URLs. Upload rolls back the storage
object if the row insert fails, so a file cannot outlive its record.

This doc was written 2026-08-30. Until then the registry routed this feature to
`memory/context/golfhelm-features.md`, which — verified by search — contains no
recruiting section at all: the mapped current-state doc did not describe the
feature.

The Clubhouse phone prospect sheets reuse the native dialog lifecycle shared
with
Modal: selected content and the background scroll lock persist through exit;
rapid reopen cancels an old completion and focus returns without scrolling. A
save/delete in flight still refuses dismissal. This client repair does not
change prospect writes, stage choices, or unsaved-draft dismissal policy.

## Primary Entry Points

### Routes

- `src/app/golf/(dashboard)/dashboard/recruiting/page.tsx`

### Components

- Clubhouse (behind the Clubhouse flag, coach only): `src/clubhouse/screens/recruiting/**`
  (`RecruitingView` holds the state and the writes; `RecruitingDesktop`,
  `RecruitingPhone`), loader `src/clubhouse/data/recruiting.ts`, pure rules
  `src/clubhouse/data/recruiting-shape.ts`, route `src/clubhouse/routes/recruiting.tsx`
- `src/components/fairway/pages/recruiting/FairwayRecruitingPage.tsx`
- `src/components/fairway/pages/recruiting/FairwayRecruitCard.tsx`
- `src/components/fairway/pages/recruiting/FairwayRecruitFormSheet.tsx`
- `src/components/fairway/pages/recruiting/FairwayRecruitDocuments.tsx`
- `src/components/fairway/pages/recruiting/recruit-status.ts`

### Actions And Services

- `src/app/golf/actions/recruiting.ts` — `getRecruits`, `createRecruit`,
  `updateRecruit`, `deleteRecruit`
- `src/app/golf/actions/recruit-documents.ts` — `getRecruitDocuments`,
  `uploadRecruitDocument`, `deleteRecruitDocument`, `getRecruitDocumentUrl`, and
  the Clubhouse page's two-step upload, `prepareRecruitDocumentUpload` and
  `completeRecruitDocumentUpload` (the file goes to Storage on a signed URL, not
  through a server action)
- `src/app/golf/actions/recruit-documents-limits.ts` — the allowed types and
  the size caps the page refuses with (25 MB; 100 MB for film), in a plain
  module for the same reason
- `src/app/golf/actions/recruit-documents-categories.ts` — the category
  vocabulary, split out because a `'use server'` file may only export async
  functions
- `src/lib/golf/resolve-team-server.ts` — team scoping for every read and write

## Core Data

- `golf_recruits` — `first_name`, `last_name`, `email`, `phone`, `hometown`,
  `state`, `hs_class`, `status`, `notes`, `team_id`, `created_by`
- `golf_recruit_documents`
- storage bucket `recruit-documents` (private; 25 MB per file, no video, until
  `supabase/migrations/20260930140000_recruit_documents_film.sql` is applied:
  then 100 MB and MP4, MOV and M4V too)

## Business Rules

- Every read and write is scoped to the coach's resolved `team_id`. A recruit is
  a team record, never a personal one.
- Coach staff only. Players have no access path to either table, enforced by RLS
  rather than by the UI hiding a route.
- Document categories are `note`, `schedule`, `transcript`, `film`, `other`.
- The storage bucket is never public. Serve files through signed URLs only, and
  never widen the bucket to make a link work.
- A failed row insert must remove the uploaded object. An orphaned file in a
  private bucket is invisible and permanent. (The Clubhouse two-step upload
  keeps the object when the row fails, on purpose, so a Retry with the same
  upload id records it without sending a film twice; the object path is built on
  the server, so it cannot point anywhere but this recruit's folder.)

## UI Contract

- Status is the primary axis: the snapshot plates filter by it and the card chip
  shows it, using the Fairway tone mapping rather than raw colour values.
- Filter and sort are a per-browser convenience (`useLocalStorage`), not account
  state — do not describe them as saved preferences.
- Search and sort operate on the already-fetched array; adding a server-side
  filter changes the page's data contract and needs the route rechecked.
- A route's `loading.tsx` reserves the page's paint at t=0 — for a
  `'use client'` page holding its own `loading` state that is that
  component's loading branch, not its settled layout. A route whose
  `page.tsx` is a pure `permanentRedirect` shim renders `bg-canvas` only:
  no geometry, and no real `<h1>` for a screen that never mounts.
  Reference implementation: `dashboard/alerts/loading.tsx`.

## Clubhouse surface

With the Clubhouse flag on for a coach, the same route renders the Clubhouse
screen in place (`page.tsx` still redirects a player Home first); with it off
nothing changes. Built from the owner's approved boards
(`design/handoff/recruiting/`, Q-87); numbered states in
`docs/clubhouse/catalog/recruiting.md` (CH-14xxx), page docs in
`docs/clubhouse/pages/P014-recruiting/`. It uses the same server actions; the
additions are an optional request id on `createRecruit` and the two-step upload,
and one migration (film), written and not applied.

- The pipeline's counts and shares are the whole list's (largest remainder, so
  they sum to 100) and do not follow the search; a stage there filters the
  list. Search looks at name, hometown, state, email and notes. The stage
  filter and the sort are still per browser (`localStorage`).
- A stage is saved the moment it is picked: the prospect moves at once and goes
  back, with a Retry on the toast, if the save does not land. Add, edit, delete
  and every document write wait for the server. Retry runs the whole action
  again, including the move and its undo.
- Delete asks first and says that notes and documents go with the prospect; it
  does not ask for the name. Removing a document asks too.
- A new prospect starts at Watched (the boards' Add dialog). An Add carries one
  request id, kept across Retry, and `createRecruit` inserts under it: a repeat
  after a lost reply finds the prospect it added (read back as this coach's, on
  this team, with this name) instead of adding a second. The current page sends
  no id and is unchanged.
- The upload dialog asks for a title and a category and refuses, before sending,
  a file over its limit (25 MB; film, meaning MP4, MOV or M4V, 100 MB) or of a
  type the bucket does not take. On desktop a file can be dropped on a
  prospect's documents (one file at a time; a folder or several are refused);
  the phone keeps the picker. The bytes go to Storage on a signed URL with real
  progress, and what Storage itself turns down (the bucket not yet updated for
  film, or a project-wide upload limit below 100 MB) is said in the dialog, not
  as a generic failure. The project's upload limit could not be read when this
  was written: confirm it is at least 100 MB before applying the migration.
- Email and Call are `mailto:` and `tel:` links; nothing is sent from GolfHelm.
- A prospect's documents are read when it opens; a failed read is a notice in
  that section and the rest of the prospect still works.

## Known Risk Areas

- `src/app/golf/actions/recruiting.ts` opens with `eslint-disable
  @typescript-eslint/no-explicit-any` and a comment saying the casts exist
  because "the regenerated TS types don't include `golf_recruits` yet".
  **That is no longer true** — `golf_recruits` is present in
  `src/lib/types/database.ts`. The casts and the comment can come out, and until
  they do this file has no type safety against the schema it writes.
- Client-side filtering means the whole recruit list ships to the browser. That
  is fine at present volumes and is a scaling limit worth knowing before adding
  bulk import.
- CRM outreach (`crm_recruiting_pipeline` in the runtime registry) is a separate,
  live surface with no registry entry and no feature doc. It is recorded as
  `feature_awareness_gap` under `observability_keys_unowned` in
  `memory/registry.yml`. Do not fold it into this feature — one doc cannot answer
  for two products.

## Tests To Prefer

- `src/clubhouse/__tests__/recruiting.test.tsx` (the Clubhouse screen: rules,
  loader, route and page, every write and its failure, the phone) and
  `recruiting-upload.test.tsx` (film, the file drop, the transfer, an Add that
  cannot repeat); `src/test/golf/actions/recruit-document-upload.test.ts` and
  `recruiting-create.test.ts` for the server side
- `src/components/fairway/pages/recruiting/FairwayRecruitingPage.test.tsx`
- RLS tests whenever team scoping or the document bucket policy changes.

## Related Docs

- `memory/features/roster-team.md`
- `memory/registry.yml` — `recruiting`, and the `crm_recruiting_pipeline` gap
- `docs/research/coach-outreach-legal-and-best-practices.md` (CRM, not this)
