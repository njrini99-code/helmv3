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

## Primary Entry Points

### Routes

- `src/app/golf/(dashboard)/dashboard/recruiting/page.tsx`

### Components

- `src/components/fairway/pages/recruiting/FairwayRecruitingPage.tsx`
- `src/components/fairway/pages/recruiting/FairwayRecruitCard.tsx`
- `src/components/fairway/pages/recruiting/FairwayRecruitFormSheet.tsx`
- `src/components/fairway/pages/recruiting/FairwayRecruitDocuments.tsx`
- `src/components/fairway/pages/recruiting/recruit-status.ts`

### Actions And Services

- `src/app/golf/actions/recruiting.ts` — `getRecruits`, `createRecruit`,
  `updateRecruit`, `deleteRecruit`
- `src/app/golf/actions/recruit-documents.ts` — `getRecruitDocuments`,
  `uploadRecruitDocument`, `deleteRecruitDocument`, `getRecruitDocumentUrl`
- `src/app/golf/actions/recruit-documents-categories.ts` — the category
  vocabulary, split out because a `'use server'` file may only export async
  functions
- `src/lib/golf/resolve-team-server.ts` — team scoping for every read and write

## Core Data

- `golf_recruits` — `first_name`, `last_name`, `email`, `phone`, `hometown`,
  `state`, `hs_class`, `status`, `notes`, `team_id`, `created_by`
- `golf_recruit_documents`
- storage bucket `recruit-documents` (private; 25 MB per file)

## Business Rules

- Every read and write is scoped to the coach's resolved `team_id`. A recruit is
  a team record, never a personal one.
- Coach staff only. Players have no access path to either table, enforced by RLS
  rather than by the UI hiding a route.
- Document categories are `note`, `schedule`, `transcript`, `film`, `other`.
- The storage bucket is never public. Serve files through signed URLs only, and
  never widen the bucket to make a link work.
- A failed row insert must remove the uploaded object. An orphaned file in a
  private bucket is invisible and permanent.

## UI Contract

- Status is the primary axis: the snapshot plates filter by it and the card chip
  shows it, using the Fairway tone mapping rather than raw colour values.
- Filter and sort are a per-browser convenience (`useLocalStorage`), not account
  state — do not describe them as saved preferences.
- Search and sort operate on the already-fetched array; adding a server-side
  filter changes the page's data contract and needs the route rechecked.

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

- `src/components/fairway/pages/recruiting/FairwayRecruitingPage.test.tsx`
- RLS tests whenever team scoping or the document bucket policy changes.

## Related Docs

- `memory/features/roster-team.md`
- `memory/registry.yml` — `recruiting`, and the `crm_recruiting_pipeline` gap
- `docs/research/coach-outreach-legal-and-best-practices.md` (CRM, not this)
