# Lane audit: Practice plan creation (Ask plan card, full plan, sheet, format, player)

Repo `helmv3` at `062f8a2`, read-only. Scope:
- Live code: `src/clubhouse/screens/coachhelm/plan/*` (PlanCard, PlanIntake, ReadPicture, sheet/, format/, player/), and `src/clubhouse/screens/coachhelm/chat/parts/AnswerCard.tsx` and `ConfirmCard.tsx`.
- Server shape: `src/lib/coachhelm/v3/chat/practice-draft.ts`.
- Route: `src/clubhouse/routes/practice.tsx`.
- Styles: `src/clubhouse/styles/coachhelm-plan.css` and `coachhelm-ask*.css`.
- Previews: coachhelm-practice-plan, -format, -player, -thread.
- Spec: `design-refresh/practice-plan/`: 01-BRIEF, 02-PLAN, 05 state matrix, 06 redlines, S-ASK and S-ASKD screens.

Method:
- Checked at phone 390 (shell ≤820) and desktop 1440, in light and dark.
- Contrast was computed from the `tokens.css` values with a small script.
- No browser was run, so pixel figures are derived from CSS and markup.

## Already known (not re-derived)
- Saving a practice plan fails after a reload or after publish. See `PlanCard.tsx:171` and `PlanTask.tsx:70`.

---

### PP-1 The full plan prints a blank team, UTC times starting "now" and every player as "Player" on live data
- Severity: P0
- Where: Ask → plan card → Open (full plan, the Sheet tab), phone and desktop, light and dark. Staging data, not previews.
- File:
  - `src/clubhouse/screens/coachhelm/plan/PlanCard.tsx:682-700` (sheet fallbacks)
  - `src/lib/coachhelm/v3/chat/practice-draft.ts:72-94` (`planCardMeta`)
- What's wrong:
  - The full plan builds the sheet from `plan.sheet`, using fallbacks:
    - `team: plan.sheet?.team ?? ''`
    - `start: new Date(plan.sheet?.start ?? Date.now())`
    - `zone: plan.sheet?.zone ?? 'UTC'`
    - coaches `[]`
    - an empty name map
  - The live server never sends `sheet`. `planCardMeta` returns only `{when,start,drills,alternatives,sources,evidence}`.
  - The coach therefore sees:
    - no team name or mark
    - today's date
    - block times in UTC counting from the moment of opening
    - "Not set" coaches
    - every player in every group printed as "Player"
  - The previews look right only because their fixtures supply `sheet`.
- Should be: 02-PLAN §Sheet. The sheet header carries the team, the date and time in the team's zone, the coaches, and the grouped player names.
- Fix:
  - Return `sheet: { team, start, zone, coaches, names }` from `planCardMeta`. Read them from the team row, the event's start and timezone, and the roster that the draft already used to group players.
  - Until then, render the sheet's "—" (U+2014) no-data cells instead of fabricated values. Never fall back to `Date.now()` or 'UTC'.
- Confidence: high

### PP-2 The plan card is a card nested inside the answer bubble
- Severity: P1
- Where: Ask thread, plan card (writing, ready and saved states) and the intake card, phone and desktop, light and dark
- File:
  - `src/clubhouse/screens/coachhelm/chat/parts/AnswerCard.tsx:90-91`
  - `src/clubhouse/styles/coachhelm-ask-v2.css:18` (`.msg-a{padding:16px;border-radius:xl;background:var(--ch-bubble-theirs-bg)}`)
