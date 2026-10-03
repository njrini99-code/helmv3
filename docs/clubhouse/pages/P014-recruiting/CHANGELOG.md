# P014 — Recruiting: changelog

Newest first. Earlier history is in `docs/clubhouse/PROGRESS.md` (verification log and decisions).

## 2026-10-01 — Depth ladder: the lists and panels read their role (catch-up entry from the branch history)

```text
Design package: none (owner direction Q-142, 2026-10-01: "everything is flat and looks basic"; the plan is docs/clubhouse/DEPTH_AUDIT.md)
PR/commit:      agent/swap-audit (PR #2111): 800f225b1 (depth ladder), ad642694a (a comment in Documents.tsx)
Contract IDs:   none new; CH-14703 is now named where the refused-file haptic fires (ad642694a)
Actions:        none
Data impact:    none
Held items:     none
```

- **Changed.** `recruiting.css` moved ten flat cards from a one-pixel ring onto
  the reading-surface role, `var(--ch-elevation-reading)` (800f225b1: a crisp
  edge, a contact shadow and two soft ambient layers, on the lighter ivory
  canvas the audit set): on desktop `.ch-rec-list`, `.ch-rec-danger.is-block`
  and `.ch-rec-empty`; on the phone the list, the no-match card, the tiles, the
  stage rows and stages, the notes and the form groups (`.ch-recm-*`,
  `.ch-rec-none-match.is-phone`, `.ch-rec-form.is-phone`). No layout, copy or behavior changed.
  `Documents.tsx` gained one comment naming CH-14703, the refused-file error
  pattern (ad642694a); no behavior changed.
- **Why.** The owner found the whole app flat; one ladder of role tokens
  replaces per-stylesheet shadows, so a card reads its depth from what it is.
- **Verification.** The before and after shots for the audit are
  `e2e/clubhouse-materials.spec.ts` (16 screens at 390 and 1280). This entry was
  added by the changelog gate (`npm run clubhouse:check`) after the fact: no
  page-specific screenshots of Recruiting were logged in VERIFY.md.

## 2026-09-30 — Film, a file drop, and an Add that cannot repeat

```text
Design package: none (owner decision Q-95 item 6, 2026-09-30: film uploads allowed, as a file drop; the drop is not on the boards)
PR/commit:      agent/clubhouse (draft PR #2102)
Contract IDs:   9 new catalog rows: CH-14107 to CH-14110, CH-14407, CH-14703, CH-14915 to CH-14917; CH-14005, CH-14105,
                CH-14106 and CH-14404 reworded (the registry mints the IDs when the coordinator runs sync)
Actions:        9 (ACT-P014-ADD-PROSPECT and ACT-P014-UPLOAD-DOCUMENT changed; none added)
Data impact:    one migration, written and NOT applied: supabase/migrations/20260930140000_recruit_documents_film.sql
Held items:     the film migration (held plan docs/clubhouse/held/data/recruit-documents-film.md; its HELD.md row is the coordinator's)
```

- **Issue.** (1) The `recruit-documents` bucket took no video and capped a file at 25 MB, so the boards' sample film (a
  `.mov`) could not be attached, and a file could only be chosen, not dropped. The upload also went through a server
  action, whose request body is capped far below a film. (2) `createRecruit` had no idempotency key: a Retry after a
  reply lost on the way added the prospect a second time.
