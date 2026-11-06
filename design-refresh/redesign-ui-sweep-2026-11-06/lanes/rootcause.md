# Lane: CoachHelm Root cause / Read (RC)

Repo `helmv3` at `062f8a2`. Code: `src/clubhouse/screens/coachhelm/read/*` (ReadPage, cards, ReadLadder, ReadsRail, ReadSummaryCard; the preview is `preview/PreviewCoachHelmRead.tsx`), `src/clubhouse/styles/coachhelm-read.css`. Spec: `design-refresh/coachhelm-read/06-SCREEN-SPECS.md` (§2 to §12, desktop), `04-FIDELITY-SPEC.md`.
Phone card content width is 326 at 390. Text widths are estimates at ≈0.55 em and are marked "≈".

### RC-1 The ⋯ "More" button opens an empty sheet for players
- Severity: P1
- Where: Read page, player view, phone (bar ⋯) and desktop (deskbar ⋯), both themes
- File: `src/clubhouse/screens/coachhelm/read/ReadPage.tsx:82` (action shown whenever `read` exists), `:153-155` (desktop ⋯ always shown), `:184-203` (sheet content: Dismiss only when `target`, which is coach-only at `:172`; Message only when `coach`)
- What's wrong: For a player both children are false, so the ⋯ button opens a Modal titled "More for this read" with nothing in it. That is a dead tap.
- Should be: 06 §11 S-READ.more: player sheet has "Ask, Copy"; desktop popover "player: Copy a link, Close".
- Fix: Build the action list per role: coach gets Dismiss, Message, Ask, Copy link; player gets Ask, Copy link. Hide ⋯ when the list is empty.
- Confidence: high

### RC-2 The More sheet is the wrong component and is missing its actions
- Severity: P1
- Where: Read page ⋯, phone and desktop
- File: `ReadPage.tsx:184-203`; Message link falls back to `href ?? '#'` at `:198`
- What's wrong: The spec's iOS action sheet (rows 57 tall, Dismiss in `--ch-flag`, Message, Ask, Copy a link, then Cancel in its own group) is built as a generic `ui/Modal` with a ghost "Dismiss this read" button and one `.lk` chip. There is no Ask, no Copy link and no Cancel. When `rebuiltHref` returns null the Message chip links to `#`, another dead tap. On desktop it opens as a centred dialog instead of the 250-wide popover under the bar.
- Should be: 06 §11 (phone action sheet) and the 06 desktop table "More popover … 250 wide; right 24, top 62".
- Fix: Use `ui/Menu` on desktop and a Menu or action-sheet variant on phone (the CSS for `.ash` is already in `coachhelm-read.css:1008-1059`, unused). Rows: Dismiss (destructive), Message {first}, Ask CoachHelm about this, Copy a link. Drop the `'#'` fallback and hide the row instead.
- Confidence: high

### RC-3 Round rows show a chevron but can't be tapped
- Severity: P1
- Where: "The rounds behind it" card, phone and desktop
- File: `src/clubhouse/screens/coachhelm/read/cards.tsx:370-385` (`<div className="row">` with `.chev`)
- What's wrong: Each round row draws a chevron, the "opens something" cue, but it is a plain `div` with no link or handler. Tapping does nothing.
- Should be: 06 §9: Row hit "whole row, 52"; chevron "row".
- Fix: Make the row a `Link` to the round (the same href the hole chips use, `h.href` in `cause.holes`; add `href` to `rounds.list`) with `.tap`. If there is no round page, remove the chevron.
- Confidence: high

