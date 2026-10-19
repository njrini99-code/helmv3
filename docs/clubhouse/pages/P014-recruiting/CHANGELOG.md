# P014 — Recruiting: changelog

## 2026-10-19 — Empty Recruiting draws the pipeline; no match is the filtered state

```text
Design package: none (complete-and-elevate plan, lane L3: empty, first-run and failure states)
PR/commit:      lane L3 commits on agent/clubhouse-complete
Contract IDs:   CH-14301, CH-14302, CH-14306
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- The empty list draws four lanes under a ruled head (desktop) or rows (phone) under the sentence.
- No match for a search or stage (CH-14302) is the shared filtered state, announced as a status, with the same two ways back; `.ch-rec-none-match` is gone. The prospect panel's per-part empty rows (`EmptyRow`) are unchanged.

### Why

- Every empty page was one template: a green tile, a headline, a sentence and a button in blank space. The waiting form draws the shape of what will fill the space (rules, rings, a baseline; no bars, no fake text) under one sentence that names what fills it and who does it, and a filter that hides everything is told apart from a first run, a lock and a failed read.

### Verification

- `states.test.tsx` (the waiting form, its four kinds, the danger tone unchanged) and this page's tests; captured on `/clubhouse-preview/recruiting?state=empty and nomatch`, phone and desktop, light and dark, before and after.

## 2026-10-18 — Pickers and controls: next step due, stage radios, saving

```text
Design package: none (complete-and-elevate plan, lane L2)
PR/commit:      uncommitted (agent/clubhouse-complete)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed (2026-10-18, L2 pickers and controls)

- The browser's own date and time inputs are gone. A prospect's Due (optional, with Clear) shows the value as the app writes it ("Thu 15 Oct 2026", "3:30 PM") and opens a month (dates) or a list by the quarter hour (times): a popover under the field on desktop, a bottom sheet on the phone. On desktop the field stays typable ("10/15", "oct 15", "tomorrow", "fri"; "3p", "1530") and says "Try 10/15, oct 15 or tomorrow." when it can't read what was typed. Today carries a dot, the chosen day is the segmented control's lit chip, days outside the range are off, and arrows, PageUp and PageDown, Home and End and Enter work in the grid. The saved value is the same `yyyy-mm-dd` / `HH:mm` string as before.
- The phone stage picker (it saves as the arrow keys move, as before) is one tab stop with the arrow keys, Home and End moving and choosing, as a native radio group does (`ui/use-roving.ts`); a disabled option is skipped.
- Add prospect and Save changes stays lit while it works (Button's `busy`: aria-busy and no second press) instead of going unlit like a button that is unavailable.

## 2026-10-18 — Wave 8: the calendar pick's press

```text
Design package: none (wave-7 premium details review)
PR/commit:      uncommitted (polish review, agent/fairway-fixes-polish)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed (2026-10-18, premium details)

- The calendar line's pick takes the row press tint a beat after the finger
  lands, as a Ledger row does.

## 2026-10-18 — Wave 6: next steps, the calendar line and Email and Call

```text
Design package: none (wave-6 CoachHelm and Recruiting review, items 4-10, 23)
PR/commit:      uncommitted (polish review, agent/fairway-fixes-polish)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed (2026-10-18, wave-6 recruiting)

- Next step: a step whose day has passed is overdue. Its plate, the
  desktop Next step column and the panel's or detail's row turn
  `--ch-warning-600` (plate ruled in it), as Team Hub marks an overdue task
  (the check keeps red for under par), and VoiceOver reads "Overdue:" first
  (`isNextStepLate`; today is due, not late). Measured in WebKit: 4.57:1 on
  the selected desktop row, 4.88 to 5.20 elsewhere in light, 7.57 or more
  in dark.
- Sorted by Next step due, every step shows its plate on the phone (Caleb
  beyond two weeks, Owen with no day), and a step with a label and no day
  sorts after the dated ones, before prospects with none. On desktop, a
  list too narrow for the Next step column (the panel open) shows the plate
  under the name while so sorted.
- The pipeline head's "decisions due" skips a committed prospect: the
  preview now reads "1 visit this month".
- The calendar line puts a contact period's end beside its name: "Contact
  period through Nov 8 · in-person contact for prospects from Aug 1 before
  their junior year". `recruiting-calendar.ts` is Clubhouse-only (no
  importer outside `src/clubhouse`); quiet, dead and Division II lines are
  unchanged.
