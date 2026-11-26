# Mobile audit: CoachHelm Team view (incl. Brief and switch), Root cause, Coach vs player

Repo `helmv3` at main `062f8a2`, read-only, from the code alone. Phone only: 320, 375, 390/393, 430 and landscape 844x390; Text Size at default, the largest non-AX size and XXL (k capped at 23/17 = 1.353 by lib/dynamic-type.ts); Safari, home-screen standalone and dark mode. Every block is new against `lanes/*.md`, `fidelity-*.md`, `motion.md` and `qa-staging.md`, or extends a named finding with a new, concrete problem.

Two facts several findings depend on:
- `useChPhone()` tests `(max-width: 820px)` (src/clubhouse/lib/use-phone.ts). An iPhone in landscape (844 wide) gets the **desktop** layout: a 208px sidebar plus a 28px gutter (shell.css:4334), and `.ch-app` safe-area padding of about 47px on each side (shell.css:8). That leaves about 534px for the main area.
- `<Modal>` (ui/Modal.tsx) is a `<dialog>` and puts its `className` on the dialog itself. Route CSS loads after controls.css (routes/coachhelm.tsx:49-61), so a same-specificity rule in route CSS beats the Modal's own rules.

---

### MOB-TEAM-1 Team and file read sheets lose their height cap: tall sheets run off the bottom of the screen and can't scroll
- Severity: P0
- Where: Team view on phone. Read, player, course and gone sheets ("Details"). Player file and Your week "This read" sheets. 320 and 375 at default size; every width at XXL. Light and dark.
- File: src/clubhouse/styles/coachhelm-team.css:1805-1809 (`.ch-htb-sheet .ch-modal__panel{max-height:86%}`); controls.css:525-536 (phone `.ch-modal__panel{max-height:var(--ch-modal-max-h)}` = 92dvh); controls.css:393-403 (`.ch-modal{overflow:visible}`); used by TeamBoard.tsx:380, PlayerFile.tsx:380, YourWeek.tsx:109
- What's wrong:
  - The rule has specificity (0,2,0) and loads later, so it replaces the phone's 92dvh cap with `86%`.
  - The dialog has no definite height, only `max-height`. A percentage max-height against an auto-height parent computes to `none`.
  - The panel therefore grows to its full content height. The dialog is `overflow:visible`, so the panel spills below the viewport. `.ch-modal__body{overflow:auto}` never gets a bounded box, so it never scrolls.
  - The read sheet is long (head, lede, evidence badges, Comparison, ReadEvidence cards, drill, correction chips, Assign / Ask actions, "Open the full read"; panels.tsx ReadPanel). At 375 it is taller than the screen even at the default size. The actions and the "full read" link are pushed past the home indicator and can't be reached. Dragging scrolls the page behind or does nothing.
- Should be: The sheet stops at 92dvh minus the top safe area, and its body scrolls inside it with the grabber and header pinned, as every other ui Modal sheet does on phone.
- Fix: Delete `max-height:86%` from `.ch-htb-sheet .ch-modal__panel`, or set `--ch-modal-max-h:86dvh` on `.ch-htb-sheet` so the shared cap and the flex column stay in charge. Check at 320x568 with XXL that "Assign" and "Open the full read" can be scrolled to.
- Confidence: medium-high (the CSS resolution is certain; the visible outcome is inferred, not run in a browser)

### MOB-CVP-1 Set-intent note is 15px, so Safari zooms on focus, the keyboard is never detected, and Save sits under the keyboard (extends CVP-13)
- Severity: P1
- Where: Player file, set-intent sheet (IntentSheet), the "Only you see this" note. iPhone Safari and standalone, every width.
- File: src/clubhouse/styles/coachhelm-file.css:285 (`.ch-hf .note{font:var(--ch-type-15)}`); src/clubhouse/screens/coachhelm/file/IntentSheet.tsx:103 (textarea), :60 (Modal with `footer`); src/components/providers/CapacitorProvider.tsx:216 (`viewport.scale > 1.01 ? 0 : ...`); controls.css (`body.keyboard-open .ch-modal{margin-bottom:var(--keyboard-height)}`)
- What's wrong:
  - At default Text Size the font is 15px. iOS zooms any field under 16px when it gets focus.
  - The keyboard fallback reports a height of 0 whenever `visualViewport.scale > 1.01`, on purpose. A focus zoom is exactly that case.
  - So `keyboard-open` is never set, and the sheet never lifts. The "Save plan" footer stays behind the keyboard, and the page stays zoomed after the keyboard closes.
  - The textarea also has no `enterkeyhint`.
  - CVP-13 covers the hand-drawn field and chips, not the zoom or the keyboard.