- **Fix.** (1) MP4, MOV and M4V up to 100 MB can be attached, by the picker (the phone's only way) or, on desktop, by
  dropping one file on the prospect's Documents (several files, a folder or an empty file are refused with a sentence:
  CH-14109, CH-14110; a dashed edge shows where it lands: CH-14917). The bytes go straight to Storage on a signed URL
  the server makes for this coach and this prospect (prepare, then complete; the path is built on the server and the
  row's size is read back from Storage), with real progress and "Keep this page open" (CH-14407), and one upload id per
  file so a Retry never sends or records it twice (CH-14916). A file over its limit (25 MB, film 100 MB) or of a type
  the bucket does not take is refused before sending (CH-14105, CH-14106), and a file Storage itself turns down is named
  in the dialog, not reported as a failure (CH-14107, CH-14108), which is what happens until the migration is applied.
  (2) An Add carries one request id, kept across Retry and a repeated Save; the server inserts under it, and a repeat
  finds the row its first attempt stored, but only once it reads back as this coach's own, on this team, with this name
  (CH-14915).
- **Checked.** Recruiting tests: the existing 61 (updated where they encoded the old rules) plus 31 new (`recruiting-upload.test.tsx`), and 25 on the server side (`recruit-document-upload.test.ts` 16, `recruiting-create.test.ts` 9): 117 passed; with the Fairway recruiting tests, the recruiting coverage-contract, feature-registry and Storage-wiring tests, 9 files and 192 tests pass. 80 deliberate breaks of the guarded code (29 on the server, 51 on the page), all caught and restored; two survived at first and each got a test (the read-back's first name, the log of an over-size file that could not be taken out). `typecheck:fast` exit 0; eslint 0 errors; `squawk` 0 issues on the migration;
  the migration's new allowlist evaluated read-only against production's current row (17 types, all fourteen old ones
  kept); axe and the native-feel scan on the four new preview states (`upload`, `toolarge`, `refusedtype`,
  `refusedsize`) and on a file dragged over: clean on 13 scans (the four states at 1280, 390 and 430, and a file dragged over at 1280), and the native-feel scan clean on the four states at 390 and 430.
- **Not checked.** The migration applied and a real film uploaded (the bucket takes no video until it is); the project's
  Storage upload limit (a project setting that could not be read: it must be at least 100 MB); `test:rls`; a production
  build; the iPhone (a film from Photos, the picker's offer of it, the transfer on cellular).

### Added

- `src/clubhouse/screens/recruiting/upload.ts` (the transfer to Storage: prepare, a PUT with progress, complete) and the
  file drop in `Documents`; `prepareRecruitDocumentUpload` and `completeRecruitDocumentUpload` in
  `src/app/golf/actions/recruit-documents.ts`; `src/app/golf/actions/recruit-documents-limits.ts` (the types and caps,
  shared by the server and the page); `createRecruit(input, { requestId })`.
- The migration `20260930140000_recruit_documents_film.sql` (written, not applied) and its held plan
  (`docs/clubhouse/held/data/recruit-documents-film.md`, listed in this page's manifest).
- 9 catalog rows (CH-14107 to CH-14110, CH-14407, CH-14703, CH-14915 to CH-14917) and preview states `upload`,
  `toolarge`, `refusedtype`, `refusedsize` (the upload dialog open on a film, refused, and refused by Storage).
- Tests: `recruiting-upload.test.tsx`, `recruit-document-upload.test.ts`, `recruiting-create.test.ts`.

### Changed

- The upload is no longer a `File` passed to a server action (the current page still does that, unchanged).
- Choosing or dropping a video starts the category as Film.
- Checks that encoded the old rules were updated with them: a `.mov` is no longer "a type the bucket does not take", the
  add and upload calls carry a request id and an upload id.

### Why

- The owner asked for film uploads "as a file drop" (Q-95 item 6) and for the repeat-Add hole found while building this
  page to be closed. A server action cannot carry a film, so the file goes to Storage directly under the coach's own
  session; RLS on the bucket (coach-only, team-scoped) is unchanged and already covers any path in the recruit's folder.

### Open

- Apply the migration (and confirm the Storage upload limit is at least 100 MB first). Until then a film is refused by
  Storage and the dialog says so.
- After a lost reply, editing a field and pressing Add again sends a new id, so it adds a second prospect (the contents
  changed, so it is a different Add). A Retry, and Save pressed again with the same contents, cannot.
- A file that landed whose row never saved, and whose coach walked away, stays in the private bucket with no row.
- Cancel is off while a file is uploading, as it was (a long upload cannot be stopped from the dialog).

## 2026-09-30 — Recruiting in Clubhouse (desktop and phone)

```text
Design package: design/handoff/recruiting/ (the owner's canvas "Clubhouse Recruiting", approved 2026-09-30)
PR/commit:      agent/clubhouse (draft PR #2102)
Contract IDs:   140101 to 142001 (53 on this page, all from the catalog; none hand-recorded)
Actions:        9 (ACT-P014-*)
Data impact:    none
Held items:     none
```

- **Issue.** With Clubhouse on, a coach opening Recruiting got the existing page, and the owner's approved boards
  were not built. There was no phone design in the app at all.
- **Fix.** A new page at `/golf/dashboard/recruiting` (coach only), built from the boards on the existing server
  actions: the header, the four-stage pipeline that filters the list (counts and shares of the whole list), search over
  name, hometown, state, email and notes, three sorts, and the open prospect's panel with Email and Call, notes and
  private documents (upload, open, remove). A stage is saved the moment it is picked and goes back, with a Retry, if it
  does not land (CH-14003); delete asks first (CH-14501); every write goes through `useAction`, so offline refuses
  before sending and Retry finishes the whole job. The phone is the boards' phone build: a pushed prospect, and the
  edit form, the stage picker and delete as sheets. In the coach's Team section after Roster. With the flag off the
  existing page is unchanged; a player is still sent Home.
- **Checked.** Recruiting tests 61 of 61 and all of `src/clubhouse` 1531 of 1531; 32 deliberate breaks of the guarded
  code, all caught and restored; `typecheck:fast` and eslint clean; axe at 1280, 390 and 430 (40 scans) and the
  native-feel scan clean (VERIFY.md). `clubhouse:check` passes once `registry.mjs sync` has minted the 53 IDs.
- **Not checked.** A real coach session, the build, the iPhone (VERIFY.md).

### Added

- The page: `src/clubhouse/screens/recruiting/` (`Recruiting`, `RecruitingView`, `RecruitingDesktop`,
  `RecruitingPhone`, `Pipeline`, `Documents`, `ProspectForm`, `RecSheet`, `parts`, `writes`, `ctx`,
  `RecruitingSkeleton`, `RecruitingNoTeam`), the loader and pure rules (`data/recruiting.ts`,
  `data/recruiting-shape.ts`), the route (`routes/recruiting.tsx`) and `styles/recruiting.css` (`.ch-rec-*`,
  `.ch-recm-*`).
- 53 catalog states, CH-14001 to CH-14914 (`docs/clubhouse/catalog/recruiting.md`), each named by a test except the
  two motion rows; the manifest, the six page docs, the phone spec and the screen checklist.
- The preview at `/clubhouse-preview/recruiting` with its states (empty, nomatch, failed, loading, sparse, noteam,
  detail, add, edit, delete, docsfailed, failwrites, failstage, slow), in `a11y.mjs`.

### Changed

- The page and its `loading.tsx` render Clubhouse for a coach with the flag on; the sidebar lists Recruiting in
  Team after Roster, and the route is rebuilt for coaches only (`shell/nav.ts`, `shell.test.tsx`).
- `controls.css`: on the phone a menu's rows are 44px tall, and the search's Clear button has a 44px hit area (both
  found by the native-feel scan on this page; shared, so every page gains them).
- `memory/features/recruiting.md` and `memory/registry.yml`: the Clubhouse surface, code and test.

### Why

- The owner approved the boards (Q-87, launch scope: Recruiting is the one screen rebuilt beyond the earlier boards).
  D-64 (motion), D-66 (navigation), D-69 (every category answered), D-70 (haptics) and D-71 (page empty state) apply.

### Open

- Eight questions for the owner about what the boards do not draw (DESIGN.md, "Not on the boards"): the upload
  dialog, removing a document, the no-team page, an empty stage, Add on the phone, film, pronouns and a remembered
  filter.
