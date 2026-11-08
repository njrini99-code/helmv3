# Lane audit: Stats (phone redesign `shs` and desktop Overview)

Repo `helmv3` at main `062f8a2`, read-only. Scope:
- Live code: `src/clubhouse/screens/stats/*`, `styles/stats.css` and `styles/stats-redesign.css`.
- Previews: `clubhouse-preview/stats` and `clubhouse-preview/player`, through `fixtures-stats-redesign`.
- Spec: `design-refresh/stats-home/`.

Contrast was computed from the token values in `tokens.css`, light and dark.
Note: `DECISIONS.md` and `ACCEPTANCE-SHARED.md` are not at the `design-refresh/` root, so I checked against DESIGN_LANGUAGE.md and RUBRIC.md alone.

---

### STATS-1 Coach header on a player's Stats page sits 2px from the screen edge
- Severity: P0
- Where: Stats, player opened by a coach (`?player=`), phone, light and dark
- File: `src/clubhouse/screens/stats/StatsPlayerPhoneShs.tsx:209-220` (`header.ch-spm-head`); `src/clubhouse/styles/stats.css:2485-2490` (`.ch-spm-head{padding:4px 2px 0}`); `src/clubhouse/styles/stats.css:2091` (`.ch-st.is-phone{padding:0}`)
- What's wrong: The header is rendered outside `.ch-shs-sheet`, so it gets none of the sheet's page padding. The phone wrapper has zero padding, so the avatar, large title and message button sit 2px from the left and right screen edges. The cards below are inset 16 or 20px, so the header and the cards don't line up.
- Should be: H5. The phone page edge is `--ch-page-x-phone` (16px, or 20px at 414px and wider).
- Fix: Use `.ch-spm-head{padding:4px var(--ch-page-x-phone) 0}`, or move the header inside the `.ch-shs-sheet` padding box.
- Confidence: high

### STATS-2 Green-reading diagram labels collide with arcs whose thickness comes from the data
- Severity: P1
- Where: Stats, player Overview, short-game zone, Green diagram, desktop, light and dark
- File: `src/clubhouse/screens/stats/OverviewZones.tsx:584-614` (`GreenDiagram`)
- What's wrong: Arc stroke width is `5 + (v/100)*28`, which runs from 5 to 33px on r=84 arcs. The direction labels sit at fixed points:
  - Left: x=62, end-anchored, y=119
  - Right: x=238
  - Long: y=24

  The left arc spans x≈66±stroke/2, so once the left share is above about 21% (stroke ≥ 11) the stroke runs over the "Left" label. The fixture's left=45 gives a 17.6px stroke, so it already overlaps. The right label (238) and the long label (24) do the same against arcs at 234±16.5 and 31±16.5. This is the owner's TeamHole bug: a size derived from data, with labels at fixed coordinates.
- Should be: H11, and the brief's pattern list (sizes from data need a clamp; labels move with their marks).
- Fix: Cap the stroke, e.g. `Math.min(18, 5 + v/100*28)`, and place each label from the arc radius plus half its stroke plus 6. Or put the share in a legend row under the SVG.
- Confidence: high

### STATS-3 GIR% figure in the Green diagram is 1.10:1 in dark mode
- Severity: P1
- Where: Stats, player Overview, Green diagram centre figure, desktop, dark
- File: `src/clubhouse/screens/stats/OverviewZones.tsx:600` (`fill="var(--ch-green-900)"` on a `--ch-green-100` disc)
- What's wrong: In dark mode, `--ch-green-900` is #0a2a1b and `--ch-green-100` is #1a3024, a ratio of 1.10:1. The figure can't be seen. Light mode passes.
- Should be: H8 (text 4.5:1).
- Fix: Use `--ch-forest-900`, which tokens.css:26-29 documents as flipping to pale mint in dark mode, or `--ch-ink-1` on `--ch-green-100`.
- Confidence: high

### STATS-4 Team chart's "Mean" label sits at a fixed left position and collides with the first point and the line
- Severity: P1
- Where: Stats, Team, Scoring feature card, phone, light and dark
- File: `src/clubhouse/screens/stats/ScoringFeatureChart.tsx:285-286` (`<text x="4" y={y(mean)-6}>Mean …</text>` in `TeamFeatureChart`, :225-292)
- What's wrong: The label is pinned at x=4, which is where the first data dot is drawn (x=0, r 3.4, half outside the SVG). The area and line pass through the label's box whenever early rounds are near the mean. When the mean is near the top of the range, `y(mean)-6` falls above y=0 and the label is clipped.
- Should be: The brief's pattern list (labels at fixed coordinates), and H11.
- Fix: Anchor the label at the right end of the mean line (`x={width-PAD.r}`, `textAnchor="end"`), clamp y to `[12, H-PAD.b]`, and inset the first point by r so it isn't cut in half.
- Confidence: medium