- Should be: Focus does not zoom. The sheet rises with the keyboard, and Save stays visible above it.
- Fix: `font-size:max(16px, calc(15 * var(--ch-type-k)))` on `.note`, or use the FormSheet TextArea, which should carry the same floor. Add `enterkeyhint="done"`. Check with the keyboard up at 320x568 that the footer is visible.
- Confidence: high

### MOB-CVP-2 `.ch-hf` paints the sheet's `<dialog>`: square page-coloured corners behind the rounded sheet and a 48px band under it
- Severity: P1
- Where: Player file read sheet, Your week read sheet, and the set-intent sheet, on phone. Light (#f2f0e9) and dark (#0e120f).
- File: src/clubhouse/styles/coachhelm-file.css:57 (`.ch-hf{background:var(--ch-hf-a-page);padding-bottom:48px}`); PlayerFile.tsx:380, YourWeek.tsx:109 (`className="ch-htb-sheet ch-htb ch-hf ch-hf-sheet"`); IntentSheet.tsx:60 (`className="ch-hf ch-hf-sheet"`); controls.css:393-403 (`.ch-modal{padding:0;background:transparent}`)
- What's wrong:
  - The Modal's className lands on the dialog element. `.ch-hf` (0,1,0) loads after `.ch-modal` (0,1,0), so it replaces the dialog's transparent background and zero padding.
  - The dialog becomes a page-coloured rectangle. Its square top corners show behind the sheet's rounded corners, which ruins the sheet silhouette over the scrim.
  - The panel is pushed up by a 48px page-coloured band at the bottom, so the sheet appears to float above the home indicator.
- Should be: The dialog stays transparent with no padding. Only the panel is painted, with its rounded top corners, flush to the bottom edge.
- Fix: Scope the page rule to the page root (`main.ch-hf{...}` or `.ch-hf:not(.ch-modal)`), or pass a separate sheet class (for example `ch-hf-sheet` alone) and put the `--ch-hf-*` tokens on it without background or padding.
- Confidence: high

### MOB-TEAM-2 Story viewer press-and-hold selects text and opens the loupe; vertical drags scroll the board behind and cancel the hold
- Severity: P1
- Where: Team view, story viewer, at every phone width, in Safari and standalone.
- File: src/clubhouse/screens/coachhelm/team/Stories.tsx:140-149 (`onPointerDown/Up/Cancel` → `held`), :168 (`.sto-b` div `onClick={next}`); coachhelm-team.css:1244, :1826 (`.story`), :1303-1325 (`.sto-b h3/p`); base.css (touch-callout only on button, a and role elements)
- What's wrong:
  - Pause is a long press on the whole viewer. iOS treats a long press on text as a selection: the h3 and p highlight, the loupe and the Copy / Look Up callout appear, and the selection stays when the finger lifts.
  - Nothing sets `user-select:none`, `-webkit-touch-callout:none` or `touch-action` on `.story`.
  - The viewer is `position:fixed` with no body scroll lock. A small vertical movement during a hold scrolls the Team board under the viewer and fires `pointercancel`, so the pause ends early.
  - There is no swipe-down to dismiss, the gesture every iOS story viewer has.
- Should be: Holding pauses with no selection or callout. The page behind does not move. Swiping down closes the viewer.
- Fix: On `.ch-htb .story`, set `user-select:none; -webkit-user-select:none; -webkit-touch-callout:none; touch-action:none` (or `pan-x`) and `overscroll-behavior:contain`. Lock the document scroll while the viewer is open, as ui Modal does. Add a downward-drag dismiss that follows the finger and respects Reduce Motion.
- Confidence: high

### MOB-TEAM-3 Story body has no overflow path: at 320x568 or XXL the Back / Next footer is pushed off the screen
- Severity: P1
- Where: Story viewer at 320x568 (SE) at default size and at every width at XXL; worst on stories with the 18-hole grid.
- File: coachhelm-team.css:1303-1310 (`.sto-b{flex:1;justify-content:center;gap:20px}`), :1311-1318 (h3 `--ch-type-28-strong`, p `--ch-type-16`), :1326 (`.sto-f`); :1244 (`.story` padding 48 top, 32 bottom)
- What's wrong:
  - The body is a centred flex column with no `min-height:0` and no `overflow`.
  - At k=1.353 the title is about 38px per line and the body about 22px. With the progress bar, the source row and the grid, the content is taller than 568 − 80px of padding.
  - Content centred with `justify-content:center` overflows at both ends: the top of the title goes under the progress bar and the `.sto-f` buttons fall below the bottom edge. Nothing scrolls.
- Should be: The footer stays pinned and reachable, and the body scrolls (or the type scales down) when it doesn't fit.
- Fix: `.sto-b{min-height:0;overflow-y:auto;justify-content:safe center}`, and keep `.sto-f` as a non-shrinking footer. Check at 320x568 and XXL.
- Confidence: medium

### MOB-TEAM-4 Spot and Player bar rows are 30px tap targets with 12px gaps
- Severity: P1
- Where: Team view on phone, the Spot card rows and the player sheet bars ("tap a row to open the player").
- File: coachhelm-team.css:397-406 (`.ch-htb .br{min-height:30px}`, row gap 12); src/clubhouse/screens/coachhelm/team/SpotCard.tsx:30, :38 (`.br tapp` button)
- What's wrong: Each row is a button about 30px tall, with 12px of dead space between rows. That is under 44pt, and a thumb landing in a gap does nothing. TEAM-12 covers the stations, not these rows.
- Should be: Each row is at least 44px tall, or has a 44px hit area that fills the gap.
- Fix: `min-height:44px` on `.br.tapp`, or a `::after{inset:-7px 0}` hit area with the row gap set to 0 and the rows padded instead.
- Confidence: high

### MOB-TEAM-5 Spot row names truncate after about 7 characters
- Severity: P1
- Where: Spot card on phone at 375 and 390. Worse at 320 and at XXL.
- File: coachhelm-team.css:400-406 (`.br{grid-template-columns:calc(92*var(--ch-type-k)) minmax(0,1fr) 52px}`), :407-413 and :1762 (`.bn{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}`); SpotCard.tsx:22-27 (24px Coin + first name); team/parts.tsx (Coin small = Avatar xs 24)
- What's wrong:
  - The name column is 92px at k=1. Taking the 24px coin and 6px gap leaves 62px for a 13–14px first name.
  - "Christopher" and "Alessandra" show as "Christo…" and "Alessan…".
  - At XXL the column grows to 124px but the type grows too, so about 8 characters still fit. The spare width in the 1fr bar column is never given to the name.
- Should be: Names up to 12 characters show in full at 375 at default size. The bar gives way first.
- Fix: Make the name column `minmax(calc(92*k), max-content)` capped at about 40%, or drop the coin on phone. At XXL, put the name on its own line above the bar.
- Confidence: high

### MOB-TEAM-6 At 320 the hole SVG shrinks to 0.81: station labels about 10.5px, coin initials about 9px, coins about 18px (extends TEAM-6)
- Severity: P1
- Where: Team view, Hole card, 320 wide (SE 1st gen and Zoomed display), every Text Size.
- File: src/clubhouse/screens/coachhelm/team/TeamHole.tsx:35 (`viewBox 0 0 330 400`), :92 (coin r=11), :100 (`+N` coin); hole-geometry.ts (HOLE.v w330); coachhelm-team.css:301-309 (`.stn .sl/.sv`), :317-322 (`.scn text` type-11)
- What's wrong:
  - The figure box at 320 is about 268px (320 − 2×16 edge − card padding), so the 330-unit viewBox scales by about 0.81.
  - Text in the SVG uses `--ch-type-*` in user units, so it shrinks with the drawing: type-13 labels render at about 10.5px and type-11 coin initials at about 8.9px. Both are under the app's 12px floor.
  - Coins become about 18px circles. The `+N` coin is the only way to open a crowded station.
  - TEAM-6 covers the opposite direction (labels growing with Text Size). This is the shrink at the narrowest width.
- Should be: Labels and initials render at 12px or more on screen at 320. Coins keep a 44px hit area.
- Fix: Divide SVG text sizes by the rendered scale (measure the SVG width with a ResizeObserver and set `--hole-s`), or move the labels into HTML over the SVG. Give each coin and the `+N` coin a transparent r=22 hit circle.
- Confidence: medium-high

### MOB-TEAM-7 Phone landscape (844x390) gets the desktop Team layout, squeezed into about 486px
- Severity: P1
- Where: Team view, iPhone landscape 844x390 (and 852 and 932 Pro Max).
- File: src/clubhouse/lib/use-phone.ts (`(max-width: 820px)`); TeamBoard.tsx:158; coachhelm-team.css:1592-1605 (`.feat .top` flex, chips `width:min(500px,64%)`), :1722 (`@media (max-width:1179px)` single column 720); shell.css:4334 (208 sidebar, 28 gutter), :8 (`.ch-app` safe-area padding)
- What's wrong:
  - 844 − 2×47 safe area − 208 sidebar − 2×28 gutter leaves a card about 486px wide.
  - The station chips get `min(500px,64%)` ≈ 311px for 5 chips, about 57px each, so "Short game" and "Approach" wrap.
  - The figure column left beside the chips is about 141px, so the 3-line caption wraps to about 6 lines.
  - Only about 300px of height is left under Safari's landscape bars, so the sidebar and the bar take most of the screen.
- Should be: An iPhone in landscape keeps the phone layout (tab bar, sheet, no sidebar), or gets a compact layout made for that height.
- Fix: Decide the phone layout on `(max-width:820px), (max-height:500px) and (pointer:coarse)` in `useChPhone`, or add a landscape-phone breakpoint. Owner decision; see the report.
- Confidence: high

### MOB-TEAM-8 Desktop inspector in landscape ignores the right and bottom safe areas and has no scrim
- Severity: P1
- Where: Team view, iPhone landscape 844x390 (desktop layout): the inspector opened from a station, row or story.
- File: coachhelm-team.css:1645-1658, :1813-1817 (`.insp{position:fixed;top:58px;right:0;bottom:0;width:420px}`); src/clubhouse/screens/coachhelm/team/Inspector.tsx (non-modal aside, Esc closes)
- What's wrong:
  - `right:0` and `bottom:0` put the panel under the Dynamic Island or sensor housing (rotated to the right) and the home indicator. Its close button and last row sit about 47px into the cut-out.
  - At 420 of 844px it covers half the screen. With no scrim and no tap-outside to close, a touch user can only close it with the X.
- Should be: The panel is inset by `env(safe-area-inset-right)` and `env(safe-area-inset-bottom)`. On touch it closes with a tap outside or is shown as a sheet.
- Fix: `right:env(safe-area-inset-right);bottom:0;padding-bottom:env(safe-area-inset-bottom)` and `width:min(420px, 50vw)`. Add a transparent scrim on `(pointer:coarse)`, or use the phone sheet when MOB-TEAM-7 moves landscape to the phone layout.
- Confidence: high

### MOB-RC-1 Phone landscape (844x390) gives the Read page's middle column about 216px (extends RC-7)
- Severity: P1
- Where: Read page (root cause), iPhone landscape 844x390, coach view.
- File: src/clubhouse/styles/coachhelm-read.css:1080-1100 (desk grid `250px 1fr 320px`, at ≤1179 `250px 1fr`), :1218-1258 (deskbar); ReadPage.tsx:142-156 (deskbar buttons); use-phone.ts (820 breakpoint)
- What's wrong:
  - Main area: 844 − 94 safe area − 208 sidebar − 8 ≈ 534. Minus 48 padding, the 250 rail and a 20 gap leaves about 216px for the read.
  - The deskbar ("Ask about this read" + "Message {first}" + ⋯, about 380px, no wrap) overflows it by about 164px. RC-7 measured 90px at 1180; this is about twice that.
  - The 44px hero, the ladder SVG and the headline wrap to one or two words a line.
- Should be: Landscape phones get the phone Read layout, or the rail collapses under about 700px of main width.
- Fix: Same breakpoint change as MOB-TEAM-7. Also drive the grid from a container query on the main area (`@container (max-width:700px){grid-template-columns:1fr}`) so it doesn't depend on window width.
- Confidence: high

### MOB-CVP-3 Phone landscape (844x390): the desktop file header leaves the player's name about 50px
- Severity: P1
- Where: Player file, iPhone landscape 844x390 (desktop layout).
- File: src/clubhouse/styles/coachhelm-file.css:293 (`.dhead .lt` nowrap ellipsis), :301-304 (`.aseg` 300), :295 (`.ib` 36); PlayerFile.tsx:326-391 (`.dhead` = Avatar xl 64 + `h1.lt` + `.aseg` + `.ib`)
- What's wrong: In a main area of about 486px, the 64px avatar, the 300px lens control, the 36px ⋯ and the gaps leave about 50px for the h1. The name ellipsizes to two or three letters ("Ch…"). It is the page title.
- Should be: The name is readable in full. The lens control wraps under the header when there is no room.
- Fix: `.dhead{flex-wrap:wrap}` with `.aseg{flex:1 1 100%}` under a container query on the main width (about 640px), or use the phone layout per MOB-TEAM-7.
- Confidence: high

### MOB-TEAM-9 Coach Brief "Open" buttons are 30px tall
- Severity: P1
- Where: Coach Brief on phone (`?view=brief`), Open reads and Working on rows.
- File: src/clubhouse/screens/coachhelm/views/CoachBrief.tsx:65 (`<Button variant="secondary" size="sm" ... className="ch-hmb-row__a">Open</Button>`); src/clubhouse/styles/ui.css:36-43 (`.ch-btn--sm{height:30px}`); coachhelm-brief.css:99-110 (phone row)
- What's wrong: The sm button has a fixed 30px height and no extended hit area. On phone it is the only action in each row, so each row's one target is 30×~58px. The Plan screen adds a `::after` hit area only under `.ch-cpv` (coachhelm-plan.css:1556).
- Should be: A 44pt target. On phone the whole row should open, as the Team view rows do.
- Fix: Make the whole `.ch-hmb-row` a link on phone, with the chevron as its affordance, or add `.ch-hmb-row__a::after{content:'';position:absolute;inset:-7px -4px}`.
- Confidence: high

### MOB-TEAM-10 Read sheet correction chips are 36px; the 44px hit area exists only in the file's sheet
- Severity: P2
- Where: Team view read sheet on phone ("Is this right?" chips and "Change").
- File: src/clubhouse/styles/coachhelm.css:1833-1930 (`.ch-hl-cx__c{all:unset;min-height:36px;padding:0 16px}`, gap 8; `.ch-hl-cx__chg{min-height:36px;padding:0 4px}`); coachhelm-file.css:99-102 (`.ch-hf.ch-hf-sheet ... ::after{inset:-4px 0}`, file sheet only)
- What's wrong: The same correction chips get an extra 8px only when inside `.ch-hf.ch-hf-sheet`. In the Team read sheet they are 36px with 8px gaps, and "Change" is about 36×55 with 4px of padding. RC-12 covers link chips on the Read page, not these.
- Should be: 44px targets wherever the chips are used.
- Fix: Move the `::after` hit area onto `.ch-hl-cx__c` and `.ch-hl-cx__chg` themselves, and drop the file-only override.
- Confidence: high

### MOB-RC-2 Read page correction chips and "Change" are 36px
- Severity: P2
- Where: Read page on phone, the correction row.
- File: src/clubhouse/styles/coachhelm-read.css:947-1000 (`.ch-hr .cx button{min-height:36px}`, `.cx .chg`)
- What's wrong: 36px chips with 8px gaps, and a "Change" text link narrower than 44, in the row where a coach marks a read wrong. RC-12 covers the link chips higher up, not this row.
- Should be: 44pt hit areas.
- Fix: `min-height:44px`, or a `::after{inset:-4px 0}` hit area, on `.cx button` and `.cx .chg`. Share it with MOB-TEAM-10.
- Confidence: high

### MOB-TEAM-11 "Open the full read" and "Open {first}'s page" links are about 32px tall
- Severity: P2
- Where: Team view phone sheets (read and player), the closing link.
- File: coachhelm-team.css:1206-1213 (`.ch-htb .lk{display:inline-flex;padding:6px 0;font:var(--ch-type-15-strong)}`); team/panels.tsx (ReadPanel `Link.lk`, PlayerPanel :240)
- What's wrong: 15px text with 6px of padding gives a target about 32px tall and only as wide as the text. It is the main way forward from the sheet.
- Should be: A 44pt-tall row, ideally full width with a chevron.
- Fix: `.ins .lk{min-height:44px;width:100%}`, or render it as the ui list row used elsewhere in sheets.
- Confidence: high

### MOB-TEAM-12 Story tiles snap flush against the card edge and chain overscroll to the page
- Severity: P2
- Where: Team view, story tiles strip on phone.
- File: coachhelm-team.css:136-146 (`.tiles{overflow-x:auto;scroll-snap-type:x mandatory;padding:2px 16px 16px}`), :147-150 (`.tile{scroll-snap-align:start}`)
- What's wrong:
  - With no `scroll-padding-inline`, a snap to `start` puts the tile's left edge at the scroller's edge, not at the 16px gutter. After any swipe, the strip sits 16px out of line with the cards above and below.
  - With no `overscroll-behavior-x:contain`, a hard swipe at the end bounces the strip and can start Safari's back-swipe at the left edge.
- Should be: Snapped tiles sit on the 16px (20px on ≥414) gutter, and the strip keeps its own overscroll.
- Fix: `scroll-padding-inline:var(--ch-tb-edge); overscroll-behavior-x:contain` on `.tiles`.
- Confidence: high

### MOB-TEAM-13 Course sheet rows: minimum column widths exceed the sheet at 320, so the value clips
- Severity: P2
- Where: Team view, Course sheet, 320 wide, and 375 at XXL.
- File: coachhelm-team.css:745-753 (`.cp{grid-template-columns:auto minmax(64px,1fr) minmax(64px,36%) auto}`), :801-804 (`.v{min-width:62px}`)
- What's wrong: The fixed minimums (hole label, 64, 64, 62 and gaps) add up to about 238px. The row has about 224px inside the sheet at 320. The last column, the value, overflows the sheet's right edge.
- Should be: Every column fits at 320 at default size, and the row reflows at XXL.
- Fix: Drop the second `minmax` to `minmax(0,36%)` and `.v{min-width:auto}`, or stack the value under the bar below a 340px container width.
- Confidence: medium

### MOB-TEAM-14 Story action scrolls the Working card under the phone top bar
- Severity: P2
- Where: Team view on phone, a story's "See what they're working on" action.
- File: src/clubhouse/screens/coachhelm/team/TeamBoard.tsx:189-195 (`scrollIntoView({block:'start'})` on `[data-ch-team-card="work"]`); coachhelm-team.css (no `scroll-margin-top` on `[data-ch-team-card]`); tokens.css:441 (`--ch-phone-topbar-h:50px`)
- What's wrong: The window scrolls the card's top to y=0. The bar is 50px plus a 47–62px top safe area, so the card's header lands about 100px under the glass bar.
- Should be: The card lands just below the bar.
- Fix: `[data-ch-team-card]{scroll-margin-top:calc(var(--ch-phone-topbar-h) + env(safe-area-inset-top) + 8px)}`.
- Confidence: high

### MOB-TEAM-15 Coach Brief section links land under the phone bar: scroll-margin is 72px, the bar is about 100px
- Severity: P2
- Where: Coach Brief on phone, opened with `?section=` (week, patterns, working, record, goals).
- File: src/clubhouse/styles/coachhelm-brief.css:114-116 (`.ch-hbr-sec{scroll-margin-top:72px}`); tokens.css:441 (`--ch-phone-topbar-h:50px`)
- What's wrong: 72px was sized for the desktop sticky head. On phone the bar is 50px plus a 47–62px top safe area (97–112px), so each section's heading is 25–40px under the bar after the jump.
- Should be: The section heading is fully visible below the bar.
- Fix: `scroll-margin-top:calc(var(--ch-phone-topbar-h) + env(safe-area-inset-top) + 12px)` under the phone breakpoint.
- Confidence: high

### MOB-TEAM-16 Coach Brief goal player names are 13px inline links about 18px tall
- Severity: P2
- Where: Coach Brief on phone, Goals section, each player name.
- File: src/clubhouse/styles/coachhelm-brief.css:132-137 (`.ch-hbr-goals__name{justify-self:start;font:var(--ch-type-13-medium)}`); CoachBrief.tsx:76
- What's wrong: The name is the only link to the player, but it is an 18px-tall text link as wide as the name. There is a hover state but no press state, so a tap shows nothing.
- Should be: A 44pt target with a visible press state.
- Fix: `display:inline-flex;min-height:44px;align-items:center` (or a `::after` hit area), plus an `:active` tint.
- Confidence: high

### MOB-TEAM-17 Chosen station resets to the biggest leak after going back from a player or read
- Severity: P2
- Where: Team view on phone: pick a station, open a row's full page, then swipe back.
- File: src/clubhouse/screens/coachhelm/team/TeamBoard.tsx:161 (`useState<TeamStation>(initialStation ?? leak)`)
- What's wrong: The station is component state. A back navigation remounts the board, so the chip and the hole snap back to the biggest leak and the coach loses their place. Native back keeps it.
- Should be: The last station holds for the session.
- Fix: Use `useChSessionState('team.station', ...)` or write it to the URL with `replaceState`.
- Confidence: medium-high

### MOB-TEAM-18 The "+N" coin has a click handler but no role, focus or label, and is about 18–22px
- Severity: P2
- Where: Team view hole, a station with more players than slots.
- File: src/clubhouse/screens/coachhelm/team/TeamHole.tsx:100 (`g.scn.is-more` with onClick inside an `aria-hidden` group)
- What's wrong: The coin opens the station's list, but it sits in an `aria-hidden` group with no role or tabIndex. VoiceOver can't reach it, and its target is a 22-unit circle (about 18px at 320). FID-TEAM-13 covers what the coin shows, not how it is reached.
- Should be: A labelled button ("3 more at Short game") with a 44px hit area, or no separate handler (the station button already opens the list).
- Fix: Remove the onClick and rely on the station's `g.stn role=button`, or make it a focusable `role="button"` with an `aria-label` and an r=22 transparent hit circle.
- Confidence: high

### MOB-TEAM-19 Story tap-to-advance region has no `touch-action:manipulation`
- Severity: P2
- Where: Story viewer, tapping the body to advance quickly.
- File: src/clubhouse/screens/coachhelm/team/Stories.tsx:168 (`<div className="sto-b" onClick={next}>`); base.css (`touch-action:manipulation` only on button, a, [role=button] and similar)
- What's wrong: The advance target is a plain div, so the base rule doesn't reach it. Two quick taps can be read as a double-tap zoom, which zooms the viewer and skips nothing.
- Should be: Taps advance one story each, with no zoom.
- Fix: Covered if MOB-TEAM-2 sets `touch-action` on `.story`. Otherwise add `touch-action:manipulation` to `.sto-b`.
- Confidence: medium

### MOB-CVP-4 Deep link to a file section scrolls it under the bar and the sticky lens control
- Severity: P2
- Where: Player file on phone, opened with a section target (from Brief, a story or a notification).
- File: src/clubhouse/screens/coachhelm/file/PlayerFile.tsx:165-170 (`el?.scrollIntoView?.({block:'start',behavior:'auto'})`); coachhelm-file.css:62 (`.sticky-seg`)
- What's wrong: There is no `scroll-margin-top` on the targets. The target's top goes to y=0, under the 50px bar plus the top safe area and the sticky lens Segmented below it, about 150px in all. The card the link pointed to opens with its header hidden.
- Should be: The target card's header sits just below the sticky lens control.
- Fix: Give the file's section cards `scroll-margin-top:calc(var(--ch-phone-topbar-h) + env(safe-area-inset-top) + <seg height> + 8px)`, or expose the sticky height as a variable and use it.
- Confidence: high

### MOB-CVP-5 Long read titles in the file's read rows are cut to one line on phone
- Severity: P2
- Where: Player file and Your week read list on phone, 375 and below, and at XXL.
- File: src/clubhouse/styles/coachhelm-file.css:289-291 (`.r__t b` and `.r__t small` nowrap ellipsis, unless `.l2`)
- What's wrong: Read titles are full sentences ("Wedge distance control from 80 to 120 yards"). On a 343px row with a badge and chevron, about 26 characters fit, so the part that says what the read is about is cut. Only rows with `.l2` get two lines.
- Should be: Titles wrap to two lines on phone, and three at XXL.
- Fix: Apply the `.l2` clamp (`-webkit-line-clamp:2`) to every `.r__t b` under the phone breakpoint.
- Confidence: medium-high

### MOB-CVP-6 Card header meta truncates to a few characters at 320 and XXL
- Severity: P2
- Where: Player file cards on phone, header right side ("Last 10 rounds" and similar).
- File: src/clubhouse/styles/coachhelm-file.css:287-288 (`.card__h h4{flex:none;max-width:70%}`; `small` nowrap ellipsis)
- What's wrong: The title takes up to 70% and doesn't shrink, so the `small` gets what's left. At 320 with XXL that is about 70px, so "Last 10 rounds" becomes "Last 1…", which reads as a different number.
- Should be: The meta wraps under the title when it doesn't fit, and never cuts inside a number.
- Fix: `.card__h{flex-wrap:wrap}` and remove the ellipsis from `small`, or move the meta to its own line below the phone container width.
- Confidence: medium

### MOB-CVP-7 File correction buttons and "Change" are 36px outside the sheet
- Severity: P2
- Where: Player file page on phone (not the sheet): the "Is this right?" row on read cards.
- File: src/clubhouse/styles/coachhelm-file.css:245 (`.corr button{min-height:36px}`), :250 (`.cx__chg` 36)
- What's wrong: The 44px hit area (:99-102) applies only inside `.ch-hf-sheet`. On the page itself the same controls are 36px. CVP-4 covers their tokens, not their size.
- Should be: 44pt targets everywhere they appear.
- Fix: Move the `::after{inset:-4px 0}` hit area to `.ch-hf .corr button` and `.ch-hf .cx__chg`.
- Confidence: high

### MOB-CVP-8 File sheets carry `.ch-htb`, so the Team view's catch-all motion rules run inside them
- Severity: P2
- Where: Player file and Your week read sheets, with Reduce Motion on.
- File: PlayerFile.tsx:380 and YourWeek.tsx:109 (`className="ch-htb-sheet ch-htb ch-hf ch-hf-sheet"`); coachhelm-team.css:1683-1699 (reduced-motion block for `.ch-htb` descendants)
- What's wrong: `.ch-htb` was added to borrow the read panel's styles, but it also applies every `.ch-htb` rule to the dialog: the Team reduced-motion overrides, the `.ch-htb .lk` link sizing and the sheet palette. A change to the Team view now changes the file's sheet as well. It is also part of why MOB-TEAM-1 reaches these sheets.
- Should be: The file sheets use a named shared sheet class, not the Team page root class.
- Fix: Split out the read panel styles under a `.ch-readpanel` class that both screens use, and drop `ch-htb` from the file Modals.
- Confidence: medium

---

Summary
1. One P0: `.ch-htb-sheet .ch-modal__panel{max-height:86%}` cancels the 92dvh cap, so Team and file read sheets run off the screen and can't scroll.
2. Sheets and fields: `.ch-hf` paints the `<dialog>`, and the 15px intent note zooms Safari, which hides the keyboard from the lift logic.
3. The story viewer needs touch care: hold selects text, drags scroll the board, the body can't overflow, and the advance tap can zoom.
4. iPhone landscape 844 falls to the desktop layout in all three lanes: Team squeezed to about 486px, Read middle column about 216px, file name cut to about 50px.
5. Many targets are under 44pt: Spot rows (30), Brief Open (30), correction chips (36), sheet links (32), "+N" coin (18), plus scroll-into-view jumps that land under the bar.