- Phone detail: Email and Call show the address or number under their name,
  cut with an ellipsis (the link's name now includes it); the Next step row
  lines up with its heading and the notes (no 14px inset).
- The form's Notes placeholder drops "next steps" when the form has a Next
  step field.

### Not changed (2026-10-18, wave-6 recruiting)

- State keeps no placeholder: P014 finding #1 removed "NC" as a plausible
  value, and recruiting.test pins it.

### Verification (2026-10-18, wave-6 recruiting)

- `recruiting.test.tsx` (CH-14802 sort and plates, overdue, head count,
  tiles, Notes placeholder), `recruiting-calendar.test.ts`; a WebKit probe
  at 1280 and 390, light and dark (layout, contrast).

## 2026-10-18 — Wave 5: what was typed survives Cancel

```text
Design package: none (wave-5 feedback review, item 7)
PR/commit:      uncommitted (polish review, agent/fairway-fixes-polish)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed (2026-10-18, kept draft)

- `ProspectForm`: Cancel, Esc or the backdrop on Add keeps what was typed,
  and the next Add starts from it; an Add that lands ends it. Edit is
  unchanged (Cancel discards), as Team Hub's edit. A kept Add saves under its
  first opening, so a lost-reply Add retried after Cancel keeps its request
  id (CH-14915).

### Verification (2026-10-18, kept draft)

- `recruiting.test.tsx` › CH-14910 CH-14915 Cancel keeps what was typed;
  `recruiting-upload.test.tsx` (CH-14915) unchanged and passing.

## 2026-10-18 — Wave 5: pending labels end in “…”

```text
Design package: none (wave-5 feedback review)
PR/commit:      uncommitted (polish review, agent/fairway-fixes-polish)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed (2026-10-18, pending labels)

- "Saving…" (CH-14403), "Uploading…" and "Uploading… 42%"
  (CH-14404), "Removing…" (CH-14405) and "Deleting…" (CH-14406).

## 2026-10-18 — Wave 4: phone text follows Dynamic Type

```text
Design package: none (wave-4 Dynamic Type pass)
PR/commit:      uncommitted (polish review, agent/fairway-fixes-polish)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed (2026-10-18, Dynamic Type)

- Phone text in `recruiting.css` (list, pipeline, prospect, documents, the
  stage sheet and the prospect form) moves from fixed px to
  `calc(N * var(--ch-type-k))`. The phone fields' own sizes become
  `max(16px, …)`; they are redundant today, since the app's 16px zoom guard
  and the shared field rule (controls.css) size every field. The pipeline's
  count discs and the initials stay fixed.
- Phone, for a large Text Size: the form's label column grows with the type
  (`calc(96 * k)`), the Add form's stage options move the last one to a
  second row when four no longer fit, and document rows take 6px above and
  below for a wrapped title. None of it moves at the default size.

### Verification (2026-10-18, Dynamic Type)

- WebKit (Playwright, dev preview, 390): every Recruiting preview state is
  pixel-identical to before at the default size. At XXL this sheet's change
  takes unscaled text from 39 to 14 on `recruiting` (count discs, initials
  and the shared search); "Hometown" no longer runs into its field and the
  stage options no longer run off the well. At 1280 the stage options keep
  four columns.

## 2026-10-18 — Wave 3 accessibility: sheets, section heading levels

```text
Design package: none (wave-3 accessibility review, items 13)
PR/commit:      uncommitted (polish review, agent/fairway-fixes-polish)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed (2026-10-18, a11y wave 3)

- The prospect and stage sheets' bars keep their `header` element (the phone's
  no-select chrome rules key on it) with `role="none"`, so a sheet no longer
  adds a second banner landmark.