### STATS-5 Sticky Player/Team switch ignores the top safe area
- Severity: P1
- Where: Stats, phone (Home-screen web app and iOS standalone), light and dark
- File: `src/clubhouse/styles/stats-redesign.css:41-47` (`.ch-shs .ch-shs-ctl{position:sticky;top:var(--ch-phone-topbar-h,0px)}`)
- What's wrong: Every other sticky element under the phone top bar adds `env(safe-area-inset-top)`: calendar.css:3933, classes.css:2153, roster.css:3034, shell.css:2534, coachhelm-file.css:62 and stats.css:66. This one doesn't, so with a notch or Dynamic Island the switch sticks 47–59px too high, under the bar.
- Should be: The shell's sticky contract, matching `stats.css:66`.
- Fix: `top: calc(var(--ch-phone-topbar-h) + env(safe-area-inset-top))`.
- Confidence: medium

### STATS-6 Gain and loss pills on the green Scoring card use the paper tint, not the feature tint
- Severity: P1
- Where: Stats, player and Team, Scoring feature card, phone, light and dark
- File: `src/clubhouse/styles/stats-redesign.css:372-394` (`.ch-shs-pill.is-gain/.is-loss` read `--ch-chart-gain-tint` and `--ch-chart-gain` directly); the re-pointed tokens sit unused at `:254` (`--ch-shs-s-gain-tint`)
- What's wrong: On the dark-green feature surface, the delta pill renders as a pale #e6f2ea chip with #155a39 text. The ratio is 7.15:1, so it's readable, but it's a light sticker on the green card. The design (redesign/stats-phone.css:124) uses `var(--gain-tint)`, which `.feature` re-points to a translucent tint. That's the "design CSS not matched to live tokens" pattern.
- Should be: The stats-home redesign (`stats-phone.css:124`) and DESIGN_LANGUAGE.md (chips on feature surfaces).
- Fix: Inside `.ch-shs-feat`, set `.ch-shs-pill.is-gain{background:var(--ch-shs-s-gain-tint);color:var(--ch-shs-s-gain)}`, and do the same for loss. Better, render `<DeltaChip tone="onFeature">` from `src/clubhouse/ui/`.
- Confidence: high

### STATS-7 Retry buttons and notices are hand-drawn instead of ui Button and InlineNotice
- Severity: P1
- Where: Stats, player and Team, error and partial-failure states, phone, light and dark
- File: `src/clubhouse/screens/stats/StatsPlayerPhoneShs.tsx:324-354` (`FailedCard`); `src/clubhouse/screens/stats/StatsTeamPhoneShs.tsx:239-266` (`TeamFailedCard`); `src/clubhouse/styles/stats-redesign.css:889-918` (`.ch-shs-btn`) and `:919-940` (`.ch-shs-notice`)
- What's wrong: These are local copies of the button and the notice, with their own height, radius, focus ring and pressed state. They don't follow Button's 44px minimum, the token focus ring or the Increase Contrast overrides. This is the "local copies of controls" pattern.
- Should be: Brief §Components; ACCEPTANCE uses `src/clubhouse/ui/Button` and `States`/InlineNotice.
- Fix: Replace both with `<Button variant="secondary" size="sm" onClick={retry}>Try again</Button>` inside the ui error state (`States` / `InlineNotice`), then delete `.ch-shs-btn` and `.ch-shs-notice`.
- Confidence: high

