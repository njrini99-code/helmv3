# Feature: Recruiting HQ

## Status

- active

> **Written 2026-08-27 from the code, not migrated from prose.** This feature had
> no canonical doc: `memory/registry.yml` pointed its `docs.feature` at
> `memory/context/golfhelm-features.md`, a 1,399-line file containing **zero**
> occurrences of the string "recruit". Any session routed here loaded 28 unrelated
> features and nothing about this one. Every fact below is taken from the source
> files named, and every table name is checked against
> `src/lib/types/database.ts` (generated truth), per the OS source-of-truth
> hierarchy.
>
> Anchor SHA: `0febf77f5`. Staleness check:
> `git rev-list --count 0febf77f5..HEAD -- 'src/app/golf/actions/recruit*' 'src/components/fairway/pages/recruiting/**'`

## Current State

Recruiting HQ is the coach-side pipeline for tracking prospective players before
they join a team. A recruit is a lightweight record owned by a team — it is **not**
a `golf_players` row and has no auth identity. Coaches create recruits, move them
through a four-stage status pipeline, and attach documents (transcripts, film
links, correspondence).

There is no player-facing surface. Recruits cannot log in, and nothing in the
player dashboard reads these tables.

## Primary Entry Points

### Routes

- `src/app/golf/(dashboard)/dashboard/recruiting/page.tsx`
- `src/app/golf/(dashboard)/dashboard/recruiting/loading.tsx`
- `src/app/golf/(dashboard)/dashboard/recruiting/error.tsx`

### Components

- `src/components/fairway/pages/recruiting/FairwayRecruitingPage.tsx` — the page shell
- `src/components/fairway/pages/recruiting/FairwayRecruitCard.tsx` — one recruit
- `src/components/fairway/pages/recruiting/FairwayRecruitFormSheet.tsx` — create/edit
- `src/components/fairway/pages/recruiting/FairwayRecruitDocuments.tsx` — attachments
- `src/components/fairway/pages/recruiting/recruit-status.ts` — status vocabulary + tones

### Actions

`src/app/golf/actions/recruiting.ts` (363 lines):

- `getRecruits`
- `createRecruit`
- `updateRecruit`
- `deleteRecruit`

`src/app/golf/actions/recruit-documents.ts` (398 lines):

- `getRecruitDocuments`
- `uploadRecruitDocument`
- `deleteRecruitDocument`
- `getRecruitDocumentUrl`

`src/app/golf/actions/recruit-documents-categories.ts` (19 lines) exports no server
action — it is a shared category constant module.

## Core Data

Two tables, both verified present in `src/lib/types/database.ts`:

- `golf_recruits` — one row per prospect. Foreign keys to the owning team and to
  the coach who created it.
- `golf_recruit_documents` — attachments. Foreign keys to its recruit **and**
  independently to the team.

Both carry `team_id`, which is the tenancy boundary for this feature. (Constraint
names are deliberately not reproduced here: `docs:schema-drift` reads any
`golf_*` token in a doc as a schema identifier, and a `*_fkey` name is not one, so
naming them registers as documented-but-nonexistent drift.)

## Business Rules

- **Status pipeline is four stages, in order:** `watched` → `recruiting` → `offered`
  → `committed`. The canonical `RecruitStatus` type lives in
  `src/app/golf/actions/recruiting.ts`; `recruit-status.ts` only supplies labels,
  descriptions, and display tones.
- **Team-scoped.** Every read and write is bounded by the acting coach's
  `golf_coaches.team_id`. `golf_recruit_documents` carries its own `team_id`
  alongside `recruit_id` so a document cannot be reached by guessing a recruit id
  from another team.
- **Auth first.** `recruiting.ts:114` calls `supabase.auth.getUser()` and resolves
  `golf_coaches` before any query — the repo-wide server-action rule, enforced by
  the Review Gate.
- **Coach-only.** No player role reads or writes these tables.

## UI Contract

- Status is rendered as a Fairway status chip. The four legacy tones collapse onto
  Fairway's `FwStatusTone` set, because Fairway's palette is green-forward and has
  no violet or blue token:

  | Status | Legacy tone | Fairway tone |
  |---|---|---|
  | `watched` | amber | `warning` |
  | `recruiting` | primary | `accent` |
  | `offered` | violet | `info` |
  | `committed` | blue | `success` |

  The rationale is recorded in `recruit-status.ts`'s header. Do not reintroduce a
  violet or blue chip here — `.claude/rules/design-system.md` governs.

## Known Risk Areas

- **Document access is the sensitive surface.** `getRecruitDocumentUrl` issues a URL
  for stored file content; any change to it is a storage-authorization change, not a
  UI change. Re-check the `team_id` bound on both the recruit and the document row.
- **`golf_recruits` is not `golf_players`.** They are separate tables with separate
  lifecycles. There is no automatic promotion from recruit to player; a committed
  recruit still joins through the normal team join-code flow.

## Tests To Prefer

- `src/components/fairway/pages/recruiting/FairwayRecruitingPage.test.tsx`
- Required checks (from `memory/registry.yml`): `npm run typecheck`, `npm run build`

## Related Docs

- `memory/registry.yml` — routing entry `recruiting`
- `.claude/rules/design-system.md` — the binding token rule for the status chips
- `docs/REPO_MAP.md` — route atlas and action-wrapper idioms
