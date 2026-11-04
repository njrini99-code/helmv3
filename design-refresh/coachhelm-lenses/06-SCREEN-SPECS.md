# 06. CoachHelm Lenses: per-screen specs

> Completeness pass, 4 Nov 2026: see the section of that name at the end of this file (adds 33 rows).
> Wiring, 4 Nov 2026: see the section of that name at the end of this file.

Every element on every screen ID in `05-SCREENS.md`, top to bottom in the order the eye meets it. Values were read off the design page's CSS and script (`redesign/coachhelm-lenses.html`, version 6, 3 Nov), not by eye. Where this file and `04-FIDELITY-SPEC.md` disagree, this file wins. Motion is in `07-MOTION.md` and is not repeated here.

How to read the numbers:
- Sizes are pt (CSS px) at the default Text Size. "× k" means the value follows iPhone Text Size through `--ch-type-k` (k = 1 at default, 1.36 at XXL as SHARED-5 sets it; the app's own cap is 23/17 = 1.353, `MAX_SCALE` in `lib/dynamic-type.ts`, so capture sets `--ch-type-scale` directly on both sides). Values without × k stay fixed. Boxes that hold text grow with it; SVG charts keep their height.
- Box columns are written as: width rule; height; padding T R B L; gap to the next element; radius; border or ring.
- Classes: the page's `.x` becomes `.ch-hf-x` in the build (04 names). Today's components keep their own classes (`.ch-hl-cx`, `ui/Menu`, `ui/Sheet`, `useToast`).
- Colours give the app token first, then light / dark hex. Base tokens are DESIGN_LANGUAGE.md §3 (the 31 Oct rollout). Chart and feature tokens are the names every CoachHelm lane uses; if the rollout lands them under another name, the hex wins and the PR says so. Never paste a hex into a component.
- Contrast ratios come from `capture/contrast.js` (table in `capture/contrast-table.md`, 57 pairs, rerun 3 Nov). Target 4.9:1, floor 4.5:1, 3:1 for chart marks, glyphs and control borders. Every text pair on this lane clears 4.9 in both themes. The one pair under target is not this lane's (avatar initials, see §0.3).
- Data fields point to `03-DATA-CHECKS.md` sections, written "03 §n". Missing values follow SHARED-4: "—", never 0, NaN or blank. A card with no data is left out, never drawn empty, unless its state row in 05 draws an empty card.

## 0. Shared

### 0.1 Token map

| Page token | App token | Light | Dark |
|---|---|---|---|
| `--a-page` | `--ch-grouped-bg` | #F2F0E9 | #0E120F |
| `--a-card` | `--ch-card-bg` | #FFFEFB | #191E1A |
| `--a-well` | `--ch-well-bg-flat` | #F6F4EE | #141815 |
| `--a-ink` | `--ch-text-primary` | #1C1B18 | #F1ECDF |
| `--a-ink-2` | `--ch-text-secondary` | #46433D | #D0C9B8 |
| `--a-ink-3` | `--ch-text-tertiary` | #5F5C55 | #ADA697 |
| `--a-gain` | `--ch-gain` | #14613D | #7CC79B |
| `--a-loss` | `--ch-loss` (amber, never red) | #9A5700 | #E7AE57 |
| `--a-accent` | `--ch-accent` | #155A39 | #7CC79B |
| `--a-sep` | `--ch-separator` | rgb(28 27 24 / .10) | rgb(241 236 223 / .10) |
| `--a-ring` | `--ch-card-ring` | rgb(28 27 24 / .07) | rgb(255 255 255 / .06) |
| `--a-shadow` | today's card shadow | ring + 0 1 2 rgb(28 25 18/.05) + 0 8 20 −12 rgb(28 25 18/.12) | ring + inset 0 1 0 rgb(255 255 255/.04) |
| `--a-frame` | `--ch-frame` | #0A331F | #08150E |
| `--a-frame-ink` | `--ch-on-green-ink` | #F4EEDD | #F4EEDD |
| `--a-frame-icon` | today's bar icon tone | rgb(240 233 214 / .86) | same |
| `--a-champ` | `--ch-champagne-300` (back label, switcher dot) | #DCCDA6 | #DCCDA6 |
| `--a-feat` | `--ch-feature-bg` (`--ch-green-800`) | #0B3A25 | #123D29 |
| `--a-feat-1` | `--ch-feature-ink` (`--ch-on-green-plate`) | #F4F1E8 | #F4F1E8 |
| `--a-feat-2` | `--ch-feature-ink-2` | #D3D9CB | #D3D9CB |
| `--a-feat-gain` | `--ch-feature-gain` | #8FD3AA | #8FD3AA |
| `--a-feat-loss` | `--ch-feature-loss` | #EDB867 | #EDB867 |
| `--c-gain` | `--ch-chart-gain-fill` | #1F6B45 | #4FA877 |
| `--c-loss` | `--ch-chart-loss-fill` | #B86F0C | #E09A35 |
| `--c-neutral` | `--ch-chart-flat` | #6B675F | #A39D90 |
| `--c-track` | `--ch-chart-track` | #EBE5D8 | #2C322D |
| `--c-zero` | `--ch-chart-zero` (= text tertiary) | #5F5C55 | #ADA697 |
| `--yr-sr/jr/so/fr` | `--ch-yr-sr/jr/so/fr` | #1F6B45 / #3D6787 / #86672C / #9A4A35 | #2A7A51 / #46739A / #8F6E31 / #A3533E |
| `--a-glass` | `--ch-glass-bg` at this lane's .86 | rgb(253 251 247 / .86) | rgb(22 27 23 / .86) |
| `--a-scrim` | `--ch-scrim` | rgb(20 20 18 / .36) | rgb(2 6 4 / .58) |
| `--a-press` | pressed tint | rgb(28 27 24 / .05) | rgb(241 236 223 / .06) |
| `--a-skel`, `--a-skel-sheen` | `--ch-skel-base`, `--ch-skel-sheen` | #E2DBCA, #ECE6D8 | #252C26, #2E362F |
| `--card` (corrections) | `--ch-bg-surface` | #FCFAF5 | #1B201C |
| `--a-subtle` | `--ch-bg-subtle` | #F5F2EA | #181D19 |
| `--a-hover` | `--ch-bg-hover` | #F9F7F1 | #212722 |
| `--a-sel` | `--ch-bg-selected` (`--ch-green-50`) | #EEF5F0 | #16281D |
| `--a-ctl`, `--a-ctl-strong` | `--ch-border-control`, `--ch-border-strong` | rgb(28 25 18 / .14), .24 | rgb(237 231 216 / .17), .30 |
| `--seg-a` → `--seg-b` | today's green segmented chip (the one shade exception) | #1F6B45 → #155A39 | same |
| `--seg-ink` | `--ch-text-on-accent` | #F4EEDD | #F4EEDD |

Chip tints are `color-mix(in srgb, <token> N%, transparent)` over the surface: loss 8%, gain 11%, plain (`--ch-text-secondary`) 9%, accent 11%. Loss is 8%, not 11%: 11% gave 4.78:1 in light.

Fonts: `--ch-font-sans` (Instrument Sans) everywhere, `font-stretch` 88% on large titles and 92% on feature figures. Tabular figures on every number (SHARED-4).

### 0.2 Type roles used on this lane

| Role | Size / line / weight / tracking | Where |
|---|---|---|
| Large title | 34 × k / 1.2 / 600, −0.034em, stretch 88% | "Your week", desktop head (30 × k) |
| Context line | 15 × k / 1.33 / 400 | under large titles |
| Card title | 17 × k / 1.3 / 600, −0.01em | every card head |
| Card meta | 15 × k / 1.33 / 400, one line, ellipsis | right of the card title |
| Feature title | 26 × k / 1.15 / 600, −0.025em, stretch 92%, balance | feature card |
| Feature body | 15 × k / 1.42 / 400 | feature card paragraph |
| Big figure | 24 × k / 1 / 500, −0.03em, stretch 92%, tabular | feature comparison |
| Row title | 16 × k / 1.3 / 500, one line (read rows: two lines, then ellipsis) | rows |
| Row meta | 15 × k / 1.33 / 400, one line, ellipsis | rows |
| Body | 15 × k / 1.42 / 400 | card notes (1.4), well text |
| Small | 13 × k / 1.2 to 1.3 / 400 | axis, dates, labels under figures |
| Chip | 13 × k / 1.45 / 600, no wrap | stance chips |
| Button | 15 × k / 1 / 600 | every button |
| Sheet title | 22 × k / 1.2 / 600, −0.02em | sheets |
| Well title | 15 × k / 1.3 / 600 | sheet wells |
| Correction | 13 / 18 × k / 600 (`--ch-type-13-strong`); answer 14 / 19 × k / 400 (`--ch-type-14`) | today's CorrectionChips |

### 0.3 Avatars

Circle; 32 in rows, 28 in the feature card, 52 in the desktop head; fill `--ch-yr-<year>`; initials white, 0.38 × size / 1 / 600; inset 0 1 0 rgb(255 255 255/.18). Initials do not scale with Text Size. Contrast is DESIGN_LANGUAGE's own table: light 6.5 / 6.0 / 5.3 / 6.2, dark 5.3 / 5.0 / 4.95 / 5.4 (Sr / Jr / So / Fr). Dark sophomore uses the darker dark-theme fill #8B6B30 (white 4.95:1), the same fix as the year coin (design lead, 3 Nov); it was #8F6E31 at 4.73.

### 0.4 Hit areas (how 44 is met)

| Control | Drawn | Hit area |
|---|---|---|
| Bar buttons (More, bell) | 44 × 44 | as drawn |
| Back in the pushed bar | today's PhoneBar back | today's, unchanged |
| Lens segment | 36 tall inside a 42 track | each button gets `::after { inset: -4px 0 }`: 44 |
| Buttons (`.ch-hf-btn`) | min-height 44 | as drawn |
| Rows | min-height 64 | as drawn |
| Feature card | whole card | whole card, one tab stop |
| Undo link | min-height 44 | as drawn |
| Sheet close X | 32 circle | `::after { inset: -6px }`: 44 |
| Correction chips, Change | 36 (today's component) | in `.ch-hf-sheet` scope only, `position: relative` and `::after { inset: -4px 0 }`: 44. The 8pt row gap means neighbours meet and never overlap |
| Plan picks | 36 | same `::after { inset: -4px 0 }`; the 8pt gap holds |
| Menu rows | 34 × k (today's `ui/Menu`) | today's, unchanged. Flagged to the coordinator: under 44 at default size; the fix belongs in `ui/Menu` for every lane |
| Desktop More, bell, settings | 36 × 36 | pointer target; 44 under `(pointer: coarse)` |

## 1. Shared frame

### 1.1 Phone bar (today's PhoneBar, unchanged; SHARED-1)

| Element | Box | Type | Colour | Hit | Data |
|---|---|---|---|---|---|
| Bar | full width; 98 tall including the 54 status area; padding 54 6 0 16; grid 1fr auto 1fr | none | `--ch-frame` | none | none |
| Lip | full width; 16 tall below the bar; radius 16 16 0 0 | none | `--ch-grouped-bg` | none | none |
| Scroll shade | 14 tall, 30 under the bar's bottom; gradient rgb(0 0 0/.08) to clear; shows once the page scrolls | none | none | none | none |
| Root bar: switcher (S-LIST, S-BOARD) | hug, start; gap 6 | 18 × k / 1 / 600 | `--ch-on-green-ink` 12.03 / 16.12; chevron 16, 85% | today's | "CoachHelm" |
| Switcher dot | 7 circle | none | `--ch-champagne-300` | none | today's |
| Pushed bar (S-FILE): back | start; margin-left −8; padding 8 4; chevron 22 stroke 2.2; gap 2 | 17 × k / 1 / 500 | `--ch-champagne-300` 8.85 / 11.86 | today's | "CoachHelm" |
| Pushed bar: title | grid 120 / 1fr / 120; one line, ellipsis, centred | 17 × k / 1 / 600 | `--ch-on-green-ink` 12.03 / 16.12 | none | player's full name (03 §10) |
| Bar button (bell, More) | 44 × 44; icon 22, stroke 1.8 | none | `--ch-frame-icon` 8.88 / 11.52 (glyph, 3:1) | 44 | More opens `S-FILE.more` |
| Bell badge | min 18 × 18; padding 0 5; top 4 right 4; radius 999 | 11 / 18 / 700, fixed | #0B3A25 on #F4EEDD 11.01 | none | today's unread count |

### 1.2 Phone page

Page `--ch-grouped-bg`, flat, no paper (SHARED-2). Body padding 112 16 48 (16 is the page edge; 20 at 430 and up, SHARED-7). Cards stack in a column with 24 between them. Cards: `--ch-card-bg`, radius 16, `--a-shadow` (ring included), `overflow: hidden`, no borders, no accent left edges (SHARED-3).

Card head: flex, baseline, space-between; gap 12; padding 16 16 12. Title as §0.2, `flex: none`, max 70% wide; optional 16 icon in `--ch-text-secondary`, gap 7. Meta right-aligned, one line, ellipsis. Card body padding 4 20 18. Card note: margin 0; padding 12 16 16; top hairline 1px `--ch-separator`; 15 × k / 1.4, `--ch-text-secondary`.

Rows: grid auto / 1fr / auto; gap 12; min-height 64; padding 10 16. Hairline between rows: 1px `--ch-separator`, from 16 in to the right edge. Title and meta as §0.2, gap 3. Trailing: `--ch-text-tertiary`, chevron 14, gap 6. Row icon tile: 28 × 28, radius 8, `--ch-well-bg-flat` with the card ring, glyph 16 `--ch-text-secondary`. Pressed rows and cards tint with `--a-press` 50ms after the finger and never scale (07 M-LNS-03, M-LNS-14).

### 1.3 Desktop shell (today's, unchanged)

Sidebar 216 on `--ch-frame`: padding 16 10; logo block margin 0 6 16, padding 10, radius 12; items min-height 36, padding 0 12, radius 10, 14 / 1 / 500 at rgb(230 223 204/.82) 7.53 / 9.65; selected item #0B3A25 on #FBF8F0 12.02; group headings 12.5 / 500 at .72, 6.15 / 7.65; the signed-in person at the bottom. Workspace: margin 8 8 8 0, radius 14, `--ch-grouped-bg`. Top bar: 56 tall, padding 0 18, glass `--a-glass` with blur 24 saturate 170%, bottom hairline `--ch-separator`; 14 / 1 / 500 `--ch-text-secondary` 9.41 / 10.71, current item 600 `--ch-text-primary`; icon buttons 36, icon 19.

Redline (frame): bar 98 tall; lip 16; first content 104 from the screen top on `S-FILE`, 112 on `S-BOARD`; page edge 16 (20 at 430); card gap 24; card radius 16; card head 50 tall at k = 1 (16 + 22.1 + 12); row 64; hairline inset 16.

## 2. S-LIST (lane 1's screen; this lane adds the push only)

No new pixels. Each "By player" row is a link to `playerFileHref(id)` carrying `data-ch-hf-open`. Row as §1.2 with a 32 avatar leading, name (row title) and top read (row meta), trailing stance chip and chevron. The row is the hit area. The page draws the root bar, the large title "CoachHelm" with "3 players have an open signal", and the card note "The team view itself is lane 1's"; the build keeps lane 1's screen as lane 1 ships it.

Redline: row 64; avatar 32; chevron 14 at 16 from the card edge; the tapped row tints, it does not scale.

## 3. S-FILE (the player file, coach view)

Order, phone: lens control, feature card, plan card, last round in context, all reads, where the strokes go, your plan for Eli, track record. Desktop (§4): left column feature, plan, strokes; right column field, reads, your plan, track record.

### 3.1 Lens control (`data-ch-lens`)

| Element | Box | Type | Colour | Hit | Data |
|---|---|---|---|---|---|
| Track | fill; 42 tall (36 + 3 + 3); padding 3; radius 12; sticky at top 104 on phone (static on desktop, 300 wide, pushed right in the head); margin-top −8 | none | `--ch-well-bg-flat`; inset 0 1 2 rgb(28 25 18/.06) and the card ring | none | none |
| Segment | 1fr each; min-height 36; padding 0 10; radius 9; one line, ellipsis | 14 × k / 1.1 / 500; picked 600 | unpicked `--ch-text-secondary` on well 8.96 / 10.87; picked `--ch-text-on-accent` on the green chip 7.10 (bottom) / 5.58 (top) | 44 (§0.4) | "Coach view", "As {first} sees it" (03 §11) |
| Thumb | under the picked segment; top / bottom 3; radius 9 | none | gradient `--seg-a` → `--seg-b`; 0 1 2 rgb(11 58 37/.3); inset 0 1 0 rgb(255 255 255/.14) | none | none |

Absent in the failed state (05 `S-FILE` failed row).

### 3.2 Feature card (top read; 03 §1)

| Element | Box | Type | Colour | Hit | Data |
|---|---|---|---|---|---|
| Card | fill; padding 20; flex column, gap 12; radius 16; flat fill, no radial light (SHARED-2; removed from the page 3 Nov); shadow 0 1 2 rgb(11 58 37/.2), 0 14 30 −18 rgb(11 58 37/.6) | none | `--ch-feature-bg` | whole card opens `S-FILE.read` (`data-ch-hf-read="top"`); its buttons are their own targets | the top read (`partitionInsights().focus`) |
| Who line (coach) | flex, gap 10; 28 avatar | 15 × k / 1.3 / 500; name 600 | name `--ch-feature-ink` 11.30 / 10.78; rest `--ch-feature-ink-2` 8.84 / 8.44 | none | "{first}'s top read · {area}" |
| Kicker (player) | hug | 15 × k / 1.3 / 500 | `--ch-feature-ink-2` | none | by stage: "Top of your list", "Coach Reyes suggests this as your focus", "Your focus" (§12.1) |
| Title | fill; wraps, no max lines | Feature title (§0.2) | `--ch-feature-ink` 11.30 / 10.78 | none | read title, both lenses (03 §1, no player retitle) |
| Comparison | grid 3 × 1fr, gap 8; cells padding 10 12, radius 12, white 7% | figure: Big figure; label 13 × k / 1.2 / 400, margin-top 5 | figure `--ch-feature-ink`; the player's own figure `--ch-feature-loss` when it's the loss, 5.77 / 5.49 (24pt, 3:1); label `--ch-feature-ink-2` 7.20 / 6.86 | none | player value; Team (`golf_player_standing.team_avg`, only when `team_n ≥ 5`, else "—"); Tour (`gauge.cmp`) (03 §1) |
| Paragraph | fill | Feature body; the stroke figure 600 | `--ch-feature-ink-2` 8.84 / 8.44; figure `--ch-feature-ink` | none | worth line from `closes`; "to the team's average" only when Team is drawn (03 §1 problems) |
| Evidence chips | flex wrap, gap 6; padding 4 9; radius 7; white 10% | 13 × k / 1.3 / 600 | `--ch-feature-ink` on white 10%: 8.39 / 7.99 | none | sample ("21 rounds"), window, firmness (coach "Seen repeatedly") or read word (player "Solid read") |
| Actions | flex wrap, gap 10; margin-top 2 | Button | see §6 | 44 | by focus stage (§6) |

Buttons on the feature card: light `#F4F1E8` fill, #0B3A25 label 11.30; ghost white 10% fill, `--ch-feature-ink` label 8.39 / 7.99; done (disabled) `--ch-feature-gain` on its 12% tint 5.64 / 5.38. All min-height 44, padding 0 16, radius 12, icon 18 with gap 8. Pressed: the card tints white 5% after 50ms unless a button inside it is the one pressed.

Redline: card padding 20; who row avatar 28; title 26 × k, first line cap 12 under the who row; comparison cells 64.6 tall at k = 1 (10 + 24 + 5 + 15.6 + 10), gap 8; chips 7 radius; buttons 44 tall, gap 10; card radius 16.

### 3.3 Plan card (03 §2)

| Element | Box | Type | Colour | Hit | Data |
|---|---|---|---|---|---|
| Head | card head | Card title, meta | as §1.2 | none | "{first}'s plan"; meta "Focus since Oct 5" or "No focus yet" |
| Handshake track (coach) | grid 3 × 1fr, margin 4 0 2; each step padding-top 22, gap 4 | label 15 × k / 1.2 / 600 when reached, 500 `--ch-text-secondary` when not; date 13 × k / 1.3 / 400 tabular | label `--ch-text-primary`; date `--ch-text-tertiary` 6.61 / 6.99 | none | Suggested (`created_at`), Shown to {first} (exposure ledger), Accepted (`accepted_at`); "Not yet" when not reached |
| Step line | 2 tall at y 6, from the dot's centre (7) to the next; last step none | none | track `--ch-chart-track`; filled `--ch-chart-gain-fill` | none | filled when the next step is reached |
| Step dot | 14 circle at 0,0 | tick 9, stroke 3.2, white | reached `--ch-chart-gain-fill` (5.15 / 4.50 on track, 3:1); not reached `--ch-card-bg` with a 2px inset `--ch-chart-track` ring | none | none |
| Coach's line (player lens) | a static row in place of the track, margin 0 −20 | row | row icon users | none | "From Coach Reyes"; meta "Accepted Oct 5", "Waiting for your answer" or "No focus yet" |
| Goal block | grid 1fr / auto, gap 4 12; margin-top 16; padding-top 14; top hairline | title Row title; meta Row meta tabular | as rows | none | goal text and check-ins (03 §2) |
| Goal chip | hug | Chip | gain 6.26 / 6.83 | none | Improved / No change / Worse |
| Goal chart (SVG) | full width; 72 tall; label rows at 12 | 12 / 400, fixed; drawn at the real width, never stretched (the page uses `preserveAspectRatio="none"`, the build sizes the viewBox from the measured width) | goal line `--ch-chart-gain-fill` 1.5, dashed 4 4, label "Goal 0.6" `--ch-text-secondary`; line `--ch-chart-flat` 2.2 round; points r 3 `--ch-chart-flat`, the newest r 4.5 `--ch-chart-loss-fill` when above the goal (3.92 / 7.12); 1.5 `--ch-card-bg` stroke; dates `--ch-text-tertiary` | none | check-in values, newest last; y from 0.5 to 1.5 for this fixture (build: goal and values with 10% headroom) |
| Drill well | grid auto / 1fr, gap 12; margin-top 14; padding 12; radius 12 | title Row title; text 15 × k / 1.38 / 400 | `--ch-well-bg-flat`; text `--ch-text-secondary` 8.96 / 10.87; icon tile on `--ch-card-bg` | none | this week's drill and sessions logged (03 §2) |
| Note (no focus) | card note | Body | `--ch-text-secondary` | none | "Assign a focus from any read. {first} sees it as yours, by name." |

Redline: dots 14 at the column starts; line 2 at y 6; labels 22 under the dot tops; goal block 16 under the track with its hairline; chart 72; drill well radius 12, padding 12.

### 3.4 Last round in context (03 §6)

| Element | Box | Type | Colour | Hit | Data |
|---|---|---|---|---|---|
| Head | card head | | | none | meta "{date} · {course}", one line, ellipsis |
| Text block | grid 1fr / auto, gap 14, centred | head Row title; body 15 × k / 1.38, margin-top 2 | head `--ch-text-primary`; body `--ch-text-secondary` 9.77 / 10.25 | none | "Better than the field", "Level with the field" (within 1.0) or "Behind the field"; sentence with score, `field_n − 1` teammates, `field_mean` |
| Figure | hug, right | 40 × k / 1 / 500, −0.04em, stretch 92%, tabular; label 13 × k / 1.2, margin-top 6 | better: `--ch-gain` 7.42 / 8.45; level: `--ch-text-primary`; behind: `--ch-loss` 5.57 / 8.53; label `--ch-text-tertiary` | none | `relative`, signed with a true minus, one decimal; "vs the field" |
| Dot strip | 40 tall, margin-top 16; track 2 at y 19 | none | track `--ch-chart-track`; teammates 14 dots `--ch-chart-flat` (5.58 / 6.27) with a 2px `--ch-card-bg` halo, **coach only**; field mean 2 × 24 `--ch-chart-zero`; the player 20 dot `--ch-chart-gain-fill` (6.41 / 5.80) | none | per-18 to par, scale −2 to +10 for this fixture (build: round to whole strokes around the data, at least 12 wide) |
| Axis | space-between | 13 × k / 1 / 400 tabular | `--ch-text-tertiary` | none | ends, then "{first} +4 · field +6.0" in the middle |

The card is absent when the newest countable round has no field (`state=nofield`, early). The coach gets the teammate dots at every field size (3 or more players). Players never get the dots, in the DOM or the payload (SHARED-11), and the player and the lens get no field card at all below `field_n` 5 (`state=fieldfew`), because a field mean of 3 or 4 that includes the player gives away the sum of two or three teammates' scores. The floor matches `team_n ≥ 5` on the Team figure (settled 3 Nov).

Redline: figure 40 × k; strip 40 tall, 16 under the text; player dot 20, teammates 14, mean line 24 tall.

### 3.5 All reads (03 §4)

| Element | Box | Type | Colour | Hit | Data |
|---|---|---|---|---|---|
| Head | card head | | | none | "All reads"; meta "{n} open · {m} dismissed" tabular |
| Read row | row (§1.2); leading stance chip; title two lines then ellipsis | chip; Row title; meta "{area} · {comparison} · {firmness}" | chip by stance: loss 4.99 / 7.35, plain 8.43 / 8.44, gain 6.26 / 6.83, accent ("Assigned") 6.84 / 6.83 | 64 row; opens `S-FILE.read` (`data-ch-hf-read="<id>"`) | `ChDeepDive.list`, stance and firmness (03 §4). Once a focus exists on a read, its chip reads "Assigned" |
| Dismissed row | static row; icon tile with X; title 400 `--ch-text-secondary` | Row title at 400 | 9.77 / 10.25 | Undo 44 tall | "Dismissed: {title}"; Undo (`data-ch-hf-undo`) is `--ch-accent` 15 × k / 1 / 600, 8.15 / 8.45 (§7) |

Lots of reads (`many`): every read is a row, no inner scroll, up to 30 (05). One read (`one`): the card still draws with its single row.

Redline: rows 64; chip leading at 16; chevron 14 trailing; dismissed row icon tile 28.

### 3.6 Where the strokes go (03 §3)

| Element | Box | Type | Colour | Hit | Data |
|---|---|---|---|---|---|
| Head | card head | | | none | "Where the strokes go"; meta "{first} vs Tour and team" |
| Row | grid 108 / 1fr / 46, gap 10, centred; rows gap 14 | label 15 × k / 1.2 / 500; figure 16 × k / 1 / 600 tabular, right | figure gain `--ch-gain`, loss `--ch-loss`; "—" `--ch-text-tertiary` | none | `sg_ott`, `sg_approach`, `sg_around_green`, `sg_putting`, strokes a round against the Tour |
| Track | 22 tall, radius 6 | none | `--ch-chart-track`; zero line 1.5 wide, 4 past the track top and bottom, `--ch-chart-zero` 5.31 / 5.42 | none | 0 is the PGA Tour average |
| Bar | inset 3 top and bottom; radius 4; from the centre outward, `|value| / 1.0 × 50%` of the track | none | loss `--ch-chart-loss-fill` 3.15 / 5.52 on track; gain `--ch-chart-gain-fill` 5.15 / 4.50 | none | clamp to the axis ends; the figure carries the real value |
| Team tick | 3 wide, 3 past the track, radius 2, 1.5 `--ch-card-bg` halo | none | `--ch-text-primary` 13.72 / 11.12 on track | none | `team_avg`, only when `team_n ≥ 5`; otherwise no tick and the key is absent |
| Axis | same grid | 13 × k / 1 / 400 | `--ch-text-tertiary` | none | "−1.0", "Tour", "+1.0" |
| Key | padding-left 118; gap 8 | 13 × k / 1.2 / 400 | `--ch-text-secondary` | none | "Team average" with a 14 tall tick |
| Note | card note | Body | | none | the biggest gap in words, then "{window} · {n} rounds · strokes per round". Window is the source's own label (03 §3, today "All time") |

Redline: label column 108; figure column 46; track 22, bar 16; zero line 1.5; rows 14 apart.

### 3.7 Your plan for Eli (coach only; 03 §7)

| Element | Box | Type | Colour | Hit | Data |
|---|---|---|---|---|---|
| Head | card head; lock 16 before the title | Card title | | none | "Your plan for {first}"; meta "Only you" with eye 14, 13 × k / 1.2 / 500 `--ch-text-secondary`, gap 6 |
| Key values | grid max-content / 1fr, gap 10 16 | 15 × k / 1.38; key 400, value 500, note 400 | key `--ch-text-secondary`; value `--ch-text-primary` | none | Aim (`narrative_goal`), Alerts (`alert_posture`), Watching (`highlight_categories`), Note (`notes`) |
| Edit plan | in the card note | 15 × k / 1 / 600 | `--ch-accent` 8.15 / 8.45 | the note row (min 44) | opens `S-FILE.plan` (`data-ch-hf-intent-edit`) |
| Not set (`nointent`) | card body | Body; defaults 600 | `--ch-text-secondary`; defaults `--ch-text-primary` | Set a plan: secondary button 44 | "Not set yet. Until you set one, CoachHelm treats {first} as Develop with Balanced alerts." (no row: don't use `loadIntent`'s made-up default as a value) |

Secondary button: `--ch-well-bg-flat` with the card ring, label `--ch-text-primary` 15.66 / 15.20.

### 3.8 Track record with Eli (coach only; 03 §8)

| Element | Box | Type | Colour | Hit | Data |
|---|---|---|---|---|---|
| Head | card head; lock 16 | | | none | meta "This season" (seasons turn on 1 August) |
| Three figures | grid 3 × 1fr, gap 8; margin-bottom 14; cells padding 12, radius 12 | figure 28 × k / 1 / 500, −0.03em, stretch 92%, tabular; label 13 × k / 1.25, margin-top 6 | `--ch-well-bg-flat`; figure `--ch-text-primary`, Improved `--ch-gain`; label `--ch-text-secondary` 8.96 / 10.87 | none | focuses assigned, improved, no change |
| Outcome rows | static rows, margin 0 −20 −18 | chip; title; meta "{before} → {after} · {month}" | chips gain / plain | none | one per closed focus this season |
| Empty | card body | Body | `--ch-text-secondary` | none | "No focus assigned to {first} yet this season. Each one you assign lands here with how it went." |

Redline (S-FILE phone): lens track at 104, 42 tall; feature card at 170 (206.8 with the preview pill); card gap 24; feature padding 20; plan dots 14; sg track 22; field figure 40; rows 64; coach-only cards carry a 16 lock.

## 4. S-FILE.rail (desktop)

| Element | Box | Type | Colour | Hit | Data |
|---|---|---|---|---|---|
| Rail | 300 wide; right hairline `--ch-separator`; scroll padding 18 14 | none | `--ch-grouped-bg` | none | none |
| Card | card, head "By player" with the count | | | none | the coach's players, lane 1's order |
| Row | row with a 32 avatar; no trailing chevron | name, top read | | 64 | the selected row holds `--a-press` |
| File head | flex, centred, gap 14; avatar 52 | name 30 × k large title, one line, ellipsis; line under 15 / 1.3 `--ch-text-secondary` | | More 36 | "Junior · Last round Oct 26, 5 days ago · 21 rounds" (03 §10). Class year is the second line until lane 1's loader lands |
| File columns | grid 1.12fr / 1fr, gap 20, align start; columns gap 20; body padding 20 28 40 | | | | one column, max 640, when the right column is empty |

Redline: sidebar 216; rail 300; top bar 56; head avatar 52; lens control 300 wide; More 36 with a 19 icon; column gap 20; body padding 20 28.

## 5. S-FILE.lens ("As Eli sees it"; 03 §11)

Every card turns into exactly what `S-BOARD` draws for the same data, in the player's words ("you"), with the player's card set and order (§12). The coach-only cards (your plan, track record) fold away and are absent from the DOM once folded, not hidden. The player-only card (what's working) folds in. Shared cards change their words in place.

| Element | Box | Type | Colour | Hit | Data |
|---|---|---|---|---|---|
| Preview pill | hug, centred; padding 8 14 8 10; gap 8; radius 999; sticky at 158 on phone (12 on desktop); margin −12 0 −8; solid `--ch-card-bg`, no backdrop blur (DESIGN_LANGUAGE: glass never behind data; settled 3 Nov); `--ch-card-ring` and 0 6 18 −8 rgb(28 25 18/.3) | 14 × k / 1.2 / 500 | `--ch-text-primary` on card 17.08 / 14.34; eye 16 `--ch-accent` 8.15 / 8.45 | none (not a control) | "Previewing {first}'s screen" |

The lens never shows "Seen repeatedly", Wrong cause, Already on it, Show later, teammate dots, or dismissed reads the player can't see (03 §11, Visibility). The player's own dismissals drop out, as on their Board.

Redline: pill at 158, 32.8 tall at k = 1; feature card 24 under it less 8.

## 6. S-FILE.focus (actions and handshake by stage)

| Stage | Feature card actions (coach) | Plan card |
|---|---|---|
| No focus (`nofocus`) | light "Assign as focus" with flag 18 (`data-ch-hf-assign`), ghost "Message {first}" with message 18 | head meta "No focus yet"; three steps unreached; note "Assign a focus from any read…" |
| Suggested (`suggested`) | done "Sent to {first}" with check 18, disabled; ghost "Message {first}" | Suggested reached with its date; line to Shown fills |
| Shown (`seen`) | done "Sent to {first}" | Suggested and Shown reached, Shown dated with time ("Oct 4, 9:12 PM") |
| Accepted (`default`) | done "{first} accepted it" | all three reached; goal block and drill well drawn |
| Declined (`declined`, not drawn) | light "Assign as focus" again, ghost "Message {first}" | the third step reads "Declined" in `--ch-loss` with no tick, the dot stays the unreached ring; meta "Declined Oct 5" |

While a write is in flight the pressed button reads today's `FocusActions` in-flight string (fixed 4 Nov: the page's "Assigning" stands in for it), disabled, label unchanged in colour (today's `useFocusActions`). On failure see §11.

Redline: done button 5.64 / 5.38; button gap 10; step dates 13 × k.

## 7. S-FILE.undo

The dismissed read's row in All reads: static row, X tile, "Dismissed: {title}" at 400 `--ch-text-secondary`, Undo link trailing (`--ch-accent`, 44 tall). While Undo is in flight it reads "Undoing". Only one dismissed row shows at a time per session; the newest dismissal replaces the older (the page's behaviour, 07 M-LNS-18). On reload, every read dismissed in the window is listed in the card under the open reads, each with Undo (03 §4: a new read, `status='dismissed'`). Players never get dismissed rows (SHARED-11).

## 8. S-FILE.read (evidence sheet; 03 §9)

| Element | Box | Type | Colour | Hit | Data |
|---|---|---|---|---|---|
| Scrim | full screen | none | `--ch-scrim` | tap closes | none |
| Sheet (phone) | today's `ui/Modal`, unchanged: full width, bottom; hugs content, max 86% of the screen; radius 20 20 0 0; 0 −10 40 −10 rgb(0 0 0/.3) | none | `--ch-grouped-bg` (fixed 4 Nov: was `--ch-card-bg` with wells; the shared read sheet puts each section on its own `--ch-card-bg` card on the grouped ground, as the Read page and the Team inspector do. See Completeness pass, shared read sheet) | | |
| Dialog (desktop) | 480 wide, centred; max 86%; radius 20 | | | Esc closes | |
| Grabber (phone) | 36 × 5, radius 3, margin 7 auto 0 | none | `--ch-separator` | drag area is the whole head | |
| Head | flex, start, space-between, gap 12; padding 14 20 8 | chip; title 22 × k sheet title, margin-top 4 | chip loss "Priority" or accent "Assigned" | X 44 (§0.4) | read stance and title |
| Close X | 34 circle (fixed 4 Nov: was 32; the shared sheet uses 34 in both lanes); icon 16 | none | `--ch-well-bg-flat`, icon `--ch-text-secondary` | 44 | |
| Body | scrolls; padding 4 16 34 (34 is the device inset; the build uses today's Sheet safe-area padding); flex column, gap 16 | | | | |
| Well (section card) | padding 14; radius 12; inset 0 1 2 rgb(28 25 18/.06); title Well title, margin-bottom 10 | | `--ch-card-bg` on the grouped ground (fixed 4 Nov: was `--ch-well-bg-flat`; the ink figures below were measured on the well; recheck them on `--ch-card-bg` in both themes against the 4.5:1 floor, CP-LNS-14); text on well: ink 15.66 / 15.20, ink-2 8.96 / 10.87, ink-3 6.06 / 7.41 | none | |
| The comparison | rows grid 56 / 1fr / 36, gap 10; rows 10 apart; bar 10 tall, radius 5 | 15 × k / 1 / 500; figures tabular, right | bars `--ch-chart-flat`, the player's `--ch-chart-loss-fill` | none | player, Team (floor 5), Tour; bar width = value / largest |
| Penalties strip | 64 tall; bars flex 1, gap 6, radius 4 4 0 0, min 3; dates 13 × k under, margin-top 6 | | bars `--ch-chart-flat`, rounds at 2 or more `--ch-chart-loss-fill` | none | `golf_rounds.total_penalties`, last 8 countable rounds, oldest first |
| Where it happened | rows gap 8; grid auto / 1fr, gap 10 | date and hole 13 × k / 1.5 / 600 tabular `--ch-text-secondary`; text 15 × k / 1.38 | | none | three newest holes with a penalty (03 §9) |
| Why | paragraph and meta | 15 × k / 1.42; meta 13 × k / 1.3 / 600, margin-top 10 | `--ch-text-secondary` | none | "Why we think this" (coach) / "Why CoachHelm thinks this" (player); meta "{n} rounds · {window} · {firmness} · as of {date}" |
| Corrections | today's CorrectionChips, unchanged (§8.1) | | | 44 | flag `coachhelm_corrections_v1` |
| Drill, gathering, no-tour, links | (fixed 4 Nov: added so both lanes draw one sheet) as the shared read sheet in the Completeness pass section: drill card or Still gathering card after Why; "No Tour figure for this one" line in the comparison when the read has none; link rows "Open the full read" (only with `coachhelm_read_v1` on) and "Ask CoachHelm about this" (only once Ask exports its href) after Corrections | | | 44 rows | `readHref`; Ask href |
| Footer (coach) | flex, gap 10; padding 12 16 34 (16 on desktop); top hairline; buttons flex 1 | Button | secondary "Dismiss"; primary "Assign as focus" is today's `.ch-btn--primary`, unchanged (the page approximates it with the green chip shade, label 7.10 / 5.58) or done "{first}'s focus" (`--ch-gain` on 12% gain, 6.16 / 6.68) | 44 | Dismiss and Assign go through `useFocusActions` |

### 8.1 Corrections (today's CorrectionChips, `.ch-hl-cx`)

Block: column, gap 8, padding-top 12, top hairline `--ch-separator`. Label "Is this read right?" `--ch-type-13-strong`, `--ch-text-secondary` 9.77 / 10.25. Chips row: wrap, gap 8. Chip: min-height 36, padding 0 16, 1px `--ch-border-control`, radius 999, `--ch-bg-surface`, 13 × k / 1.2 / 600 `--ch-text-primary` 16.51 / 14.02; pressed `--ch-bg-hover`; "Not this" open: `--ch-border-strong` on `--ch-bg-selected`, 15.55 / 13.14, `aria-expanded="true"`. Reasons row (after Not this): padding 8, radius 12, `--ch-bg-subtle`, the four reasons as chips. Answered: one row, space-between, "Your answer: {kind}." `--ch-type-14` `--ch-text-secondary`, and Change 13 × k / 600 `--ch-text-primary`, underline offset 3 in `--ch-border-strong`, 36 tall. Coach kinds: Not this, Wrong cause, Already on it, Show later, Good read. Player kinds: Not this, Good read.

Redline: grabber 36 × 5 at 7; title 22 × k; section cards 16 apart, padding 14, radius 12 (fixed 4 Nov: were wells); close 34; gauge bar 10; strip 64; chips 36 with gap 8; footer buttons 44 with gap 10; desktop dialog 480.

## 9. S-FILE.plan (your plan sheet; coach only)

Same sheet and dialog frame as §8, with head "Only you" (lock 14, 13 × k / 500 `--ch-text-secondary`, margin-bottom 2) over the title "Your plan for {first}".

| Element | Box | Type | Colour | Hit | Data |
|---|---|---|---|---|---|
| Well per field | as §8 section cards (fixed 4 Nov: each field is a `--ch-card-bg` card on the grouped ground; unpicked picks keep their card ring, so they still read as buttons) | Well title | | | Aim this season; How often CoachHelm flags {first}; Watching; Note |
| Picks | wrap, gap 8; min-height 36; padding 0 12; radius 10; card ring and 0 1 2 rgb(28 25 18/.06) | 14 × k / 1 / 500; picked 600 | unpicked `--ch-text-primary` on `--ch-card-bg`; picked `--ch-text-on-accent` on `--ch-seg-on-bg` (the segmented chip shade, SHARED-2's one gradient) 7.10 / 5.58 with 0 1 2 rgb(11 58 37/.3) | 44 (§0.4) | Aim: Breakout, Develop, Maintain, Bubble, Rehab (one); Alerts: Aggressive, Balanced, Conservative, Silent (one); Watching: the five areas (several) |
| Alerts hint | margin-top 10 | 13 × k / 1.3 / 600 | `--ch-text-secondary` | none | "Aggressive shows more reads, Silent shows none." |
| Note | fill; min-height 76; padding 10 12; radius 10; card ring; no resize | 15 × k / 1.4 | text `--ch-text-primary`; placeholder `--ch-text-tertiary` 6.61 / 6.99 | the field | `notes`; placeholder "Only you see this" |
| Footer | as §8 | | secondary "Cancel", primary "Save plan" | 44 | upsert `golf_coach_player_intent` (03 §7); while saving "Saving" |

With no plan (`nointent`) the picks open on Develop and Balanced, nothing watched, empty note.

Redline: picks 36 tall, radius 10, gap 8; note 76 tall; footer 44.

## 10. S-FILE.more (today's `ui/Menu`)

| Element | Box | Type | Colour | Hit | Data |
|---|---|---|---|---|---|
| Menu | 232 wide; padding 6; radius 14; flex column, gap 2; glass blur 24 saturate 170%; ring and 0 12 32 −8 rgb(28 25 18/.28); anchored under its trigger with today's 8pt edge clamp (phone lands at top 92 right 10; desktop top 132 right 28); flips up near the bottom | none | `--a-glass` | tap outside, Esc or scroll closes | none |
| Item | min-height 34 × k; padding 0 8; radius 8; gap 8; icon 16 | 14 × k / 1.2 / 500 | `--ch-text-primary` on glass 16.72 / 14.73; icon `--ch-accent` 7.98 / 8.69; pressed or focused `--a-press` | 34 × k (§0.4) | "Open {first}'s profile" (users icon) to `/golf/dashboard/roster?player=<id>` (fixed 4 Nov), "Message {first}" (message icon) |

Redline: 232 wide; items 34; radius 14; 8 from the screen edge.

## 11. S-FILE.toast (today's `useToast`, unchanged)

Not drawn. Words from `useFocusActions` (`parts.tsx:306`): "Couldn't assign the focus to {first}" / "Nothing was saved. Try again." CH-13001; "Couldn't dismiss the insight" / "It's still on the board. Try again." CH-13002; "Couldn't undo the dismissal" / "It's still dismissed. Try again." CH-13003; duplicate "{first} already has a focus on this". Save plan failing: "Couldn't save your plan for {first}" / "Nothing was saved. Try again." with the next free CH-13xxx (fixed 4 Nov wiring: CH-13760, the first of this lane's block CH-13760 to CH-13779). Accept and Decline failing (§13): "Couldn't accept the focus" / "Couldn't decline the focus", "Nothing was saved. Try again.", next free codes (fixed 4 Nov wiring: Accept and Decline reuse today's `ProposalRow` actions, so their codes are today's CH-13004 and CH-13005, `screens/coachhelm/Proposals.tsx:35, 44`, with today's words "Couldn't accept {title}" / "Couldn't decline {title}" and "It is still waiting for you. Try again in a moment."). Layout, colours and motion are today's.

## 12. S-BOARD (the player's own CoachHelm)

Order, phone: Board · Standing · Deep dive strip, "Your week" title, feature, what's working, plan, last round in context, where the strokes go, also worth knowing. Desktop: one workspace with no rail; head "Your week" with the strip on the right; left feature, plan, strokes; right what's working, field, also worth knowing.

| Element | Box | Type | Colour | Hit | Data |
|---|---|---|---|---|---|
| Root bar | §1.1 root bar | | | | badge count is the player's own |
| View strip | today's segmented, unchanged: 42 track, three segments | as §3.1 | as §3.1 | 44 | Board (picked), Standing, Deep dive |
| Title block | column, gap 22 | large title; context line, margin-top −18 | `--ch-text-primary` 15.10 / 16.01; context `--ch-text-secondary` 8.64 / 11.45 | none | "Your week"; "{n} rounds · refreshed {date}" (03 §10) |
| Feature card | §3.2 in the player's words | | | | kicker by stage; "You" in the comparison; "Solid read" chip |
| What's working | card; one static row with a gain chip | | | none | head "What's working", meta "Top strength"; the top strength only (`WORKING_MAX` 1, 03 §5) |
| Plan card | §3.3, coach's line instead of the track | | | | |
| Last round in context | §3.4 with no teammate dots | | | | "You shot…", the field mean and the player's own mark only |
| Where the strokes go | §3.6 | | | | meta "You vs Tour and team" |
| Also worth knowing | §3.5 without the dismissed row; card note "{n} more read(s) in the Deep dive" | | | rows 64 | up to 2 rows: the Board's 3 findings counting the focus, minus the focus (`NEEDS_MAX` 3, `moreReadsLine`, 03 §4) |

Never in the player DOM or payload: Your plan, Track record, teammate dots, "Seen repeatedly", Wrong cause, Already on it, Show later, the coach's dismissed rows (SHARED-11).

Redline: strip at 112, 42 tall; title 22 under the strip; feature card 24 under the context line; card gap 24.

### 12.1 S-BOARD.focus

| Stage | Kicker | Actions |
|---|---|---|
| No focus | "Top of your list" | none |
| Suggested / Shown | "Coach Reyes suggests this as your focus" | light "Accept" with check 18 (`data-ch-hf-accept`), ghost "Decline" (`data-ch-hf-decline`) |
| Accepted | "Your focus" | done "Your focus since Oct 5", disabled |
| Declined (not drawn) | "Top of your list" | none; the plan card line reads "You declined this on Oct 5" |

In flight: "Accepting", "Declining". The coach's name is the assigning coach's display name, never a hard-coded "Coach".

### 12.2 S-BOARD.read

The §8 sheet in the player's words: "You" in the comparison, "Why CoachHelm thinks this", read word "Solid read", corrections Not this and Good read, no footer.

## 13. States

| State | Rule |
|---|---|
| Loading | Every card keeps its head and shows three bars at 82, 64, 74% wide, 12 × k tall, radius 6, gap 10, padding 4 20 20, `--ch-skel-base` with today's 1.9s linear sheen `--ch-skel-sheen` (`.ch-skel`). Feature card: bars at 44, 70 (22 × k tall), 92, 70% on white 10% with a white 12% sheen. Under Reduce Motion the sheen is gone (07 M-LNS-25). `aria-busy="true"` on each card |
| Empty (no rounds) | One card: `.empty` column, centred, gap 8, padding 26 24 24. Icon circle 44, margin-bottom 4, `--ch-accent` 11% tint, glyph 22 `--ch-accent` 6.84 / 6.83. Title 16 × k / 1.3 / 600. Body 14 × k / 1.45, max 34ch, `--ch-text-secondary`. Button margin-top 8: coach secondary "Message {first}", player primary "Go to Rounds". The coach's plan and track record cards still draw |
| Failed | One card, `role="alert"`: icon circle on `--ch-loss` 12% with glyph `--ch-loss` 4.71 / 6.76 (3:1 glyph), "Couldn't load {first}'s file" / "Couldn't load your CoachHelm", "Nothing was lost. Check your connection and try again.", secondary "Try again". No lens control |
| Stale (one section failed) | Not drawn. That card shows today's RefreshNotice in place of its body; the rest draw |
| Early (rounds, none countable) | Feature card "No reads yet" (coach) / "Your reads start after 4 full rounds"; progress pips 28 × 6, radius 3, gap 6, white 18%, reached `--ch-feature-gain`; label 13 × k / 500 `--ch-feature-ink-2`, margin-left 6, "0 of 4 rounds that count"; chips "2 rounds", "Totals only", "Last 90 days". Strokes rows read "—" with empty tracks and no key. Reads card "No reads yet". No field card, no what's working |
| Long | Longest names ellipsize on one line in bars, rows, card meta and the desktop head; read titles wrap to two lines then ellipsize; feature title wraps without a cap |
| XXL (k = 1.36) | Every × k value grows; rows and buttons grow past their minimums; nothing clips (SHARED-5). Charts keep their heights; their labels grow |
| Dark | Every token takes its dark value (§0.1); the feature card's dark fill is #123D29 |

Redline (states): skeleton bars 12 tall, gap 10; empty icon 44; failed glyph amber, never red; early pips 28 × 6.

## Completeness pass, 4 Nov 2026

Specs for the IDs and states added in 05's Completeness pass section, then the shared read sheet contract that this lane imports from Team. §8 was fixed in place to match it. Same columns as above; hex from §0.1, contrast worked out from it.

| Element | Box | Type | Colour | Hit | Data |
|---|---|---|---|---|---|
| Discard row (S-FILE.plan.discard) | replaces the footer content: one line, then the two buttons, flex, gap 10; at k 1.36 the buttons stack | line 15 × k / 1.3 / 600; Button | line `--ch-text-primary` 17.08 / 14.34 on card; primary today's `.ch-btn--primary`, secondary today's `.ch-btn--secondary` | 44 each | "Discard changes?"; "Keep editing"; "Discard" |
| File at 1024 to 1179 | rail 300, then one column, max width 720, padding 24, cards 24 apart in phone order | as desktop | as desktop | | as S-FILE |
| File at 821 to 1023 | desktop shell, no rail; S-LIST fills the main area at max width 720; the file pushes over it | as phone | as phone | rows 64 | as S-LIST, S-FILE |
| Focus ring | today's `:focus-visible` ring, 2pt, offset 2, the target's radius; on the feature card `--ch-feature-ink` | | `--ch-accent` on card 8.15 / 8.45; on feature 11.30 / 10.78 | every row, segment, chip and button | none |
| Lens control keys | radio group; Left and Right move and select | | | 44 | `data-ch-lens` |

### CP shared read sheet (one component, two hosts)

The Team read sheet (`ReadPanel`, CT3) and the Lenses evidence sheet (`EvidenceSheet`, PR 3) are one content component. Team lands first (BUILD_BRIEF order), so Lenses imports it and adds nothing of its own inside it. This table is word for word the same in `coachhelm-team/06` and `coachhelm-lenses/06`. Where an older row in either file differs, this table wins and the older row carries a `(fixed 4 Nov: ...)` note. Contrast figures are on `--ch-card-bg` (light #FFFEFB, dark #191E1A), worked out from the token hex in each lane's token map.

| Element | Box | Type | Colour (light / dark) | Hit | Data |
|---|---|---|---|---|---|
| Container (phone, up to 820) | today's `ui/Modal` bottom sheet, unchanged: full width, hugs content, max 86% of the screen, radius 20 20 0 0, grabber `.ch-grab`, safe-area padding at the bottom | none | panel `--ch-grouped-bg` #F2F0E9 / #0E120F; scrim `--ch-scrim` rgb(20 20 18/.36) / rgb(2 6 4/.58) | scrim tap closes; drag on the head closes past 80pt or a 0.5pt/ms flick | none |
| Container (821 and up) | the host's own: Team puts the content in its 420 inspector (no scrim, overlays the board under 1180); Lenses in its 480 centred dialog, radius 20, max 86% | none | panel `--ch-grouped-bg`; Lenses dialog scrim `--ch-scrim` | Esc closes; focus returns to the row that opened it | none |
| Head (coach) | flex, gap 12, padding 14 20 8; coin 30; text column; close at the right | full name 16 × k / 1.25 / 600; meta "{area} · {n} rounds this season" 13 × k / 1.3 / 500 | name `--ch-text-primary` 15.10 / 16.01 on ground; meta `--ch-text-secondary` 8.64 / 11.45 | close 44 | player name and colour (roster), `insight.area`, season round count (03) |
| Head (player) | as coach, no coin | area kicker 13 × k / 1.3 / 600 caps off | `--ch-text-secondary` 8.64 / 11.45 | close 44 | `insight.area` |
| Close | 34 circle, icon 16 | none | `--ch-well-bg-flat` fill, icon `--ch-text-secondary` | 44 (5pt hit extension) | none |
| Chip row | wrap, gap 8, margin 4 20 0 | 13 × k / 1 / 600; chips 28 tall, padding 0 10, radius 999 | stance chip tints over ground: loss 8% (5.00 / 7.33 on card), gain 12% (6.15 / 6.70), accent 11% (6.84 / 6.80); plain chips `--ch-text-secondary` on 9% | none | stance, worth ("{x} strokes a round"), claim or read word, cause (coach only, only when the read has one), window ("Last {n} rounds") |
| Title | margin 10 20 0; wraps, no line cap | 23 × k / 1.18 / 600, `font-stretch` 92% | `--ch-text-primary` | none | `insight.title` |
| Lede | margin 6 20 0 | 15 × k / 1.42 / 400 | `--ch-text-secondary` 8.64 / 11.45 | none | `insight.summary` |
| Section card | margin 16 16 0; padding 14; radius 12; today's card ring and shadow | card title 13 × k / 1.3 / 600 `--ch-text-secondary`, margin-bottom 10 | `--ch-card-bg`; ink 17.08 / 14.34, ink-2 9.77 / 10.25, ink-3 6.61 / 6.99 | none | none |
| Comparison (ladder) | rows grid 56 / 1fr / 44, gap 10, rows 10 apart; bar 10 tall, radius 5; drawn at rest, no grow | label 15 × k / 1 / 500; figure tabular, right | bars `--ch-chart-flat` 5.58 / 6.27, the player's bar `--ch-chart-loss-fill` 3.92 / 7.12 (marks 3:1); track `--ch-chart-track` | none | rows: player (or "You"), Team only when the read carries a team pool, `coachhelm_team_pool_v1` is on and the pool has 5 or more players, PGA Tour. A row with no figure shows its label and today's `ChLadderRow.missing` line (03-DATA-CHECKS: "Not measured yet…") in place of the bar; a lone missing number elsewhere reads "—". No Tour figure: the Tour row is left out and one line sits under the rows, 13 × k `--ch-text-tertiary` 6.61 / 6.99, worded by `ChLadderRow.missing` ("No Tour figure to compare this with yet."; the Team page's "No Tour figure for single holes, so none is drawn." fills the same slot) |
| Evidence cards | as section card; last-8 strip 64 tall (bars flex 1, gap 6, min 3) and "Where it happened" rows (date and hole column, then text) | dates 13 × k / 1.5 / 600 tabular; text 15 × k / 1.38 | strip `--ch-chart-flat`, rounds over the read's line `--ch-chart-loss-fill` | none | only when the read has them (03): last 8 countable rounds, oldest first; three newest holes |
| Why card | as section card | 15 × k / 1.42; meta 13 × k / 1.3 / 600, margin-top 10 | body `--ch-text-primary`; meta `--ch-text-secondary` | none | title "Why we think this" (coach) or "Why CoachHelm thinks this" (player); meta "{n} rounds · {window} · {firmness} · as of {date}". Never the likely cause for a player (CR0) |
| Drill card | as section card; drill name, one line why, reps line | 16 × k / 1.3 / 600; 14 × k / 1.42 | `--ch-text-primary`, `--ch-text-secondary` | none | `insight.drill` when present |
| Still gathering card | as section card, centred, icon circle 36 on accent 11% | 15 × k / 1.3 / 600; 14 × k / 1.42 | glyph `--ch-accent` 6.84 / 6.80 on its tint | none | in place of the drill when the read has none: "Still gathering" and "{n} more rounds before CoachHelm suggests a drill" ("1 more round" singular; with the count unknown, "Still gathering" alone). No Assign while gathering |
| Corrections | today's `CorrectionChips`, unchanged, as its own section card | as today | as today | 44 per chip (36 drawn, 4 extension) | behind `coachhelm_corrections_v1` |
| Link rows | card of rows, each 48 tall, top hairline between, chevron 14 at the right | 15 × k / 1.2 / 500 | `--ch-accent` 8.15 / 8.45 | 48 | "Open the full read": `readHref` when `coachhelm_read_v1` is on; with it off, Team links `coachReadHref` (today's Deep dive) and Lenses leaves the row out. "Ask CoachHelm about this": only once Ask exports its href and its flag is on. "Add to practice": only once Practice exports `practicePlanHref` and `golf_practice_plans` is on |
| Footer (coach) | pinned on phone with a top hairline `--ch-separator`; padding 12 16 + safe area (16 on desktop); flex, gap 10; at k 1.36 the two buttons stack, primary on top | Button 15 × k / 600 | secondary today's `.ch-btn--secondary`; primary today's `.ch-btn--primary` | 44 tall, radius 12 | secondary "Dismiss" only where the host passes an Undo place (Lenses yes, Team no); primary "Assign as focus". Strings are today's `FocusActions` strings |
| Footer (player) | none | | | | players never get Dismiss or Assign |
| Assigning | primary keeps its box, disabled; spinner 18, 2pt ring, right quarter clear, gap 8 | as Button | as primary | disabled | today's `FocusActions` in-flight label |
| Assigned / focus exists | a 44 row in place of the primary, not a button: check 18, stroke 2.2, then the label | 15 × k / 1.2 / 600 | `--ch-gain` on 12% gain over card 6.15 / 6.70 | none | today's `FocusActions` done label; the Team host may add " · now in Working on" |
| Duplicate (assigned elsewhere) | as Assigned | as Assigned | as Assigned | none | a focus already exists for this read (second device, another coach): the write is not sent again; the row shows as Assigned |
| Write failed | the sheet stays open; primary back to "Assign as focus" | | | 44 | today's `useFocusActions` toast with its own words and code (CH-13001). No inline line |
| Stale | "Out of date" plain chip leads the chip row; no Assign | chip as above | plain chip | none | `ChInsight.stale` |
| Part failed | that one card's body becomes one line and a text button | 14 × k / 1.42; "Try again" 14 × k / 600 | `--ch-text-secondary`; button `--ch-accent` | 44 | "Couldn't load this part" (the rest draws) |
| Gone | the sheet shows one compact card in place of the body: icon circle 36 on loss 12%, title, one line, secondary "Close" | 16 × k / 1.3 / 600; 14 × k / 1.45 | glyph `--ch-loss` 5.57 / 8.53 (amber, never red); text `--ch-text-secondary` | 44 | CH-13861 wording: the read was removed or is not yours to see. No figures load for a read the viewer may not see |
| Long and XXL | title wraps with no cap; names ellipsize on one line in the head; at k 1.36 the sheet grows to its 86% cap, then the body scrolls under a pinned head and footer | every × k value | | | |
| Loading | the sheet never opens while the host is loading; a row tapped during a refresh opens on the data already shown | | | | |
| Screen reader | `role="dialog"`, `aria-modal="true"`, `aria-labelledby` on the title; order: close, head, chips, title, lede, cards in order, links, footer; Assign in-flight sets `aria-busy` on the footer | | | | |

Redline: head padding 14 20 8; close 34; title 23 × k; section cards 16 apart, padding 14, radius 12; ladder bar 10; strip 64; link rows 48; footer buttons 44, gap 10; phone max 86%; Team inspector 420; Lenses dialog 480.


## Wiring, 4 Nov 2026

Checked against helmv3 `main` 03d9087 (1 Nov) by reading code only. Paths under `src/clubhouse/` unless they start with `src/`, `supabase/` or `config/`. "new:" names code the build adds. A missing value shows "—". Six writes, all existing actions: Assign, Dismiss, Undo, Save plan (coach), Accept, Decline (player). Shot tracking: no screen in this lane changes what shot tracking collects, stores or sends. The field card reads round rows (`loadTeamFieldRounds`, `src/lib/coachhelm/v3/field-day/loader.ts:29`), the SG card reads stored standing rows, the evidence sheet's penalty strip reads `golf_rounds.total_penalties`; nothing reads or writes `golf_shots`.

### Shared plumbing (S-FILE, S-FILE.off, S-LIST row push)

| element or action | reads (source, file:line) | writes or calls (file:line or new) | who and RLS | validation | success | failure and rollback | sync (realtime or refresh) | notification | flag | until held migration runs |
|---|---|---|---|---|---|---|---|---|---|---|
| Route `?view=player` and redirects | `ClubhouseCoachHelmRoute` `routes/coachhelm.tsx:166`, `coachDrill` block 191-197, `CoachPlayerPage` 114-132 | new: before line 191, `view === 'player'` gives `CoachPlayerFilePage`; `deep-dive`, `standing`, `profile` with `from !== 'file'` redirect to `playerFileHref(…, true)`; CSS import after line 41; page type gains `insight`, `at`, `from` (`page.tsx:199`, type only) | coach branch only; `loadCoachPlayerScope` (`data/coachhelm-player.ts:90`) checks the id against the coach's team first; a player never reaches this branch (224-233), so a file URL gives their own CoachHelm | strings only | file renders | not member CH-13311, scope failed CH-13209, coach-off board, player-off `HelmOff` (today's states) | none (server render) | none | new `coachhelm_player_file_v1`, `src/lib/coachhelm/v3/player-file/flag.ts`; off: no redirect, `view=player` falls to the board (`S-FILE.off`) | none |
| `playerFileHref(id, at?, on = false)` | `coachPlayerHref` (`data/coachhelm-views-shape.ts:91`) | new, after line 130, beside Read's `readHref`; `on` false gives today's address byte for byte | callers pass `on` from a server loader (`isFlagEnabled` is server only, `src/lib/flags/is-enabled.ts`); coach surfaces only | ids encoded, empty parts left out | n/a | n/a | n/a | n/a | as above | none |
| Loader | `loadCoachPlayerDeepDive` (`coachhelm-player.ts:187-269`, one `getInsightsForCoach` at 200), `loadCoachPlayerStanding` (171-176) | new `data/coachhelm-file.ts` `loadCoachPlayerFile`: the standing loader takes the dive's feed rows instead of its own call | `getInsightsForCoach` (`src/app/golf/actions/insight-delivery.ts:871`) checks coach access; rows under `coach_insights_select_via_player_team` (baseline 18552) | n/a | `ChViewLoad<ChPlayerFile>` | each card fails on its own (`SectionBoundary`) | none | none | file flag | none |
| Exposure | `recordExposureForReturned` (`insight-delivery.ts:1069`, `coach_feed`) | one `coach_feed` set per file view, the same as opening Deep dive today; the lens records nothing | server only | n/a | n/a | n/a | n/a | n/a | n/a | none |
| Goals in the plan (L0, PR 0) | `readPlans` (`data/coachhelm-dive.ts:53-71`): `loadActiveGoals`, `loadRecentlyAchievedGoals` use the admin client with no share filter (`src/lib/coachhelm/v3/goals/loader.ts:19-38`) | fix: `readPlans(supabase, playerId, viewer)`; for a coach keep a goal only when `creator_role === 'coach' \|\| shared_with_coach` and `team_id === scope.teamId`, the rule of RLS `goals_coach_view` (baseline 18708); callers `coachhelm-dive.ts:121` (player: unchanged) and `coachhelm-player.ts:194` (coach) | coach never receives a private player goal; the player keeps all of their own | n/a | n/a | n/a | n/a | none | none: ships alone with every flag off, fixing today's coach Deep dive too | none |
| Rail (`S-FILE.rail`) | new `loadFileRoster(scope)`: active `golf_team_members` on `scope.teamId` | `Link` to `playerFileHref(id, undefined, true)` with `replace` | coach; team members only | n/a | file swaps in place; each swap records one `coach_feed` set | rail failed: list hidden, file still draws | none | none | file flag | none |
| Pull to refresh, Back | `shell/PullToRefresh.tsx`; history | `router.refresh()` | both | n/a | cards swap in place, lens kept | per card | refresh | none | none | none |

### S-FILE cards: feature, reads, SG, field, intent, track (+ S-FILE.focus, S-FILE.undo)

| element or action | reads | writes or calls | who and RLS | validation | success | failure and rollback | sync | notification | flag | until held migration runs |
|---|---|---|---|---|---|---|---|---|---|---|
| Feature card: Assign as focus | `ChDeepInsight` top of `orderDive`; `ChInsight.assigned`, `declined`, `stale` | today's `FocusActions` (`screens/coachhelm/parts.tsx:392`) with `useFocusActions(writes).assign` (306) and the same `ChFocusTarget` (290); `LIVE_COACHHELM_WRITES.assign` to `createFocusAreaFromInsightV2` (`src/app/golf/actions/development.ts:1736`) | coach; `verifyPlayerAccess`; RLS `golf_player_focus_areas_insert_coach` (baseline 19345) | duplicate `ACTIVE_FOCUS_DUPLICATE_ERROR` | chip "Assigned" after success only; plan card Suggested step slides in (`Swap`) | toast CH-13001; duplicate "{first} already has a focus on this" | the action's `revalidatePath('/golf/dashboard/coachhelm')` | to the player: bell row `dev_plan_assigned` plus email gated by `email_task_reminders` (`notifyPlayerOfProposedFocus` `development.ts:1359`); no push | none | none |
| Reads card: Dismiss, Undo | `ChFileCards.reads` | `fa.dismiss` to `dismissInsight` (`src/app/golf/actions/insights-feed.ts:681`); `fa.undo` to `reactivateInsight(id, lifecycle, 'dismiss')` (790) | coach; session client scoped by `team_id`; RLS "Coaches can manage their insights" (baseline 16837) | n/a | row "Dismissed: … Undo" (`S-FILE.undo`) | toast CH-13002 / CH-13003, row kept | revalidatePath `/golf/dashboard`, `/golf/dashboard/insights` | none | none | none |
| SG card | `PlayerStanding.team_avg`, `team_n` (`src/lib/coachhelm/v3/standing/types.ts`) through new `toChFileSg` | "Full standing" link `coachPlayerHref('standing', id) + '&from=file'` | coach file and player board; vs team only when every `team_n >= 5`, else vs Tour | n/a | drawn | standing failed: card failed state | refresh | none | none | none (reads `golf_player_standing` lifetime while `20261024151000_golf_player_standing_season` is held, as Standing does today, `data/coachhelm-standing.ts:157`) |
| Field card | `loadTeamFieldRounds` (`field-day/loader.ts:29`), `buildFieldDayContext`, `FIELD_MIN_MEMBERS` 3 (`field-day/field.ts:22`) | new pure `toChFileField(entry, rows, viewer)` | coach: dots (values only, no ids or names) at any field size; player and lens: `dots: null` and the card null under `field_n` 5; RLS `golf_rounds_select` | n/a | drawn | loader null: failed state | refresh | none | `coachhelm_team_pattern_v1` (`config/feature-flags.yml:781`), as the loader's own comment asks | none |
| Intent card (coach only) | new `loadFileIntent(scope)` with the session client: `golf_coach_player_intent` by `coach_id` and `player_id`, `maybeSingle()`; never `loadIntent` (it invents a default) | "Edit plan" / "Set a plan" opens `S-FILE.plan` | RLS `intent_coach_only` (baseline 19912); left out of every shape built for a player or the lens, so it never reaches a player's client | null: "No plan set" | drawn | read failed: card failed state | local after Save (below) | none | file flag | none |
| Track card (coach only) | new `loadFileTrack(scope)`: this coach's `golf_player_focus_areas` this season; `readAttributionForPlayer` (`src/lib/coachhelm/v3/effectiveness/attribution-read.ts:281`), delta only at `n_rounds_after >= 3` | none | coach; left out of player shapes | no measured outcome: "Not measured yet" | drawn | failed state | refresh | none | file flag; verdict words behind `coachhelm_verdicts_v1` | none (not `ChTrackRecord`; `20261021090000_golf_coachhelm_shown_reads` is applied anyway, HELD.md row 216) |

### S-FILE.plan (+ .discard): Save plan

| element or action | reads | writes or calls | who and RLS | validation | success | failure and rollback | sync | notification | flag | until held migration runs |
|---|---|---|---|---|---|---|---|---|---|---|
| Save plan | the intent row as loaded | `setIntent({ player_id, narrative_goal, alert_posture, highlight_categories, notes })` (`src/app/golf/actions/v3/intent.ts:100`, the same action `RosterPeek.tsx:362` calls) through `useAction` (`lib/use-action.ts`) | coach; session client, `verifyPlayerAccess` (intent.ts:55), upsert on `coach_id,player_id`; RLS `intent_coach_only` | picks from the type maps only; note up to 2000 characters (`NOTE_MAX`, `screens/roster/RosterPeek.tsx:348`) | "Saving", then the sheet closes and the card swaps from the saved values (M-LNS-21) | toast "Couldn't save your plan for {first}" CH-13760; sheet stays open with picks kept; nothing to roll back (no optimistic write) | the action revalidates only `/golf/dashboard/roster` and `/roster/{id}`, so the card updates from the values just saved, with no `router.refresh()` (a refresh would record the file's `coach_feed` set again); other devices see it on next load; last save wins | none | file flag | none |
| Double submit | `useAction` `inFlight` ref | second tap sends nothing | n/a | n/a | one write | n/a | n/a | n/a | n/a | none |
| Discard | local picks | none | coach | dirty check | "Discard changes?" footer | n/a | n/a | none | none | none |

### S-FILE.read (+ .gone), shared read sheet from Team

| element or action | reads | writes or calls | who and RLS | validation | success | failure and rollback | sync | notification | flag | until held migration runs |
|---|---|---|---|---|---|---|---|---|---|---|
| Content | the file's `ChDeepInsight`; penalty strip from `golf_rounds.total_penalties` (last 8 countable rounds) | imports Team's `team/ReadPanel.tsx` (Team lands first); nothing of its own inside it | coach; Why never carries a likely cause for a player (Read CR0 fix in `diagnosisFor`) | team row only with a team pool of 5 or more | drawn | gone: CH-13861 card, no figures | n/a | none | `coachhelm_team_pool_v1` (`feature-flags.yml:710`) | none |
| Assign, Dismiss | as the cards above | as the cards above; Lenses passes an Undo place, so Dismiss shows | coach | as above | sheet closes, then the card swaps (M-LNS-15) | as above | as above | as above | none | none |
| Corrections | `readCorrections` (`data/coachhelm-corrections.ts:29`) | today's `CorrectionChips` to `recordCoachHelmCorrection` (`src/app/golf/actions/coachhelm-corrections.ts:239`) | coach five chips; RLS `golf_coachhelm_corrections_insert_author` (`20261020121000…sql:156`) | today's | today's | CH-13971 | local | none | `coachhelm_corrections_v1` (`feature-flags.yml:1130`) | none (applied) |
| Open the full read | `insight.id` | `readHref(playerId, id, readOn)` (Read lane, `data/coachhelm-views-shape.ts`) | coach | Read off: row left out | push | n/a | n/a | none | `coachhelm_read_v1` | none |
| Ask about this | `insightId` | Ask's `askAboutHref` | coach | null: left out | navigation | n/a | n/a | none | Ask's `coachhelm_ask_v2` | none |

### S-FILE.focus handshake, S-FILE.lens, S-FILE.more, S-FILE.toast

| element or action | reads | writes or calls | who and RLS | validation | success | failure and rollback | sync | notification | flag | until held migration runs |
|---|---|---|---|---|---|---|---|---|---|---|
| Handshake: Suggested, Shown to {first}, Accepted or Declined | new `loadFilePlan(scope, plan)`: the live focus row (`created_at`, `started_at`, `status`); Shown from `golf_insight_exposure` `.eq('insight_id', from_insight_id).eq('surface', 'player_feed').gte('shown_at', created_at).limit(1)` | none | coach; RLS `golf_insight_exposure_coach_select_team` (`20260621160000_insight_event_ledger.sql:63`) | no `from_insight_id`: Shown is a dash, never a tick | drawn | read failed: plan card failed state | refresh | none | file flag | none |
| Practice row | `loadFocusAreaPracticeLogData` (`src/lib/coachhelm/focus-areas/practice-log-loader.ts:162`) | none | coach and player | count and last date only | "{n} sessions logged this week" | hidden on failure | refresh | none | `coachhelm_focus_area_practice_log` | none |
| Lens toggle | `ChPlayerFile.lens` built on the server by new `loadFileLens`: the player's rows read under the coach session, `shapePlayerFeed` (PR 5a), `projectInsightsForPlayer` | none: never calls `getInsightsForPlayer`, never writes; Accept and Decline in the lens are `aria-disabled` | coach only; feedback overlay under `ipf_coach_select_team` (baseline 19916); no intent, track, cause or dots in the lens payload | n/a | cards fold and swap | n/a | client state only, reset per player | none | file flag | none |
| More: Open {first}'s profile | `player.id` | link `/golf/dashboard/roster?player={id}` (Classes and Roster lane's deep link) | coach | n/a | navigation | before their PR 8, Roster opens on its list | n/a | none | file flag | none |
| More: Message {first} | `player.id` | link `/golf/dashboard/messages?player={id}` (`screens/messages/Messages.tsx:179` reads it) with an empty body | coach | n/a | navigation | n/a | n/a | none (sending is Messages') | none | none |
| Toast | n/a | today's `useToast` through `useAction` | both | n/a | n/a | the codes above | n/a | n/a | n/a | none |

### S-BOARD (+ .focus, .read): the player's own file

| element or action | reads | writes or calls | who and RLS | validation | success | failure and rollback | sync | notification | flag | until held migration runs |
|---|---|---|---|---|---|---|---|---|---|---|
| Cards | today's `ChPlayerHelm` (`PlayerBoard` `screens/coachhelm/PlayerBoard.tsx:44`) from `getInsightsForPlayer` (`insight-delivery.ts:836`, the real `player_feed` exposure that the coach's Shown step reads); `loadFileField`, `loadFilePlan` (no handshake), `toChFileSg` with the player's session | none | the session player only; RLS `coach_insights_select_player_own` (baseline 18546); no teammate name, id or dot; field card null under `field_n` 5 | n/a | drawn | per card | refresh | none | file flag; off: today's `PlayerBoard` byte for byte | none |
| Accept | `ChProposal` from `loadProposals` (`data/coachhelm.ts:312`), new `coachName` from `golf_coaches.full_name` in `coachUserIds` (338) | today's `ProposalRow` (`screens/coachhelm/Proposals.tsx:26`) `writes.accept` to `acceptFocusArea` (`development.ts:736`): proposed to active, `started_at` set | player; RLS `golf_player_focus_areas_update_player` (`20260621041839`) | only a `proposed` row changes | "Your focus since {date}" | toast "Couldn't accept {title}" CH-13004, buttons stay | `revalidatePath('/golf/dashboard/coachhelm')` (724) | none: the coach is not notified today; the coach sees Accepted on the handshake on next load | none | none |
| Decline | as Accept | `writes.decline` to `declineFocusArea` (795): proposed to declined | player; same policy | `.eq('status', 'proposed')` | row leaves, today's Undo toast | toast CH-13005 | revalidatePath (783) | none: the coach is not notified; Declined shows on the handshake | none | none |
| Name read failed | `golf_coaches.full_name` | none | readable to any signed-in user | n/a | n/a | "Your coach" | n/a | none | none | none |
