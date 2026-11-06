# Lane: CoachHelm Team view (TEAM)

Repo `helmv3` at `062f8a2`. Code: `src/clubhouse/screens/coachhelm/team/*`, `src/clubhouse/styles/coachhelm-team.css`. Spec: `design-refresh/coachhelm-team/04-FIDELITY-SPEC.md`, `06-SCREEN-SPECS.md`.
Owner screenshot: `screenshots/nick-phone-team-hole.png` (402pt wide iPhone, light). Staging figures used below: Tee +2.5, Approach +1.9, Around the green 0.0, Putting −3.9, team +0.5, one early player "CB".
Geometry: phone hole is viewBox 330×400 drawn at 338 wide at 390 (350 at 402), so 1 unit ≈ 1.02–1.06 px. Text widths are estimates at ≈0.55 em (Instrument Sans 500); they are marked "≈".
Note: the staging caption reads "3 rounds with hole scores", which `main` does not produce; staging is ahead of or beside `062f8a2`. The layout faults below are in `main` either way.

### TEAM-1 Station halo radius is uncapped, so real values draw circles bigger than the hole
- Severity: P0
- Where: Team board, hole card, phone and desktop, light and dark
- File: `src/clubhouse/screens/coachhelm/team/TeamHole.tsx:51` (`const r = 10 + Math.abs(v ?? 0) * 22`), used at `:77-78` (`.pulse`, `.halo`)
- What's wrong: The radius has no cap. With staging values, putting −3.9 gives r = 95.8 (diameter 191.6, 58% of the 330-wide viewBox); tee +2.5 gives r = 65; approach +1.9 gives r = 51.8. The putting halo's top is at y = −19.8, about 21px above the SVG, over the caption. The tee halo's bottom is at y = 419, 19 units below the 400 viewBox, so it runs about 14px into the chip row. The selected pulse scales ×1.7 to r ≈ 163 and reaches the kicker line. The spec's own radii were 15.4 to 26.2 because the fixture values were all under 0.74 (06 §S-TEAM.hole, "Station halo").
- Should be: Halos stay inside the hole drawing and never cover labels or the header (H11). Use 06's radii range (about 15 to 28).
- Fix: Clamp it, e.g. `const r = 10 + Math.min(Math.abs(v ?? 0), 1.3) * 14` (max 28.2), or scale against the largest station: `10 + (Math.abs(v) / maxAbs) * 18`. Set the pulse to scale 1.35, not 1.7 (`coachhelm-team.css:300`). With r ≤ 28 every halo fits: tee 354 + 28 = 382 < 400, putting 76 − 28 = 48 > 0.
- Confidence: high (owner screenshot; arithmetic from code)

### TEAM-2 Station labels sit at fixed points inside the halos
- Severity: P0
- Where: Team hole, phone (`HOLE.v`) and desktop (`HOLE.h`), both themes
- File: `src/clubhouse/screens/coachhelm/team/hole-geometry.ts:47-50` (`st.*.lx/ly`), `:80-83`; drawn at `TeamHole.tsx:80-85` (`text.sl`, `text.sv` at `ly + 21`)
- What's wrong: Label anchors are constants, so with real halos each label starts inside its own circle. Tee label x 178 vs halo edge 215. Approach label x 146 vs edge 161.8. The putting label (252,58) is 84 units from its centre, inside r 95.8. The short-game station (198,134) and its label start (234,134) are 64 and 86 units from the putting centre, so both sit inside the putting halo. Text on the selected halo fill (amber .34 over feat) is f-ink-2 at 4.36:1 light and 4.20:1 dark, under 4.5 (H8). Desktop does the same: the putting label (664,200) sits inside r 95.8 around (664,120).
- Should be: 06 §S-TEAM.hole says labels are clear of the marks; H11 (no overlap).
- Fix: Derive the label from the clamped radius, `lx = t.x + r + 8` for `a: 'start'` (desktop: `ly = t.y + r + 14`). Keep `lx/ly` only as the direction. After TEAM-1's clamp, move tee `lx` 178 → 186 (its edge lands exactly on 178).
- Confidence: high (screenshot plus code)

