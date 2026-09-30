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
Server actions: src/app/golf/actions/recruiting.ts, recruit-documents.ts (unchanged)
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
| ACT-P014-ADD-PROSPECT | Add prospect (header, empty page, phone "+") | `addAction` in `RecruitingView` | `createRecruit` | golf_recruits | invalid 140501 · lands 140901 · fails 140601 · fields kept 141201 · Retry 141401 |
| ACT-P014-SAVE-PROSPECT | Save (Edit dialog or sheet) | `saveAction` | `updateRecruit` | golf_recruits | invalid 140501 · lands 140902 · fails 140602 · fields kept 141201 · Retry 141401 |
| ACT-P014-MOVE-STAGE | A stage in the panel's control, the phone's stage sheet | `moveAction`, which moves, calls `updateRecruit` (status only) and puts the prospect back if it does not land | `updateRecruit` | golf_recruits | optimistic 141301 · fails 140603 · announce 141803 · haptic 141701 · Retry 141401 |
| ACT-P014-DELETE-PROSPECT | Delete prospect (panel, edit sheet), after the question | `deleteAction` | `deleteRecruit` (their documents go with them) | golf_recruits, golf_recruit_documents | confirm 141101 · loading 140304 · lands 140903 · fails 140604 · haptic 141702 |
| ACT-P014-LIST-DOCUMENTS | A prospect opens (the Documents section) | `fetchDocs` in `Documents` | `getRecruitDocuments` | golf_recruit_documents | loading 140202 · fails 140609 |
| ACT-P014-UPLOAD-DOCUMENT | Upload (a chosen file, its title and category) | `uploadAction` | `uploadRecruitDocument` (removes the stored file if its row does not save) | golf_recruit_documents, recruit-documents | invalid 140505, 140506 · loading 140302 · lands 140904 · fails 140605 · refused 140802 |
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

- `createRecruit` has no idempotency key, so a Retry after an answer that was lost on the way (the write landed,
  the reply did not) adds the prospect a second time. The stage, edit and delete writes are idempotent.
- The documents bucket takes no video and caps a file at 25 MB (the boards' sample film is a `.mov`); see DESIGN.md.
