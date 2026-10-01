# P014 — Recruiting: verification

Only what was observed. Gates are in `docs/clubhouse/PROGRESS.md`; the per-gate checklist is
`docs/clubhouse/screens/recruiting.md`.

## Current verification status

```text
Status:     partial
Commit/PR:  agent/clubhouse (draft PR #2102)
Date:       2026-09-30
```

## Static checks

| Check | Command | Result |
| --- | --- | --- |
| Typecheck | `npm run -s typecheck:fast` | exit 0, no errors (2026-09-30) |
| Lint | `npx eslint` on the Recruiting screens, loader, route, preview, tests, nav, the preview page, the recruiting page and loading files, `a11y.mjs` and `check.mjs` | exit 0, 0 errors; 9 warnings that are not this page's (`jsx-a11y/aria-role` on the existing `role="player"` marker props in `shell.test.tsx` and the preview page) |
| Registry sync, then Clubhouse check | `node scripts/clubhouse/registry.mjs sync` and `node scripts/clubhouse/check.mjs` in a copy of the working tree (the real tree is not synced: the coordinator syncs) | exit 0: 14 pages, 1145 Bridge IDs (53 of them P014), tracker valid; P014's CONTRACT.md passes `checkContract` with all 25 categories |
| Clubhouse check, real tree | `node scripts/clubhouse/check.mjs` | exit 1 until the coordinator runs `registry.mjs sync`: 182 findings, every one of them "not in bridge-contracts.json / run sync / generated doc is stale" (P014's 53 IDs and its manifest's references to them, and P005's). No other finding |
| Knowledge check | `npm run -s docs:check` | exit 0 (see "Knowledge check" below) |
| Build | `npm run build` | not run in this pass (see "Open verification gaps") |

## Automated tests

| Test | Contract | Result |
| --- | --- | --- |
| `src/clubhouse/__tests__/recruiting.test.tsx` (61 cases, each named by the codes it forces) | every catalog row of kinds 0 to 5 that is not marked preview | pass |
| `src/clubhouse/__tests__/shell.test.tsx` (the Team list now reads Roster, Recruiting, Stats, Qualifiers) | 10802 | pass |
| `src/clubhouse/__tests__/recruiting-upload.test.tsx` (31 cases: the limits and the migration's numbers, the transfer and its progress, the file drop, Storage's refusals, an Add that cannot repeat, the phone) | CH-14105 to CH-14110, CH-14404, CH-14407, CH-14703, CH-14915 to CH-14917 | pass |
| `src/test/golf/actions/recruit-document-upload.test.ts` (16) and `recruiting-create.test.ts` (9) | the server side of CH-14915 and CH-14916 | pass |

Both files together: 110 passed (2026-09-30). All of `src/clubhouse`: 30 files, 1531 tests, exit 0.

Mutation checks (2026-09-30): for each break, the code it guards was changed, the Recruiting tests were run and seen
to fail, and the code was put back (byte-identical afterwards). 32 breaks, 32 killed, 0 survived:

- Stage change (141301, 140603): a refused save not put back; a thrown save not put back; the move not optimistic;
  the change not announced; the phone stage sheet's pick not saved.
- Delete (141101, 141102, 141702, 140903): deleting without the question; no warning haptic; a landed delete leaving
  the row; removing a document without the question.
- Add, save and upload (140901, 140902, 141201, 140605): the dialog staying open after an add; the form closing
  before the answer, so the fields are lost on a failure; the upload dialog closing on a failed upload; the
  document list not read again after an upload.
- Search, filter and sort: notes not searched; the stage filter ignored; name Z to A; a missing class year sorting
  first; recently updated oldest first; a stage count wrong; shares not adding to 100; the phone's Search all stages
  doing nothing.
- Validation (140501 to 140506): no first-name check; no state check; the 25 MB limit not applied; the dialog not
  refusing a big file; `tel:` keeping spaces.
- Role and route (140801, 140101, 140406, 140608, 140609): the route drawing for a session with no coach; a player not
  sent Home; the Clubhouse page shown with the flag off; a failed read drawn as an empty list; no team treated as a
  failed list; a failed documents read drawn as empty.

### Film, the file drop and an idempotent Add (2026-09-30, later)

The four test files above: 117 passed (`npm run test:file`, exit 0). With the Fairway recruiting tests
(`FairwayRecruitingPage`, `FairwayRecruitCard`), `coverage-contract.b6`, `feature-registry` and
`supabase-service-wiring`: 9 files, 192 tests, exit 0. `typecheck:fast` exit 0. eslint on the changed files: 0 errors (one
`jsx-a11y/aria-role` warning on the `role="coach"` marker prop, the same as the other Clubhouse tests).
`squawk-cli` 2.64.0 on the migration, as CI runs it: 0 issues. `check:migration-headers`: the migration is not among the files
it flags.

Mutation checks: 80 deliberate breaks, 80 caught, each restored (29 on the server, 51 on the page). Two survived at first
and each got a test: the read-back's first name (a prospect with the same last name but another first name was accepted as
"saved"), and the log of an over-size file that could not be taken out of Storage. Covered: the type and size rules and the
names that are only object properties; a repeat that signs a second transfer or records a second row; the size read back from
Storage; Storage's refusals by status and by body; progress held at 99 until Storage answers; the drop (folder, several, empty,
text, the phone, a second drop, the window guard while the dialog is open); the toast staying quiet for a refusal; the upload id
kept across Retry; the request id kept across Retry and Save and changed with the contents; the team, creator and name
read-back.