- What's wrong:
  - `PlanCard` and `PlanIntake` render inside `.msg-a`, so the bordered plan card sits inside a padded bubble.
  - Card against bubble is 1.00:1 in light (#fffefb on #fffefb) and 1.14:1 in dark (#191e1a on #232925). The card edge reads only as a shadow or hairline inside a second rounded box.
  - The card loses 32px of width (358 → 326 at 390).
  - The design (S-ASK.plan-card__ready) draws the card 358 wide directly on the thread, with no bubble.
- Should be: S-ASK.plan-card. The plan card is a thread-level object, not bubble content (owner pattern: "nested cards").
- Fix: In AnswerCard, when the part is `plan` or `intake`, render it as a sibling of `.msg-a`, not as its child. Alternatively, add `.msg-a.is-bare{padding:0;background:none}` for those parts.
- Confidence: high

### PP-3 The practice plan page has no styles: 0 edge on phone, full-bleed on desktop, no title or Back
- Severity: P1
- Where: `/golf/dashboard/practice/plan/[id]` (reached from "Edit in builder" and from saved plans), phone and desktop
- File:
  - `src/clubhouse/routes/practice.tsx` (`PracticePlanRoute`, `<main className="ch-page">`)
  - No `.ch-page` rule exists anywhere in `src/` (grep returns nothing)
- What's wrong:
  - The page is a bare `<main class="ch-page">` with a lone Print button (`PlanPageActions`) and the sheet.
  - `.ch-canvas` has no side padding, and `.ch-page` is unstyled. So on phone the sheet's text sits on the screen edge (0px, against 16/20), and at 1440 it stretches the full canvas width.
  - There is no page title, no PhoneTop and no Back, so on phone the only way out is the browser back.
- Should be: H5 for the phone page edge (`--ch-page-x-phone`). On desktop, the page max width and title match every other Clubhouse page. 06 "Shared: the green bars": a sub-page has a Back.
- Fix:
  - Wrap the route in the shared page shell used by other routes, with PhoneTop (title "Practice plan", back) on phone and the desktop page header.
  - Give the body `padding-inline: var(--ch-page-x-phone)` and a `max-width` of about 760 for a printable sheet.
  - Alternatively, define `.ch-page` once in the shell CSS and audit every user of it.
- Confidence: high

### PP-4 "Edit in builder" goes to a read-only print page, not a builder
- Severity: P1
- Where: Full plan → overflow / dock "Edit in builder", phone and desktop
- File:
  - `src/clubhouse/screens/coachhelm/plan/PlanCard.tsx` (router push to `/golf/dashboard/practice/plan/${planId}`)
  - `src/clubhouse/routes/practice.tsx`
- What's wrong: The action promises editing. The destination is the unstyled sheet in PP-3, which has only a Print button and no edit controls.
- Should be: 02-PLAN. The label matches the destination.
- Fix: Either route to the real practice builder, or rename the action "Open printable sheet" until a builder exists.
- Confidence: high

### PP-5 Groups D–F draw an invisible disc: a white letter on no colour
- Severity: P1
- Where: Plan sheet → Groups and Rotation, any plan with 4 or more groups, phone and desktop, light and dark
- File:
  - `src/clubhouse/screens/coachhelm/plan/sheet/plan-sheet-model.ts` (`LETTER = 'ABCDEF'`)
  - `src/clubhouse/styles/coachhelm-plan.css:3-5, 263-265` (only `.g-A/.g-B/.g-C` are defined)
- What's wrong:
  - The model allows six groups, but the CSS colours only three.
  - Groups D, E and F render the letter in text-on-accent (#f4eedd) on a transparent background. That is about 1.1:1 on the light card, so it is effectively invisible, and the rotation grid loses its key.
- Should be: H8. Every data glyph is legible. 05 state matrix: up to 6 groups.
- Fix:
  - Add `.g-D/.g-E/.g-F` from the existing categorical tokens, with dark overrides.
  - Alternatively, cap `LETTER` at the number of styled groups and fold extras into "+N".
- Confidence: high

### PP-6 The full plan dock fires Publish / Save draft even when saving is off, and drops the "Comes with the Practice tab" copy
- Severity: P1
- Where: Full plan dock, teams without the Practice tab (`saveOn` false), phone and desktop
- File: `src/clubhouse/screens/coachhelm/plan/PlanCard.tsx:721-735` (dock), plus the `.foot` branch for `!saveOn`
- What's wrong:
  - "Publish…" always renders, and it calls `publish()` → `save()` → `savePracticePlanDraft` even when `saveOn` is false. That makes a network call that cannot succeed.
  - On desktop, "Save draft…" also shows regardless of `saveOn`.
  - With `!saveOn` the foot shows nothing, so the coach gets no explanation.
  - On phone in the draft state there is only Publish, though the spec draws Save draft and Publish.
- Should be: 01-BRIEF and 02-PLAN:66. Without the Practice tab the actions are replaced by "Comes with the Practice tab".
- Fix:
  - Gate both dock buttons on `saveOn`.
  - In the `!saveOn` branch, render the spec line with `InlineNotice`.
  - On phone, render both buttons (`Button` secondary "Save draft", primary "Publish") in the draft state.
- Confidence: high

### PP-7 On desktop a failed save shows nothing, and the Saved receipt with Undo is hidden
- Severity: P1
- Where: Ask on desktop (≥821) with the plan pane open, save / publish / Undo
- File:
  - `src/clubhouse/screens/coachhelm/plan/PlanCard.tsx` (receipt and error render in `.foot`)
  - `src/clubhouse/styles/coachhelm-plan.css:1454` (`.ch-cpv.is-desk .art > :not(.art-h){display:none}`)
- What's wrong:
  - On desktop the card collapses to its header, which hides `.foot`. The "Saved to …" receipt, its Undo, and any save error therefore never appear.
  - No toast is raised either, so a failed save is silent.
- Should be: S-ASK.toast and S-ASKD.pane. Save results show in the pane dock, or as the shared toast with Undo.
- Fix: Render the receipt and errors in the desktop `.fdock`, or raise the shared `ch-toast` with an Undo action on desktop. Errors use `InlineNotice tone="error"`.
- Confidence: high

### PP-8 The full plan title has no ellipsis and runs under the absolute "Ask" Back
- Severity: P1
- Where: Full plan bar, long plan titles, phone (390) and the desktop pane (452)
- File:
  - `src/clubhouse/screens/coachhelm/plan/PlanCard.tsx:685-689` (`.fbar` `<b>{plan.title}</b>`)
  - `.ch-cpv-full .fbar` in `coachhelm-plan.css`
- What's wrong:
  - Back is absolutely positioned at the left, and the centred title has no `max-width`, `overflow` or `text-overflow`.
  - A live title such as "Short game and pressure putting before Hargrove" (48 characters at type-17) is about 380px. It wraps to two lines or overlaps the Back label.
- Should be: 06:304. The bar title is a single line with ellipsis, clear of the Back hit area.
- Fix: Use `.fbar b{max-width:calc(100% - 2*88px);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}`, or reuse PhoneTop's title slot, which already does this.
- Confidence: high

### PP-9 The full plan overlay ignores safe areas: the bar sits under the notch and the dock under the home bar
- Severity: P1
- Where: Full plan, phone (notched devices, `viewportFit: cover` at `src/app/layout.tsx:105`), light and dark
- File: `src/clubhouse/styles/coachhelm-plan.css`:
  - `.ch-cpv-full{position:fixed;inset:0}`
  - `.fbar{min-height:56px}` with no top inset
  - `.fdock{padding:12px 16px}`
- What's wrong:
  - The overlay covers the whole viewport, but neither the bar nor the dock adds `env(safe-area-inset-*)`.
  - On an iPhone, the Back and title sit under the status bar (about 47px), and the Publish button sits under the home indicator (34px).
- Should be: 06 dock redline, padding `10 16 28` (that is, safe bottom). H10.
- Fix:
  - `.fbar{padding-top:env(safe-area-inset-top)}`
  - `.fdock{padding:10px 16px max(12px, env(safe-area-inset-bottom))}`
- Confidence: high

### PP-10 Drill fan cards overflow the card and collide with "+N more"
- Severity: P1
- Where: Plan card read picture `dr` (drills), phone 390, live drill titles
- File:
  - `src/clubhouse/screens/coachhelm/plan/ReadPicture.tsx` (`dr`: cards `translateX((i-1)*84px) rotate((i-1)*5deg)`, 96 wide, in an 88-tall `.fan`; `.more` at `right:0;bottom:0`)
  - `coachhelm-plan.css` (`.ch-cpv-vz .fan`)
- What's wrong:
  - Three 96px cards spread ±84px. That is about 264px plus rotation overhang, inside about 268px of inner width (326 in a bubble, see PP-2).
  - The third card overlaps the absolutely placed "+N more".
  - Live `d.title` wraps to 3–4 lines, which makes cards taller than the fixed 88px fan, so they spill over the caption below.
- Should be: 05. Picture labels ellipsize at one line. Owner pattern: fixed-coordinate labels and data-driven sizes.
- Fix:
  - Derive the spread from the container width (`--fan-step: min(84px, (100cqi - 96px)/2)` with `container-type:inline-size`).
  - Clamp titles with `-webkit-line-clamp:2`.
  - Put "+N more" in normal flow below the fan.
- Confidence: medium (no live render; geometry from CSS)

### PP-11 Evidence rows print raw numbers with a hyphen-minus and an unclamped bar width
- Severity: P1
- Where: Plan card → Evidence sheet, live data, phone and desktop
- File:
  - `src/lib/coachhelm/v3/chat/practice-draft.ts:90` (`String(m.value)`)
  - `src/clubhouse/screens/coachhelm/plan/PlanCard.tsx` evidence sheet (`.tr .m` `width: ${r.pct}%`)
- What's wrong:
  - Values arrive as `String(m.value)`, for example "-1.4321" or "0.38", with no formatting, precision or unit, and with a hyphen-minus.
  - The bar width is the raw `pct` with no clamp, so a value over 100 or under 0 overflows the track or goes negative.
- Should be: H14. Use U+2212 for negatives and "—" for no data, with house number formatting.
- Fix:
  - Format with the shared stats formatter (the one Stats uses for strokes-gained) on the server, or in the sheet before render.
  - Use `width: ${Math.max(0, Math.min(100, r.pct))}%`.
- Confidence: high

### PP-12 Block sheet Cancel keeps the edits
- Severity: P1
- Where: Full plan → tap a block → FormSheet (minutes and reps steppers), phone and desktop
- File: `src/clubhouse/screens/coachhelm/plan/PlanCard.tsx` (block FormSheet, the steppers call `setBlock` live)
- What's wrong: The steppers write straight into plan state, so Cancel and Done both keep the change. A coach who cancels still sees the new times, and the total duration has shifted.
- Should be: Shared FormSheet contract. Cancel discards and Done commits.
- Fix: Hold a local draft of the block in the sheet, and call `setBlock(draft)` only in `onDone`.
- Confidence: high

### PP-13 The desktop pane opens only after writing finishes; meanwhile the card is a bare header
- Severity: P1
- Where: Ask on desktop, while a plan is being written
- File:
  - `src/clubhouse/screens/coachhelm/plan/PlanCard.tsx:228-234` (pane opens on ready)
  - "Open" is hidden while writing
  - `coachhelm-plan.css:1454`
- What's wrong:
  - On desktop the in-card body is hidden (`.is-desk .art > :not(.art-h)`), and the pane waits for `ready`.
  - During writing (10–40s) the coach sees only a title row: no progress, no streamed blocks, no Open.
- Should be: S-ASKD.pane. The pane opens "when the plan starts writing" and streams in.
- Fix: Open the pane on the first `writing` state and render the streaming blocks there, or show the card body on desktop until the pane opens.
- Confidence: high

### PP-14 At 821–1100 the open pane squeezes the thread to about 140–400px
- Severity: P1
- Where: Ask on desktop narrow (821–1100) with the plan pane open, light and dark
- File: `src/clubhouse/styles/coachhelm-ask.css:1398-1408` (`.ch-cpv-full` 452 wide; `.ch-ask-main{margin-right:452px}`)
- What's wrong:
  - A fixed 452px pane plus the shell's left rail leaves the thread column at about 137px at 821 and about 400px at 1100.
  - The answers, composer and the plan card header wrap word by word.
- Should be: S-ASKD. Below a usable thread width, the pane overlays (sheet behaviour) instead of pushing.
- Fix: Add `@container`/`@media (max-width:1100px)` so `.ch-cpv-full` becomes an overlay with a scrim and no `margin-right`, or use `width: min(452px, 45vw)`.
- Confidence: medium

### PP-15 PlanFormat Undo ignores failure and leaves the undone format's name as "Current format"
- Severity: P1
- Where: Practice → Format (coachhelm-practice-format), after an upload → Undo
- File: `src/clubhouse/screens/coachhelm/plan/format/PlanFormat.tsx` (`undoPlanFormat(...).then(()=>setView({k:'empty'}))`)
- What's wrong:
  - There is no `catch`, so a failed undo silently shows the empty state while the server keeps the format.
  - `name` is not reset, so the next render shows the undone file's name as the current format.
- Should be: 05 state matrix. Undo has success and error states.
- Fix: Use `.then(()=>{setName(prev); setView({k:'empty'})}).catch(()=>setView({k:'error'}))`, and show `InlineNotice` on error.
- Confidence: high

### PP-16 PlanFormat draws its own green bar (a local copy of the shell bar)
- Severity: P1
- Where: Practice → Format, phone
- File:
  - `src/clubhouse/screens/coachhelm/plan/format/PlanFormat.tsx` (`.fbar.is-page` with `margin:-16px -16px 0`, Back → `/golf/dashboard/calendar` labelled "Practice")
  - `src/clubhouse/shell/phone-chrome.tsx` (PhoneTop)
- What's wrong:
  - This is a hand-built copy of the green bar. It uses negative margins to bleed, has no safe-area top, and has a Back that goes to Calendar while it reads "Practice".
  - It also doesn't move to 20px at ≥414, because `.ch-cpv-fmt` is fixed at 16 (see PP-25).
- Should be: 06 "Shared: the green bars". Every phone sub-page uses PhoneTop. Owner pattern: local copies of controls.
- Fix: Replace it with `<PhoneTop title="Practice format" back={{href: practiceHref, label:'Practice'}}/>` and drop the negative margins.
- Confidence: high

### PP-17 Dark-mode drill-kind dots fall below 3:1
- Severity: P2
- Where: Read pictures and the sheet, kind key (skill, pressure, random), dark
- File: `coachhelm-plan.css` (`.ch-cpv-vz .k-skill/.k-random/.k-pressure`, hard-coded hex with no dark override)
- What's wrong: On the dark card #191e1a the contrast is:
  - skill #3d6787: 2.81:1
  - pressure #1f6b45: 2.61:1
  - random: 3.37:1

  The first two fail the 3:1 non-text minimum.
- Should be: H9. Non-text graphics are at least 3:1 in both themes.
- Fix: Move the kinds to tokens with dark values, such as lighter tints (skill #7fa9c9, pressure #6bbb8c = `--ch-green-600` dark).
- Confidence: high (computed)

### PP-18 Read-picture labels wrap instead of ellipsizing; cls axis labels collide and hang off the edge
- Severity: P2
- Where: Plan card read pictures `sg`, `pd` and `cls`, phone
- File: `src/clubhouse/screens/coachhelm/plan/ReadPicture.tsx`:
  - `pd` labels are live `metric_label` in a fixed 64px column
  - `cls` boxes use `left`/`width` percentages with no clamp
  - axis labels are absolute at `a.at%` with `translateX(-50%)` and nowrap
- What's wrong:
  - `sg` and `pd` labels wrap to 2–3 lines in the 64px column and push rows apart.
  - In `cls`, the tag text gets clipped inside `.bx`, and the end axis labels overhang the card by half their width.
- Should be: 05. Labels ellipsize at one line. Owner pattern: fixed-coordinate labels.
- Fix:
  - Single-line ellipsis on the label columns.
  - Clamp the axis label position to `[labelW/2, 100% - labelW/2]`, or anchor the end labels left and right.
- Confidence: medium

### PP-19 The cal picture uses a fixed 5-column grid whatever the number of days
- Severity: P2
- Where: Read picture `cal` (previews only, not produced live)
- File: `ReadPicture.tsx` and `coachhelm-plan.css` (`.wk{grid-template-columns:1.6fr 1fr .8fr .8fr 2fr}`)
- What's wrong: With 3 or 7 days the cells misalign or wrap into a second row.
- Should be: The grid is data-driven.
- Fix: Use `grid-template-columns: repeat(var(--n), 1fr)`, with `--n` set from `days.length`.
- Confidence: high

### PP-20 Rotation grid and meta row don't adapt on phone
- Severity: P2
- Where: Plan sheet, phone 390 and under 340
- File: `src/clubhouse/screens/coachhelm/plan/sheet/PracticePlanSheet.tsx` and `coachhelm-plan.css`:
  - `.pp-rot` uses `repeat(n,40px)` with no cap and no container query
  - `.pp-meta` is 3 columns
  - `.pp-groups` is 3 columns
- What's wrong:
  - 6 stations × 40 plus the label column overflows 358.
  - The 3-column meta (date, time, coaches) truncates coach names on phone.
  - A 4th group wraps onto its own row.
- Should be: 05. "Rotation cells tighten under 340pt". Owner pattern: multi-column on phone.
- Fix:
  - Use `repeat(n, minmax(28px, 40px))` with `container-type:inline-size`.
  - `.pp-meta` becomes 1 column, and `.pp-groups` becomes 2 columns, on phone.
- Confidence: medium

### PP-21 11px type in the sheet and tags on phone
- Severity: P2
- Where: Plan sheet group detail and tag row, and the plan date, phone
- File: `coachhelm-plan.css`:
  - `.ch-cp-sheet .gd` defined twice: line 6 is type-11-strong, line 29 is type-11 (w400)
  - `.tagr` is type-11
  - `.pp-date`
- What's wrong:
  - The second rule silently overrides the first, and both are 11px on phone.
  - The `data-density` attribute the sheet sets has no CSS, so nothing scales up.
- Should be: H12. Nothing below 12px on phone.
- Fix: Use one `.gd` rule at `--ch-type-12-strong`. Set `.tagr` and `.pp-date` to type-12. Remove the dead `data-density`, or style it.
- Confidence: high

### PP-22 Tap targets under 44 in the plan card and sheets
- Severity: P2
- Where: Plan card refine chips, intake chips, the ask-in send button, source button, folder save row; phone
- File: `coachhelm-plan.css`:
  - `.ch-cpv-sheet .ask-in button` 28×28 with no hit slop
  - `.refine button{min-height:36px}`
  - `.srcb::after` (about 39)
  - `.saverow` (about 37)
  - `PlanIntake.tsx` `.qo` (36)
- What's wrong: Five interactive controls fall short of 44 on touch.
- Should be: H10.
- Fix: Add the shared `::before{inset:-8px}` hit area (the pattern `.ch-msv-new` uses), or set `min-height:44px`. Keep the visual size.
- Confidence: high

### PP-23 "Saving…" sweep and the writing caret are static; the scan line has no CSS
- Severity: P2
- Where: Plan card writing and saving states, and PlanFormat reading, light and dark
- File: `coachhelm-plan.css`:
  - `.sw2` and `.caret` have no animation; the only keyframes in the file are the old `ch-cp-seg`
  - `.scanl` (used by PlanFormat) is not defined
- What's wrong:
  - The progress affordances in the spec are drawn but frozen, so the card looks stuck while writing or saving.
  - The format "reading" state shows no scan at all.
- Should be: H2 and spec 06 motion rows: the sweep and caret, gated by reduced motion.
- Fix: Add `@keyframes` using `--ch-dur-*` / `--ch-ease-*` tokens under `@media (prefers-reduced-motion: no-preference)`, and define `.scanl`.
- Confidence: high

### PP-24 Folder names lack ellipsis in the save rows and the folder strip
- Severity: P2
- Where: Save to folder sheet, saved receipt, and the documents strip, phone
- File: `coachhelm-plan.css` (`.fr .n`, `.saverow b`, `.dstrip .fold b` in a 3-column strip)
- What's wrong: Long folder names (up to 60 characters) wrap and push the row height, or overflow the 3-column strip.
- Should be: Spec. Folder names ellipsize at one line (60 characters).
- Fix: Use `min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap` on those spans.
- Confidence: high

### PP-25 Format page side padding stays 16 at ≥414
- Severity: P2
- Where: Practice → Format, phone 414–430
- File: `coachhelm-plan.css` (`.ch-cpv-fmt{padding:16px}`)
- What's wrong: The page edge doesn't follow `--ch-page-x-phone` (20 at ≥414), so it sits 4px off every other page.
- Should be: H5.
- Fix: `padding-inline: var(--ch-page-x-phone)`.
- Confidence: high

### PP-26 The intake's folded state is never drawn
- Severity: P2
- Where: Ask thread after the intake questions are answered
- File: `src/clubhouse/screens/coachhelm/plan/PlanIntake.tsx` (`if (done) return null`)
- What's wrong: The intake disappears entirely, so the thread loses the record of what the coach chose (length, focus, groups).
- Should be: S-ASK.intake-folded. A one-line summary row remains.
- Fix: When `done`, render the folded summary row from the chosen answers.
- Confidence: high

### PP-27 Refine chips are hard-coded and team-specific
- Severity: P2
- Where: Plan card refine row, every plan
- File: `PlanCard.tsx` (`REFINE = ['Make it 2 hours','More pressure','Lighter before Hargrove']`)
- What's wrong: "Lighter before Hargrove" shows for every team and every plan, whatever the schedule.
- Should be: The chips derive from the plan (next event, current length).
- Fix: Build the chips from `plan.when` and the next event, or drop the event-specific chip when there is no matching event.
- Confidence: high

### PP-28 Publish coins cap at 9 with no "+N"
- Severity: P2
- Where: Publish confirm card (ConfirmCard), roster over 9
- File:
  - `src/lib/coachhelm/v3/chat/practice-draft.ts:162`
  - `src/clubhouse/screens/coachhelm/chat/parts/ConfirmCard.tsx:113-170`
- What's wrong: The coin row shows up to 9 avatars and silently drops the rest.
- Should be: Spec. Show 6 coins plus "+N".
- Fix: Slice to 6 and render a `+{n-6}` coin with the shared Avatar overflow style.
- Confidence: high

### PP-29 Publish sample preview shows an empty green square for the app icon
- Severity: P2
- Where: ConfirmCard → sample notification preview, light and dark
- File: `ConfirmCard.tsx` (`.ch-cpv-sample .app`)
- What's wrong: The icon box has a background and no glyph or mark, so it reads as a broken image.
- Should be: The sample uses the club mark.
- Fix: Render the shared app mark (or Avatar of the team) inside `.app`.
- Confidence: high

### PP-30 The player practice page has no empty state and no desktop width
- Severity: P2
- Where: coachhelm-practice-player, a player with no stops; desktop 1440
- File: `src/clubhouse/screens/coachhelm/plan/player/PlayerPractice.tsx`
- What's wrong:
  - An empty `stops` array renders an empty card frame.
  - On desktop the content stretches the full canvas width.
- Should be: 05 state matrix (empty) and desktop page max width.
- Fix: Use `EmptyState` ("No practice plan yet") when `stops.length===0`, and a page `max-width` like the other player pages.
- Confidence: high

### PP-31 The three upload options do the same thing; "Take a photo" doesn't open the camera
- Severity: P2
- Where: Practice → Format → Upload choices, phone
- File: `PlanFormat.tsx` (all three options call `input.click()`)
- What's wrong: "Take a photo", "Choose a file" and the third option open the same file picker. "Take a photo" has no `capture`.
- Should be: The options differ.
- Fix: Use separate inputs: `accept="image/*" capture="environment"` for the photo, and `accept=".pdf,image/*"` for files. Otherwise collapse to one option.
- Confidence: high

### PP-32 The full plan overlay has no focus trap, no Esc, and no scroll containment
- Severity: P2
- Where: Full plan overlay, phone and desktop (keyboard)
- File: `coachhelm-plan.css` (`.ch-cpv-full`, `.fbody` with no `overscroll-behavior`) and `PlanCard.tsx`
- What's wrong:
  - Tab leaves the overlay into the hidden thread, and Esc does nothing.
  - On phone, scrolling to the end of `.fbody` scrolls the thread underneath.
- Should be: Shared sheet behaviour (FormSheet): trap, Esc, and scroll lock.
- Fix: Add `overscroll-behavior:contain` on `.fbody`, plus the shared modal focus trap and Esc handler (as FormSheet uses).
- Confidence: medium

### PP-33 The folder-strip "flight" animation can't run on desktop
- Severity: P2
- Where: Save to folder, desktop
- File: `PlanCard.tsx` (`stripRef`, inside the hidden `.foot`)
- What's wrong: The strip the save flies to is inside the element that desktop hides (PP-7), so the animation has no target, and the receipt never shows.
- Should be: The desktop pane has a save confirmation.
- Fix: Covered by the PP-7 fix. Anchor the flight to the dock on desktop.
- Confidence: medium

---

## Summary (worst first)
1. PP-1 (P0): live full plans show no team, UTC times from "now", "Not set" coaches and "Player" for everyone, because the server never sends `sheet`.
2. PP-2 and PP-3 (P1): the plan card is nested inside the answer bubble (1.00:1 card on bubble). The `/practice/plan/[id]` page is unstyled: 0 edge on phone, full-bleed on desktop, no title or Back.
3. PP-5 and PP-6 (P1): groups D–F are invisible (no colour). The dock fires Publish / Save with saving off, and the "Comes with the Practice tab" copy is missing.
4. PP-7, PP-13 and PP-14 (P1): on desktop, save errors and receipts are hidden, the pane opens only after writing, and at 821–1100 the pane crushes the thread.
5. PP-8 to PP-12 (P1): the title collides with Back, there are no safe-area insets on the overlay, the drill fan overflows, evidence values are raw with a hyphen-minus (H14), and block Cancel keeps edits.
