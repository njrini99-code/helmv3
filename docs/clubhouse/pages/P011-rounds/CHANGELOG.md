# P011 — Rounds: changelog

## 2026-10-19 — Type, shape and touch in the page stylesheet

```text
Design package: none (complete-and-elevate plan, lane W4b: type, shape and touch in the page stylesheets)
PR/commit:      lane W4b commits on agent/clubhouse-complete
Contract IDs:   none changed
Actions:        none
Data impact:    none
Held items:     none
```

### Changed (rounds.css, rounds-setup.css, rounds-track.css, rounds-recover.css)

- The season figure, the review's hero and figure values, the setup and shot screen's headline numerals, the unfinished-round line and the share card's labels follow the iPhone's text size. The scorecards (review nine, shot card, share card table), the season ribbon, the score strip cells and the zone drawings' SVG text keep their fixed sizes.
- Radii on the 5, 7, 10, 14, 20 scale (pills, circles and bars stay; sheet corners of 24 to 28px are left).
- The library's Continue link and Discard key reach 44px on the phone; the par keys, quick distances and setup segments reach 44px down the page; the review nine, season, spark, figure and shot-count numerals use tabular numerals (the font shorthand had dropped them).

### Why

- Pixel font sizes did not follow Dynamic Type, radii were off the 5/7/10/14/20 scale, some phone controls were under 44px, some clickable things did not answer a pointer, and the font shorthand had dropped tabular figures from figures that sit in columns.

### Verification

- WebKit (headless) at 390 and 1280, light and dark: Rounds, a round, sign-up, sign-in, Home, a CoachHelm thread and Team Hub looked at after the change; the phone with `--ch-type-scale: 1.4` scales text with no sideways overflow (scrollWidth equals clientWidth). Touch reach was measured with `elementFromPoint` 21px beyond each short control; hover was measured by comparing computed styles under the pointer; figures were measured by computed `font-variant-numeric`. `npm run clubhouse:css`: its two findings are existing shadows in `auth.css` (lines 1809 and 1872).

## 2026-10-19 — In-flight actions are busy; one spinner; round setup choices use the shared segmented control

```text
Design package: none (complete-and-elevate plan, lane W4a: controls behave one way everywhere)
PR/commit:      lane W4a commits on agent/clubhouse-complete
Contract IDs:   none changed
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- Restore round, Discard, Change round type, Reload and the conflict banner's Discard are busy while they run instead of disabled.
- The posting, saving and sync rings are the shared `Spinner` (one duration, still under reduced motion and Animations off).
- Round type, Holes (setup and Add a course) and Which nine are the shared `Segmented`, with the unavailable 18-hole option skipped by the arrow keys. `.ch-rsu-seg` in `rounds-setup.css` is no longer used.
- Previous and next hole, the discard buttons and the course view's controls show their name on hover and focus. The hole strip and the review scorecard fade a clipped edge.

### Why

- The same control behaved differently from page to page: a save greyed its button out at 42%, five places drew their own spinner, icon-only buttons had no words on desktop and a scroller gave no sign there was more. They now come from the shared owners (`Button` busy, `Spinner`, `Tooltip`, `use-hscroll`).

### Verification

- Targeted tests for this page and `ui/__tests__/controls-consistency.test.tsx`; the busy ring was captured at 390 and 1280, light and dark, on `/clubhouse-preview/classes` (the same Button owner draws it here); tooltips and edge fades on the messages, roster and CoachHelm previews. Pages other than the one captured were checked in source only.

## 2026-10-19 — The library reaches the card; the round's labels are callable from the server

```text
Design package: none (complete-and-elevate plan, lead wiring for lane L4)
PR/commit:      agent/clubhouse-complete
Contract IDs:   CH-11920 (link target)
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- Right-click (or Shift+F10) on a posted round in the library offers Open round and Scorecard; Scorecard opens the review
  at the card (#ch-rcard). Shift+right-click keeps the browser's own menu, so open-in-new-tab is still there. Both note
  the round as opened from the library, so the review's Back is a step back (a link item in ui/Menu now runs its
  onSelect as it opens).
- dateOf and TYPE_LABEL moved to rounds/labels.ts (a plain module); parts.tsx re-exports them. The card's model imported
  them from a 'use client' module, which the client-boundary test refuses.

## 2026-10-19 — The round card: a scorecard to keep, share and print

```text
Design package: none (complete-and-elevate plan, lane L4); no owner board, phone draft in docs/clubhouse/phone/round-card.md
PR/commit:      uncommitted (agent/clubhouse-complete)
Contract IDs:   CH-11920 to CH-11924
Actions:        none (no server action, endpoint or save path touched)
Data impact:    none (the card is drawn from the review the page already loaded)
Held items:     none
```

### Changed

- A round's review has a scorecard under the hero: Out, In and Total, par, the score in scorecard notation (circle birdie,
  double circle eagle or better, square bogey, double square double bogey or worse; red for under par only), putts,
  fairways and greens where tracked, the course, tees, rating and slope, the date, holes played, and the strokes gained by
  leg. Phone: two bands of nine. Desktop: one wide table. A nine-hole round has one band; a round with holes missing says
  "Thru 14 of 18 holes" and shows no short subtotal. No card for a round posted as a total.
- Arriving from Post round (`?just=submitted`, added to the engine's own navigation and its link in `RoundRuntime`), the
  card settles in once on the smooth spring, with one quiet line from figures the page shows: "Best on hole 5, a birdie.
  35 putts, 1.9 a hole." Reduced motion: no movement. No haptic (the submit path fired it). A reload does not replay it.
- Share card: a sheet with the picture, drawn on the device with the Canvas 2D API at 1200px wide after the fonts load,
  and two switches (Strokes gained; Putts, fairways and greens) that redraw it. Share on a device that can share files,
  Save image otherwise, named for the course, date and score. Nothing leaves the device. The picture names the player
  before the date and has a quiet foot inside the frame: GolfHelm in the brand green and the team name when known.
- Print (desktop): the page prints only the card, on one page, ledger rules kept, in ink on white in either theme.

### Why

- The round is the product's heart and its last screen was a report. A player and a coach want the card itself, the way
  it would come off a scorecard, to keep.

### Verification

- `screens/rounds/card/__tests__/` (card-model, share-card, draw-card, round-card): mark mapping, 9, 18 and partial rounds,
  Out and In against the page's own figures, the share and download branches, the 1200px canvas. The existing review and
  round-entry tests pass with the new card (two assertions scoped to the review's own scorecard; the engine's post
  navigation now carries `?just=submitted`).
- WebKit captures (headless, 390 and 1280, light and dark), the exported PNG, print emulation, and a Chromium PDF (one page).
  Not tried: a physical iPhone, the native share sheet, a physical printer.

## 2026-10-19 — Right-click on an unfinished round

```text
Design package: none (complete-and-elevate plan, lane L1, desktop command layer)
PR/commit:      uncommitted (agent/clubhouse-complete)
Contract IDs:   none
Actions:        none
Data impact:    none (no new read: the palette lists what the page already loaded)
Held items:     none
```

### Changed

- Right-click (or Shift F10) on the round in progress, or a row under "more unfinished rounds", offers Continue (Post round when
  every hole is scored) and Discard round, the same links and the same confirmation as the row's own buttons. A posted round has
  one action, a link, and keeps the browser's menu (open in a new tab). Desktop only.

### Why

- Discarding was a small bin icon; the menu is the keyboard-reachable form of it.

### Verification

- `screens/rounds/__tests__/rounds-context-menu.test.tsx`.

## 2026-10-18 — Pickers and controls: round date, radio groups, saving

```text
Design package: none (complete-and-elevate plan, lane L2)
PR/commit:      uncommitted (agent/clubhouse-complete)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed (2026-10-18, L2 pickers and controls)

- The browser's own date and time inputs are gone. The new round's Date (no day after today) shows the value as the app writes it ("Thu 15 Oct 2026", "3:30 PM") and opens a month (dates) or a list by the quarter hour (times): a popover under the field on desktop, a bottom sheet on the phone. On desktop the field stays typable ("10/15", "oct 15", "tomorrow", "fri"; "3p", "1530") and says "Try 10/15, oct 15 or tomorrow." when it can't read what was typed. Today carries a dot, the chosen day is the segmented control's lit chip, days outside the range are off, and arrows, PageUp and PageDown, Home and End and Enter work in the grid. The saved value is the same `yyyy-mm-dd` / `HH:mm` string as before.
- Round type, Holes, Qualifier, Which nine, a hole's par, tee colour, penalty choices and the miss-direction grid is one tab stop with the arrow keys, Home and End moving and choosing, as a native radio group does (`ui/use-roving.ts`); a disabled option is skipped.

## 2026-10-18 — Wave 10: one Start a round in the library

```text
Design package: none (wave-10 first-run review)
PR/commit:      uncommitted (polish review, agent/fairway-fixes-polish)
Contract IDs:   CH-11302 CH-11304
Actions:        none
Data impact:    none
Held items:     none
```

### Changed (2026-10-18, wave-10 library)

- The head's New round shows only with a round in progress, or when the check
  for one failed: otherwise the idle card's Start a round is the one primary
  (it was two for one action). A full library with nothing in progress loses
  the head button too.
- CH-11302's headline keeps "18‑hole" together (a non-breaking hyphen).

## 2026-10-18 — Wave 10: the setup scorecard before a course

```text
Design package: none (wave-10 first-run review, decision D)
PR/commit:      uncommitted (polish review, agent/fairway-fixes-polish)
Contract IDs:   CH-11309
Actions:        none
Data impact:    none
Held items:     none
```

### Changed (2026-10-18, wave-10 setup)

- Before a course is picked (CH-11309) the placeholder keeps the hole numbers
  and drops the grey bars beside them, which read as loading: a row of
  numbers on desktop, the ledger's numbered rows on the phone.

## 2026-10-18 — Wave 9: on the course

```text
Design package: none (wave-9 on-course review, rows 1-8, 9 part, 10-16; E, A)
PR/commit:      uncommitted (polish review, agent/fairway-fixes-polish)
Contract IDs:   CH-11910 (copy), CH-11502, CH-11507, CH-11509, CH-11901
Actions:        none
Data impact:    none
Held items:     owner decisions B, C, D, F not taken
```

### Changed (2026-10-18, wave-9 on course)

- Undo and Discard confirms: the button labels keep their own ink (the
  question's grey no longer reaches them), and Keep it and the danger button
  sit together on their own row under the question, at the right, at 36px.
- Save line (CH-11901): one line with its icon beside the words; when the
  readout leaves no room it drops under it at the right.
- A missed putt's leave has its own quick picks: 2, 3, 4, 6, 8, 12 ft
  (0.5 to 4 m). Its "What happened" chips are 44px tall.
- Every hole in (CH-11910): "All holes are in. Review the round, then post
  it." with Review and post, and the same action is the shot review's footer
  button, in the thumb zone. The preview can finish again after Back to
  hole 18.
- The shot screen's distances keep number and unit together (no-break
  space). The posted overlay keeps the coach's name on one line.
- Scorecard sheet subtitle says where the player stands: "thru 3 · +1".
- Setup dock: each "·" travels with the segment after it, so a wrapped line
  starts "· Par 72".
- Short phones (height 700px or less): a smaller hole numeral, readout and
  drawn hole, so a putt's Putt result is on the first screen at 375 x 667.
  On a phone the page's scroll padding clears the action bar, so Tap in or a
  focused box brought into view lands above it.
- The screen stays on while the shot screen is up (Screen Wake Lock, asked
  again when the page comes back; nothing happens where it isn't supported).

### Changed (2026-10-18, wave-9 round review)

- Fairway and Green in regulation marks: each row is its own size container,
  and where eighteen 22px marks in a line would touch (any phone), the holes
  fold into nines, Out above In, so marks and hole numbers never collide. A
  desktop row keeps one line.
- Dark scorecard: a hit FIR or GIR dot is the lighter green, 5.2:1 on its
  cell (the deep fill was 2.5:1). Scoped to the review; the token is unchanged.
- The hole's step header reads "Hole 2 · Par 5", as its title does.
- Where the strokes were lost: each row names the score ("Bogey", "Double
  bogey") instead of repeating the shot count beside it.
- In words: the player reads "what you wrote"; a coach "what the player
  wrote".
- The round: "... falls when strokes go back. A lower score is better." The
  chart's orientation is unchanged (owner decision C).

## 2026-10-18 — Wave 8: premium details

```text
Design package: none (wave-7 premium review, items 2, 5, 12)
PR/commit:      uncommitted (polish review, agent/fairway-fixes-polish)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed (2026-10-18, wave-7 premium)

- Round review charts: each picture's stage or plate is its own size
  container (`chrz`), so its words are sized by the drawing's width, not the
  review's. At 1280 the running score and shot trail read at about 11.5px
  (were 7 to 8.5px); 1024 and 1440 hold about 11.5 to 12.5px; the phone keeps
  31 units. The trail's dot numerals keep their size.
- Rounds ribbon (desktop): ticks, values and dates at 13.75 to 14 units, about
  11px at 1280 (were 9.7 to 10px); the average chip's words at 13.
- Season hero figure (phone 48px, desktop 58px): tracking eased to −0.035em
  and the decimal point in its own span (`withPointSpan`), so it no longer
  touches the 3.
- Setup course picker: a course photo that doesn't load falls back to the
  quiet flag tile.

## 2026-10-18 — Wave 5: the round flow, setup to posted

```text
Design package: none (wave-5 first-use and round-flow review)
PR/commit:      uncommitted (polish review, agent/fairway-fixes-polish)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed (2026-10-18, round flow)

- Track: Undo's "Undo shot 2?" scrolls itself into view clear of the action
  bar (CH-11502). A birdie or bogey in the holed-out hero keeps its own ink
  on its pale mark. The strip's "Thru 3 +1" stays pinned at the right edge
  while the holes scroll. The scorecard (CH-11509, CH-11508) has even hole
  columns, with its label and Tot columns pinned and a fade at Tot on a
  phone. The picked quick distance is green, as on desktop.
- Track: after a hole saves and play moves on, the new hole says "Hole 4
  saved · Birdie" in place of "No shots yet" for four seconds or until its
  first shot; a move the player makes on the strip says nothing.
- One shot-line form everywhere: "→ fairway · 140 yds left" (shot log, hole
  review, round review). The slope choice reads "Downhill".
- Round complete: Post round (was Submit round), "Posting round",
  "The round didn’t post", and "Your 74 (+2) at Finley GC is posted."
  The same word everywhere a finished round is sent: the library card
  ("Ready to post", Post round; Post in the more-unfinished list), the
  qualifier round sheet (CH-11518) and Recover's finished round.
- Recovery (CH-11512): "Pick up where you left off" / "Your shots are on
  this device from when the app closed."
- Setup: "Front 9" never wraps; a tee with no yardage shows "—" without
  "yds"; the picker's head says "Add" on a phone (still named "Add a
  course"); 18 holes off on a 9-hole tee says why; the dock names the nine
  ("Back nine"). Setup is kept for the tab (keyed by page, team and
  player) so Back and return keeps the course, tees and pars; cleared once
  a round starts or posts.
- Review: the phone charts' words are about 12px (31 units), every other
  hole number and score tick gives way, the trail's labels never overprint
  and the putts line ends inside the stage (its dots drop their numbers on
  a phone), and "Hole 2: +1" no longer touches the score labels. Note:
  "Pick a hole to read it and see its shots."

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

- "Discarding…" (CH-11501, library and Recover) and "Restoring…"
  on Recover; "Trying again…" on the library's Try again (CH-11213).

## 2026-10-18 — Wave 4: Dynamic Type for the phone's text

```text
Design package: none (wave-4 Dynamic Type brief)
PR/commit:      uncommitted (polish review, agent/fairway-fixes-polish)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed (2026-10-18, Dynamic Type)

- `rounds.css`, `rounds-setup.css`, `rounds-track.css`, `rounds-recover.css`:
  the phone's text (heads, labels, row titles and subtitles, captions, pills,
  buttons, the setup fields and sheets, the shot screen's labels, segments,
  tags, sheets and bar) is set in `calc(N * var(--ch-type-k))`, so it follows
  the iPhone's Text Size up to XXL. Line-heights in px move with it, except
  where they centre text in a fixed-height control. The phone text floors
  (12px) are split: the text members scale, the numerals stay 12px.