Preview states forced: `upload`, `toolarge`, `refusedtype`, `refusedsize`, and a file dragged over (a synthetic `dragenter`).
axe (WCAG 2.2 AA): clean on 13 scans, the four states at 1280, 390 and 430 and the drag at 1280. The native-feel scan on the four
states at 390 and 430: clean. Both were run from a scratch copy of the scripts pointed at these URLs, because `a11y.mjs` and
`native.mjs` are edited by another session: add the four states to `CH_A11Y_PAGES`. Seen at 1280: the drop's dashed edge, the
upload dialog mid-transfer (a bar at 83%, "Uploading 83%") and Storage's refusal of a type.

The read-only database checks behind the migration: the live `recruit-documents` row (25 MB, fourteen types, no objects), the
coach-only policies on `storage.objects`, the `golf_recruits` constraints (the primary key is the only unique column, so
the request id is the key), and the new allowlist expression evaluated against the live row (seventeen types, the file's own
`-- VERIFY:` true of it). Nothing was written.

## Forced states

| State | Contract | How forced | Observed result |
| --- | --- | --- | --- |
| Skeleton | 140201 to 140202, 140301 to 140304 | tests, `?state=loading` | shaped like the page; the write's button says what it is doing |
| Empty | 140401 to 140406 | tests, `?state=empty`, `nomatch`, `sparse`, `noteam` | first run, a search with no match and a stage with nobody are three different screens, each with its own way on |
| Validation | 140501 to 140506 | tests | message beside the field, nothing sent, focus on the first problem |
| Server failure | 140601 to 140610 | tests, `?state=failwrites`, `failstage`, `docsfailed`, `failed` | toast or notice with its code; fields and dialog kept |
| Offline | 140701, 10703 | test (a stage change) | refused before anything moves; the shell's toast names the action |
| Permission | 140801, 140802 | tests (route, page, loader, an upload refusal) | a player sent Home, nothing drawn without a coach, the server's sentence as the reason |
| Destructive | 141101, 141102 | tests | confirm first, warning haptic, Keep leaves everything |
| Optimistic | 141301 | tests | the move is seen before the answer and undone if it fails, including a thrown error |
| Retry | 141401 | tests | Retry moves, undoes and moves again; Try again reads the list again |
| Slow save | 10702 | `?state=slow` in the preview; the shell's own test | the still-saving notice |

## Visual verification

### Desktop

```text
Viewport:  1280 and 924px (preview, the dev server on :3107)
Reference: design/handoff/recruiting/Main, AddProspect, Empty, NoMatch, LoadFailed (.dc.html)
Result:    main, add, empty, no match, failed and sparse compared with the boards at 1280; 924 checked for a
           sideways scroll and for the panel stacking under the list (the boards draw no 924). Loading is the
           skeleton, compared by eye only.
```

### Phone

```text
Viewport:     390 x 844 and 430 (preview)
Device/shell: not yet on a real iPhone (npm run ios:dev, owner)
Reference:    design/handoff/recruiting/Phone* (.dc.html)
Result:       list, detail, sparse, edit, stage sheet, delete, empty, no match and failed compared with the boards;
              sort menu opened and seen. The browser pass with a real coach session and the iPhone pass are open
```

## Accessibility

```text
Axe:            `CH_BASE=http://localhost:3107 CH_WIDTHS=1280,390,430 node scripts/clubhouse/a11y.mjs recruiting`
                exit 0: 40 scans (every state, the add, edit and delete dialogs, the phone sort menu and the stage
                sheet), WCAG 2.2 AA, contrast included
