# P014 — Recruiting: changelog

## 2026-10-08 — Premium pass: Committed moment, next step, recruiting calendar, findings

```text
Design package: docs/clubhouse/PREMIUM_PASS_AUDIT.md (P014 B1, C1, C2; findings #1–#4, #6–#9)
PR/commit: agent/clubhouse-premium-backlog (uncommitted at writing)
Contract IDs: CH-14111, CH-14307, CH-14806, CH-14807, CH-14808 (new); CH-14904, CH-14501, CH-14302 (changed copy or place)
Actions: ACT-P014-MOVE-STAGE (a commit's success haptic moves to the rule's end); save and add send the next step only while its columns exist
Data impact: supabase/migrations/20261008120000_golf_recruits_next_step.sql, written, NOT applied (two nullable columns, no RLS change)
Held items: the next-step write needs createRecruit/updateRecruit to pass next_step_label/next_step_date (src/app/golf/actions/recruiting.ts, outside this page); calendar event and Undo for a next step not built
```

### Changed

- **B1, Committed is a moment, once (CH-14806).** A landed move to Committed
  draws a 1px gilt rule under the stage (desktop panel; the phone's Stage row),
  left to right over the reveal duration, and the success haptic lands as it
  ends instead of when the save lands. The coin takes a gilt rim. On the phone
  it waits for the stage sheet to close. Reduced motion and Animations off: the
  rule is there and the haptic fires at once. No repeat on reopening.
- **C1, Next step (CH-14307, CH-14111).** A label and a day per prospect: a
  table column, a panel and detail part, a dated plate on a due phone row, a
  "Next step due" sort and "n visits this month · n decisions due" in the
  pipeline head. Feature-off until the migration is applied: the loader probes
  the column with a zero-row head request and the list keeps `select('*')`.
  Editing it also needs the writes to store it (`nextStepWrites`): the live
  server actions whitelist columns today, so until they pass the two fields
  through, a next step is shown read-only and never sent.
- **C2, Recruiting calendar (CH-14808, CH-14807).** A quiet line from the
  2026-27 NCAA D-I, D-II, D-III, NAIA and NJCAA rule books, each entry sourced.
  Division from the team's organization, else the coach's pick on this device.
  Email and Call carry Division I's June 15 start note from the class year; no
  period restricts phone or email, so no period hint is shown.
- **Findings.** #1 State has no placeholder and Class of reads "e.g. 2028"; #2
  the Add form's stage options fill their track; #3 desktop Delete moved into
  an overflow menu beside Edit; #4 "% of list" removed; #6 "Only coaches see
  this page" moved to the first-run empty state; #7 the search placeholder is
  "Search" and the no-match line names states; #8 phone Stage is a full-width
  row with Email and Call as two smaller keys; #9 phone connectors run coin
  edge to coin edge. #5 (the shared canopy band) is the shell's; the page-local
  part is the shorter subtitle.

### Why

- Owner-approved premium backlog items for P014 (B1, C1, C2) and the page's
  P2 and P3 findings.

### Verification

- `npx vitest run src/clubhouse/__tests__/recruiting.test.tsx
  src/clubhouse/__tests__/recruiting-calendar.test.ts
  src/clubhouse/__tests__/recruiting-loader.test.ts
  src/clubhouse/__tests__/recruiting-upload.test.tsx`; WebKit captures at
  1440 and 390, light and dark, of the default, next-step, edit, division and
  Committed states (scratch, not in git).

## 2026-10-08 — Copy: typographic apostrophes and quotes

Recruiting writes its apostrophes as ’, as Home, Stats and Calendar do: the
no-team page (CH-14306), the failed reads (CH-14201, CH-14202), the first run,
the delete confirmations (CH-14501, CH-14502), the failed writes (CH-14001 to
CH-14007) and the upload's own reasons, so an offline write reads "Couldn’t
move Mason Reilly to Committed: you’re offline" (CH-14901). A search that
matches nothing quotes the words in curly quotes: No prospects match “Tampa”
(CH-14302). What the server sends is shown as it sent it ("Only this team's
coaches can add recruit documents."). The catalog quotes them as shown, and
copy-apostrophes.test now covers the page.

## 2026-10-08 — States: first run stands alone

From the states audit (2026-10-08, finding c2): with no prospects yet, the
desktop page no longer draws the pipeline's four empty stages above the page
empty. "Your prospect list starts here" stands alone under the head, so Add
your first prospect sits well above the fold, as on the phone (CH-14301).

## 2026-10-08 — Phone: the Mobile clubhouse pass

The phone Recruiting follows the Coach Home board (round 3, "fewer containers,
one feature card"), carried to every phone screen (owner: "phone too cardy"):

- **Head:** the page opens on the engraved double rule with Recruiting in the
  bold condensed sans (no serif). No green feature card: nothing on this list
  outranks the rest.
- **Timeline:** the compact pipeline sits between two hairlines instead of in a
  box; a stage's coin takes the row press tint under the finger (CH-14601).
- **Prospects:** rows on seams under a hairline, with no card; a press tints the
  row 12px past its text (CH-14604). The sort's trigger tints the same way.
- **No match** is centred on the parchment, with no box around it.
- **Search** keeps the kit's field, 36px drawn with a 44px reach; the input
  and its clear key still take their own taps. A stale override that lost the
  cascade to the kit's field (a 40px grey well) is gone, so the field no
  longer depends on stylesheet order.
- **A prospect (pushed):** the name in the bold condensed sans; Stage, Email and
  Call are keys drawn on the parchment (a hairline ring; the stage key keeps
  its stage's fill); with no contact yet, Stage is a row between seams. Notes
  and Documents open under the double rule with their headings; a part with
  nothing in it yet is one row on a seam, and such rows run on as one ledger.
  Documents are rows on seams. Every key, row and action tints under the
  finger (CH-14604). Upload keeps its full 44px reach over the first
  document under it.
- **Loading** draws the phone page on its own classes (the double rule, the
  title, the search, the timeline between its hairlines, the count and the
  rows), so nothing moves when it lands.
- The add and edit sheets, the stage picker and the delete sheet keep their
  material: they are sheets and forms.
- The upload bar's fill now slides by transform instead of growing its width
  (doctrine: never animate layout). It looks the same.

Desktop is otherwise unchanged: every other new rule sits in the phone
block, and the skeleton's phone parts are hidden there. 1440 captures before
and after match, apart from the loading page, where the shared skeleton's tone
and ruled blocks changed in the same pass.

## 2026-10-07 — A stage settles the list in

Picking a stage in the pipeline, or letting it go, settles the prospect list in
with a 6px rise (base) while the old one fades out (quick), hidden from
assistive tech (CH-14603, desktop and phone). Typing a search and the kept stage
coming back as the page opens stay in place. A prospect row presses with the row
press tint. CH-14602 is corrected: with reduced motion the prospect settles at
once. New test: recruiting.test › CH-14603.

## 2026-10-07 — Recruiting on the Ledger

On desktop, Recruiting now sits on the canvas instead of in cards (owner:
"flush, not so card heavy"):

- **Pipeline:** "Pipeline" and its count are the section heading, set over an
  engraved rule. The four stages are now columns divided by hairlines rather
  than a timeline. Each coin has its stage, blurb and share beside it, or under
  it on a narrower canvas. A stage is still a filter, and the stage being shown
  takes a green tint.
- **Prospect list:** the search and sort head the list over an engraved rule.
  The table's rows have seams and sit on the canvas. A row's hover and selected
  tints are drawn as one box, so Safari leaves no hairline gaps between columns.
- **Prospect panel:** a column beside the list behind a hairline, or under it
  behind a rule once they stack. Contact rows and documents have seams, the
  notes are plain text, and an empty part is a row with an engraved icon instead
  of a card.
- **Delete prospect** is red, as in the handoff (D-42). It had no style and
  drew as black text.

The loading screen draws the same pipeline line for line. The list used to drop
27px at 1440 when the data landed; it now moves 0px (WebKit, 1440 and 1100).
The lede no longer leaves "page." alone on its last line. Coins, stage chips, the
search field, segmented controls and dialogs keep their material. The phone is
unchanged.

## 2026-10-07 — Phone title in the serif

The phone Recruiting large title was a 34px semibold sans. It now uses the
display serif at 38px, matching every other phone page title.

## 2026-10-07 — Serif title

The Recruiting title is set in the display serif, as on every Clubhouse page.

## 2026-10-06 — Popup text and height corrections

```text
PR/commit:      #2155, codex/clubhouse-smoothness-audit
Design package: approved phone bars and action-sheet layout
Contract IDs:   existing CH-14501, CH-14914 and shell overlay contracts
Data impact:    none; CSS sizing and accessible message association
Held items:     physical iPhone, VoiceOver, keyboard and gesture acceptance
```

Form/picker bars wrap long titles without displacing Cancel/Save/Done. Stage
notes and deletion copy wrap unbroken imported names. The deletion sheet
scrolls at short viewport heights and announces its description. Busy guards,
stage actions and writes are preserved. See [popup evidence](../../POPUP_AUDIT.md).

<!-- clubhouse:release-audit:start -->
## 2026-10-06 — Whole-app release audit

Reconciled page purpose, design acceptance, contract status, wiring and
verification against the current flagged implementation. Indexed 9 mapped
actions and 14 overlay/control call sites in the [all-page
audit](../../ALL_PAGE_AUDIT.md#p014-recruiting). Approved handoffs and
contract IDs are preserved; runtime gaps stay explicit.
<!-- clubhouse:release-audit:end -->

Newest first. Earlier history is in `docs/clubhouse/PROGRESS.md` (verification log and decisions).

## 2026-10-06 — Motion import path moves to `motion/react`

```text
PR/commit:      #2153 (agent/deps-ui-upgrade)
Design package: none; no visual or behavior change
Contract IDs:   none
Data impact:    none
Held items:     none
```

Dependency upgrade only. `framer-motion` 13 is replaced by the `motion` 14
package, so this page's animation imports change from `framer-motion` to
`motion/react`. The animation API, durations, curves and reduced-motion gating
are unchanged; Motion 14 only removed internal compatibility APIs this tree
never used.

## 2026-10-02 — Phone prospect sheets keep their fields through dismissal

```text
PR/commit:      codex/clubhouse-design-fidelity (pending)
Design package: approved boards; bars and dismissal policy unchanged
Contract IDs:   CH-14403, CH-14406, CH-14501
Data impact:    none; client dialog/scroll/focus/gesture lifecycle only
Held items:     physical iPhone keyboard and gesture validation
```

Edit, stage and delete sheets now share the native dialog lifetime. Even when
the parent clears its selected prospect, the last open subtree remains during
the exit. Background scroll stays locked until completion, rapid reopen cancels
the prior close, and title/opener focus uses preventScroll. Busy save/delete
dismissal guards are preserved.

Keyboard viewport sizing keeps Cancel/Add above the keyboard and the form body
scrollable through Stage/Notes. The destructive action sheet remains scrollable
in the available space.

Targeted checks: 351 tests pass across the final focused runs; scoped ESLint and
diff check exit 0. Runtime evidence is recorded in this page's VERIFY entry.

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