### TEAM-3 "Around the green" runs off the card
- Severity: P0
- Where: Team hole, phone, every Text Size (worst at XXL)
- File: `src/clubhouse/screens/coachhelm/team/hole-geometry.ts:49` (short_game `lx: 234`, `a: 'start'`), `:101` (`STATION_NAME.short_game = 'Around the green'`); `coachhelm-team.css:301-304` (`.stn .sl` 13px)
- What's wrong: The label starts at x 234 and is ≈118 units wide, so it ends near 352. The viewBox is 330, and the only thing holding it is `.feat { overflow:hidden }` at the card edge (about 350 units with the −6 margin and 16 padding). It touches the card edge at default size (seen in the screenshot). At Text Size ×1.12 it is ≈133 wide and loses "en". At ×1.35 it is ≈160 and reads "Around the g".
- Should be: H11 (no clip without ellipsis); 06 says the SVG doesn't scale.
- Fix: On the hole use `STATION_SHORT` ("Short game", ≈73 units, ends ≈307), or anchor this one label `end` to the left of the station. TEAM-6 stops it growing with Text Size.
- Confidence: high (screenshot)

### TEAM-4 The hole SVG draws outside its box (overflow visible plus negative margin)
- Severity: P0
- Where: Team hole, phone and desktop
- File: `src/clubhouse/styles/coachhelm-team.css:212-214` (`.feat .hole { margin:6px -6px 0 }`), `:215-220` (`.holesvg { overflow:visible }`), desktop `:1606-1611` (`overflow:visible`)
- What's wrong: The ported page relied on small halos. With `overflow:visible`, anything past the viewBox paints over the header figure, the caption and the station chips. That covers TEAM-1's 21px over the caption, the 14px into the chips, and the pulse up to the kicker. The only clip left is the card's rounded edge.
- Should be: Content stays in its own box (H11); 06 hole box 338×409.7.
- Fix: Set `.holesvg { overflow:hidden }` on both orientations once TEAM-1 and TEAM-2 are in. Keep the −6 margin only if nothing draws past x 0 to 330.
- Confidence: high

### TEAM-5 The figure's 3-line caption collides with the hole
- Severity: P0
- Where: Team hole header, phone 390 and 402, light and dark
- File: `src/clubhouse/screens/coachhelm/team/TeamBoard.tsx:73-80` (`.hn`, a `<br />` then "This season · N rounds · average of N players"); `coachhelm-team.css:196-211` (`.feat .hn { display:flex; align-items:flex-end; gap:12px }`)
- What's wrong: The caption beside the 40px figure gets ≈261px at 402 and ≈249px at 390 (inner 338 or 326, minus the ≈65px "+0.5", minus the 12 gap). Line 2 is ≈320px at 14px, so it wraps and the caption is 3 lines × 19 = 57px against the 40px figure. With `align-items:flex-end` its first line rides about 17px above the figure. The last line then sits where the halo overshoot from TEAM-1 and TEAM-4 lands. Spec 06 says "2 lines beside the figure".
- Should be: 06 §S-TEAM.hole "Figure sub … 2 lines beside the figure"; H11.
- Fix: On phone let the caption take its own row when it can't fit two lines: `.feat .hn { flex-wrap:wrap; align-items:baseline }` and `.hn span { flex:1 1 180px; min-width:0 }`. Or put "average of N players" on its own third line under the figure, not beside it. Add `margin-top:12px` on `.hole`.
- Confidence: high (screenshot)