### RC-4 Rail player switcher popover is clipped by its own card
- Severity: P1
- Where: Read page, desktop 1440 and 1180 to 1279, coach view
- File: `src/clubhouse/screens/coachhelm/read/ReadsRail.tsx:328-340` (`details.ch-hr-swr` inside `nav.card`); `coachhelm-read.css:191-196` (`.card { overflow:hidden }`), `:1294-1305` (`.pop { position:absolute; left:0; width:250px }`), `:1264-1270` (summary in column 2 after a 36px avatar)
- What's wrong: The summary starts about 60px into a 250-wide rail card (16 padding + 36 avatar + 8 gap). The 250-wide popover therefore ends at about 310, and the card's `overflow:hidden` cuts the last ≈60px. With a full roster (12 names × 36px = 432) the popover is also cut at the bottom when the rail card is shorter. The control is a hand-built `<details>` with a 34px summary and 36px rows.
- Should be: 06 desktop "Switcher (coach) … 34 tall"; H11; components from `src/clubhouse/ui/` (Menu).
- Fix: Use `ui/Menu` (it portals and positions) anchored to the name, or `ui/Segmented` as the spec's switcher. If you keep it, set `.ch-hr-rail { overflow:visible }` and `.pop { left:auto; right:0 }`.
- Confidence: high

### RC-5 Cause "arms" draw one 14px dot per hole, with no cap
- Severity: P1
- Where: "Why CoachHelm thinks so", likely cause, coach, phone and desktop
- File: `cards.tsx:151-155` (`Array.from({ length: a.n })`); arm B is "All other holes" (`data/coachhelm-read-view-shape.ts:147`); `coachhelm-read.css:542-556` (14px dots, gap 4, wrap)
- What's wrong: `n` is a raw hole count. "All other holes" over a season is easily 200 to 300. At 326 wide that is 18 dots a row, so n = 300 gives 17 rows (≈306px) of dots, and the card becomes a wall of circles. The empty dots (`--ch-hr-track`) are 1.24:1 light and 1.29:1 dark against the card, so the denominator, which carries the information, can barely be seen.
- Should be: 06 §6 (fixture "16 dots row 1"); H8 non-text 3:1; data-driven sizes are clamped.
- Fix: Above about 30, draw a proportion bar (filled share of a 12px track) or bucket dots (1 dot = n/30 holes, shown in the count line). Give empty dots a 1px `--ch-hr-neutral-fill` ring.
- Confidence: high (code); medium on typical n

### RC-6 "How it has moved" prints hyphen-minus and drops the decimal
- Severity: P1
- Where: Moved card slope labels, phone and desktop
- File: `cards.tsx:296` (``const f = (v) => String(Math.round(v * 10) / 10)``), used at `:312`, `:315`
- What's wrong: −1.2 renders "-1.2" (U+002D) and 3.0 renders "3". Elsewhere on the page the same values read "3.0" and "−1.2".
- Should be: H14 (U+2212; fixed digits in a figure).
- Fix: `formatSigned(v)` or `formatFixed` with `MINUS` from `lib/format.ts`, with the read's unit.
- Confidence: high

### RC-7 Desktop action bar overflows the middle column between 1180 and about 1280
- Severity: P1
- Where: Read page desktop, window 1180 to 1279, with the 232 sidebar
- File: `ReadPage.tsx:142-156` (two `size="lg"` Buttons + ⋯, no wrap); `coachhelm-read.css:1080-1100` (3 columns from a `max-width:1179px` window query), `:1218-1223`
- What's wrong: The breakpoint uses the window, not the main area. At 1180 the main area is 1180 − 232 − 48 = 900, so the middle column is 900 − 250 − 320 − 40 = 290px. "Ask about this read" + "Message {first}" + ⋯ is ≈380px in a non-wrapping flex row, so it spills about 90px into the evidence column. The headline card and the 44px hero are cramped at 290.
- Should be: 06 desktop "No horizontal scroll at 1280 or 1024"; columns 250 / fill / 320; H11.
- Fix: Switch to 3 columns with a container query on `.ch-hr-desk` (min-inline-size about 1000px), not the window. Let `.ch-hr-deskbar` wrap, or put these actions in the glass bar as 06 draws them.
- Confidence: medium (button widths estimated)

