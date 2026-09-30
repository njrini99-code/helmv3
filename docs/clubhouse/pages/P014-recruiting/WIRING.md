# P014 — Recruiting: wiring map

## Entry point

```text
Route:                   /golf/dashboard/recruiting
Page:                    src/app/golf/(dashboard)/dashboard/recruiting/page.tsx
                         (no session -> login; a player -> redirect('/golf/dashboard'), as before; a coach with the
                         Clubhouse on (isClubhouseFor('coach')) -> Clubhouse; otherwise the existing Fairway page)
Clubhouse route adapter: src/clubhouse/routes/recruiting.tsx ClubhouseRecruitingRoute()
                         (no session.coach -> nothing, CH-14902; no team -> RecruitingNoTeam, CH-14306;
                         otherwise Recruiting)
Server loader:           src/clubhouse/data/recruiting.ts loadRecruiting (calls getRecruits; a failed read is
                         flagged, not empty, and logs chLogServer('recruiting', 'prospects'); the `no_team` answer
                         becomes the no-team page)
Screens:                 src/clubhouse/screens/recruiting/ Recruiting (live wrapper), RecruitingView (state and
                         writes), RecruitingDesktop, RecruitingPhone, Pipeline, Documents, ProspectForm, RecSheet
Skeleton:                RecruitingSkeleton.tsx (CH-14401) through ClubhouseSwitch in recruiting/loading.tsx
Navigation:              src/clubhouse/shell/nav.ts (CH_NAV_COACH: Recruiting after Roster, Team section;
                         '/golf/dashboard/recruiting' in the coach's CH_REBUILT_ROUTES)
Preview:                 src/app/clubhouse-preview/[screen]/page.tsx, screen `recruiting`
                         (?state=empty|nomatch|failed|loading|sparse|noteam|detail|add|edit|delete|docsfailed|
                         failwrites|failstage|slow), src/clubhouse/preview/PreviewRecruiting.tsx (in-memory writes),
                         fixtures-recruiting.ts (the board's eight prospects)
```

## End-to-end graph

```text
UI (RecruitingDesktop / RecruitingPhone, Pipeline, ProspectForm, Documents, RecSheet)
↓
Intent: RecruitingView (RecCtx): setQuery, setStage, setSort, select, startAdd, startEdit, moveStage, askDelete, tryAgain
↓
Action: useAction(name, run, copy) in RecruitingView and Documents (offline refusal CH-1903, slow notice CH-1902,
        chReport, toast + haptic, Retry re-runs the same action, so each action holds its own follow-up: the move
        and its undo, the closing of the dialog, the read of the page, the toast)
↓
Client writes: src/clubhouse/screens/recruiting/writes.ts (createLiveRecruitingWrites; one interface, faked whole in
               tests and the preview)
↓
Server actions: src/app/golf/actions/recruiting.ts, recruit-documents.ts (the current page's calls are unchanged;
                createRecruit takes an optional request id, and recruit-documents.ts has two new upload steps)
↓
Data: golf_recruits, golf_recruit_documents, storage bucket recruit-documents (private; signed URLs)
↓
Fresh props: the prospect writes call revalidatePath('/golf/dashboard/recruiting') -> the route re-renders ->
             RecruitingView takes the new list (141501). The document actions do not revalidate (the panel re-reads),
             so Documents reads its own list again after an upload or a removal (140904)
↓
Contract outcomes: CONTRACT.md (Bridge IDs 14ccii, catalog CH-14xxx)
↓
Bridge: recorded, not wired (D-68)
↓
Tests: src/clubhouse/__tests__/recruiting.test.tsx (61 cases), shell.test.tsx (the Team list)
```

## Actions