### TEAM-6 SVG labels use the --ch-type-* tokens, so they grow with Text Size while the drawing doesn't
- Severity: P1
- Where: Team hole, huddle, course trend, finger-print; phone, at any Text Size above default
- File: `coachhelm-team.css:301-304` (`.stn .sl` `--ch-type-13-medium`), `:305-309` (`.stn .sv` `--ch-type-20-strong`), `:317-322` (`.scn text` `--ch-type-11-strong`), `:600-607` (`.trend text`, `.trend .lv`), `:862-871` (`.hudsvg .q`, `.axl`, `.tl`), `:884-890` (`.hp text`), `:953-956` (`.fp .lab`)
- What's wrong: `--ch-type-k` multiplies these in SVG user units, so at ×1.35 the station value is 27 units and coin initials are 14.85 units inside an r 11 (22-wide) coin, which overflows the coin. Labels push further into halos and off the card (TEAM-3). Spec: "SVG drawings (the hole, the huddle, the trend) don't scale" (06 line 7). H4 lets SVG chart text stay pinned.
- Should be: 06 line 7; 06 §S-TEAM.hole label 13/500, value 19/600, coin initials 9.5/600.
- Fix: Use fixed sizes in SVG: `.stn .sl { font-size:13px; font-weight:500 }`, `.stn .sv { font-size:19px; font-weight:600 }`, `.scn text { font-size:9.5px; font-weight:600 }`, and the same for `.hudsvg`, `.trend` and `.fp`. Note 11px in `.trend` and `.hudsvg` is also under H12; use 12.
- Confidence: high

### TEAM-7 Station tab row wraps "Short game" to two lines and misaligns the row
- Severity: P1
- Where: Team hole chip row (`.stchips`), phone 390 and 402
- File: `src/clubhouse/screens/coachhelm/team/StationControl.tsx:24-29`; `coachhelm-team.css:330-353` (5 columns, `gap:2px; padding:2px`; `button { padding:8px 4px; font 13 }`), `:1728-1730`
- What's wrong: Each chip's content box is 57px at 402 and 55px at 390 ((326 − 4 − 8) / 5 − 8). "Short game" at 13/500 is ≈72px, so it breaks to 2 lines. That chip grows from ≈55px to 73px. Every other button centres its content vertically, so its label and value sit 9px lower than "Short game"'s, and the row looks broken. "Approach" (≈57px) is on the edge and wraps at Text Size ×1.12. Spec: chip 61.6×64.7, label on one line.
- Should be: 06 §S-TEAM.hole "Station chip … label over value", one line each; H11.
- Fix: On phone, keep the four spots as a 4-up row (≈71px of content each) and put Course as a full-width row or chip under it. Set the label to `white-space:nowrap` with `font-variation-settings:'wdth' 88` (≈63px fits), and add `align-content:start` so a taller chip can't shift the others. Also match the spec's `gap:3px; padding:3px`.
- Confidence: high (screenshot)

### TEAM-8 Gains are drawn as losses on the hole and in the chips
- Severity: P1
- Where: Team hole and chip row, phone and desktop, light and dark
- File: `TeamHole.tsx:77-79` (a halo for any non-null v); `coachhelm-team.css:276-284` (`.halo`/`.core` always amber f-loss), `:347-353` (`.stchips button b { color: var(--ch-tb-f-loss) }`)
- What's wrong: Tee +2.5 and Approach +1.9 are strokes gained (the code's own sign: `worstOf` treats v < 0 as a loss). They draw the second and third biggest amber halos, and their chip values are amber. Around the green 0.0 is amber too. The biggest "leak" circles on the hole are gains.
- Should be: 04 §8 F (amber loss, green gain); D-42 and H15; H13; `format.ts:19-21` F-54 (0.0 is neither colour).
- Fix: Draw halos only for v < 0, or add `.stn.is-gain .halo { fill: rgb(143 211 170/.17); stroke: var(--ch-tb-f-gain) }`. Colour the chip `<b>` by sign: f-loss below 0, f-gain above, f-ink-2 at 0.0. Use `changeTone()` from `lib/format.ts`.
- Confidence: high

### TEAM-9 Team-average mark lands at the far loss end for a gaining station
- Severity: P1
- Where: Spot card bars and the player sheet bars, phone and desktop
- File: `src/clubhouse/screens/coachhelm/team/SpotCard.tsx:42`; `panels.tsx:280`
- What's wrong: `left = 84 − min(|team|, 1.3) / 1.3 × 84` uses the absolute value, so Tee (+2.5) puts the dashed average at 0%, the left end of the track, which reads as a 1.3-stroke loss. Approach +1.9 does the same.
- Should be: 06 §S-TEAM.spot track: the average mark at the station mean on the same scale as the fills (loss left of 84%, gain right).
- Fix: `left = v < 0 ? 84 − min(|v|,1.3)/1.3×84 : 84 + min(v,0.25)/0.25×16`. Share one helper with `barScale`.
- Confidence: high