### RC-8 Benchmark ladder labels still collide when three marks are close
- Severity: P1
- Where: Read headline and board summary ladder, phone and desktop
- File: `src/clubhouse/screens/coachhelm/read/ReadLadder.tsx:276-286`
- What's wrong: The split runs pairwise and later pairs overwrite earlier ones. Take marks at 120, 170 and 220: pair 1 sets a to end and b to start, then pair 2 sets b to end and c to start. a and b are both end-anchored 50 units apart, and a label like "Team average" (≈75 units at 12.5) overlaps. A mark near an edge that the split forces to `end` (e.g. cx 20, then tx 16) runs past x 0, and only `overflow:visible` (`coachhelm-read.css:298`) lets it show, into the card padding.
- Should be: 06 §2 Ladder: "labels split above and below when two marks sit closer than 76 units"; "a label within 60 units of an edge anchors to that edge"; H11.
- Fix: Alternate rows: when two marks are closer than 76, put the second label below the track (y 58 for one, y 8 or a third row for the other) instead of flipping anchors. Keep edge anchoring last, so it wins.
- Confidence: medium (logic traced; depends on how many lines a read has)

### RC-9 Ladder text size is set by CSS that scales and overrides the SVG's own size
- Severity: P2
- Where: Ladder, phone at Text Size above default
- File: `coachhelm-read.css:300-304` (`.ladder text { font-size: var(--ch-hr-cap-size) }`), `:1214-1216` (`12px × min(k, 1.2)`), `:292-299` (margin hacks for the overflow); `ReadLadder.tsx:295-305` (`fontSize="12.5"` attributes, which the CSS overrides)
- What's wrong: The second label line's baseline is 58 + 1.15em, which is 71.8 at 12px and 74.6 at ×1.2. With descenders it sits past the 78-unit viewBox, and the layout hides that with a computed `margin-bottom` and `overflow:visible`. The spec's 12.5 becomes 12.
- Should be: 06 §2 (labels 12.5 × min(k,1.2)); H11.
- Fix: Grow the viewBox height with k (78 + 16 × (min(k,1.2) − 1)) and drop the margin hack and `overflow:visible`. Use 12.5.
- Confidence: medium

### RC-10 Moved card: the "Now" label is a date and runs off the right edge; the line is always amber
- Severity: P2
- Where: Moved card, phone and desktop
- File: `cards.tsx:320-324` (`{m.through}` centred at x 260), `:308` (line always `--ch-hr-loss-fill`), `:311-316` (labels always 12 above)
- What's wrong: The right label is the read's as-of date ("Through Oct 26", ≈85 units) centred at 260, so it spans ≈217 to 302 and is cut at the 300 edge. The slope is amber even when the read improved. Both value labels sit 12 above their points, so when the lower point's label lands on the line it collides.
- Should be: 06 §8: labels "Before" and "Now", no dates; line "gain fill when better"; values "12 above the higher point or 20 below the lower".
- Fix: Label the right point "Now". Choose the stroke from `m.tone`. Place the lower value 20 below its point.
- Confidence: high

### RC-11 Hole chips: no cap and about 30px tall
- Severity: P2
- Where: Why card, counted cause
- File: `cards.tsx:186-199` (all `cause.holes`); `coachhelm-read.css:633-645` (`.hole { padding:6px 8px }`, 13px)
- What's wrong: Every hole is listed, where the spec caps at 5, and each chip is ≈30px tall with no extended hit area.
- Should be: 06 §6 Hole chips: "at most 5", "min-height 36 with the hit area 4 above and below"; H10.
- Fix: `holes.slice(0, 5)` plus a "+N more" line; `.hole { min-height:36px; display:inline-flex; align-items:center; position:relative } .hole::after { content:''; position:absolute; inset:-4px 0 }`.
- Confidence: high

### RC-12 Link chips are 36px with no hit area
- Severity: P2
- Where: What to do card link row (Message, Ask), More sheet
- File: `coachhelm-read.css:814-825` (`.lk { padding:8px 12px }`, ≈36px)
- What's wrong: The tap height is ≈36.
- Should be: 06 §10 Link chips "min-height 36, hit area 4 above and below"; H10.
- Fix: `min-height:36px; position:relative` plus `::after { inset:-4px 0 }`.
- Confidence: high