### STATS-8 Summary cards nest buttons and a slider inside a role="link" section
- Severity: P1
- Where: Stats, player phone summary (Scoring, Rounds, Glance cards), phone, light and dark
- File: `src/clubhouse/screens/stats/SummaryCard.tsx` (section `role="link"` wraps `button.ch-shs-dlink` and the chart's `role="slider"`)
- What's wrong: Interactive elements inside an interactive element: VoiceOver reads it as one link. A tap on the chart scrubber also bubbles up and opens the detail, so you can't scrub without navigating away. The file also has local `ShsPill`, `ShsChevron` and `ShsCard` copies.
- Should be: H10 and brief §States (dead or competing taps); components `Surface`, `Badge`, `DeltaChip`.
- Fix: Make the card a plain `Surface`. Put the link on the header row only (title plus chevron), and stop propagation from the chart. Swap `ShsPill` for `DeltaChip` or `Badge`, and `ShsCard` for `Surface`.
- Confidence: medium

### STATS-9 SVG axis text uses a Text Size type token, so labels get bigger than the chart's padding
- Severity: P1
- Where: Stats, Scoring feature chart (player and Team), phone, at Text Size XL and XXL
- File: `src/clubhouse/styles/stats-redesign.css:336-340` (`.ch-shs-ax{font:var(--ch-type-13)}`), used at `src/clubhouse/screens/stats/ScoringFeatureChart.tsx:193,212,216,265,276,280,285`
- What's wrong: `--ch-type-13` scales with Text Size, reaching 17.7px at XXL. The chart's padding is fixed: `PAD.r` is 30 and `PAD.b` is 26. Y-axis figures such as "74.2" (~36px at 17.7px) overflow the right gutter, and the x labels run into the plot.
- Should be: RUBRIC H4 (SVG chart text is a fixed pin, not a type token) and the brief's "type tokens used inside SVG".
- Fix: Pin SVG text, e.g. `.ch-shs-ax{font:500 11px/1 var(--ch-font-num)}`, as other charts do. Or derive `PAD` from the measured label width.
- Confidence: high

### STATS-10 Glance tiles stay three across on phone, and "Scrambling" overflows at 340px
- Severity: P2
- Where: Stats, player phone summary, "At a glance" card, phone 340–390, light and dark
- File: `src/clubhouse/styles/stats-redesign.css:459-530` (`.ch-shs-glance`, `grid-template-columns:repeat(3,1fr)`; drops to two columns only under `.is-big`)
- What's wrong: Each column has ~91px of content at 390 wide and ~74px at 340. The 15px label "Scrambling" is ~75px wide, and figures like "62.5%" plus a delta chip don't fit at 340. This is the "multi-column kept on phone" pattern.
- Should be: Brief §Overflow; stats-home 06-SCREEN-SPECS (glance grid collapses).
- Fix: Add `@container (max-width:360px){.ch-shs-glance{grid-template-columns:repeat(2,1fr)}}`, keyed on the card's container rather than `.is-big`, plus `min-width:0` and an ellipsis on labels.
- Confidence: medium

### STATS-11 "Needs 5 rounds" rail text is nowrap and runs into the next columns
- Severity: P2
- Where: Stats, detail tables (thin-sample rows), phone, at large Text Size
- File: `src/clubhouse/styles/stats-redesign.css:1657-1666` (`.ch-shs-needs{white-space:nowrap}`)
- What's wrong: At Text Size 1.36, the rail column is ~96px and the string is ~118px. With no overflow or ellipsis, it draws over the label and value columns.
- Should be: H11 (nowrap needs an ellipsis or wrap).
- Fix: Add `overflow:hidden;text-overflow:ellipsis;min-width:0`, or let it wrap to two lines (`white-space:normal`).
- Confidence: medium

### STATS-12 Ribbon chart's reference label and figures share a fixed 40px gutter
- Severity: P2
- Where: Stats, detail ribbon (SG over rounds, vs Tour or Mean), phone, at large Text Size
- File: `src/clubhouse/styles/stats-redesign.css:1176-1184` (`.ch-shs-rib{padding-right:40px}`, `.ch-shs-rib .rref{right:-42px}`); overlap guard in `src/clubhouse/screens/stats/ShsBlocks.tsx` (`Ribbon`, `Math.abs(y(v)-y(ref)) < 14`)
- What's wrong: The "Tour" / "Mean" label and the `.ry` figures are placed with absolute positioning in a 40px gutter. The 14-unit collision guard is in viewBox units and doesn't scale with font size. At 17.7px, "Tour" (~38px) plus a figure collide and spill past the card's right padding.
- Should be: The brief's patterns (labels at fixed coordinates) and H11.
- Fix: Measure the gutter from the label (`ch` units or `max-content`), and run the collision guard in CSS px using the actual line height.
- Confidence: medium

### STATS-13 Team "Who gains and loses" truncates names in a fixed 104px column
- Severity: P2
- Where: Stats, Team, gains-and-losses rows, phone, light and dark
- File: `src/clubhouse/styles/stats-redesign.css:1847-1855` (`.ch-shs-prow{grid-template-columns:20px 104px 1fr 44px}`)
- What's wrong: Long names like "Christopher Bainbridge" (~150px at 15px) are cut at 104px, and the bar column (`1fr`) keeps the extra room. At 390 wide the bar gets ~170px, which is more than it needs.
- Should be: Brief §Overflow (long real names).
- Fix: Use `grid-template-columns:20px minmax(0,1.2fr) minmax(64px,1fr) 44px` and show initial plus last name with ellipsis.
- Confidence: medium

### STATS-14 Tee-direction stack: Left and Right fills are 1.18:1 apart
- Severity: P2
- Where: Stats, player, Off the tee detail, direction stack, phone, light and dark
- File: `src/clubhouse/screens/stats/StatsPlayerPhoneShs.tsx:613-617, 633-646` (`ch-shs-fill-flat` on Left, `ch-shs-fill-miss` on Right)
- What's wrong: The two miss segments contrast with each other at 1.18:1 in light and 1.29:1 in dark. Only the order and a legend tell them apart.
- Should be: H13 (colour is never the only signal) and H8 (UI marks 3:1).
- Fix: Label the segments inline with "L 18%" and "R 22%", or add a 2px `--ch-card-bg` gap between them and hatch one side.
- Confidence: medium

### STATS-15 Score-mix bar uses raw px and weight 700, off the type scale
- Severity: P2
- Where: Stats, Scoring detail (`GameDetail asDetail`), phone and desktop
- File: `src/clubhouse/styles/stats.css:7137-7139` (`.ch-sv-mix-seg b{font:700 13px/1}`), `:7201` (`.ch-sv-mix-key b{font:700 17px/1}`), `:7224` (`font-size:12px`), `:7259-7283` (phone block, raw 15px and 14px)
- What's wrong: The figures ignore Text Size, use a weight that isn't on the scale, and sit next to `--ch-type-*` text, so they look off.
- Should be: H4.
- Fix: Use `font:var(--ch-type-13-num)` / `var(--ch-type-17-num)` with the scale's weight. Keep raw px only inside the SVG segment labels.
- Confidence: high

### STATS-16 Skeleton doesn't match the loaded layout (fixed heights; coach header missing)
- Severity: P2
- Where: Stats, loading, phone, light and dark
- File: `src/clubhouse/screens/stats/ShsSkeleton.tsx` (fixed card heights 342, 193, …; no header for `?player=`)
- What's wrong: Card heights are px constants, so they're too short at large Text Size and the page jumps when it loads. When a coach opens a player, the 64px header pops in above everything.
- Should be: ACCEPTANCE loading state (the skeleton matches the final layout) and brief §States.
- Fix: Render the `ch-spm-head` placeholder when `coach` is set. Size the placeholders in `em` or with `--ch-type-*` line heights.
- Confidence: medium

### STATS-17 Rounds ticker with a single round draws one full-width grey block
- Severity: P2
- Where: Stats, player, Rounds card, partial state (1 round), phone
- File: `src/clubhouse/screens/stats/MiniCharts.tsx` (`tickerBars`, bar width = 300/n)
- What's wrong: With n=1 the one bar fills the 300-wide viewBox, so it reads as a broken slab rather than one round.
- Should be: Brief §States (partial).
- Fix: Cap the bar width, e.g. `Math.min(14, 300/n)`, and right-align. Or show the partial-state copy ("1 round — more after your next") instead of the chart.
- Confidence: medium

### STATS-18 Sticky switch's scroll shadow is raw rgb with no dark value
- Severity: P2
- Where: Stats, phone, dark
- File: `src/clubhouse/styles/stats-redesign.css:1937-1948` (`.ch-shs-ctl::before`, gradient `rgb(0 0 0/.1)`), `:2236` (raw-rgb shadow)
- What's wrong: The fixed black shadow is invisible on the dark grouped background (#0e120f), so there's no edge between the switch and the scrolling content in dark mode.
- Should be: Brief §Dark mode (hard-coded colours).
- Fix: Use the shell's scroll-edge token (`--ch-shadow-1` / `--ch-hairline`), as `shell.css` does.
- Confidence: medium

### STATS-19 Desktop Stats still has around 50 raw px font declarations
- Severity: P2
- Where: Stats desktop (Overview, Game detail, strokes-gained table), light and dark
- File: `src/clubhouse/styles/stats.css` (e.g. `:5401 .ch-sgt__callout{font:700 15px}`, `:7031`; RUBRIC already lists `:5365` and `:6556`)
- What's wrong: Text set in raw px ignores Text Size and drifts from the 11-step scale next to tokenised neighbours.
- Should be: H4.
- Fix: Replace them with `--ch-type-*` tokens. `grep -nE "font(-size)?:\s*[0-9]{3}? ?[0-9]+px" src/clubhouse/styles/stats.css` lists them.
- Confidence: high

---

## Summary
1. The coach's player header sits 2px from the screen edge because it's outside the padded sheet and `.ch-st.is-phone` has no padding (STATS-1).
2. The desktop Green diagram repeats the TeamHole bug: arc thickness comes from the data with no cap, and the labels are at fixed points, so they collide (STATS-2). Its GIR figure is 1.10:1 in dark mode (STATS-3).
3. The Team chart's "Mean" label is pinned at x=4, on the first point and the line (STATS-4). SVG axis text uses Text Size tokens, so it outgrows the fixed chart padding (STATS-9).
4. The sticky Player/Team switch is the only sticky element without the top safe area (STATS-5). The feature-card pills use paper tints on the green card (STATS-6).
5. Retry buttons, notices, pills and cards are local copies instead of `src/clubhouse/ui/` components (STATS-7, STATS-8), and the phone grids and gutters are fixed-width so they overflow at real name lengths and large Text Size (STATS-10 to STATS-13).