### TEAM-10 Rank words show on every station, including gains ("+2.5 a round · smallest")
- Severity: P1
- Where: Spot card header meta, phone and desktop
- File: `src/clubhouse/screens/coachhelm/team/SpotCard.tsx:14` (`RANK`), `:78`
- What's wrong: Every station gets a rank word from `stationOrder`. A gain reads "+2.5 a round · smallest" or "+1.9 a round · third", calling a gain a leak.
- Should be: 06 line 293: "biggest leak" only on the station with the largest loss; other stations show the value alone.
- Fix: `${formatSigned(v)} a round${rank === 0 && v < 0 ? ' · biggest leak' : ''}`.
- Confidence: high

### TEAM-11 The hollow (early) coin is a dashed dark disc that reads as broken
- Severity: P1
- Where: Team hole, early players (under 5 rounds), both themes
- File: `coachhelm-team.css:323-329` (`.scn.early circle { fill: var(--ch-tb-feat)!important; stroke-dasharray:3 2.4 }`; stroke from `:313-316` is f-ink .55); `TeamHole.tsx:91-92`
- What's wrong: The early coin is a feat-green disc with a 3/2.4 dashed light ring. In a halo it looks like a broken or loading icon, which is the "CB" coin in the screenshot. The coin also lands on the bunker: putting slot (118,98) is inside the bunker ellipse at (110,100) with rx 14.
- Should be: 06 §Coin: "Hollow … no fill, 1.5 ring in the player colour, initials … on the hole `--f-ink`".
- Fix: `.scn.early circle { fill: var(--ch-tb-feat); stroke: currentColor; stroke-dasharray: none; stroke-width:1.5 }` with `color` set to `coinColor(id)` on the `<g>`. Move the putting coin slots off the bunker, e.g. (128,112) and (152,120).
- Confidence: high (screenshot)

### TEAM-12 Stations have no 44pt hit target
- Severity: P1
- Where: Team hole, phone
- File: `TeamHole.tsx:61-86` (the `g.stn role="button"` contains only the halo, the core and the text)
- What's wrong: Around the green at 0.0 has r 10, a 20-unit (≈21px) circle. A station with no figure has no circle, so only its text can be tapped. After TEAM-1's clamp, all four halos are at most 56 units wide, and small values are about 30.
- Should be: 06 line 242: "give each station an invisible 44 by 44 target centred on it"; H10.
- Fix: Add `<circle className="hit" cx={t.x} cy={t.y} r={22} fill="transparent" />` first in each `.stn`, with `.stn .hit { pointer-events: all }`.
- Confidence: high

### TEAM-13 Roster totals are amber even when the player gains
- Severity: P1
- Where: Roster card, phone and desktop
- File: `src/clubhouse/screens/coachhelm/team/Cards.tsx:71` (adds `g` when total > 0); `coachhelm-team.css:931-934` (`.rr .tot { color: var(--ch-tb-loss) }`), with no `.rr .tot.g` rule anywhere
- What's wrong: The `g` class has no style, so a +0.5 total is painted loss amber. A null total ("—") is amber too.
- Should be: 06 §roster: loss amber, gain green; H13; F-54 for 0.0.
- Fix: Add `.ch-htb .rr .tot.g { color: var(--ch-tb-gain) }`. Use `changeTone(p.total, false)` and give "—" `--ch-tb-ink-3`.
- Confidence: high

### TEAM-14 Huddle quadrant label runs off the card with real data, and a coin sits on it
- Severity: P1
- Where: Huddle card, phone and desktop
- File: `src/clubhouse/screens/coachhelm/team/Huddle.tsx:195-197` (`x={X(as) + 6}`), `:189-194` (fixed corners)
- What's wrong: With staging values, striking = 2.5 + 1.9 = 4.4 and scoring = −3.9. `huddleRange` widens to −4.3 to 4.7, so X(4.4) = 299 and Y(−3.9) = 211. "Strikes well, leaks scoring" (≈150 units) starts at x 305 of 320 and about 135 units of it are clipped by `.card { overflow:hidden }`. The player's coin (r 13 at 299,211) sits on its first letters, and "Behind on both" (y 212) sits on the dashed average line at y 211.
- Should be: H11; 06 §S-TEAM.huddle (labels in their quadrant, clear of marks).
- Fix: Anchor the right-hand label `end` at `W − R − 4` when `X(as) > W/2`. Place quadrant labels against the plot edges, not against the average lines. Hide a label when a coin falls inside its box.
- Confidence: high (computed from code with staging values)