Each action's record is in `config/clubhouse/pages/P014-recruiting.json` (`actions`), and the whole list is readable
in `docs/clubhouse/generated/CLUBHOUSE_ACTION_MAP.md`. Offline, every write is refused before anything is sent (the
shell's 10703, CH-1903, 140701). Only the stage change is optimistic (141301); the rest wait for the server. A landed
write re-reads the page (141501) and a failed one reports through `chReport`.

| Action | Control | Handler | Service | Data | Contracts |
| --- | --- | --- | --- | --- | --- |
| ACT-P014-ADD-PROSPECT | Add prospect (header, empty page, phone "+") | `addAction` in `RecruitingView`, which sends one request id per Add (`requestIdFor`) | `createRecruit(input, { requestId })`: inserts under that id; a repeat finds the row it stored (CH-14915) | golf_recruits | invalid 140501 · lands 140901 · fails 140601 · fields kept 141201 · Retry 141401 · repeat CH-14915 |
| ACT-P014-SAVE-PROSPECT | Save (Edit dialog or sheet) | `saveAction` | `updateRecruit` | golf_recruits | invalid 140501 · lands 140902 · fails 140602 · fields kept 141201 · Retry 141401 |
| ACT-P014-MOVE-STAGE | A stage in the panel's control, the phone's stage sheet | `moveAction`, which moves, calls `updateRecruit` (status only) and puts the prospect back if it does not land | `updateRecruit` | golf_recruits | optimistic 141301 · fails 140603 · announce 141803 · haptic 141701 · Retry 141401 |
| ACT-P014-DELETE-PROSPECT | Delete prospect (panel, edit sheet), after the question | `deleteAction` | `deleteRecruit` (their documents go with them) | golf_recruits, golf_recruit_documents | confirm 141101 · loading 140304 · lands 140903 · fails 140604 · haptic 141702 |
| ACT-P014-LIST-DOCUMENTS | A prospect opens (the Documents section) | `fetchDocs` in `Documents` | `getRecruitDocuments` | golf_recruit_documents | loading 140202 · fails 140609 |
| ACT-P014-UPLOAD-DOCUMENT | Upload (a chosen or dropped file, its title and category) | `uploadAction`, which sends one upload id per chosen file | `uploadRecruitFile`: `prepareRecruitDocumentUpload` (checks the type and size, builds the path from the recruit's team, signs an upload URL, or says the object is already there), a `PUT` of the file to that URL with progress, then `completeRecruitDocumentUpload` (reads the object's real size back, records the row; a file whose row fails stays for the Retry) | golf_recruit_documents, recruit-documents | invalid 140505, 140506 · loading 140302 · lands 140904 · fails 140605 · refused 140802 · file refused CH-14107, CH-14108 · drop CH-14109, CH-14110, CH-14917 · progress CH-14407 · repeat CH-14916 |
| ACT-P014-REMOVE-DOCUMENT | Remove document, after the question | `removeAction` | `deleteRecruitDocument` | golf_recruit_documents, recruit-documents | confirm 141102 · loading 140303 · lands 140904 · fails 140606 · refused 140802 |
| ACT-P014-OPEN-DOCUMENT | A document's name | `openAction` | `getRecruitDocumentUrl`, then the in-app browser (`openExternalUrl`) on the iPhone and an anchor on the web | golf_recruit_documents | fails 140607 |
| ACT-P014-TRY-AGAIN | Try again on the list's notice | `tryAgain` (asks the server for the page again) | — | — | list failed 140608 · Retry 141401 |

Not actions: Email and Call are `mailto:` and `tel:` links (141805), and the search, the stage filter and the sort
are state in the page (the filter and the sort are kept in `localStorage`, `ch-recruiting-stage` and
`ch-recruiting-sort`).

## Data reads

```text
getRecruits()                The team's prospects, newest update first; the coach's active team only. `no_team`
                             when the coach has none.
getRecruitDocuments(id)      One prospect's documents (title, category, file name, type, size, date).
getRecruitDocumentUrl(id)    A signed URL that expires, made when a document is opened.
```

## Permissions behind the page

```text
Page:          a player is redirected Home; a session with no coach draws nothing.
Actions:       the prospect actions resolve the caller's coach profile and active team (`Coach profile required`,
               `no_team`) before they read or write; RLS limits the rows to the team's coach staff, and the
               documents actions say "Only this team's coaches can ..." when a write is refused.
RLS:           golf_recruits and golf_recruit_documents are team-scoped with RLS behind the actions; the bucket is
               private. The page uses the signed-in client, never the service role.
```

## Open wiring gaps

- Fixed 2026-09-30: `createRecruit` had no idempotency key, so a Retry after an answer lost on the way added the
  prospect twice. An Add now carries a request id (CH-14915). The stage, edit and delete writes were already idempotent.
- Film is built but waits for a migration: the bucket takes no video and caps a file at 25 MB until
  `20260930140000_recruit_documents_film.sql` is applied (DESIGN.md item 6). Until then a film is refused by Storage and the
  dialog says so (CH-14107, CH-14108).
- The project-wide Storage upload limit could not be read from here. The migration sets 100 MB on the bucket; a project
  limit below that makes Storage answer 413 for a large film, which the page reports as CH-14108.
- An upload the coach abandons after the file landed but before its row was saved leaves an object in the private
  bucket with no row (a Retry would have found it). There is no sweep for these.