- Phone prospect: Contact, Next step, Notes and Documents are `h2` under the
  screen's `h1` (the name); they skipped to `h3`. The sections take a heading
  `level` (`SecHeading`, default 3), so the desktop panel keeps `h3` under its
  `h2` name. Phone and desktop headings keep their look.

### Verification (2026-10-18, a11y wave 3)

- `npm run test:file` on `recruiting.test.tsx`.
- WebKit (Playwright, dev preview, 390, axe-core): with the stage sheet or the
  edit sheet open, no duplicate-banner, landmark-unique or aria-allowed-role
  finding.
- axe-core on `recruiting?state=detail`, 390 and 1280, light and dark:
  heading-order 2 to 0; `npm run test:file` on the recruiting tests.

## 2026-10-18 — Wave 3: the shared gutter

```text
Design package: none (wave-3 design review, items 5)
PR/commit:      uncommitted (polish review, agent/fairway-fixes-polish)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed (2026-10-18, page-head line)

- On desktop the page head sits on the shared line: the main takes
  `--ch-page-gutter` (40px) at its sides and `--ch-page-head-top` (34px) above
  the head (tokens.css), and keeps its own max width, so at 1280 and below the
  title holds still between tabs. The tight head keeps its tight top; its title
  is at y 110. The no-team page takes the same frame.

### Verification (2026-10-18, page-head line)

- WebKit (Playwright, dev preview): every full-head tab title (Home, Hub, Stats,
  Calendar, Settings, Qualifiers, Rounds, Classes, CoachHelm) at y 156 (156.9 on
  Rounds) at 1280 and 1440, and at x 284 at 1280; at 1440 a page narrower than
  the canvas still centres (Home x 320, Settings 340, CoachHelm 290). Loading
  states keep the loaded head line. At 1024 the same line holds where a page's
  narrow layout does not take over (Settings keeps its 16px); at 390 every main
  keeps its phone padding.
- `clubhouse:check`, `typecheck:fast` and eslint pass. `clubhouse:css` exits 1
  on five `shell.css` findings (lines 3743 to 3822) from earlier work, none in
  this change.

## 2026-10-18 — Polish: panel rings inside the scroller

```text
Design package: none (wave-2 interaction review rows 6)
PR/commit:      uncommitted (polish review, agent/fairway-fixes-polish)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed (2026-10-18, interaction review)

- The prospect panel's rows, links and document Remove keys draw their
  focus ring inside, where the panel's scroller no longer clips it.

### Verification (2026-10-18, interaction review)

- WebKit (Playwright) checks: focused vs blurred and hovered vs resting
  computed styles and crops, `scratchpad/w2-interact/`.
- `npm run test:file` on the page's tests, `clubhouse:check`,
  `typecheck:fast` and eslint pass. `clubhouse:css` exits 1 on the five
  existing `shell.css` findings (lines 3742-3821), none in this change.

## 2026-10-17 — Polish: the search names what it searches