### TEAM-15 Story viewer ignores safe areas: progress bar under the Dynamic Island, buttons under Safari's bar
- Severity: P1
- Where: "This week" story viewer, phone (iOS Safari)
- File: `coachhelm-team.css:1244-1256` (`.story { padding:48px var(--ch-tb-edge) 32px }`), `:1826-1829` (`position:fixed`)
- What's wrong: The viewer is full screen and fixed, with a fixed 48px top and 32px bottom. The iPhone 16 Pro top inset is about 62px, and the bottom has a 34px home indicator plus Safari's floating toolbar (visible in the owner's screenshot). So the progress bar and close button sit under the status bar, and "Open the read" / "Next" sit under the toolbar. There is no `env(safe-area-inset-*)` anywhere in the rule.
- Should be: 06 §S-TEAM.story "padding 54 16 34" inside the safe area; brief: safe-area bottom padding.
- Fix: `padding: calc(env(safe-area-inset-top) + 12px) var(--ch-tb-edge) calc(env(safe-area-inset-bottom) + 34px)`.
- Confidence: medium (no device run; code certain)

### TEAM-16 Close buttons are 34×34 with no extra hit area
- Severity: P1
- Where: Read, player, course and gone sheets, desktop inspector, story viewer
- File: `coachhelm-team.css:1123-1133` (`.xb { width:34px; height:34px }`); used at `panels.tsx:34`, `Stories.tsx:163`, `:307`
- What's wrong: The visible size is the tap size, 34×34.
- Should be: 06 line 128: "Close hit area 44 by 44 (5 of transparent padding round the 34 circle)"; H10.
- Fix: `.xb { position:relative } .xb::after { content:""; position:absolute; inset:-5px }`. Or use `ui/Button` `ch-iconbtn`.
- Confidence: high

### TEAM-17 Phone sheet content is inset 32px, double the spec
- Severity: P1
- Where: Read, player and course sheets (ui/Modal), phone
- File: `coachhelm-team.css:1788-1790` (`.ch-htb-sheet .ch-modal__body { padding-inline:16px }`, keeping `controls.css:470-475`'s 16 top and 20 to 24 bottom) plus `:1101-1105` (`.ins { padding: 8px var(--ch-tb-edge) 40px }`)
- What's wrong: Body padding and `.ins` padding stack. Content sits 32px from each side (cards 326 wide at 390 instead of 358), 24px from the top and 60 to 64px from the bottom.
- Should be: 06 §Sheet chrome: "Body `.ins`: padding 8 16 40".
- Fix: `.ch-htb-sheet .ch-modal__body { padding:0 }` and let `.ins` own the inset.
- Confidence: high

### TEAM-18 Desktop roster: the "Loses most" badge is wider than its column and overlaps the finger-print
- Severity: P1
- Where: Roster card, desktop 1440, both themes
- File: `src/clubhouse/screens/coachhelm/team/Cards.tsx:67`; `coachhelm-team.css:1634-1636` (`grid-template-columns: auto minmax(0,1fr) 112px auto 64px`); Badge is `white-space:nowrap` (`ui.css:291-301`)
- What's wrong: "Loses most: Short game" at 12/600 plus 16 padding is ≈160px in a 112px track. It spills about 48px over the 78px finger-print.
- Should be: H11; 06 §S-TEAM.roster desktop columns.
- Fix: Change the column to `minmax(112px, max-content)`, or shorten the badge to the spot name alone ("Short game") with the header saying "Loses most".
- Confidence: medium (width estimated)

### TEAM-19 Hidden sheet header still holds a focusable Close and the dialog's label "Details"
- Severity: P2
- Where: Phone sheets (ui/Modal with `.ch-htb-sheet`)
- File: `coachhelm-team.css:1781-1787` (visually hides `.ch-modal__head`); `TeamBoard.tsx:380` (`title="Details"`)
- What's wrong: The clipped header keeps the Modal's own Close button in the tab order as a 1px invisible stop, next to the panel's `.xb`. The dialog is labelled "Details" and focus goes to that hidden "Details" heading, not the panel title.
- Should be: 06 §Sheet chrome (one close button); H1.
- Fix: Pass the panel's real title to `Modal`, and add a prop to drop the Modal header instead of clipping it. Or point `initialFocus` at `.insh b`.
- Confidence: medium

### TEAM-20 Under Reduce Motion the busy spinners stop
- Severity: P2
- Where: Assign or Undo busy states in the sheets, phone and desktop
- File: `coachhelm-team.css:1683-1690` (`.ch-htb * { animation-duration:1ms!important; animation-iteration-count:1!important }`)
- What's wrong: Every animation under `.ch-htb` is forced to one 1ms run, including the shared Button spinner (`ch-spinner-turn`), so a busy button shows a frozen arc.
- Should be: H19: "the spinner … keeps turning" (OQ-18).
- Fix: Exclude the spinner: `.ch-htb :where(*:not(.ch-spinner, .ch-btn__spinner))`, or set `animation-iteration-count` only on named classes.
- Confidence: medium (spinner class name to confirm)

### TEAM-21 Course sheet header shows a raw ISO date
- Severity: P2
- Where: Course sheet (tap a course row), phone and desktop
- File: `src/clubhouse/screens/coachhelm/team/panels.tsx:344` (``line={`${row.rounds} rounds this season · last ${row.last}`}``)
- What's wrong: `row.last` is a `YYYY-MM-DD` string; `CourseCard.tsx:93` formats it with `day()`, but the sheet prints it as is ("last 2026-10-26").
- Should be: 06 §S-TEAM.course-sheet ("· last Oct 26").
- Fix: Export `day` from `CourseCard.tsx` and use `day(row.last)`.
- Confidence: high

### TEAM-22 0.0 is painted green in bars and sheets
- Severity: P2
- Where: Spot card bars, player sheet bars
- File: `SpotCard.tsx:36` (`loss = v < 0`), `:45`; `panels.tsx:284` (`v >= 0 ? ' g'`)
- What's wrong: A player at exactly 0.0 (Around the green on staging) gets the gain colour on the value and a gain fill of length 0.
- Should be: `lib/format.ts:19-21` F-54: "0.0 is no change, so it is never painted amber or green".
- Fix: Use `changeTone(v, false)` and `--ch-tb-ink-2` for ''.
- Confidence: high

### TEAM-23 Hyphen as minus in story and comparison figures
- Severity: P2
- Where: Story viewer (focus before and now), read-sheet comparison ladder
- File: `Stories.tsx:73`, `:78`, `:81` (`formatFixed(p.from|now|target)`); `panels.tsx:46` (`formatFixed(v, …)`); `formatFixed` is `value.toFixed()` (`lib/format.ts:88-91`)
- What's wrong: A negative strokes-gained focus value prints "-0.4" with U+002D.
- Should be: H14 (U+2212).
- Fix: Use `formatSigned` for signed figures, or make `formatFixed` swap in `MINUS`.
- Confidence: medium (depends on the focus metric's sign)

### TEAM-24 Huddle's rotated axis label is as long as the plot at default size and spills past it when larger
- Severity: P2
- Where: Huddle card, phone
- File: `Huddle.tsx:201-203` (`.axl` rotated); `coachhelm-team.css:865-868` (`--ch-type-12-medium`)
- What's wrong: "Scoring: short game and putting" is ≈205 units against a plot height of 204 (T 16 to 220). At ×1.12 it is ≈230 and overflows top and bottom, with `.hudsvg { overflow:visible }` (`:842-847`), toward the card header.
- Should be: H11; 06 line 7.
- Fix: Use fixed 11.5 to 12px (see TEAM-6), shorten to "Scoring: short game, putting", and set `overflow:hidden`.
- Confidence: medium

### TEAM-25 Huddle coins: 28px tap targets, and low-contrast edges in dark
- Severity: P2
- Where: Huddle card, phone; dark theme
- File: `Huddle.tsx:220` (`r={13}`, fill and stroke both `coinColor`); `TeamHole.tsx:11` (`TONE_FILL`)
- What's wrong: The hit target is a 26-unit circle (≈28px). In dark, the sage, mist and heather coins against the card (#191E1A) measure 2.69, 2.66 and 2.53:1, under the 3:1 floor for marks.
- Should be: H10; H8 (non-text 3:1).
- Fix: Add an invisible r 22 hit circle per coin. In dark, give coins a 1.5 ring in `--ch-tb-f-ink`/`--ch-tb-ink` at 0.5 or lift the tone fills.
- Confidence: high (ratios computed)

### TEAM-26 Team against Tour grid is 3-up on phone and its cells wrap
- Severity: P2
- Where: Course tab, phone 390
- File: `coachhelm-team.css:684-713` (`.shape` 3 columns; `.sv` 20/600; `.st` 12)
- What's wrong: Cells are ≈95px of content. "Not measured yet" at 20/600 (≈170px) breaks onto 2 to 3 heavy lines, and "a hole · Tour +0.00" (≈115px at 12) wraps. Rows end at different heights.
- Should be: 06 §S-TEAM.course grid (118.7 wide cells); H11.
- Fix: Show "—" (H14) instead of "Not measured yet" in `.sv`. Allow a 2-up grid under 400px, or give `.st` `white-space:nowrap; text-overflow:ellipsis`.
- Confidence: medium

### TEAM-27 Spot axis "Tour" label is not under the zero line
- Severity: P2
- Where: Spot card and player sheet axis, phone 390
- File: `coachhelm-team.css:459-468` (`.axis`, `span:last-child { padding-right:40px }`)
- What's wrong: The zero line is at 84% of the track, about x 255 in a 358 card. "Tour" is pushed right by a fixed 40px pad, so its centre is about x 287, roughly 30px off its line. The gap changes with Text Size (`92 × k` name column).
- Should be: 06 §S-TEAM.spot (Tour at the zero line).
- Fix: Put the axis in the same grid as `.br` (`92k / 1fr / 52`) and absolutely position "Tour" at `left: 84%` of the track cell with `translateX(-50%)`.
- Confidence: medium

### TEAM-28 Skeleton doesn't match the loaded frame (layout jump)
- Severity: P2
- Where: Team board loading, phone and desktop
- File: `TeamBoardSkeleton.tsx:35` (`CoachHelmTabs` outside `.sheet`) vs `TeamBoard.tsx:363-365` (tabs inside `.sheet`); `:38` This week 120 tall; `:46-61` desktop has no title or tabs
- What's wrong: On phone the tabs move from full width to the 16px page edge when data lands, and "This week" grows from 120 to about 227. The desktop skeleton has no header row, so everything shifts down by the title and tab height.
- Should be: 06 `#loading` (cards 180, 406, 258, 216; title and switch stay); H1.
- Fix: Render the tabs inside `.sheet` as the board does. Use the 06 heights. Add the `ch-htb-deskhead` with `LargeTitleSkeleton` on desktop.
- Confidence: medium

### TEAM-29 Failure notices are missing their icon tile (only This week has it)
- Severity: P2
- Where: Working on failed, Track record unavailable, hole failed, player with no rounds
- File: `Cards.tsx:118-127`, `:170-175`; `TeamBoard.tsx:257-267`; `panels.tsx:250-255` (no `.ni`); compare `Stories.tsx:222-225`
- What's wrong: The same notice is drawn two ways: with the 34px warning tile on This week and as bare text everywhere else, so those read as plain paragraphs.
- Should be: 06 line 114 (notice: icon tile 34 by 34, `--tint-loss`, 18 warning glyph).
- Fix: Make one `Notice` part (or use `ui/States`), with the `.ni` tile, and use it in all five places.
- Confidence: high

### TEAM-30 Course "Try again" is a bare inline text button with no height
- Severity: P2
- Where: Course tab failed state
- File: `CourseCard.tsx:124`; `coachhelm-team.css:1768-1771` (`.more.is-inline { min-height:0; padding:0 }`)
- What's wrong: The tap target is the text line, about 19px tall.
- Should be: 06 line 116 ("Try again" 36 tall, extend to 44); H10.
- Fix: Use `ui/Button variant="ghost" size="sm"` as the other notices do.
- Confidence: high

### TEAM-31 The same station has two names on one card
- Severity: P2
- Where: Team hole (label) vs chip row and spot header
- File: `hole-geometry.ts:101-102` (`STATION_NAME.short_game = 'Around the green'`, `STATION_SHORT = 'Short game'`); used at `TeamHole.tsx:81`, `StationControl.tsx:29`, `SpotCard.tsx:76`
- What's wrong: The hole says "Around the green" and the chip under it says "Short game" for the same spot. The roster key says "short game".
- Should be: one term per spot (glossary `TERMS.shortGame`).
- Fix: Use "Short game" on the hole, which also fixes TEAM-3's width, or "Around the green" everywhere with a 2-line-safe chip.
- Confidence: high

### TEAM-32 Story tile picture is invented for read and theme stories
- Severity: P2
- Where: This week tiles, phone and desktop
- File: `Stories.tsx:38-44` (fixed bars 70 and 90 wide)
- What's wrong: Any story that isn't a focus draws the same two bars (70, then 90) in gain green, implying a measured improvement that isn't in the data. "Slipping" only swaps the colour.
- Should be: The file's own comment and 03 §6 ("no invented figures").
- Fix: Draw the round's 18-hole strip for a read story (the data is in `storyRounds`), and a neutral glyph for a theme. Or draw no picture.
- Confidence: medium

### TEAM-33 First-paint fly-in and trend draw-in conflict with the rubric
- Severity: P2
- Where: Team hole first paint each session; Course tab trend
- File: `team-motion.ts:14-86` (ball flight, stations pop in), `:128-143` (line draw, dots staggered 55ms)
- What's wrong: The lane spec asks for these (M-TEAM-01 to 04, 13 to 15), but RUBRIC H2 fails "chart draw-ins or first-paint staggers (Q-153)". The fly-in also adds `.pre` to stations, which hides the halos and labels for about 2.2s after load.
- Should be: H2 vs 07-MOTION M-TEAM-01: owner decision.
- Fix: Ask the owner. If H2 wins, drop `useFlyIn` and `useTrendDraw`.
- Confidence: low (spec conflict)

### TEAM-34 Dead keyframe references (a drop-in trap)
- Severity: P2
- Where: CSS only
- File: `coachhelm-team.css:531` (`animation:fadein`), `:998` (`popin`), `:1228` (`draw`, with `stroke-dashoffset:24` at `:1226-1227`), `:1237` (`spin`), `:1331` (`storyin`); the keyframes are named `ch-htb-*` (`:838`, `:1000`, `:1230`, `:1333`)
- What's wrong: None of these names exist, so the animations never run. `.assigned path` would draw an invisible check if the class were used, and `.spin` would not turn. They are unused in the TSX today.
- Should be: one source of motion (07-MOTION).
- Fix: Delete the dead rules, or rename them to the `ch-htb-*` keyframes.
- Confidence: high

## Summary (worst first)
1. TEAM-1/4: halo radius `10 + |v|×22` with no cap, drawn with `overflow:visible`. Putting −3.9 is r 95.8 and covers the caption, the labels and the chip row.
2. TEAM-2/3: fixed label coordinates sit inside halos (on-halo text 4.36:1), and "Around the green" ends at about x 352 of 330, clipped at the card edge.
3. TEAM-5/7: the header caption wraps to 3 lines beside the figure, and the 5-up chip row wraps "Short game" (≈72px into 55px), which misaligns the row.
4. TEAM-8/9/10/13: gains drawn as losses (amber halos and chips, average mark at the loss end, "smallest" leak, amber roster totals).
5. TEAM-6/15/16/17: SVG text scales with Text Size, the story viewer has no safe areas, close buttons are 34px, and sheets have a 32px double inset.