### RC-13 "Show newest 8 of N" shows all N
- Severity: P2
- Where: Rounds card with more than 8 rounds
- File: `cards.tsx:367` (`all ? list : list.slice(0, 4)`), `:390`
- What's wrong: The label promises 8 but the open state shows the whole list.
- Should be: 06 §9 redline: "four rows before Show all; eight when open".
- Fix: `all ? list.slice(0, 8) : list.slice(0, 4)` and link the rest out, or label it "Show all N".
- Confidence: high

### RC-14 Rounds subline has no hole dots
- Severity: P2
- Where: Rounds card rows
- File: `cards.tsx:377`
- What's wrong: Only "N counted holes" is shown. The spec's 9×9 dots, one per counted hole, are missing.
- Should be: 06 §9 "Hole dots: in the subline … one per counted hole".
- Fix: Render `r.counted` dots (cap about 9) before the text, in `--ch-hr-loss-fill`.
- Confidence: high

### RC-15 Not-traced meter: the spec's ring and ten segments are drawn as N segments
- Severity: P2
- Where: Why card, not traced
- File: `cards.tsx:205-211` (`cause.gap.need` segments; `need = have + target` at `coachhelm-read-view-shape.ts:158`); count-down draws no meter
- What's wrong: A data gap draws `need` flex segments (for example 40 segments of ≈4px), not a 54px ring. The count-down state, which should have the ten-segment meter, draws none.
- Should be: 06 §6 "Meter (count-down) … ten segments"; "Meter (data gap) ring 54×54".
- Fix: Draw the ring for `gap`, and ten segments scaled to `countDown.haveEvents/needEvents`.
- Confidence: medium

### RC-16 Phone loading skeleton has no bar, so it jumps on load
- Severity: P2
- Where: Read page loading (Suspense fallback), phone
- File: `ReadPage.tsx:26-45` (`ReadSkeleton` renders `.sheet` only; the loaded page adds `PhoneTop` at `:78-84`); route `routes/coachhelm.tsx:260`
- What's wrong: The green bar with back and title appears only once data lands, and the cards drop by the bar's height.
- Should be: 06 §12 Skeleton "outlines at final heights"; H1 (no layout jump).
- Fix: Render `<PhoneTop back title="CoachHelm" />` in the skeleton.
- Confidence: high

### RC-17 Under Reduce Motion the Assign spinner runs at 1ms per turn
- Severity: P2
- Where: What to do, "Assigning…"
- File: `coachhelm-read.css:1101-1106` (`.ch-hr * { animation-duration:1ms!important }`)
- What's wrong: The shared Button spinner keeps `infinite` but turns once per millisecond, so it reads as a static or flickering ring.
- Should be: H19 (spinner keeps turning under Reduce Motion).
- Fix: Exclude the spinner from the blanket rule, or scope the rule to the named motion classes (`.fbar`, `.dots i`, `.pn`, `.flash`).
- Confidence: medium

### RC-18 Hero figure tracking reset to 0
- Severity: P2
- Where: Read headline and board summary
- File: `coachhelm-read.css:1271-1273` (`.hero b { letter-spacing:0 }`) overriding `:277-284`
- What's wrong: The 44px figure loses its −0.04em tracking and the 'wdth' 92 setting is 96. It looks loose next to the Team card's figure.
- Should be: 06 §2 Hero number "44 × k / 0.9 / 500, wdth 92, −0.04em".
- Fix: Delete the override and set `font-variation-settings:'wdth' 92; letter-spacing:-0.04em`.
- Confidence: high

## Summary (worst first)
1. RC-1/2: the ⋯ More opens an empty sheet for players. For coaches it is the wrong component (Modal instead of action sheet or popover), with no Ask, Copy or Cancel and a `'#'` dead link.
2. RC-3: round rows draw a chevron but are not tappable.
3. RC-4: the rail's player switcher popover is clipped by the rail card (about 60px cut on the right), and it is hand-built instead of `ui/Menu`.
4. RC-5: cause arms draw one 14px dot per hole with no cap ("All other holes" can be 300 dots), and the empty dots are 1.24:1.
5. RC-6/7/8: hyphen-minus and dropped decimals in the moved chart, a desktop action bar overflowing the 290px middle column at 1180, and ladder labels that still collide with three close marks.