```text
Design package: none (polish review rows; no new pattern)
PR/commit:      uncommitted (polish review, agent/fairway-fixes-polish)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- The search placeholder reads "Search prospects" on desktop and phone, where
  it was a bare "Search" (the premium pass's #7 choice; the no-match line
  still names the fields) (`RecruitingDesktop.tsx`, `RecruitingPhone.tsx`).
- Tabular figures restored (review row 18): 7 rules in `recruiting.css` that
  set `font` on a figure (pipeline counts, row values, next-step plates and
  column) now set `font-variant-numeric: tabular-nums` after it.

### Verification

- `npm run test:file` on the page's tests, `clubhouse:check`,
  `clubhouse:css`, `typecheck:fast` and eslint. The WebKit pass is the
  coordinator's.

## 2026-10-17 — Wiring checked against production (no change)

```text
Design package: none
PR/commit:      uncommitted (Clubhouse wiring pass, remaining screens)
Contract IDs:   none
Actions:        ACT-P014-* checked, none changed
Data impact:    none
Held items:     none
```

### Checked, no change

- Add, Save, the stage move and Delete call `createRecruit`, `updateRecruit` (`{
  status }` for a move, the whole form for a save, as `FairwayRecruitFormSheet`)
  and `deleteRecruit`; documents call `getRecruitDocuments`,
  `prepareRecruitDocumentUpload` / `completeRecruitDocumentUpload` (the same
  two-step signed upload as `recruit-document-upload.ts`, the same five
  categories), `deleteRecruitDocument` and `getRecruitDocumentUrl`. Every action
  scopes to the team `resolveCoachTeamIdWithCookie` picks, and the loader reads
  through `getRecruits` and the same resolver, so what is drawn and what is
  written are one team. RLS on both tables is `is_golf_team_coach(team_id)`.
- The move is optimistic and put back on a refusal or a throw, inside the
  action, so Retry repeats both; Add, Save and Delete change the list only once
  the server answers. No realtime. Email and Call are `mailto:` / `tel:`; the
  no-team page's Open team settings opens Settings' Team section, which is
  rebuilt for a coach.

## 2026-10-15 — Ink that holds at night

Dark mode: the offered chip and stage dot and the prospect avatar's initials now
take `--ch-on-fill-*` / `--ch-forest-*` ink, which match the day's palette in
light and stay light at night (they went dark on dark). Light is unchanged.
Shared change: docs/clubhouse/CHANGELOG.md.

## 2026-10-13 — Sheets rise and leave on the shared spring, over the shared backdrop

The phone's form, picker and action sheets rise on the smooth spring (462ms)
instead of the 260ms ease-out, leave
on it too, and sit on the shared `--ch-scrim` (0.36) instead of their own 0.42
and dark 0.6. Shared change:
docs/clubhouse/CHANGELOG.md (popups).

## 2026-10-12 — A section root on the phone (no "‹ More")

The phone shell's section strip replaced the tab bar and the More sheet
(docs/clubhouse/phone/section-strip.md). Recruiting's phone top bar no longer
draws a "‹ More" back link: its title is a start title (`PhoneTop start`),
which the shell turns into the section switcher. The page's action, where it
has one, is unchanged. Shared change: docs/clubhouse/CHANGELOG.md.

## 2026-10-12 — Recruiting follows the dashboard role

Clubhouse Recruiting is drawn only when the gate is on for the coach and the
dashboard layout's
role (`getGolfDashboardRole`) is the coach's: a coach row beside an onboarded
player profile (the
player dashboard) no longer reaches the coach route. Fairway, the page's own
access checks and the gate-off path are unchanged.

## 2026-10-10 — Tokens for the pipeline, gentler coins

Presentation only. The pipeline's coins, connectors and stage chips use palette
tokens instead of nine hex literals; the offered and
recruiting coins carry a soft shadow and lift under the pointer, and press in.

## 2026-10-08 — Next step writes, the held migration, calendar fact-check

- **Next step writes (C1).** `createRecruit` and `updateRecruit` accept
  `next_step_label` (trimmed, at most 120 characters) and `next_step_date` (a
  real YYYY-MM-DD day) and write them only when passed, with the coach and team
  checks unchanged. The live writes now store a next step; the page still sends
  one only after its column probe finds the columns, so before the owner applies
  `20261008120000_golf_recruits_next_step.sql` (held in
  `supabase/migrations/HELD.md`, `lock_timeout` 3s) no write names them.
- **Calendar (C2), after a fact-check of all 15 dates against the 2026-27
  books.** Division I's contact line carries its age rule ("in-person contact
  allowed from Aug 1 before junior year", 13.1.1.1); Division II's line says
  in-person contact starts June 15 before junior year (13.1.1.1); the Division I
  men's quiet period notes evaluations at the GCAA showcase and combine
  (13.17.7-(c)-(1)); the NJCAA line reads "The NJCAA sets no recruiting periods;
  staff may visit prospects anywhere" (Art. VI §4 C.1).

## 2026-10-08 — Premium pass: Committed moment, next step, recruiting calendar, findings

```text
Design package: docs/clubhouse/PREMIUM_PASS_AUDIT.md (P014 B1, C1, C2; findings #1–#4, #6–#9)
PR/commit: agent/clubhouse-premium-backlog (uncommitted at writing)
Contract IDs: CH-14111, CH-14307, CH-14806, CH-14807, CH-14808 (new); CH-14904, CH-14501, CH-14302 (changed copy or place)
Actions: ACT-P014-MOVE-STAGE (a commit's success haptic moves to the rule's end); save and add send the next step only while its columns exist
Data impact: supabase/migrations/20261008120000_golf_recruits_next_step.sql, written, NOT applied (two nullable columns, no RLS change)
Held items: the next-step write needs createRecruit/updateRecruit to pass next_step_label/next_step_date (src/app/golf/actions/recruiting.ts, outside this page); calendar event and Undo for a next step not built
```

### Changed in the premium pass

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

### Why the premium pass changed it

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
27px at 1440 when the data landed; it now moves 0px (WebKit, 1440 and 1100). The
lede no longer leaves "page." alone on its last line. Coins, stage chips, the
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
notes and deletion copy wrap unbroken imported names. The deletion sheet scrolls
at short viewport heights and announces its description. Busy guards, stage
actions and writes are preserved. See [popup evidence](../../POPUP_AUDIT.md).

<!-- clubhouse:release-audit:start -->
## 2026-10-06 — Whole-app release audit

Reconciled page purpose, design acceptance, contract status, wiring and
verification against the current flagged implementation. Indexed 9 mapped
actions and 14 overlay/control call sites in the [all-page
audit](../../ALL_PAGE_AUDIT.md#p014-recruiting). Approved handoffs and
contract IDs are preserved; runtime gaps stay explicit.
<!-- clubhouse:release-audit:end -->

Newest first. Earlier history is in `docs/clubhouse/PROGRESS.md` (verification
log and decisions).

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
  `.ch-rec-none-match.is-phone`, `.ch-rec-form.is-phone`). No layout, copy or
  behavior changed. `Documents.tsx` gained one comment naming CH-14703, the
  refused-file error pattern (ad642694a); no behavior changed.
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

- **Issue.** (1) The `recruit-documents` bucket took no video and capped a file
  at 25 MB, so the boards' sample film (a `.mov`) could not be attached, and a
  file could only be chosen, not dropped. The upload also went through a server
  action, whose request body is capped far below a film. (2) `createRecruit` had
  no idempotency key: a Retry after a reply lost on the way added the prospect a
  second time.
- **Fix.** (1) MP4, MOV and M4V up to 100 MB can be attached, by the picker (the
  phone's only way) or, on desktop, by dropping one file on the prospect's
  Documents (several files, a folder or an empty file are refused with a
  sentence: CH-14109, CH-14110; a dashed edge shows where it lands: CH-14917).
  The bytes go straight to Storage on a signed URL the server makes for this
  coach and this prospect (prepare, then complete; the path is built on the
  server and the row's size is read back from Storage), with real progress and
  "Keep this page open" (CH-14407), and one upload id per file so a Retry never
  sends or records it twice (CH-14916). A file over its limit (25 MB, film 100
  MB) or of a type the bucket does not take is refused before sending (CH-14105,
  CH-14106), and a file Storage itself turns down is named in the dialog, not
  reported as a failure (CH-14107, CH-14108), which is what happens until the
  migration is applied. (2) An Add carries one request id, kept across Retry and
  a repeated Save; the server inserts under it, and a repeat finds the row its
  first attempt stored, but only once it reads back as this coach's own, on this
  team, with this name (CH-14915).
- **Checked.** Recruiting tests: the existing 61 (updated where they encoded the
  old rules) plus 31 new (`recruiting-upload.test.tsx`), and 25 on the server
  side (`recruit-document-upload.test.ts` 16, `recruiting-create.test.ts` 9):
  117 passed; with the Fairway recruiting tests, the recruiting
  coverage-contract, feature-registry and Storage-wiring tests, 9 files and 192
  tests pass. 80 deliberate breaks of the guarded code (29 on the server, 51 on
  the page), all caught and restored; two survived at first and each got a test
  (the read-back's first name, the log of an over-size file that could not be
  taken out). `typecheck:fast` exit 0; eslint 0 errors; `squawk` 0 issues on the
  migration; the migration's new allowlist evaluated read-only against
  production's current row (17 types, all fourteen old ones kept); axe and the
  native-feel scan on the four new preview states (`upload`, `toolarge`,
  `refusedtype`, `refusedsize`) and on a file dragged over: clean on 13 scans
  (the four states at 1280, 390 and 430, and a file dragged over at 1280), and
  the native-feel scan clean on the four states at 390 and 430.
- **Not checked.** The migration applied and a real film uploaded (the bucket
  takes no video until it is); the project's Storage upload limit (a project
  setting that could not be read: it must be at least 100 MB); `test:rls`; a
  production build; the iPhone (a film from Photos, the picker's offer of it,
  the transfer on cellular).

### Added

- `src/clubhouse/screens/recruiting/upload.ts` (the transfer to Storage:
  prepare, a PUT with progress, complete) and the file drop in `Documents`;
  `prepareRecruitDocumentUpload` and `completeRecruitDocumentUpload` in
  `src/app/golf/actions/recruit-documents.ts`;
  `src/app/golf/actions/recruit-documents-limits.ts` (the types and caps, shared
  by the server and the page); `createRecruit(input, { requestId })`.
- The migration `20260930140000_recruit_documents_film.sql` (written, not
  applied) and its held plan
  (`docs/clubhouse/held/data/recruit-documents-film.md`, listed in this page's
  manifest).
- 9 catalog rows (CH-14107 to CH-14110, CH-14407, CH-14703, CH-14915 to
  CH-14917) and preview states `upload`, `toolarge`, `refusedtype`,
  `refusedsize` (the upload dialog open on a film, refused, and refused by
  Storage).
- Tests: `recruiting-upload.test.tsx`, `recruit-document-upload.test.ts`,
  `recruiting-create.test.ts`.

### Changed

- The upload is no longer a `File` passed to a server action (the current page
  still does that, unchanged).
- Choosing or dropping a video starts the category as Film.
- Checks that encoded the old rules were updated with them: a `.mov` is no
  longer "a type the bucket does not take", the add and upload calls carry a
  request id and an upload id.

### Why

- The owner asked for film uploads "as a file drop" (Q-95 item 6) and for the
  repeat-Add hole found while building this page to be closed. A server action
  cannot carry a film, so the file goes to Storage directly under the coach's
  own session; RLS on the bucket (coach-only, team-scoped) is unchanged and
  already covers any path in the recruit's folder.

### Open

- Apply the migration (and confirm the Storage upload limit is at least 100 MB
  first). Until then a film is refused by Storage and the dialog says so.
- After a lost reply, editing a field and pressing Add again sends a new id, so
  it adds a second prospect (the contents changed, so it is a different Add). A
  Retry, and Save pressed again with the same contents, cannot.
- A file that landed whose row never saved, and whose coach walked away, stays
  in the private bucket with no row.
- Cancel is off while a file is uploading, as it was (a long upload cannot be
  stopped from the dialog).

## 2026-09-30 — Recruiting in Clubhouse (desktop and phone)

```text
Design package: design/handoff/recruiting/ (the owner's canvas "Clubhouse Recruiting", approved 2026-09-30)
PR/commit:      agent/clubhouse (draft PR #2102)
Contract IDs:   140101 to 142001 (53 on this page, all from the catalog; none hand-recorded)
Actions:        9 (ACT-P014-*)
Data impact:    none
Held items:     none
```

- **Issue.** With Clubhouse on, a coach opening Recruiting got the existing
  page, and the owner's approved boards were not built. There was no phone
  design in the app at all.
- **Fix.** A new page at `/golf/dashboard/recruiting` (coach only), built from
  the boards on the existing server actions: the header, the four-stage pipeline
  that filters the list (counts and shares of the whole list), search over name,
  hometown, state, email and notes, three sorts, and the open prospect's panel
  with Email and Call, notes and private documents (upload, open, remove). A
  stage is saved the moment it is picked and goes back, with a Retry, if it does
  not land (CH-14003); delete asks first (CH-14501); every write goes through
  `useAction`, so offline refuses before sending and Retry finishes the whole
  job. The phone is the boards' phone build: a pushed prospect, and the edit
  form, the stage picker and delete as sheets. In the coach's Team section after
  Roster. With the flag off the existing page is unchanged; a player is still
  sent Home.
- **Checked.** Recruiting tests 61 of 61 and all of `src/clubhouse` 1531 of
  1531; 32 deliberate breaks of the guarded code, all caught and restored;
  `typecheck:fast` and eslint clean; axe at 1280, 390 and 430 (40 scans) and the
  native-feel scan clean (VERIFY.md). `clubhouse:check` passes once
  `registry.mjs sync` has minted the 53 IDs.
- **Not checked.** A real coach session, the build, the iPhone (VERIFY.md).

### Added (2026-09-30)

- The page: `src/clubhouse/screens/recruiting/` (`Recruiting`, `RecruitingView`,
  `RecruitingDesktop`, `RecruitingPhone`, `Pipeline`, `Documents`,
  `ProspectForm`, `RecSheet`, `parts`, `writes`, `ctx`, `RecruitingSkeleton`,
  `RecruitingNoTeam`), the loader and pure rules (`data/recruiting.ts`,
  `data/recruiting-shape.ts`), the route (`routes/recruiting.tsx`) and
  `styles/recruiting.css` (`.ch-rec-*`, `.ch-recm-*`).
- 53 catalog states, CH-14001 to CH-14914
  (`docs/clubhouse/catalog/recruiting.md`), each named by a test except the two
  motion rows; the manifest, the six page docs, the phone spec and the screen
  checklist.
- The preview at `/clubhouse-preview/recruiting` with its states (empty,
  nomatch, failed, loading, sparse, noteam, detail, add, edit, delete,
  docsfailed, failwrites, failstage, slow), in `a11y.mjs`.

### Changed (2026-09-30)

- The page and its `loading.tsx` render Clubhouse for a coach with the flag on;
  the sidebar lists Recruiting in Team after Roster, and the route is rebuilt
  for coaches only (`shell/nav.ts`, `shell.test.tsx`).
- `controls.css`: on the phone a menu's rows are 44px tall, and the search's
  Clear button has a 44px hit area (both found by the native-feel scan on this
  page; shared, so every page gains them).
- `memory/features/recruiting.md` and `memory/registry.yml`: the Clubhouse
  surface, code and test.

### Why (2026-09-30)

- The owner approved the boards (Q-87, launch scope: Recruiting is the one
  screen rebuilt beyond the earlier boards). D-64 (motion), D-66 (navigation),
  D-69 (every category answered), D-70 (haptics) and D-71 (page empty state)
  apply.

### Open (2026-09-30)

- Eight questions for the owner about what the boards do not draw (DESIGN.md,
  "Not on the boards"): the upload dialog, removing a document, the no-team
  page, an empty stage, Add on the phone, film, pronouns and a remembered
  filter.