- Left fixed on purpose: scorecards (the review's nines, the list's grid, the
  shot screen's card), chart and map labels (the season ribbon, the range
  ends, the zone plots, the hole map), and display numerals (scores, figures,
  the hole number, the distance and its input, the quick distances, the
  setup's par and yardage cells). The shot screen's controls keep their
  heights and stay at least 44px; its hero result word stays fixed with the
  hero.
- At XXL (390 wide) the unscaled text drops from 150 to 87 (Rounds), 374 to
  302 (a round), 36 to 10 (Setup), 50 to 24 (Track), 63 to 27 (a putt), 156
  to 130 (the summary). What remains is the shared shell and primitives
  (`ch-strip`, `ch-btn`, `ch-seg`, `ch-score--sm`, the zone sections in
  `ui.css`) and the numerals above. At the default size every value is the
  same pixel (WebKit screenshots identical).
- The course picker's rows, phone: past the default size the name keeps a
  readable width (`min-width` from `--ch-type-k`, none at the default) and the
  date, par and tees wrap under it; at XXL they had squeezed "Finley GC" to
  "Finley ...".

### Verification (2026-10-18, Dynamic Type)

- WebKit (Playwright, dev preview, 390): scale 1 screenshots of Rounds, a
  round (player and coach), Setup and Track (bare, card, summary, putt, holed,
  submit failed, exit) are pixel-identical to before; at
  `--ch-type-scale: 1.353` no horizontal overflow, no new clipped text or
  spilled controls; the shot screen's controls under 44px are unchanged from
  before (summary and submit failed 13, holed 1). Also checked at XXL: the
  course picker (identical at scale 1 with and without the wrap), the course
  view and the change-shot sheet.
- The setup fields stay 16px on the phone: `globals.css`'s iOS zoom floor
  (`input:not(...)`, `font-size: 16px` under 768px) outranks them.
- `npm run clubhouse:check`, `npm run clubhouse:css` (no findings in these
  sheets), `npm run typecheck:fast`.

## 2026-10-18 — Wave 3 accessibility: landmarks, headings, rings

```text
Design package: none (wave-3 accessibility review, items 2, 11, 12, 14, 19)
PR/commit:      uncommitted (polish review, agent/fairway-fixes-polish)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed (2026-10-18, a11y wave 3)

- Setup and Track are each a `main` landmark; they had none.
- Headings no longer skip a level: the library's month or course groups, and
  Setup's Round details and Scorecard cards, are `h2` under the page's `h1`.
- The on-green focus rings in Setup's band and Track's top bar, strip and hero
  carry `.ch-root`, so the shared green ring no longer wins over them (Track's
  Exit pill measured 1.86:1 on the green; now champagne 9.71:1).
- Setup's upcoming step labels take `--ch-on-green-ink-muted` (4.0:1 to
  6.19:1).
- Round review: the off-fairway shot disc is `#75653f` in both themes, so its
  ivory number reads 5.08:1 (was 3.68 in light).
- Track, dark: the `.ch-rt-subm__bad` amber on its ivory disc follows the
  darker light warning ink, `#8a5a0c` (5.11:1, was `#94600e` at 4.60). The
  token itself would give the pale night amber there.

### Verification (2026-10-18, a11y wave 3)

- `npm run test:file` on the rounds, round setup, entry, tracking and review
  tests (the library's group heading test now asks for level 2).
- WebKit (Playwright, dev preview, axe-core, 390 and 1280, light and dark):
  Setup and Track have one `main` each; on the library, Setup and Track the
  findings go from 98 to 0 (heading-order 8, landmark-one-main 8, region 78,
  now none). Group and card headings keep their font, margin and colour.
- Focus rings measured by keyboard focus: Setup's back link mint 8.39:1 light
  (was the green ring at 1.55), Track's Exit pill champagne 9.71:1 at 390
  light (was 1.86); the strip's hole keys draw their champagne ring.

## 2026-10-18 — Wave 3: the head on the shared line, a 44px New round

```text
Design package: none (wave-3 design review, items 5, 14)
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
  title holds still between tabs. The round review takes the same gutter and
  top; its title sits under the back link.
- Phone: New round is 44px tall where it was 36px; the loading shape matches.

### Verification (2026-10-18, page-head line)

- `npm run test:file` on `rounds.test.tsx`.
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

## 2026-10-18 — Wave 3: Best's course name holds together

```text
Design package: none (wave-3 design review, items 17)
PR/commit:      uncommitted (polish review, agent/fairway-fixes-polish)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed (2026-10-18, Best caption)

- The season's Best caption keeps the course name on one line ("Carolina
  GC", which broke to "Carolina / GC"); the separator ends that line and the
  date takes the next. A long name ends in the column's ellipsis
  (`parts.tsx`, `rounds.css`).

### Verification (2026-10-18, Best caption)

- WebKit at 390 and 1280: "Carolina GC ·" over "Aug 18"; an injected
  "Pinehurst Resort No. 2 Championship Course" reads "Pinehurst Resort …".
- `npm run test:file` on `rounds.test.tsx`.

## 2026-10-18 — Polish: setup focus, hover, dock wrap and shotgun start

```text
Design package: none (wave-2 interaction review rows 7, 9, 10, 14, 16)
PR/commit:      uncommitted (polish review, agent/fairway-fixes-polish)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed (2026-10-18, interaction review)

- Setup: the Date field draws its ring on `:focus` (WebKit never matches
  `:focus-visible` on a date input), light and dark.
- Setup: Round type and Holes segments darken on hover (desktop).
- Setup dock: "N holes", "Par N" and "hole N" keep a no-break space, so the
  phone dock never breaks "Par / 72".
- Setup: Starting hole is always shown. Before a course is picked it is
  disabled under "Shotgun start? Pick a course, then choose your first
  hole."; once the card's holes load it behaves as before.
- Round entry dialogs: option rows take the ledger row tint on hover; the
  primary and danger rows also step their ring.

### Verification (2026-10-18, interaction review)

- WebKit (Playwright) checks: focused vs blurred and hovered vs resting
  computed styles and crops, `scratchpad/w2-interact/`.
- `npm run test:file` on the page's tests, `clubhouse:check`,
  `typecheck:fast` and eslint pass. `clubhouse:css` exits 1 on the five
  existing `shell.css` findings (lines 3742-3821), none in this change.

## 2026-10-18 — Polish: the skeleton holds the season chart's height

```text
Design package: none (wave-2 states review row 3)
PR/commit:      uncommitted (polish review, agent/fairway-fixes-polish)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed (2026-10-18, loading)

- Desktop skeleton (CH-11401): the season pane draws its head and then the
  vs-par stage at the chart's proportion, so the hero is the loaded one's
  height at any width; the first month is drawn under its heading
  (`RoundsSkeleton.tsx`, skeleton-scoped rules in `rounds.css`).

### Verification (2026-10-18, loading)

- WebKit (Playwright, dev server, preview fixtures), the tools row's top
  skeleton vs loaded: 1280 778 vs 782 (was 548 vs 782); 1100 1193 vs 1202;
  1440 812 vs 802. The first month's rounds 878 vs 887 at 1280.
- `npm run test:file` on the page's tests, `clubhouse:check`,
  `typecheck:fast` and eslint.

## 2026-10-17 — Polish: setup segments reach 44px

```text
Design package: none (polish review rows; no new pattern)
PR/commit:      uncommitted (polish review, agent/fairway-fixes-polish)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- Round lifecycle parity: Fairway's back-nine start now numbers its hole setup
  1 to 9 as Clubhouse's does (shared engine fix), so the parity test asserts
  the two starts send identical hole configs.
- Phone setup: Round type and Holes segments are drawn 38px inside the
  well; their hit area now reaches 44px without moving them
  (`rounds-setup.css`).
- Tabular figures restored (review row 18): 29 rules across `rounds.css`,
  `rounds-setup.css`, `rounds-track.css` and `rounds-recover.css` that set
  `font` on a figure (scorecard nines, figures, season cards, the match card)
  now set `font-variant-numeric: tabular-nums` after it. The 84px and
  46px hero numerals keep proportional figures.

### Verification

- `npm run test:file` on the page's tests, `clubhouse:check`,
  `clubhouse:css`, `typecheck:fast` and eslint. The WebKit pass is the
  coordinator's.

## 2026-10-17 — Add a course draws the chosen photo itself

The photo chosen in Add a course is drawn on a canvas from the file's own
pixels (`LocalPhoto` in `setup/AddCourseSheet.tsx`, cropped like the card's
`object-fit: cover`) instead of an `<img>` whose source is an object URL made
from the file. It looks the same; nothing on the page is built from the file,
which clears code scanning's `js/xss-through-dom` finding on the PR. Checked in
WebKit: the frame draws at device resolution. Test: `round-setup.test.tsx`
CH-11511.

## 2026-10-17 — Shot entry checked against production: a shot changes mid-hole, and distances are numbers

Parity pass on the in-round hole and shot entry (`track/`: ShotEntry, the
penalty and change sheets, the shot log, the hole review) against Fairway's shot
screen (`FairwayShotTracking` and its entry, pills, penalty and edit modals),
the shared `useShotTracking` engine, and what reaches `golf_shots`,
`golf_holes`, `putt_details` and `approach_miss_details`.

```text
Design package: none (no board); the open shot log's rows take the hole review's row grammar and its pencil
PR/commit:      agent/course-picker-premium-pr (see the PR)
Contract IDs:   111105 (CH-11505, a second way in); 110504 (CH-11104, now blocks); 110505 (CH-11105, a typo refused)
Actions:        none new (handleEditShot, handleSaveEditedShot, handleDeleteShot as before)
Data impact:    none to the schema; a meters player's comma decimal is no longer stored short
Held items:     none
```

### Changed

- **A recorded shot opens to change or delete before the hole is holed**
  (CH-11505, `parts.tsx` `ShotLog`, `RoundTracking.tsx`). Fairway's shot pills
  open any recorded shot mid-hole; Clubhouse only opened one from the hole
  review after hole-out, so a wrong tee shot on shot 3 could only be undone back
  to. The open shot log's rows are now buttons into the same change sheet (held
  while an undo, an edit or the hole's save runs).
- **The distance boxes hand the engine a number** (`labels.ts` `cleanDistance`,
  `isDistanceText`; `ShotEntry.tsx`, `sheets.tsx`). They are text fields and the
  engine reads them with `parseFloat`, so "1,5" from a comma-locale decimal pad
  (the meters pad) was recorded as 1 (3 ft instead of 5 ft), and "150y" as 150,
  with the error line showing but Next shot on. A comma is now the decimal
  point, and anything else that isn't a plain number blocks Next shot ("Enter a
  valid distance", CH-11104) or the change sheet's Save (CH-11105), as Fairway's
  number inputs do.

Unchanged after the check (every renderer write is the shared engine's): results
offered per shot, the locked unit (feet on the green, yards elsewhere), meters
converted to stored yards and feet, driver only off a par 4 or 5 tee, a par 3's
tee shot stored as an approach, tee miss left or right, the approach miss grid
and its derived lie, putt break, slope and paired miss tags (stored in tap
order), penalties and which stroke went for out of bounds and lost ball, tap in,
undo, delete and renumbering, a finished hole changed after going back, and the
15-stroke limit. Neither screen has a score-only mode or a GPS distance. Left as
it is: Fairway's change modal also offers short and long for a tee miss (0 such
rows in production in 120 days; its live entry offers only left and right), and
its quick distance picks in the change modal (input help only).

### Verification

`src/hooks/golf/__tests__/shot-entry-parity.test.tsx` (new) plays eleven holes
through both screens' own controls (par 3 two putts, par 4 bunker up and down,
par 5 out of bounds and water, a lost ball from here, holed from off the green,
three putts, a 9-hole round's last hole with a tap in, a meters player, a
mid-hole change, a mid-hole delete and undo, a finished hole changed) and
requires every recorded row, hole checkpoint, stats update and autosave to be
equal, and every recorded row's stored columns inside the live CHECK
constraints; a twelfth, Clubhouse only, types "1,5" m; and
`round-tracking-shot-parity.test.tsx` (new) covers the two fixes. Read-only
production sample (rounds of the last 120 days): 480 rounds and 8,379 holes with
shots, 0 holes whose score, putts or penalties differ from their shots, no lie,
result, unit, break, slope, penalty, miss direction, putt tag or approach lie
the Clubhouse screens can't write (`deep_rough` and `recovery` are allowed by
the constraint and in 0 rows), and the rows only the change sheet makes, on both
screens: 24 off-target tee shots and 15 approach misses with no miss direction,
4 fairway tee shots with one, and 5 putts measured in yards. Not checked in a
browser or on a device; no screenshots.

## 2026-10-17 — Round lifecycle checked against production: the start's city and state, and the recap

Parity pass on the round lifecycle (start, autosave, checkpoints, offline
replay, resume, discard, submit, recap, review, library), against Fairway's
NewRound, Continue and round pages and the shared engine
(`src/lib/golf/round-session/`). Both UIs drive the same engine, so a payload
can differ only in what each setup feeds it; `round-lifecycle-parity.test.tsx`
drives both setups through the real engine to the same round and compares every
server write field by field (112402).

```text
Design package: none (layout unchanged; the existing recap section now appears on a round that had no recap stored)
PR/commit:      agent/course-picker-premium-pr (see the PR)
Contract IDs:   110116 (new), 111504 (new), 112402 (new)
Actions:        none new; the review calls the existing generateRoundRecap, and setup the existing getPlayerSavedCourses,
                touchSavedCourse and contributeCourseFromRound, as Fairway does
Data impact:    golf_rounds.course_city / course_state now saved as the library has them; ai_recap written on first review
Held items:     none (20261001000000, the submit's optimistic lock, stays held; the app already sends the key)
```

### Fixed

- **A course's city and state reach the round as the library has them**
  (`setup-reads.ts` `toStartForm`, `shape.ts`, `RoundSetup.tsx`,
  `AddCourseSheet.tsx`). The start split the printed place ("Chapel Hill, NC")
  back into a city and a state, so a course with a state and no city was saved
  with the state as its city (`course_city = 'NC'`). The pick now carries the
  course's own `city` and `state`; Fairway's tee pick passes them straight
  through the same way.
- **A completed round with no recap gets one when its review opens** (111504,
  `use-round-recap.ts`, `RoundReview.tsx`, `round-review-shape.ts`
  `recapPending`). Fairway's round page asks `generateRoundRecap` once after
  mount when a completed round has none stored (`useDeferredRoundRecap`), and
  that is the only writer of `golf_rounds.ai_recap`; Clubhouse only read it, so
  a round posted and reviewed in Clubhouse never got a recap. The recap still
  passes the figure check before it is drawn (D13's "no new AI call" was about
  that check, not about writing the recap). A failure is quiet, as on Fairway,
  and the next visit asks again. This spends one LLM call per round on its first
  review, as Fairway does (owner: keep, as production, unless told otherwise).
  Before and after captures not taken.

### Added

- **"Your courses" in the course picker** (110116, `setup-reads.ts`
  `listCoursesRead`, `listTeesRead`, `teeHolesRead`, `afterSavedCourseStart`;
  `shape.ts` group `saved`; `RoundSetup.tsx` `pickTee`). Fairway's setup offers
  the player's own saved courses (`golf_player_courses`,
  `getPlayerSavedCourses`); Clubhouse offered only library courses, and 52 of
  the 54 saved rows have no library course behind them (26 with no library
  course of the same name either), so those players had to type a course they
  had saved again. Each saved course is listed after Recently played with its
  one tee set (White when none was named, as on Fairway) and the card it was
  saved with, and is left out when the library already lists it (its link, or
  the same name). Starting from one sends what Fairway's saved-course start
  sends (the parity test drives both). A saved course with no library course
  behind it is offered to the library with Fairway's input and the round is
  linked to the course and tee that finds or creates, so its later checkpoints
  and its submit carry them, as Fairway's do (the engine's new opt-in
  `libraryOffer`, below); the course is touched, best-effort. One difference
  kept: the touch happens when a round starts, not when the course is picked, so
  a course looked at and left is not moved. Fairway lists saved courses beside
  the library without removing names the library has; Clubhouse lists each
  course once. Before and after captures not taken (the preview has no saved
  courses).
- **Yardages follow Fairway's rule for the course** (`shape.ts` `yardageRule`,
  `setupBlocker`; `toStartForm` `yardage`). A library tee's card starts on its
  pars, a blank yardage at 0 yards (Fairway's preloaded start gates a library
  tee on its pars); a saved course needs a yardage on at least one hole ("Add a
  yardage for at least one hole"), the rest at 0; a course typed in by hand
  still needs every yardage, as Fairway's hole editor does. Before, every hole
  of every card needed a yardage. A yardage over 999 still stops Start.

### Changed in the shared engine (opt-in; Fairway unchanged)

- `src/lib/golf/round-session/start-form.ts`: `NewRoundStartForm` takes two
  optional fields, `yardage` ('every' | 'any' | 'none', default 'every') and
  `libraryOffer` (holes, under the card's numbers); `validateStartHoles(holes,
  yardage = 'every')`.
- `src/lib/golf/round-session/use-new-round-session.ts`: `start(form)` passes
  `form.yardage` to `validateStartHoles`, and `handleHolesSave` runs the legacy
  saved-course catalog offer (`contributeCourseFromRound`, then the course and
  tee refs) when the form carries `libraryOffer`, there is no "save course"
  opt-in and no library link yet. Only Clubhouse's `start(form)` passes either
  field; Fairway's screens never call `start(form)`, so their path, payloads and
  every round-session and Fairway round test are unchanged (32 files, 242
  tests).

### Checked, unchanged (same as production)

- The start, each hole's checkpoint, autosave (every 15 s, in both) and the
  submit: the same engine handlers and the same payloads, with
  `expectedUpdatedAt` on the submit of an existing round (112402).
- The back nine: Fairway's quick start sends its hole configs under the card's
  numbers (10 to 18), Clubhouse's under 1 to 9; the holes themselves, and every
  write after the start, are numbered by position in both, and no 9-hole round
  in production has a hole numbered past 9 (read-only check, 2026-10-17).
- Offline replay: the Clubhouse shell starts the sync engine
  (`shell/OfflineSync.tsx`) as Fairway's `OfflineProvider` does, and the offline
  banner shows what is waiting. Discard (library and round) marks the round
  discarded and drops its queued copy, as the engines do.
- After a submit, the review opens (`/rounds/[id]`, as Fairway's overlay
  pushes); Home, Rounds, Stats, Qualifiers and the stats cache are revalidated
  by the shared server action. A recap is now written on that first review.
- Review totals: of 427 completed rounds with holes in the last 60 days, none
  has a stored total, nine, to par or putts that differs from its holes, so the
  review's nines (from the holes) and its totals (from the round) agree.

## 2026-10-17 — Change a submitted round's type from its review; qualifier rounds checked against production

Parity pass on how a round becomes a qualifier round, against Fairway's
new-round setup, its continue editor and its round page (`RoundTypeEditor`), and
the live `reclassify_golf_round` and `submit_round_atomic`.

```text
Design package: none (no board); the review's control is the existing Change round type sheet (CH-11521)
PR/commit:      agent/course-picker-premium-pr (see the PR)
Contract IDs:   111122 (CH-11522, new); 111121, 110638, 110639, 110417 (copy widened)
Actions:        ACT-P011-REVIEW-CHANGE-ROUND-TYPE (new), on the existing updateRoundType
Data impact:    none new; a coach's save inserts the player's golf_qualifier_entries row, as on Fairway
Held items:     none
```

### Changed (2026-10-17)

- **A submitted round's type can be changed from its review** (CH-11522,
  `RoundReview.tsx` `ChangeRoundType`). Fairway's round page has had this since
  2026-08-19 (the coach's report of players who tapped Practice for a qualifier
  round); the Clubhouse review had no way to do it. The rules are Fairway's: the
  owning player and a coach of the player's team; the player's entered
  qualifiers, finished ones included; for a coach, the round's team's other
  qualifiers too (test ones left out), marked "Not entered yet. Saving enters
  the player in it.", and `updateRoundType` enters them. Taken slots are shown
  and not offered. The options are read beside the holes
  (`data/rounds-type-options.ts`); any of the reads failing is "didn't load"
  (CH-11218), never a shorter list.
- **The sheet's words follow the viewer and the round** (`RoundTypeSheet.tsx`,
  `round-type.ts`). A coach with no team qualifier is told to create one, not to
  ask a coach (CH-11316); a coach's permission refusal is worded for a coach
  (CH-11020); the toast says when the save entered the player. On a live round a
  closed qualifier now says "Closed. It has to be reopened before this round can
  be submitted.": the live `submit_round_atomic` still refuses a completed
  qualifier, though `round-submit.ts`'s comment says that check was removed, so
  the old "Adding this round changes its final standings" was only true of a
  submitted round.
- **Setup asks the server about every open qualifier** (`setup-reads.ts`). A
  qualifier whose entry count said "all rounds in" was blocked without asking,
  and any refusal read "Try again in a moment". Now the server's next round
  decides, as on Fairway, and its definitive refusals are said as such (every
  round in, more than one saved round, no longer entered, gone,
  `qualifierBlockedReason`); only a failed read says to try again.

Unchanged after the check: the new-round payload (the engine's `start(form)`
with the qualifier and its round, or none for practice and tournament), the
device's day for the date, the in-progress round that opens instead of starting,
and Continue's options (the player's entered qualifiers).

### Verification (2026-10-17)

round-type-review.test (new: the options for both viewers, the coach's
non-entered qualifier and the payload of its save, the loader for both viewers,
CH-11316, CH-11020, the live-round hint, the setup's refusals),
round-entry-routes (CH-11211 follows the server rule), and the action's own
`round-type.test.ts` for the coach entering the player. Not checked in a browser
or on a device; no screenshots.

## 2026-10-17 — A coach on /rounds goes to Team stats

Readiness audit (2026-10-17): a coach on `/golf/dashboard/rounds` stood on
"not rebuilt". The page's plain `redirect()` to Team stats never ran: the frame
drops a page that is not rebuilt for the role. It now redirects through
`redirectToClubhouse`, and `/rounds` (exactly, not its children) is on the
frame's aliased list (`CH_ALIASED_ROUTES`, nav.ts), so the segment renders
hidden and its redirect fires. A player's Rounds is unchanged (checked in
Chrome). Test: `alias-frame.test.ts`.

## 2026-10-16 — Round type, holes and the track strip take the shared green chip

The chosen Round type and Holes in setup, and the chosen chip in the track
strip, are the lit green chip every switcher draws (`rounds-setup.css`,
`rounds-track.css`). The window-only light-track version of the Holes choice in
Add a course is gone with it, so the window and the page match. Add a course's
photo refusal is drawn in warning amber, not danger red: nothing is lost by it,
and the red-token rule (D-42) reserves red for under par, the flag and
destructive actions. Shared detail: docs/clubhouse/CHANGELOG.md.

## 2026-10-16 — The course picker and Add a course, rebuilt

Owner, 2026-10-16, across the day: "wider than tall", "Claude and ChatGPT and
Apple level", "it still looks vibe coded", no shimmer after picking a course,
and Add a course in the picker's corner with the team's own photo.

```text
Design package: design/handoff/ v2 (rounds-flow.jsx Picker, rounds-course.jsx AddCourse) is the base; the photo cards,
                the phone list and the two-column Add a course are the owner's direction of 2026-10-16 and depart
                from the boards
PR/commit:      agent/course-picker-premium-pr (see the PR)
Contract IDs:   CH-11510, CH-11511, CH-11403, CH-11404, 111503 (unchanged); no new contract row
Actions:        round start now also uploads a typed course's photo (best-effort); no new server action
Data impact:    may write golf_courses.image_url and one object in the course-images bucket per typed course
Held items:     none
```

### Changed (2026-10-16)

- **Desktop picker** (`CoursePicker`, `rounds-setup.css`): the window is
  landscape, 880px wide and at most 680 tall, and the courses are photo cards,
  the photo on its own corners with the name, place, par and tee count under it
  in the page's type, three to a row (880px is the Add a course window's width
  too). No text over a photo and no scrim. Loading cards are still shapes (no
  shimmer), six in waiting. The cards fold back as they leave the list's top and
  unfold coming up from its bottom (a scroll-driven animation; still with
  reduced motion or Animations off).
- **Photos are real or absent.** A course shows its uploaded photo
  (`image_url`), else a bundled photo of the real course
  (`resolveRealCourseImage`), else a quiet tile with the flag. No stand-in scene
  and no repeated photo. `ChSetupCourse.image` carries it (`setup-reads`).
- **Phone picker**: a list to scan with a thumb, a small photo or the flag tile
  beside the name, place and par, on hairlines; full-width photo cards were a
  screen each.
- **No shimmer after the pick**: a course's tees are asked for on hover, focus
  or press of its card (once while the picker is open; a failed read is asked
  again), so the tee list usually opens on them. When they are still on the way
  the list holds a quiet space the height of a tee. The stale-read rule (111503)
  is unchanged.
- **Add a course** moved into the picker's head, beside Close (`Modal`
  `action`), always in reach. On the desktop it is two columns: the form, and
  the course as the picker will show it, filling in as it is typed, with a photo
  slot (choose or drop; JPG, PNG, WebP or AVIF, up to 5 MB). The review step is
  a plain summary, the name field takes focus, one focus ring per field, and the
  footer reads the note on the left with Cancel and Next together on the right.
  On the phone the card and its photo slot follow the form, so a phone can add a
  photo too.
- **The photo's path** (`AddCourseSheet` -> `ChSetupForm.coursePhoto` ->
  `toStartForm` `courseImage` -> `useNewRoundSession`): only a course typed by
  hand and saved carries it. After `contributeCourseFromRound` resolves the
  library course, the start uploads the photo and sets it as the course's image
  only when the course has none, not awaited and best-effort: a photo never
  blocks or undoes a started round.
- The photo slot's hint now names AVIF, which the code already accepted.
- The photo's refusal message is `.ch-acs__photo-error`, in warning amber (see
  the segmented-switcher entry above).

### Why

- The list of rows read as generated UI beside the dialogs the owner compared it
  with; booking-style photo cards with the text under them, one material and one
  shadow are the researched answer (see the shared entry for the material).
- Course photos were left out in Q-72 because no course had `image_url`. A
  course's own photo, or a real one of it, is now shown when there is one
  (DESIGN.md Data assumptions, phone/rounds.md).

### Verification (2026-10-16)

- Before and after captures, Playwright WebKit headless,
  `/clubhouse-preview/setup` (synthetic fixture, no auth): the picker and Add a
  course at 1440x900 and 390x844, filed under
  `.helm/screenshots/clubhouse/P011-rounds/` and listed in VERIFY.md. The
  fixture's courses carry no photo, so the captures show the flag tiles: a photo
  card with a real photo was not captured.
- Not verified: a real iPhone Safari pass; the photo upload end to end against a
  real round. Note for review: the image write used to go through
  `setCourseImageUrl` -> `updateCourse`, which is gated to coaches (and the
  policy `golf_courses_update_authenticated` refuses players too), so a player's
  photo was refused and swallowed. The owner decided any golf team member may
  set a course's photo. `setCourseImageUrl` now calls a narrow `SECURITY
  DEFINER` RPC, `golf_set_course_image` (migration
  `20261016220000_golf_set_course_image.sql`; tests: pgTAP
  `supabase/tests/rls/golf_set_course_image.sql`, vitest
  `set-course-image-url.test.ts`). The migration is NOT applied to production:
  it needs applying after merge. Until then `setCourseImageUrl` falls back to
  `updateCourse` when the function is missing, so coaches keep uploading and a
  player's photo is still refused (the upload lands in the bucket either way),
  and the deploy order is safe whichever comes first. A real round's photo end
  to end was not run.

## 2026-10-14 — The course map hydrates without a mismatch

Every shot-tracking screen logged "A tree hydrated but some attributes of the
server rendered HTML didn't match" (Playwright WebKit): the map measured its
centre line with Math.hypot, whose last digit differs between Node and
JavaScriptCore, so a circle's cy came out 375.388364625849 on one and
375.3883646258491 on the other. It measures with exactly-rounded arithmetic
(Math.sqrt of a sum of squares); a guard test keeps the map free of hypot and
trig.

## 2026-10-12 — round entry, recovery and continue follow the dashboard role

No visible change for a single-profile user. `/rounds/new`, `/rounds/recover`
and `/rounds/continue/[id]` draw Clubhouse only when the gate is on for the
player and the dashboard layout's role (`getGolfDashboardRole`) is the player's,
and the autosave and submit traces tag `ui` the same way. Fairway, the page's
own access checks and the gate-off path are unchanged.

## 2026-10-12 — the old review address loads in the review's shape

- `rounds/[id]/review/loading.tsx` paints the Clubhouse review skeleton
  (CH-11406) inside the shell, so a client navigation to the old address
  never shows Fairway's skeleton before the redirect to `/rounds/[id]` lands.
  Outside the shell it keeps Fairway's. Contract 110206 is implemented.
- Round review and the Rounds library follow the dashboard layout's role
  (`getGolfDashboardRole`).

## 2026-10-12 — Change round type mid-round (continue)

```text
Design package: none (the round's own sheet pieces: Modal, Segmented, Opt; no owner board)
PR/commit: agent/clubhouse-release-features
Contract IDs: 111121, 110212, 110638, 110639, 110417, 110511 (CH-11521, CH-11411, CH-11020, CH-11218, CH-11316, CH-11110)
Actions: ACT-P011-CHANGE-ROUND-TYPE
Data impact: none (existing updateRoundType; reads golf_qualifier_entries and golf_rounds)
Held items: none
```

### Changed (2026-10-12)

- A continued round's Exit sheet has a "Change round type" row ("Practice now.
  Changes what it counts toward."). It opens `RoundTypeSheet`: Practice,
  Tournament or Qualifier; for Qualifier, which one the player is entered in
  and which of its rounds, with the slots their other rounds hold shown as
  "Already recorded" and not offered. Save calls `updateRoundType`, toasts what
  the round now counts toward, and refreshes the page so the engine submits
  with the new setup.
- `ClubhouseContinueRoundRoute` reads the options (`loadRoundTypeOptions`);
  a failed read is "didn't load", never "none".
- Auto-save is held while the sheet is open and until the refreshed round
  arrives, so an auto-save never writes the old type back.
- A permission refusal reads as needing to be entered in the qualifier and an
  active member of the team; offline nothing is sent (CH-1903).
- The Fairway continue page is unchanged (a comment only).

### Why (2026-10-12)

- Owner decision: rebuild the dropped Fairway round-type editor (2026-08-31:
  players can edit a live round's type; Q-92b).

### Verification (2026-10-12)

- round-entry-continue.test (CH-11521, CH-11411, CH-11020, CH-11218, CH-11316,
  CH-11110, CH-1903, the auto-save hold while the sheet is open, and the
  submit after a change) and round-type-options.test (the loader and the
  sheet's rules). The hold after Save relies on `router.refresh()` in a
  transition staying pending until the new payload commits; no test exercises
  that. Not observed in a browser or on a device; no screenshots.

## 2026-10-11 — Review motion on transform; the depth from tokens

Presentation only (no contract change):

- The review's running-score card and the library's season-chart card sit on a
  still, full-width track and move along it by
  `translate` in container units, so they glide without relayout and the track
  never overflows the chart.
- Putts a hole: each column scales up from its foot (`--ch-rz-p`); first putts
  by length: each bar slides in from the left. Both
  glide on transform. The strokes-gained bars stay sized inline and no longer
  glide (their width is what the review's tests read);
  the scoring distribution keeps its own slide.
- Depth: the stage and hero use `--ch-elevation-feature`, the scrub card
  `--ch-elevation-overlay`, marks `--ch-elevation-mark`,
  `-mark-warn` and `-mark-ink`, and the figures row `--ch-elevation-plate`
  (shared entry in `docs/clubhouse/CHANGELOG.md`).

## 2026-10-10 — Rounds library and new round, more premium

```text
Design package: owner direction "premium polish across the whole app"
PR/commit: agent/clubhouse-premium-backlog
Contract IDs: none (presentation only; no new codes, no changed copy)
Actions: none changed
Data impact: none
Held items: none
```

### Changed (the library, desktop and phone)

- Season scoring: "Every round vs par" sits on the same deep-green stage as the
  review's pictures (desktop; flat on the page on the
  phone, which keeps its one green card). Bars are gradient fills (red under
  par, ivory over), the average is a gold dashed line with
  its chip, a qualifier a gold outline. The bars rise from the par line the
  first time the chart is scrolled into view; move across it
  (or touch it) for a card with the round's date, kind, score and score against
  par. The title and the colour key share one line.
- The average is the page's largest figure with a short gold rule; the Best,
  Putts and GIR figures keep their drawings with deeper
  fills (a gold ring on the best round, a gold tick at two putts a green), and a
  caption wraps to a second line before it is cut.
- Heads (in progress, season scoring, more unfinished, each month) carry the
  short gold rule. A month shows its trend as one small bar
  a round beside its count, average and low.
- Round rows are a ledger: a flush date with a gold hairline, Out, In and Tot as
  a small hung board (the review's scorecard in
  miniature, the total on a gold plate), gradient meters (putts in gold), and a
  flush to-par with its red ring kept under par.
- The round in progress: the to-par through the holes is a figure; the hole
  board has a gold hairline.

### Changed (new round)

- The green band is lighter on the desktop (title left, steps right) and the
  steps are a numbered stepper with a gold-ringed current
  step; a gold hairline closes the band.
- The scorecard is two hung boards, Out and In, each with its par and yardage
  total; hole numbers are debossed, par keys and the
  yardage sit on ivory plates, an edited hole's number turns gold. The whole
  new-round page now fits one desktop screen. On the phone
  the nines stack under their own heads.
- The course band has the gold hairline; the open qualifier has a gold-ringed
  medal and a raised Play; the course picker's tiles are
  ivory with a gold hairline and turn green under the pointer, with the chevron
  nudging.

### Notes

- Every duration is a motion token, so Animations off and reduced motion make
  each of these instant; the chart's per-bar delay is zeroed
  for reduced motion. No behaviour, data, copy or accessible name changed.
- Added `MonthSpark` and the chart stage to `screens/rounds/parts.tsx`;
  `HoleConfig` wraps each nine in a labelled group (`Out`, `In`).

## 2026-10-10 — Tap in on the putting screen

```text
Design package: owner direction "tap in in the shot tracking, on the green, hidden somewhere"; no owner board, draft in docs/clubhouse/phone/rounds.md ("Tap in on the phone")
PR/commit: agent/golf-tap-in
Contract IDs: CH-11913, CH-11710 (new)
Actions: none changed (the shot and hole-out writes are the engine's own)
Data impact: none (no migration). A tap in is a holed putt: result hole, putt_made true, its putt length in feet
Held items: none
```

- On a putt, before a result is picked, a quiet "Tap in" sits under the putt
  result with a caption naming what it
  writes and the score: one holed putt from where the ball lies within 2 ft, or
  the putt on screen left at 1 ft and
  the holed 1 ft putt. One tap records it through the same path as Hole out
  (`useShotTracking.handleTapIn`, shared
  with the Fairway screen), and the hole saves and moves on as usual.
- A tap in is a real stroke and putt (Rules of Golf 3.3c; concessions are match
  play only, 3.2b), so score, putts and
  strokes gained count it like any holed putt. Undo lifts one stroke at a time.
- Medium on the tap, success once the hole's save lands (D-70).

## 2026-10-10 — Shotgun start: choose the starting hole

```text
Design package: owner request "Shotgun start - select which hole they start on"
PR/commit: agent/agent-a2f230fc2a2574d84 (based on agent/clubhouse-premium-backlog)
Contract IDs: 110115 (new)
Actions: none new (start(form) and savePartialRound carry `startHole`)
Data impact: golf_rounds.draft_data.startHole on every autosave; no column, no migration
Held items: none
```

- Round details gains a quiet "Starting hole" select (the shared `ui/Select`),
  once the scorecard is in. It lists the
  holes the round plays by the card's numbers (10 to 18 on a back nine) and
  defaults to the first. The dock adds
  "· Starts on hole N" only when the start is not the first hole.
- Only the play order changes. Holes keep their numbers, pars and order on the
  strip, the scorecard and Round complete
  (Out/In and Front · Back stay by hole number). A round started on 6 plays 6 to
  18, then 1 to 5, and finishes after
  the 18th hole played. A 9-hole round wraps inside its nine.
- The strip lets the player go back to holes already played in this round's
  order, and not ahead to holes 1 to 5
  before the round wraps to them. "Back to hole" on Round complete names the
  hole the round ended on.
- The unfinished card's "Continue at hole N" follows the play order (a round
  started on 6 with 6 to 18 in continues at
  hole 1).

## 2026-10-10 — Micro motion on the review

The running-score line draws once the first time its stage is seen; the scrub
card fades and the hovered dot lifts; a picked hole's shots
draw in the order they were hit and its reading settles in; strokes gained, putt
columns and the first-putt bars glide to a new
length; the costliest-hole rows press and warm. All from motion tokens (instant
with Animations off or reduced motion). The zones come
from the shared `ui/Zone.tsx`.

## 2026-10-09 — The round review, more premium

```text
Design package: owner direction "make it more premium"
PR/commit: agent/clubhouse-premium-backlog
Contract IDs: none (presentation only)
Actions: none changed
Data impact: none
Held items: none
```

- The running score to par sits on a deep-green stage with a glowing line, mint
  and gold washes against par, and a
  scrubber: move across it for a card with the hole, its score and the running
  total; click a hole to open its shots.
- The picked hole's shots are drawn on a matching stage (arcs in mint for the
  fairway and green, gold for rough and
  sand, a red pin flag).
- The bands carry depth: a gradient and a gold rule on top, a gold-ringed
  number, a short gold rule under each title,
  and the reading in a soft plate with a gradient figure. The scorecard zone's
  reading follows the picked hole.
- Strokes gained bars, fairway and green marks, putt columns and the first-putt
  bars are gradient fills with soft
  shadows; marks grow slightly under the pointer. The figures row has a gold
  hairline and green numerals.
- The left column holds in view while a band's pictures scroll.

## 2026-10-09 — The round review as zones, with insights drawn from the round

```text
Design package: owner direction "redesign round review to be really nice and good looking like stats, cool insights and visuals"
PR/commit: agent/clubhouse-premium-backlog
Contract IDs: CH-11203, CH-11204, CH-11205, CH-11217, CH-11305, CH-11306, CH-11313 (no new codes)
Actions: none changed
Data impact: none (no migration). Every figure is derived from the holes and shots the review already loads.
Held items: none
```

### Changed (the review, desktop and phone)

- The review is six zones under gold rules with an alternating tint, in the same
  style as the player stats page: what the
  area is and one reading on the left, the picture that fits it on the right.
  The hero and the five figures stay.
- The hero gains one line on what the round was, from the figures: the leg that
  carried it and the one that gave strokes
  back ("Approach gained +1.3, putting gave back 0.9"), else its birdies and
  doubles.
- The round: the running score to par as a line (rising when strokes are gained
  on par, falling when given back, the
  front and back nine labelled, the costliest hole marked) with each hole's
  strokes against par as a column under it, and
  the scoring distribution.
- Where the strokes went: the four strokes-gained legs on one scale, and the
  holes that cost the most, each opening on
  the scorecard with its shots.
- Tee to green: a mark a hole for fairways and greens in regulation, which side
  fairways were missed, and how close
  approaches finished (average and closest, in feet).
- Putting: the putts on every hole as columns (one putt green, three or more
  gold), the one, two and three-putt split,
  and the first putts by length with how many dropped.
- Scorecard and shots: the scorecard as before; the picked hole now draws its
  shots as arcs along the hole from tee to
  pin, each coloured by where it finished, the penalty and the putts marked,
  above the shot list.
- In words: the recap and the player's notes.
- On the phone the zones stack and the pictures' words are set larger; the
  scorecard keeps its sideways scroll.

## 2026-10-08 — the shot screen's field is centred

- Owner: "center this, way too much white space". The drawn hole, its readout
  and the shot log now sit centred in the green field between the hole strip and
  the entry sheet, which stays on the dock. The tree band drawn under the log is
  gone, and the drawing's top and bottom dissolve into the field green, so the
  hole has no visible edge. WebKit 390 × 844: approach, putt and holed states.

## 2026-10-08 — The shot screen toward board 3: chip strip, a save line by the readout, the sheet on the dock

Toward the owner's phone concept "3 · On the course, glove on" (called "native,
premium, modern"). Presentation only:
the shot engine (`useShotTracking`, its save, resume, undo and checkpoint logic)
is untouched. Phone (640px container
and under) unless noted. Not yet reviewed by the owner; no screenshots were
taken in this change (no dev server).

```text
Design package: owner concept board 3 (On the course, glove on)
PR/commit: agent/track-polish
Contract IDs: CH-11805, CH-11901
Actions: none added or removed
Data impact: none
Held items: none
```

### Changed (shot screen, board 3)

- **Hole strip (CH-11805, `track/parts.tsx` `TrackStrip`,
  `styles/rounds-track.css`):** one row of compact chips
  instead of two-line tiles. A played hole shows its score as a bare numeral
  (red only under par, D-42, on the new
  `--ch-score-under-on-green` / `--ch-score-under-on-ivory` tokens); the current
  hole is lit ivory with its number (or
  its score when looking back at a finished hole); an unplayed hole is a
  hairline outline with a muted number. Each
  chip (36 x 30) is drawn inside a 44 x 44 hit area; 18 holes scroll sideways
  and the strip brings the current hole to
  the middle (at once on first paint, eased after, instant with reduced motion).
  Thru and to par stay at the end, on
  one line. Desktop keeps its tiles.
- **Names (CH-11805, all widths):** every chip is named by hole, score, to par
  and whether it is current: "Hole 2, 6,
  2 over", "Hole 3, 2, 1 under", "Hole 1, 4, even", "Hole 4, current", "Hole 6"
  (was "Go to hole 1, 4 strokes" and
  "Hole 2, current hole"). Buttons and marks keep their roles.
- **Save line (CH-11901, `track/RoundTracking.tsx`):** moved from a pill under
  the top bar to a quiet line beside the
  distance readout (and beside the holed score), as on the board's "Saved on
  this phone". The words and the states are
  the engine's, unchanged. New: "Round saved" now holds after the engine's
  two-second flash for as long as the shots
  on screen are exactly the ones the server acknowledged (same hole, same shot
  list); a new shot, an edit, an undo or
  a hole change drops it until the next acknowledgement. While a holed hole is
  being saved (CH-11402) or after that
  save failed (CH-11003, "kept on this device") the line never says "Round
  saved". Nothing is ever said before it is
  true, and nothing at all when the device copy of a shot failed. On the desktop
  the line sits under the readout.
- **The sheet on the dock (`styles/rounds-track.css`):** the entry card no
  longer floats over an empty band. The
  hero takes the slack instead, so the card sits directly on the Undo / Penalty
  / Next shot dock in every state
  (before and after a result, putting, the holed review). The drawn hole keeps
  its size at the top, so picking a
  result grows the card upward and nothing above it moves; below the shot log
  the hole's dark rough carries on with a
  few trees at the edges and settles into the field green where the card begins.
- **Preview:**
  `/clubhouse-preview/track?state=saved | phone | saving | retrying` fake the
  round's save for the line's
  states.

### Why (shot screen, board 3)

- The owner's board puts the round's progress in one quiet row, the persistence
  signal by the number the golfer is
  reading, and the entry in one ivory sheet sitting on the dock; the old screen
  had bulky tiles, a pill at the top and
  a sheet that floated until a result was chosen.

### Verification (shot screen, board 3)

- `round-tracking.test` (CH-11805: chip names, under-par marking, current and
  unplayed chips) and
  `round-save-status.test` (CH-11901: saving, retrying, held on the phone,
  placement in the hero, "Round saved" held
  past the engine's two seconds and dropped by an undo, never carried over to a
  new unanswered shot); and
  `round-tracking.test` CH-11901 (no "Round saved" while the holed hole saves or
  after it failed).
- Docs: the phone tracking notes (`docs/clubhouse/phone/rounds.md`), DESIGN and
  CONTRACT prose and the catalog rows
  for CH-11805 and CH-11901.
- Not verified: rendering on a phone or in a browser (no dev server in this
  change); screenshots pending.

## 2026-10-08 — Setup on the phone without cards

Owner direction (2026-10-08): the card is no longer the default unit of layout
on the phone. Phone only (820px and
under); the desktop setup is unchanged.

- **Sections, not cards:** Course, Round details and Scorecard are sections on
  the canvas, each under the Ledger's
  double rule with a 19px heading, its fields and rows flush below, and air
  between them. Everything sits on one 20px
  gutter, the green band's text included.
- **The course:** before a pick, "Choose a course" is the section's heading over
  its line and Browse courses (the
  dashed icon tile is gone). Once picked, the course name is the heading on the
  canvas (no second green band under the
  setup band), the place and the tee's facts under it, and Change course as the
  section's action on the heading's line.
- **Open qualifier:** one row between hairlines with its Play, tinting under the
  finger like a Ledger row.
- **Rows on seams:** the qualifier choices (radio, name, rounds), the course
  list and the tees in the picker sheet,
  and Add a course. The figure strip over the scorecard sits between two
  hairlines instead of in a well. Segmented
  controls, the date field, the par keys and the yardage fields keep their
  material.
- **Waiting matches loaded:** before a course (CH-11309), while the holes load
  (CH-11405) and when they didn't
  (CH-11210) the scorecard shows its heading; while loading also its figure
  strip and ghost rows at the loaded rows'
  52px (`ScorecardHead`, `.ch-rsu-ph`, phone only).
- **The start dock** is the screen's one action bar: a solid toolbar across the
  foot with a hairline edge, no blur, its
  padding carrying the home-indicator inset (the tab bar is away on this
  screen).

## 2026-10-08 — Premium pass (backlog)

- **Full screen on the phone (D1):** the shot screen and setup call
  `usePhoneImmersive` (the shell's bar goes inert) and hide the shell's top bar
  and bell while they are up (`.ch-root:has(.ch-rt-q|.ch-rsu)`, so the server's
  first paint is already full screen). The live `/golf/dashboard/rounds/new`
  route renders the same `RoundSetup` and `RoundTracking`. One h1 per screen
  (D11): the shot screen's is the course and hole, setup's names the screen, the
  phone library and review leave it to the bar.
- **On the course (owner board 3):** the shot screen in track mode on the phone:
  deep green full bleed; Exit, the round and Card in glass pills; the hole strip
  as plates; the drawn hole as the hero (solid line for each played shot, dashed
  to the pin, numbered stops) with "Hole N / Par · yds" and "Shot N · kind /
  distance / yards to the pin" set on it; the one-line shot log; one ivory entry
  card with the real fields; Undo, Penalty and a big Next shot on the green.
  Every rule is `useShotTracking`'s and `shot-entry-rules`' (undo asks first,
  D-70; plausibility; the 15-stroke note; putting details; the miss grids).
  Desktop keeps its layout with the same drawn hole.
- **Course view (board 3b):** tapping the hole opens it full screen (a panel on
  the desktop): the hole top to bottom with 50/100/150 rings from the pin scaled
  from the hole's yardage, each shot numbered with its club and distance, and a
  sheet of this hole's shots. ‹ › look at other holes (the round screen's
  finished holes' shots; view only, never the scored hole). No GPS, satellite or
  course geometry; "Your last 3" and "Team average" are left out (not loaded).
  The drawn hole's geometry is `track/hole-geometry.ts`.
- **The scorecard as a hung board (A2):** each nine a field-green board, hole
  numbers debossed, figures on ivory plates, the Score row the largest numerals
  (D8), Tot past a gutter, the whole cell the target (D9); on the phone a sticky
  label column and an edge fade (D10). Missed at 3:1, N/A as "—" (D12).
- **Round review:** the recap is a passage under a rule labelled "Written by
  CoachHelm from N holes" (no Sparkles, D14) on both widths; any clause its own
  strokes-gained or putts figures contradict is cut before it shows
  (`recap-check.ts`, D13; no new AI call). "Select a hole" on the desktop (D17).
- **One sun (A1):** the green feature cards (in progress, the review's phone
  hero, the setup band) and the shot screen's field take the shell's global
  light (`--ch-light-*`): sky from the sun's side, a sun-side rim, a leaning
  cast shadow. Never on figures.
- **Library and posting:** a month's low is an 18-hole figure and nine-hole rows
  say so (D2); the ribbon draws under par red, over par at 3:1, Even in the
  legend, a qualifier as a gilt outline, with an honest caption and ink-500
  labels (D3–D5); played holes on the round card show the number over the score
  (D15); the best round keeps its whole course name (D16); the desktop score box
  keeps one width (D18). Submitting, posted and didn't-submit are a modal dialog
  over a 0.96 green with an opaque card and focus on the title (D6, D7). The
  spinner stops under Animations off (D20); the bar's blur has its prefix (D21).
- Not here: B3 (D-70 stands); 44pt shared buttons and red failure titles
  (shell).

## 2026-10-08 — States and native feel

The states audit's Rounds findings and the owner's native-feel pass, verified in
WebKit at 390x844 with touch.

- **Motion:** the scoring distribution's bars change on transform, not width
  (motion research A4): each is drawn at the track's width and slid in by its
  share, so its rounded end stays round.
- **Titles:** "Ready when you are" (CH-11304) and "Your season starts with your
  first 18-hole round" (CH-11302) close without a full stop.
- **Press:** a hole on the review's scorecard deepens to the row press tint; the
  hole steps and the round card's discard key compress like every key
  (`data-ch-press`).
- **Notices on the green card** take the shared on-green tokens
  (`--ch-notice-on-green-ink`, `--ch-notice-on-green-body`) instead of copied
  literals; the notice draws no stripe now (shell).
- **Loading:** on the phone the list's and the review's skeletons hold the
  loaded geometry, measured at 390 (the intro, the round card at the idle card's
  height, season scoring, the tools, a month's rows; the review's hero, figures,
  strokes gained and scorecard), so nothing moves when the page lands. On the
  desktop the review's scorecard loads as a solid object; the rest are the
  Ledger's ruled blocks (shell).
- **Loading at every phone width:** the round card's place follows the idle card
  as the phone widens (it was 20px too tall at 430): it grows with its two rows
  of hole squares (two ninths of the card's width, `cqw`) and drops its foot's
  second line from a 359px card, as the card does. Measured in WebKit from 355
  to 445px; within 0.3px at 390 and 430.
- **Copy:** the page's own words take the curly apostrophe: the list, the
  review, setup and the round-review route ("Your rounds didn’t load", "Couldn’t
  check for a round in progress", "This round isn’t here", "The round’s date
  can’t be after today" and the rest). The catalog's quotes match, and the
  copy-apostrophes guard now covers Rounds, its screens and its round-review,
  round-new, round-continue and round-recover routes. Tee names and other words
  from the server are shown as sent.

## 2026-10-08 — Phone: Mobile clubhouse pass

The owner's phone review ("phone too cardy, too vibe coded"; the Coach Home
"Mobile clubhouse pass" board, round 3: "fewer containers, one feature card"),
carried to the Rounds list and a round's review. Phone only: each new rule sits
inside `@media (max-width: 820px)`.

- **Titles:** "Your rounds" and the review's course were 400-weight display
  titles on the phone. "Your rounds" is the Ledger's intro under the engraved
  double rule (the season line as the tracked brown eyebrow across the page, the
  title in the 600 sans at 31px, New round at the end of its line); the course
  on the review is the 600 sans.
- **List:** the round in progress (or the idle card) is the page's one green
  feature card and keeps its hole strip. Season scoring is a section flush on
  the parchment: the average, the three drawn figures between hairlines, the
  ribbon. "More unfinished rounds" and each month are sections under the double
  rule, and every round is a row between soft seams (the date as a plain lead,
  the course and tee, the to par over the score with no box) that deepens to the
  row press tint.
- **Review:** the hero is the one green feature card; the five figures sit
  between hairlines; strokes gained, the scorecard, the hole, the distribution
  and the notes are sections under the double rule; the recap is a passage under
  a rule with a green kicker, not a second green card.
- **Loading:** `RoundsSkeleton` and `RoundReviewSkeleton` draw a phone shape
  beside the desktop one; the stylesheet shows the one for the width, so the
  server needs none.

Kept as material: the hole strip, the scorecard's grid, the search, the grouping
control, the hole steps, the notices and the discard question. A notice inside
the green card (a round that would not finish) takes the card's ivory and coral
inks, so the now-flush shared notice stays legible on green. No motion, copy,
behaviour or catalog code changed.

## 2026-10-08 — Server-action imports follow the golf.ts split

```text
PR/commit:      #2176, agent/phase-7
Design package: none
Contract IDs:   none changed
Data impact:    none
Held items:     none
```

The screen's imports and test mocks now point at the files that own the server
actions (round-submit.ts, round-partial.ts and shot-actions.ts) after `golf.ts`,
`insights.ts` and `admin-data.ts` were split by domain. No behavior change.

## 2026-10-07 — A round row answers the press

On the desktop Ledger a round that opens its review now deepens to the row press
tint over the press beat, never a lift or a scale. CH-11601 says so and is
referenced in `RoundRow`, so it is no longer reserved.

## 2026-10-07 — The rounds list takes the page head; flush panes and rows

On desktop, the library opens on the framed page head and its sections sit on
the canvas:

- **Head:** "Since August 1" and the count are the eyebrow over "Your rounds"
  in the head's heavy sans. New round stays the page's one primary.
- **Panes:** the round in progress and season scoring are two panes under
  engraved rules, split by a soft column rule. The in-progress pane reads top
  down: the course, the hole strip (kept as a small scoreboard) and where the
  round stands, with Continue as the raised secondary key. Season scoring's
  label is the pane heading; the average sits beside the three drawn figures,
  then the ribbon.
- **Book:** more unfinished rounds and each month are sections with a heading
  over the rule, and every round is a row between soft seams. Hovering a round
  tints its row, as Home's leaderboard does, with no lift or ring (CH-11601).
- **Kept:** the hole strip's board, the date key, the Out, In and Tot scorecard
  and the to-par key keep their material.

The route skeleton (`RoundsSkeleton`) opts into the same head at the loaded
head's height. Its head measured 0px of shift in WebKit at 1440 and 1100, with
the skeleton's server markup swapped into the loaded preview (the preview has
no `?state=loading` for the library). Below a 860px page the panes stack. The
phone is unchanged: WebKit captures at 390 in seven states match the earlier
captures, apart from the dev server's Compiling badge in four of them.

## 2026-10-07 — A round’s holes slide as you step through them

On a round's review, the hole's shots slide 12px in the direction of travel,
whether you step with the arrows or pick a hole on the card (CH-11604). The
hole's head and the arrows stay put. With reduced motion it is instant.

## 2026-10-07 — Round detail takes the page head

On desktop, the round's green slab is now the framed page head:

- **Back link:** "Rounds" (or "Stats") is a quiet link above the double
  hairline.
- **Head:** the date and kind are the eyebrow, the course is in the head's
  heavy sans, and the tee line follows. The score sits on the right in forest
  ink: over par in amber, under par in red.
- **Ledger:** the five figures sit on the canvas between soft rules.
  Strokes gained, the scorecard, the hole, scoring distribution and the notes
  lose their cards and sit as sections under the engraved rule.
- **Kept:** the scorecard's nine tables and the green round recap keep their
  material.

The route skeleton (`RoundReviewSkeleton`) opts into the same head, and the
preview now has a `?state=loading` for it. Its head measured 0px of shift in
WebKit at 1440 and 1100. The phone is unchanged.

## 2026-10-07 — Unplayed holes legible

An in-progress round's unplayed hole numbers sat at 2.8:1 on the green. They now
use the muted on-green ink (4.5:1 or better); the recess, not a faded number,
says the hole is still to come.

## 2026-10-07 — Drawn season figures, ledger dates, serif titles

Owner: "random numbers with not great labeling mean little without visuals".
Season scoring's figures are now drawn, each against a reference that needs no
invented benchmark:

- **Best:** the season's rounds as dots on their scoring range, the best lit
  green and the average ticked. The caption says where the best came from.
- **Putts:** a bar against 36 (two putts on every green), with how far under or
  over it the season sits.
- **GIR:** the 18 greens of a round, with as many lit as the season's greens per
  18.

The figures sit beside the season average on desktop and below it on the phone.
Season scoring loses its double gilt frame, which read as a card inside a card,
and becomes one reading sheet.

Other changes:

- **Month rows:** each starts with an ivory date key, its day numeral in the
  field green, not a green block. Numerals stay in the sans, because the display
  serif's 1 has no flag.
- **Titles:** "Your rounds", the month headings and the round recap title are
  set in the display serif.
- **In-progress card:** solid field green with no large gradient (banding). Its
  hole strip takes the scoreboard finishes, unplayed holes show their faint hole
  numbers, and the strip is centred in the card.

## 2026-10-06 — Smooth scroll and materials

New round resets the canvas to the top instantly through the canvas scroller, so
the shared wheel easing never animates the step change.

## 2026-10-06 — Course-picker loading accessibility

Course and tee loading containers now use status semantics, making their
accessible labels valid while the popup is waiting. Catalog IDs and course
selection behavior are unchanged. See [popup evidence](../../POPUP_AUDIT.md).

<!-- clubhouse:release-audit:start -->

## 2026-10-06 — Whole-app release audit

Reconciled page purpose, design acceptance, contract status, wiring and
verification against the current flagged implementation. Indexed 7 mapped
actions and 25 overlay/control call sites in the [all-page
audit](../../ALL_PAGE_AUDIT.md#p011-rounds). Approved handoffs and contract
IDs are preserved; runtime gaps stay explicit.
<!-- clubhouse:release-audit:end -->

Newest first. Earlier history is in `docs/clubhouse/PROGRESS.md` (verification
log and decisions). The first Rounds work is dated 2026-09-30: the tracker and
the history show none earlier.

## 2026-10-02 — Keep narrow round setup readable

```text
PR/commit:      codex/clubhouse-design-fidelity (working tree after c1e81e0fe)
Design package: existing P011 phone setup and shared 820px phone boundary
Contract IDs:   none changed
Actions:        unchanged course selection and round start
Data impact:    none; setup CSS only
Held items:     physical Safari keyboard and routed account verification
```

At 320px, Browse courses extended 51px beyond its clipped course card. The
setup container could not apply its own padding through a self-container
query, so desktop gutters remained on phones. Phone padding now uses the
shared viewport boundary. The empty course card gives its text a full column
and Browse a separate 44px row; round-type controls fit without smaller type.
The dock summary can wrap rather than truncate the selected course.

WebKit geometry and actual hit checks passed at 320, 375, 390, 430 and 820px.
At 390px, Browse, Finley GC and Blue tee selection enabled Start and retained
the full 18-hole, par-72 summary. See VERIFY.md for dimensions and limits.

## 2026-10-02 — Shiro fix: a stable, finger-sized continue action

```text
PR/commit:      codex/clubhouse-design-fidelity (working tree after cca081cff)
Design package: Coach home dashboard redesign (6), mobile boards
Contract IDs:   none changed
Actions:        none
Data impact:    none; CSS only
Held items:     physical iPhone Safari verification
```

Shiro fix mode confirmed that the Continue action was only 38px tall in WebKit
at 375 and 390px, with no expanded touch target. The phone action and discard
control are now 44px tall; the footer can move its action group to another line
instead of squeezing progress text. A long last-round label can wrap within the
card. Layered card materials and the hole strip remain intact.

WebKit at 375/390/430px measured 44px action heights and no horizontal document
overflow. A controlled +12 through 17 label stayed on one line. The populated
preview captures are logged below; no real round was changed.

## 2026-10-01 — Give the phone library room to read

```text
PR/commit:      codex/clubhouse-design-fidelity (working tree)
Design package: Coach home dashboard redesign (6), mobile boards
Contract IDs:   none changed
Actions:        none
Data impact:    none; layout and material only
Held items:     real iPhone Safari device verification
```

The phone library uses 16px gaps between sections. Posted-round course names
wrap at 16px instead of forcing one-line ellipsis. Season scoring and
posted-round cards use the shared layered sheet surface, preserving the score
tiles, season frame and live round data.

Verified in Playwright WebKit with iPhone 13 emulation at 375, 390 and 430px:
the document stays within the viewport and Instrument Sans is loaded. Before and
after captures at 390px are logged in VERIFY.md. This verifies layout, not
physical iPhone scrolling performance or live database data.

## 2026-10-01 — Aesthetic audit: the shot screen uses the phone's gutters

```text
PR/commit:      agent/swap-audit (#2111): cee8548a0
Design package: none (owner's aesthetic audit guide, 2026-10-01)
Contract IDs:   none new
Actions:        none
Data impact:    none; visual only
Held items:     none
```

- **Issue.** The phone rule `.ch-rt { padding: 4px 12px 0 }` sat inside
  `@container chrt`, and `.ch-rt` was itself the `chrt` container; a container
  query never matches its own container, so the rule never applied. On a 390px
  phone the shot screen kept the desktop's 28px gutters: cards 335px wide
  instead of 366px, and the hole strip (margin -12px, drawn to bleed to the
  edges) stopped 16px short of both with square corners. The board is
  `design/handoff/rounds-track.css`, where the container is outside `.rt`.
- **Fix.** `RoundTracking.tsx` wraps the screen in `.ch-rt-q`;
  `rounds-track.css` gives the container to the wrapper. The desktop is
  unchanged (padding 28px, checked at 1440).
- **Not done, on purpose.** The strip's 34px chips (the board; `MOBILE.md` says
  44px) and the map's 7.5px shot numbers: Q-151.
- **Contrast pass (`d4367ee`).** The strip's par and Thru labels were ivory at
  0.5 and 0.55 (3.8:1, 4.3:1): 0.66 now. A result option's note and the rare
  options were `#8a857a` on the well, 3.2:1: tertiary ink, 4.7:1.
- **Verification.** Before and after at 375, 390, 430 and 1440 for the approach
  step, the putt step and the submit-failed overlay. `round-tracking`,
  `round-save-status` and `round-entry` tests, 68 of 68. Not tested: landscape
  and short heights, repeated taps, save, exit, reload and resume against real
  data (this is a stylesheet and wrapper change, not a persistence one), a real
  iPhone.

## 2026-10-01 — The round's save line tells the truth

Owner rule 3 (2026-10-01): "Saved" only once the server confirms; before that,
say where the shot is. Advancing optimistically is allowed only if it is
provably safe on the current engine; if it is not, change the status and
report why.

```text
PR/commit:      agent/swap-audit: 6ca1cf635
Catalog:        CH-11901 (its words); no new codes
Contract IDs:   none changed
Data impact:    none: no write, no read, no migration
Held items:     none
```

- **A conflict was shown as "Round saved".** When the server answered a save
  with `conflict`, both engines called `handleRoundSyncConflict` without
  waiting and returned, so the hook read the save as acknowledged: "Round
  saved", the fingerprint stored, and the comment's "next tick re-sends"
  never happened. A conflict is now held: healed (the mismatch was this
  device's own unreadable write, the token is adopted) is a `conflict` hold,
  re-sent on `online` or after 20 s; otherwise the round is blocked until a
  reload and the line says "Saved on this phone". `use-continue-round-
  session.ts` and `use-new-round-session.ts`, with a test in each
  preservation file that fails on the old code.
- **"Round saved" outlived the shot after it.** A shot recorded within 2 s of
  an acknowledgement kept "Round saved" up (the auto-save effect's cleanup
  drops the timer that would clear it) until that shot's own save began, 5 to
  15 s later. An acknowledgement of an older snapshot that arrives after a
  newer shot did the same. Both now leave "saved": the effect takes it down
  as soon as the shots on screen differ from the last acknowledged ones, and
  an acknowledgement says "saved" only if it covers what is on screen.
- **A word for the wait.** Between a shot and its save the line said nothing.
  It now says "Saved on this phone · syncing" when the engine's device copy of
  that shot landed (`emergencySave` returns whether `localStorage` took it;
  `handleSaveShot` now returns that and the shot hook keeps it as
  `autoSaveSyncing`). When the device copy failed the line says nothing:
  there is no true word for it, and the engine's one-time "degraded" notice
  already tells the player. A hole-out keeps its own line ("Saving hole N")
  and clears nothing it did not set; leaving a hole clears the flag, because
  a hole is left only after the server confirmed it.
- **Review fixes (same day).** An independent read of the change found
  four gaps, now closed. (1) "syncing" stayed up after a shot taken back by
  Undo before its save: when no shots are waiting for the server (none, or
  every one acknowledged) the device-only claims clear (`AUTO_SAVE_SETTLED`;
  a save in flight is left alone). (2) A hole-out whose device copy failed
  left an earlier claim standing; it now takes it down. (3) A save held as
  `busy` or `conflict` is a server answer that can repeat for a cause a
  resend never clears (a hole the server keeps refusing): each repeat now
  waits twice as long, from 20 s to 5 min, instead of a request every 20 s
  for the rest of the round; `offline` and `queued` stay flat (neither calls
  the server) and a success starts over. (4) The conflict branch awaited
  the staleness check inside the save lock with no timeout: it is now
  bounded at 8 s (`settleWithin`), and a check still running is held as
  `conflict` (the resend finds the round blocked if the check ends that
  way). Not changed: the hold loop that predates this entry on the
  completed-hole path is backed off, not capped, because capping an
  `offline` hold would break WKWebView recovery.
- **The journey, as a test.** `use-continue-round-session.preservation.test`:
  a shot entered (device copy lands), the connection cut (the save is held,
  nothing is sent), the screen left, reopened (the device copy is offered,
  restoring it gives two shots, not three), reconnected: the server is
  written once with each shot once, and only its answer retires the device
  copy; a retry of the same save sends the same snapshot, never a longer one.
  What this proves is the client side. That the server then holds the shot
  exactly once rests on the save being a whole-snapshot replace under the
  `expected_updated_at` lock (migration `20260820170000`), which is read, not
  re-proved here (no pgTAP was run for it).
- **Complete hole still waits for the server, and now with the blockers
  named.** Submit and finalise were already strictly server-confirmed
  (`completedRoundId` is set only after `result.success`; Save for later and
  Discard navigate only after success). Advancing at the tap stays off; see
  "Why Complete hole still waits" below. The new evidence: a retry of hole N
  replays the snapshot captured at the tap under the live lock token
  (`persistCompletedHole` sends `{ ...saveData, expectedUpdatedAt }`), and
  every save replaces the round with its snapshot, so a retry after the
  player has recorded shots on hole N+1 would erase them; no client
  timeout exists, so a hung request keeps "Saving hole N" up; and nothing
  retries a hole advanced past while unsynced (the periodic save is triggered
  by the current hole's shots alone, though its payload is the whole round).

## 2026-10-01 — Owner rules: page states, races, Back

Owner, 2026-10-01 (the page-state rules in
`docs/clubhouse/PAGE_PERFORMANCE.md`): never "0 strokes", "No rounds yet"
or "no insights" while loading or after a failed read; a failed refresh
keeps the old data and says it may be out of date; a late answer never wins;
returning from a detail view restores the list.

```text
PR/commit:      agent/swap-audit: 10e8e8568 (false empties, the review,
                the continue loader), 201d35d84 (the library keeps its
                last good page), 571aea89c (setup's tee race), 6307c072a
                (Back from a round)
Catalog:        CH-11213 to CH-11217, CH-11315, CH-11410, CH-11912 (new);
                the Try again notices now say "Trying again" while they run
Contract IDs:   110633 to 110636, 110416, and those of CH-11213, CH-11410
                and CH-11912 (registry sync)
Data impact:    none: no write, no new read, no cache
Held items:     none
```

- **The posted-rounds read fails (library).** The idle card said "No rounds
  posted yet" beside the error notice. It now says nothing about the last
  round (`listFailed`), and the page shows only CH-11201.
- **The holes read fails (library).** The card read "Set up, no holes scored
  yet" (the more-unfinished list "not started"); the loader only logged it,
  under a comment that said otherwise. It now carries `holesError`: the strip
  draws numbers only (nothing scored, no hole ringed), the score-through
  line is dropped, and CH-11214 says the scores didn't load, with Try again.
  Continue still goes to the round's saved current hole.
- **A finished round while the posted rounds are unread.** The "already
  submitted" set was empty after a failed list read, so a finished card
  offered Submit round. It is now not ready to submit (`submitUnchecked`):
  CH-11215 says so, and the card is Continue, whose finish sheet submits.
  The more-unfinished list says "couldn't check if posted".
- **A Try again that lands.** `useState(data.unfinished.list)` seeded the
  cards once, so a retry that read the card still showed "No round in
  progress" (or the first-run page). The cards now come from the page's
  data; only a local discard is state, as ids to leave out. No other screen
  in the Rounds folders seeds state from props.
- **Rounds with no score.** `toLibraryRound` drops a completed round with no
  total at all (no `total_score`, no nines). No total is never countable, so
  no count or average understated, but the round was hidden. The loader now
  counts them (`rounds.unscored`) and the page says "N posted rounds have no
  score recorded, so they aren't listed here" (CH-11315). A page whose only
  rounds are unscored is not "No rounds yet".
- **The review's hero.** `total_score ?? 0` could show "0 strokes". A
  missing total is now an em dash and "Score not recorded". The tee read, a
  coach's read of the player's name and the team read each carry a flag: a
  missing yardage or name is said (CH-11216), a missing baseline is said in
  the strokes gained card (CH-11217), each with Try again. A coach no longer
  sees an invented "Player", whether the name read failed or found no player
  row (both are CH-11216); Back to Stats and "The player's notes" follow a
  coach flag, not the name. A player with no team gets no baseline notice
  (that claims none). The review's hole re-picks the first hole over par
  when a card arrives after a retry.
- **The continue loader** (`rounds/continue/[id]/page.tsx`, shared with
  Fairway; only its failed-read handling changed). A failed round read was
  `notFound()`; it now throws, so the route boundary offers its retry. A
  failed course-hole read threw nothing and opened every hole the draft did
  not cover at 0 yards (a 1-yard tee shot to the state machine); it now
  throws when any hole would open with no yardage. A draft that carries
  every yardage opens as it would have (the draft wins over the course
  either way). Unchanged: the holes, shots and detail reads, and `notFound`
  for a round that is not there. This is a page file, not `'use server'`; it
  still needs the lead's `next build` with the stack.
- **Retry controls.** Every retry on the library and the review is
  `useRefresh` plus `InlineNotice retrying`: it says "Trying again" and
  ignores a second tap.
- **A failed refresh keeps the old page (rule 2).** The library draws the
  last library that landed in full for the same player (`useLastGood`, key:
  the player) while a refresh fails, with CH-11213 and Try again. A first
  load that fails, and another player's, are the error as before. A Try
  again in flight keeps the page, marks it busy and says "Updating"
  (CH-11410). Differs from the brief: "good" means the posted rounds and the
  in-progress read both landed, so a card the player was looking at is not
  replaced by an error either.
- **Setup's tee race (rule 4).** `RoundSetup.loadHoles` took the last answer
  to arrive. Each choice now takes a number and an answer that is not the
  latest is dropped, as `CoursePicker`'s read does; a course typed in by
  hand counts as the latest choice too, so a late tee read cannot overwrite
  the holes the player entered. (The file is `setup/RoundSetup.tsx`, not
  `track/RoundSetup.tsx`.) `rounds-setup-race.test` holds the reads open and
  answers them out of order; it fails without the guard.
- **Back from a round (rule 8).** Differs from the brief (the address,
  `replaceState` and a scroll kept in `sessionStorage`): the shell has since
  gained the shared pieces (`useChSessionState`, and RouteFrame restoring
  the scroll on Back or Forward), so the library uses them instead of a
  second mechanism. Its search and grouping are session state per route and
  team; its place in the list is RouteFrame's. The review's Back was a push,
  which RouteFrame treats as a new page (top of the list). A review opened
  from the library now notes it on a plain left click only
  (`screens/rounds/return-state.ts`, this tab) and its Back, on a plain click
  or the phone bar, steps back in history when the tab has an entry behind
  it (`history.length` above 1; CH-11912). Opened any other way, in a tab
  with no history (a copied note), or by a coach, it goes to the address as
  before. The note is not checked against which page is behind: after
  leaving a review another way and reopening that round, Back steps to the
  real previous page, which is what Back means.
- **Left, and why.**
  - The review's route throws the whole page when the team-membership read
    fails (`routes/team.ts`, the lead's), while the library catches it. The
    review keeps that: failing to know who is looking is an error, and the
    route boundary offers the retry.
  - A coach's Back from the review still pushes the player's rounds on
    Stats; that list's filters are Stats'.
  - The Back step and the scroll restore were observed in jsdom with the
    real RouteFrame (`rounds-return-state.test`), not in a browser. The
    review's Back going through `router.back()` into RouteFrame's popstate
    window is the part to look at on a phone and on the desktop.

## 2026-10-01 — Page performance: the library and the review, and why the next hole still waits

Owner, 2026-10-01: "Everything page transition and load needs to be extremely
smooth and accurate." Standard: `docs/clubhouse/PAGE_PERFORMANCE.md`.

```text
PR/commit:      agent/swap-audit: b4842d7de (reads), 8e305ae26 (the saving
                note); the round engines are not changed
Design package: none
Contract IDs:   none changed
Data impact:    none; no write, no cache, no new read
Held items:     none
```

- **Library.** Four serial waves became two (`rounds-reads.test`): the team's
  time zone, the posted rounds and the in-progress card start together, then
  that card's holes. The route resolves the team beside them, not before. The
  completed list reaches the cards only for the "already submitted" check.
- **Review.** The round is read while the team resolves (the team says who is
  looking, not which round), then its holes, shots, tee and team in one wave.
  A viewer with no standing is still "this round isn't here"; the round read
  that ran beside it is that viewer's own RLS read and is dropped unseen.
- **Saving a hole.** "Saving hole N" holds its row from the tap (so nothing
  moves) and shows only once the wait passes a base beat (260ms): a hole that
  saves at once no longer flashes a status.
- **Switching and prefetching.** The library's search and grouping are on the
  page's own data, so they are instant; every row and card is a `<Link>`, so
  Next prefetches the review and the continue page up to their `loading.tsx`.
  No fuller prefetch or cache: a review changes when a round is edited, and the
  edit has no way to clear a client cache.
- **Not changed: the continue page** (`rounds/continue/[id]/page.tsx`, shared
  with Fairway) reads the round, then its holes, shots and course yardages,
  then the putt and approach details, which need the shot ids. Embedding the
  details in the shots read would save one wave, but it is the loader both UIs
  trust with a saved scorecard, so it is left for its own change.

### Why "Complete hole" still waits for the server

Question: can the engine move on to the next hole while the hole's save
finishes in the background? Decision: not without a change to both engines and
the shared shot hook that cannot be shown safe from the existing tests, so it
is not done. The evidence, in the order a change would meet it:

- **What is already safe.** The hole is on the device before any network call
  (`emergencySave` in `handleHoleComplete`), and every save sends the whole
  scorecard (`buildPartialRoundData` reads `completedHoleStatsRef`), so a slow
  or failed save of hole N is carried by the next successful one. By the code
  (not exercised on a device), the next hole's pill is already enabled while
  hole N saves (the engine sets the score locally at the tap and `TrackStrip`
  allows the frontier), so a player is not locked in; the engine's own
  comments (B8) expect it.
- **The engine says to wait.** `persistCompletedHole` opens with "keep the
  player on the hole until this complete snapshot is acknowledged", and
  `handleHoleComplete` moves on (`setCurrentHoleIndex`, the finish prompt,
  `activeProgressHoleRef`, clearing `pendingHoleCheckpointRef`) only after the
  acknowledgement, in `use-new-round-session.ts` and `use-continue-round-
  session.ts`. Moving on at the tap would have to replace each of those.
- **A save in flight is not single-flight.** Between attempts the checkpoint
  loop drops `serverSaveInProgressRef` and sleeps 250ms times the attempt. A
  shot on hole N+1 in that gap sends its own save. With the round's id that is
  safe (every attempt reads the live lock token), but a round that was started
  offline has no id until a save lands, and two saves then both create:
  a second in-progress round. An advance needs one queue across holes, which
  does not exist.
- **A retry replays a stale snapshot.** `persistCompletedHole` sends the
  `saveData` captured at the tap with only the lock token refreshed, on every
  attempt (up to three, with the quiet loop around it). Each save replaces the
  round's shots and holes with its snapshot, so once a player advances, a retry
  of hole N would erase whatever they recorded on hole N+1 since. Every
  attempt would have to rebuild its payload from the live refs.
- **No timeout, no per-hole sync state.** No client timeout or abort exists in
  either engine or the shot hook: a hung request keeps "Saving hole N" up. A
  thrown error is retried by resending the same snapshot; a write whose
  answer was lost is reconciled through the conflict path (the lock token no
  longer matches, B9 adopts the server's and sends again), which is sound only
  for a snapshot that is the latest. The periodic save is triggered by the
  current hole's shots alone (`useShotStateMachine` compares only that hole's
  fingerprint), so a hole advanced past while unsynced needs a set of unsynced
  holes, a flush on `online` and a timer, and a status derived from that set.
- **One slot for the failure.** `pendingHoleCheckpointRef` holds one hole's
  retry intent and the next `handleHoleComplete` overwrites it. A `hole_invalid`
  answer (a hole the server refuses, which no retry fixes) must send the player
  back to hole N; Retry lives in hole N's review, and the shot hook clears the
  failed status when the hole changes, so a failure on an earlier hole would be
  seen only as a banner.
- **The finish prompt.** `allHolesScored` is decided after the acknowledgement;
  advancing early must still hold the finish and the submit until every hole is
  acknowledged, or the submit races a checkpoint still in flight for the
  round's lock token.
- **Tests.** The guard order is pinned by source-text tests
  (`new-round-client.discard-race.test`, `continue-round-client.*`) and by the
  35 preservation tests; a change needs its own fault-injection tests (offline
  start, slow save, `hole_invalid`, discard during a save, restore) in both
  engines and in Fairway, which shares them.
- **What it would take.** A per-round save queue (one in flight, the next
  coalesced), a list of unsynced holes in place of the single slot, a status
  that says "on this device" for hole N while the player is on hole N+1 (the
  CH-11901 chip already separates device from saved), a failure path that
  returns to the hole, and the finish held until the queue drains. That is a
  design of its own, with the owner's rule 12 (active rounds are durable) as
  its test; it is recommended after the owner has seen the numbers on a phone.

## 2026-10-01 — Round recovery (swap audit F-02)

```text
PR/commit:      agent/swap-audit
Catalog:        CH-11017 to CH-11019, CH-11212, CH-11314, CH-11408,
                CH-11409, CH-11520, CH-11911
Contract IDs:   110209, 110210, 110415, 110629 to 110632, 110712, 111120
Data impact:    none (reads and writes what Fairway's recovery does)
```

- **Issue.** With the flag on, a player could not reach round recovery. The
  engines sent a submit that could not reach the server to `/rounds`, and the
  Library reads server rounds only, so a round saved only on the device was
  invisible and could not be restored.
- **Fix.** `/rounds/recover` is rebuilt for a player. The screen lists the
  rounds the device holds for the signed-in player (recovery journal,
  failed-submit queue, the old database, the emergency save; one card per
  round) and offers Restore (or Submit round for a finished round whose
  submit failed), Retry sync for queue rounds, and Discard after a question.
  The engines' `recover` route is that screen, with `?from=submit`. Restore is
  Fairway's recovery, ported; Discard is the round engines' discard (the
  Library's for a round the server holds), then every device copy and the
  discard mark the round screens and the queue's drain honour. A queued round
  with no round id leaves the player's current new-round draft alone.
- **Changed with it.** CH-11905's toast no longer says to continue from
  Rounds. The rebuilt-routes test now expects recover to be rebuilt.
- **Checked.** rounds-recover.test (the screen, the address, the page, the
  phone) and rounds-recover-ports.test (the scan for the signed-in player
  only, Restore, Retry sync, Discard). Not run: a phone, or a real failed
  submit.

## 2026-09-30 — Strokes gained on a round's review (CH-11313)

```text
PR/commit:      agent/clubhouse
Contract IDs:   none new (catalog CH-11313)
Data impact:    none (reads columns that already exist; no migration)
```

- **Issue.** The review showed the score, the card and the shots but not the
  round's strokes gained, though `golf_rounds` stores the total and the four
  legs.
- **Fix.** The loader selects `strokes_gained_total`, `_tee`, `_approach`,
  `_around_green` and `_putting`, and the player's team gender (a `teamId` on
  the player viewer, the coach's own team) for the baseline. A Strokes gained
  card sits under the figures, on desktop and the phone: the total, then a bar
  per leg either side of zero on a scale the round sets (its largest value
  rounded up, at least 1), "vs Tour" (the women's Tour baseline for a women's
  team), "9 holes" first for a nine-hole round. A round with none reads one
  line, "No strokes gained for this round. It is worked out from shots tracked
  hole by hole." (CH-11313); a leg with no value is a dash.
- **Checked.** strokes-gained.test (the loader only shapes strokes gained when
  the select names the columns, the card, the no-strokes-gained line, the
  women's and nine-hole labels); mutations caught: a dropped column, the card
  always hidden.

## 2026-09-30 — Round entry over the round engine: /rounds/new and /rounds/continue/[id]

```text
PR/commit:      agent/clubhouse (draft #2102, stacked on #2104)
Contract IDs:   110114 and 111404 (hand); CH-11014 to CH-11016, CH-11407, CH-11518, CH-11519 and CH-11903 to CH-11910 (catalog, 14 minted)
Actions:        5 new (ACT-P011-START, -SAVE-FOR-LATER, -DISCARD-ROUND, -SAVE-AS-PRACTICE, -SUBMIT-ROUND)
Data impact:    none (no migration; the engine and the server actions it calls are not edited)
Held items:     none
```

- **Issue.** Setup, the shot screen and the round-entry states were built, and
  #2104 moved the round engines into `src/lib/golf/round-session/`, but no route
  drew them. A Clubhouse player opening `/rounds/new` or `/rounds/continue/[id]`
  got the shell's not-rebuilt notice, and the library, Home and CoachHelm drew
  no New round, Start a round, Continue or Post a round control, so a player
  with the flag on could not start or continue a round.
- **Fix.** Both pages branch on `isClubhouseFor('player')` and render
  `ClubhouseNewRoundRoute` and `ClubhouseContinueRoundRoute`; flag off (and a
  coach on `/rounds/new`) keeps Fairway's client exactly as it was. Both
  addresses are in the shell's rebuilt list for a player (`nav.ts`), so every
  link to them is drawn. `NewRound` runs `useNewRoundSession` and
  `ContinueRound` runs `useContinueRoundSession`; `RoundRuntime` draws the shot
  screen and every sheet from one normalised session. Every engine outcome has a
  Clubhouse state: a saved round to recover (CH-11512, Restore guarded against a
  second tap), a round already in progress (CH-11514, resume or start a new one
  after a discard question), a qualifier round in progress that opens
  (CH-11907), a start refused (CH-11007 Retry, CH-11014 none, CH-11015 Retry,
  CH-11016 Start anyway), offline refusals (CH-1903), a reload (CH-11902),
  engine notices (CH-11903 to CH-11908), a closed qualifier that opens Save as
  practice (CH-11516, CH-11012) and its Discard (CH-11517, CH-11011), Save for
  later and Discard failures with Retry (CH-11010, CH-11006), a slow submit
  (CH-11909), a finish sheet closed with every hole in (CH-11910), the qualifier
  round number question (CH-11518, CH-11519) and the route skeleton (CH-11407).
  A Retry runs the action against the round as it is now and never twice
  (111404): each action holds its own in-flight ref and reads the latest engine
  through a ref, because the toast's closure carries an older render.
  `useAction` gained `quiet`, `retry` and `offline`, and its gate against a
  second run is a ref instead of the render's `pending` (shared by every
  Clubhouse screen); `SubmitOverlay` gained Go back and the slow line.
- **Checked.** `typecheck:fast` exit 0; `eslint` on the changed files exit 0;
  `vitest run src/clubhouse` 28 files, 1413 of 1413; the engine and page tests
  (35 files, 436) exit 0, unedited; `next build --webpack` exit 0 (9 GB heap);
  `clubhouse:check` exit 0 after `registry.mjs sync`; `docs:check` exit 0 after
  `knowledge:doc-inventory`. New tests drive the real engines over mocked server
  actions (`round-entry-wiring`, `round-entry-continue`) and the pages with the
  flag on and off (`round-entry-routes`); 19 mutations of the wiring were run
  (18 killed, one equivalent after a refactor), and the test written to kill one
  of them found a real bug (a lost post timer). Existing Rounds, CoachHelm, Home
  and review tests were updated in place for the now-drawn links, not weakened.
  **Not checked:** a browser on the routed addresses (the flag was not flipped),
  a live account, an iPhone, `/rounds/recover` (still Fairway's, nothing links
  to it).

## 2026-09-30 — Phone tap targets

```text
PR/commit:      agent/clubhouse
Data impact:    none
```

- **Issue.** The review's previous and next hole (30px), the unfinished round's
  discard (38px), the shot screen's pills (36px) and setup's Back (34px) were
  under 44pt on the phone.
- **Fix.** Each gets an invisible 44 x 44 hit area without changing how it is
  drawn (`rounds.css`, `rounds-track.css`, `rounds-setup.css`). Left as they
  are: the nine-across hole strip and the scorecard's hole cells (nine 44pt
  columns do not fit in 390pt, and the whole column picks the hole).
- **Checked.** scripts/clubhouse/native.mjs at 390 and 430px.

## 2026-09-30 — Round entry states (Q-81); A tap on a score picks the hole (Clickables gap 7); Cancel on Add a course (Clickables gap 24)

```text
PR/commit:      agent/clubhouse
Data impact:    none
```

### Round entry states (Q-81)

- **Issue.** The live round flow has four states the /rounds boards do not draw:
  a saved round to recover, a round already in progress on the same course and
  day, a reload, and a qualifier that closed during the round.
- **Fix.** RecoveryDialog, InProgressConflictDialog, ReloadBanner and
  RoundErrorBanner, SaveAsPracticeSheet and the Save for later / Discard failure
  toasts, as Clubhouse components; Discard now asks first everywhere. Engine
  wiring waits on #2104 (stacked, Q-81). Preview /clubhouse-preview/entry.
- **Checked.** round-entry 38/38, 57 mutations killed. Not viewed in a browser.

### A tap on a score picks the hole (Clickables gap 7)

- **Issue.** In the round review's card only the hole number picked a hole.
- **Fix.** A tap on a score picks that hole too, with the select haptic (pointer
  only; the hole number stays the keyboard control; Tot picks nothing).
- **Checked.** round-review 31/31, the mutation caught.

### Cancel on Add a course (Clickables gap 24)

- **Issue.** Closing Add a course dropped the coach out of the course picker.
- **Fix.** Cancel goes back to the picker it was opened from, as on the board
  (preview only until #2104).
- **Checked.** round-setup 20/20, the mutation caught.

## 2026-09-30 — V2 page docs and the contract pass (docs only)

```text
Design package: design/handoff/ v2 (Player - Rounds.html, Player - Rounds - Mobile.html, rounds-*.jsx)
PR/commit:      agent/clubhouse (uncommitted at the time of writing)
Contract IDs:   110101 to 112401 (44 hand contracts, all reserved), on top of the 74 catalog contracts already minted
Actions:        2 (ACT-P011-DISCARD, ACT-P011-TRY-AGAIN)
Data impact:    none
Held items:     none
```

### Changed (2026-09-30 V2 page docs)

- The six page docs, the manifest (`status.docs` current, `status.contract`
  complete, the two actions) and a sidecar of the 44 hand contracts for the
  registry: the core views (library, review, setup, shot screen), controls that
  are not drawn until their screen is rebuilt, the unfinished and not-counted
  rounds, search and grouping, the first-run rule, the setup's blocker and start
  form, the nine-hole rule, the distance unit, the qualifier rules, partial
  reads, offline, who may open what, the discard's server gate, success, state
  kept on failure, Retry and Try again, totals and the review's honesty, a stale
  tee read, axe, the focusable scorecard, the phone builds, Esc, the read order,
  logging and the tests. 32 name a covering test, 12 have none (VERIFY.md lists
  them).
- The docs say plainly which surfaces are routed (the library and the review)
  and which are preview only (setup and the shot screen, behind `ChSetupPorts`
  and the round screen's props until the engine move).

### Found, not fixed

- With the flag on, `/rounds/new` and `/rounds/continue/[id]` show the shell's
  not-rebuilt notice, so a Clubhouse player cannot start or continue a round
  until the engine move (the library correctly draws no control that leads
  there).
- `rounds/[id]/loading.tsx` is Fairway's, so a Clubhouse review loads under the
  Fairway skeleton (110206); both `error.tsx` files are the shared Fairway
  boundary.
- A failed team-membership read fails the whole library although only "today"
  depends on the team.
- The library loader's four reads run one after the other by design (the
  ready-to-submit check needs the posted list); the in-progress query itself
  does not, so it could start earlier. Noted, not changed.
- Stale prose: the catalog's intro and CH-11801 say the review is not rebuilt;
  CH-11705's test column says `preview` although the tracking test names it; the
  checklist covers only the library; PROGRESS's "not yet: linking a coach's
  Stats rounds to the review" is done (`StatsPlayer.tsx` links it);
  `phone/rounds.md` says the card and the season stack below 640px, the CSS
  stacks them below 860px; `ROUNDS_PLAN.md` promises a coach's note, "mark as
  viewed" and a hole handicap that Q-72f and Q-72g left out.
- The tracker's row counts for the shot screen (33) and setup (20) do not match
  the catalog diffs (32 and 17).

### Why (2026-09-30 V2 page docs)

- The contract pass (D-62, D-69): every category answered, every behaviour
  named, and every claim checked against the code (the review's access rules,
  what `rebuiltHref` hides, what the loaders read and in which order).

### Verification (2026-09-30 V2 page docs)

- See VERIFY.md.

## 2026-09-30 — Accessibility: axe now scans Rounds (3443098a0)

```text
Design package: design/handoff/ v2 (no board state)
PR/commit:      agent/clubhouse (3443098a0)
Contract IDs:   none new (111809, 111810 and 111811 are recorded in the contract pass above)
Actions:        none
Data impact:    none
Held items:     none
```

### Added (2026-09-30)

- 12 Rounds preview pages in `CH_A11Y_PAGES` (the library: default, empty,
  failed; the review: default, coach, no shots; setup: default, failed courses;
  tracking: default, putt, holed, card), scanned at 1280 and 390.

### Fixed (found by axe; the existing tests still pass, 171 of 171 across Hub, the review, the library and tracking)

- **The season and review figures put a sub-line `<span>` straight in a
  `<dl>`.** The sub-line is now a second `<dd>`, styled `dd + dd`.
- **The review's hit and miss marks were `<i aria-label>` with no role.** They
  are now `role="img"` and read as Hit, Missed or Not applicable.
- **The tracking scorecard scrolls sideways with no way to focus it.** It is now
  a focusable, labelled region (`role="region"`, `tabIndex 0`, "Scorecard").

### Why (2026-09-30)

- `clubhouse:a11y` had never scanned Team Hub, Rounds or Classes; the first run
  failed 13 of the 26 new entries.

### Verification (2026-09-30)

- Re-run: hub and rounds 40 of 40 clean at 1280 and 390 (`PROGRESS.md`).

## 2026-09-30 — A new round's setup, preview only (28737755c, fe3c388e8)

```text
Design package: design/handoff/ v2 (rounds-flow.jsx Setup, Picker, HoleConfig; rounds-course.jsx AddCourse)
PR/commit:      agent/clubhouse (28737755c, fe3c388e8)
Contract IDs:   none by hand (catalog rows below; Bridge IDs 110xxx to 111xxx already minted)
Actions:        none registered (preview only)
Data impact:    none
Held items:     none
```

### Added (2026-09-30, 2)

- `screens/rounds/setup/`: the green band with its steps, the course card, the
  open qualifier, Round details (type, date, holes, which qualifier round), the
  scorecard (par and yardage per hole, edited holes marked, Front 9 or Back 9),
  the dock with the one thing stopping Start, the course picker (recent, team
  and library courses, search, tees with length, par, rating and slope, draft
  tees shown but not playable) and Add a course (four steps; the round's own
  course, saved and offered to the library when asked, Q-72h).
- It draws against a neutral contract (`ChSetupPorts`: list courses, list tees,
  a tee's holes, start), so the engine move (ROUNDS_PLAN step 4) only supplies
  the ports. Every read has its loading and didn't-load state with Try again;
  Start goes through `useAction` with its follow-up inside, so Retry opens the
  round.
- 17 catalog rows: CH-11007, CH-11107 to CH-11109, CH-11208 to CH-11211,
  CH-11309 to CH-11312, CH-11403 to CH-11405, CH-11510, CH-11511.
  `round-setup.test.tsx` (19 cases, mutation-checked: 17 of 18 killed; the
  survivor is equivalent). Preview `/clubhouse-preview/setup`.

### Fixed (2026-09-30)

- **The setup's class prefix was `ch-rs`, which is Roster's, and hid the page on
  the phone.** It is now `ch-rsu`.
- A new round hides the phone tab bar (`usePhoneTabsHidden`); the date and holes
  fields stack at 390.

### Why (2026-09-30, 2)

- Q-72h: a player's "Add a course" is the round's own course (the library's add
  is coach only), saved by default, and the picker's tee cards draw one length
  bar, not per-hole bars.

### Verification (2026-09-30, 2)

- See VERIFY.md (real Chromium at 390: the dock read "Finley GC · Blue · 18
  holes · Par 72"; axe at 1280 and 390).

## 2026-09-30 — The shot screen, preview only (db0cc6c9c)

```text
Design package: design/handoff/ v2 (rounds-track.jsx, rounds-track.css; the Mobile board's tracking frames)
PR/commit:      agent/clubhouse (db0cc6c9c)
Contract IDs:   none by hand (catalog rows below)
Actions:        none registered (preview only)
Data impact:    none
Held items:     none
```

### Added (2026-09-30, 3)

- `screens/rounds/track/`: the hole strip, the hole hero with its schematic map
  and shot log, the live entry (club, putt read, result, tee miss, the approach
  miss grid, putt tags, distance with quick picks, the one-thing-missing hint,
  the plausibility confirm and block, the 15-stroke limit, Undo with its
  question, Penalty), the holed-out review (saving, failed with Try again,
  change a shot, back to the next hole), and the sheets (penalty, change or
  delete a shot, leave a hole with a result unrecorded). The round's own sheets
  (Exit with a discard that asks again, Scorecard, Round complete, Submitting)
  are `round-sheets.tsx`, driven by props.
- All logic is the shared `useShotTracking` (the Fairway screen's, moved
  unchanged; a fresh-context review found no must-fix) and `shot-entry-rules`
  (gained the confirm key, the putt-tag toggle and the edit derivation;
  `editedShotIssues` moved there). Where the board and the engine disagree the
  engine wins (`phone/rounds.md`, "Tracking: board to engine").
- 32 catalog rows: CH-11002 to CH-11006, CH-11101 to CH-11106 (a new validation
  section), CH-11207, CH-11308, CH-11402, CH-11502 to CH-11509, CH-11602,
  CH-11603, CH-11705 to CH-11707, CH-11805 to CH-11808, CH-11901.
  `round-tracking.test.tsx` (21 cases driving the real hook, mutation-checked:
  20 of 21 killed; the survivor is equivalent). Preview
  `/clubhouse-preview/track` with a stand-in round screen.

### Why (2026-09-30, 3)

- ROUNDS_PLAN "Avoid a third copy": the handlers move into one shared hook
  before a second screen calls them.

### Verification (2026-09-30, 3)

- See VERIFY.md (desktop and 390 checked headless; a shot recorded in real
  Chromium at 390; axe at 1280 and 390).

## 2026-09-30 — A round's review, at /rounds/[id] (4255c15d3, 85ee9559a, 01f228b45)

```text
Design package: design/handoff/ v2 (rounds-review.jsx)
PR/commit:      agent/clubhouse (4255c15d3, with the catalog fix 85ee9559a and the browser-pass fixes 01f228b45)
Contract IDs:   none by hand (catalog rows below)
Actions:        none
Data impact:    none
Held items:     none
```

### Added (2026-09-30, 4)

- `RoundReview`, `ReviewLoadFailed`, the loader `loadRoundReview` (pure steps in
  `round-review-shape.ts`) and the route `ClubhouseRoundReviewRoute`, for the
  player who played the round and a coach of their team: the hero, the five
  figures, the card (tap a hole or step for its shots), the scoring
  distribution, the AI recap and the player's notes. Access matches the legacy
  page; anyone else and a missing round get the same "This round isn't here"
  (CH-11307); a failed membership check says it didn't load rather than "not
  found"; a round in progress goes to be continued.
- `nav.ts` gained role-scoped rebuilt patterns, so a coach's review is rebuilt
  without their Rounds library; the library's rounds now open their review.
- 8 catalog rows: CH-11204 to CH-11206, CH-11305 to CH-11307, CH-11704,
  CH-11804. `round-review.test.tsx` (29 cases, mutation-checked: 21 of 21 killed
  after three sharper tests). Preview `/clubhouse-preview/round`.

### Fixed (2026-09-30, 2)

- The catalog named the wrong test file for the review's rows (85ee9559a).
- Browser pass: the review hero's course name was dark on dark green.

### Why (2026-09-30, 4)

- Q-72e: the board's review is the round page, so it lives at `/rounds/[id]`;
  the AI deep review at `/rounds/[id]/review` stays with CoachHelm. Q-72f: the
  card shows the player's own posting notes, and Focus and Keep are left out.

### Verification (2026-09-30, 4)

- See VERIFY.md.

## 2026-09-30 — The library, for players (c8a7302ba, 8835b6794, e04be28ce, 01f228b45)

```text
Design package: design/handoff/ v2 (Player - Rounds.html, rounds-flow.jsx Library)
PR/commit:      agent/clubhouse (c8a7302ba; the plan and Q-72 in 8835b6794 and e04be28ce)
Contract IDs:   none by hand (catalog rows below)
Actions:        none registered then (ACT-P011-DISCARD and ACT-P011-TRY-AGAIN are in the contract pass above)
Data impact:    none
Held items:     none
```

### Added (2026-09-30, 5)

- `screens/rounds/` (`RoundsLibrary`, `parts`, `writes`, `RoundsSkeleton`), the
  loader `loadRoundsLibrary` (pure steps in `rounds-shape.ts`) and the route
  `ClubhouseRoundsRoute`; `/golf/dashboard/rounds` rebuilt for players (coaches
  keep the Fairway page). The round in progress (the hole strip from
  `golf_holes`, the next hole, ready to submit per legacy R8), every other
  unfinished round listed with Discard, the season (countable 18-hole rounds
  since August 1, the rule Home and Stats use), the ribbon, search, and grouping
  by month or by course.
- Discard is `deleteInProgressRound` then `clearEmergencySave`, with a
  confirmation and a Retry that finishes the job. New round, Continue and a
  round's review are not drawn until those screens are rebuilt
  (`nav.rebuiltHref`).
- 17 catalog rows: CH-11001, CH-11201 to CH-11203, CH-11301 to CH-11304,
  CH-11401, CH-11501, CH-11601, CH-11701 to CH-11703, CH-11801 to CH-11803. The
  catalog `catalog/rounds.md` (page 11), the manifest P011, the checklist
  `screens/rounds.md`, the plan `ROUNDS_PLAN.md` and Q-72. `rounds.test.tsx` (38
  cases then, mutation-checked: 20 of 20 killed after two added tests). Preview
  `/clubhouse-preview/rounds`.

### Fixed (browser pass, 01f228b45)

- **The hero stacked at a normal desktop width and its hole strip grew 100px
  cells.** It now stacks below 860px and cells cap at 44px.
- **An under-par score label on the ribbon sat on the dates.**
- **The phone ribbon's labels were about 5px.** It now draws the last ten rounds
  on a narrower canvas.

### Why (2026-09-30, 5)

- Q-72a to d: no course photos, "50+ stats tracked" becomes a plain list, the
  hole map is a labelled schematic, and the submit overlay names the real shot
  count. Round entry reuses the hardened engine, so one engine and two renderers
  until the flag flips.

### Verification (2026-09-30, 5)

- See VERIFY.md.