Native scan:    `CH_BASE=http://localhost:3107 node scripts/clubhouse/native.mjs recruiting` exit 0 at 390 and 430
                (tap targets, 16px fields, sideways scroll). The first run found two findings, both fixed: the search's
                Clear button (24px) and the sort menu's rows (34px), through two rules in `controls.css`
Keyboard:       tested: Enter saves the form (CH-14913), Esc clears the search, arrow keys move the stage, focus goes to
                the first invalid field (CH-14804). A full keyboard walk is open
VoiceOver:      not tried on a device
Reduced motion: the a11y and native scans run with reduced motion on; not otherwise tested
```

## Performance

```text
Layout shift:      not measured
Request waterfall: one server read before first paint (getRecruits); a prospect's documents when it opens
Large list:        the whole list ships to the browser and is filtered there, as on the current page; not measured
                   with a large team
Animation:         v2 tokens only (clubhouse:check bans literal durations)
```

## Knowledge check

`npm run -s docs:check` exit 0 after the commits (2026-09-30). On the way it failed three times, each for a reason this
change caused and fixed: the new files were untracked when first run, so `memory/features/recruiting.md`'s links to
them counted as dead references (they resolved once committed); the schema-drift check flagged `golf_clubhouse_ui` in
that doc (taken out: it says "the Clubhouse flag"); and the document inventory, the feature map and the world model
needed regenerating for the new docs and the registry entry (`knowledge:doc-inventory`, `knowledge:feature-map`,
`knowledge:world-model`, committed separately from the feature).

## Screenshots

Evidence log. The images stay in `.helm/screenshots/clubhouse/` (never committed) and travel in the PR description; this table is the committed record of them. One row per file; the label is the file's basename, named by `npm run clubhouse:shots -- name` (convention: `.claude/rules/clubhouse.md`). Phase is before, after, baseline or evidence.

| Label | Phase | Commit | What it shows |
|---|---|---|---|

## Open verification gaps

- `npm run build` was not run: it writes the `.next` folder the shared dev server reads, and the feature registry
  names it for Recruiting. No `'use server'` file was changed; the page and loading files and the new server-only
  loader are covered by typecheck and the tests. CI's Next build is the check.
- The full `npm run typecheck` (`tsc`) was not run; `typecheck:fast` (`tsgo`) was.
- A real coach session, against real data: the page, the five writes, a document upload and its signed link. None was
  run; every write is tested against a fake of the current server actions, and the preview's writes are in memory.
- The iPhone pass (keyboard with the edit sheet open, swipe-back with a sheet open, haptics, a file from Photos).
- Film needs the migration: the bucket takes no video and caps a file at 25 MB until
  `20260930140000_recruit_documents_film.sql` is applied. A real film was not uploaded (that would write to the production
  bucket), so the direct transfer to Storage was tested against a fake request only; what Storage answers to a refused film
  (413 for a size, 415 or a body naming the mime type for a type) is read from its documented shape, with a body-only case covered.
- The project-wide Storage upload limit is a project setting that could not be read; the migration assumes at least 100 MB.
- `npm run test:rls` was not run (no local database in this pass; the change is bucket configuration, not a policy) and
  `npm run build` was not run (a server-action file changed; CI's build is the check).
- `createRecruit`'s idempotency was tested against a fake of the database (the duplicate-key answer, the read-back); the real
  primary-key collision was not forced on production.
- CH-14601 and CH-14602 (motion) are preview-checked only.
- The registry will mark the codes `reserved` or `implemented` when the coordinator runs `sync`; 53 IDs are minted
  from the catalog, with no hand contracts.

## Found and fixed in this pass

- The phone search's Clear button and the sort menu's rows were under 44px (above).
- "Search all stages" cleared the search as well as the stage; it now drops only the stage.
- The phone add form nested a `<form>` inside the sheet's form (a hydration error); the phone body is a `div`.
- The committed stage's dot lost its contrast while disabled on an empty list.
- Preview relative dates drifted with the real clock; the view freezes its clock when given fixed data.

## Found, not fixed (outside this page's files or an owner call)

- See DESIGN.md "Not on the boards" for the eight questions (film, item 6, is decided and built; it waits for the migration).
- After a lost reply, editing a field and pressing Add again is a different Add and adds a second prospect; a Retry and a
  repeated Save with the same contents cannot. An upload the coach abandons after the file landed leaves an object with no row.
