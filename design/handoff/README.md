# Handoff: GolfHelm coach app on Fairway Clubhouse Edition

## Overview
This is the redesigned GolfHelm coach web app, built on the **Fairway Clubhouse Edition** design system. The owner approved five screens:

1. **Home** (`Coach Home v3.html`): the coach's day, with a calendar, latest rounds and a leaderboard.
2. **Calendar** (`Calendar.html`): day, week, month and agenda views, a right-hand detail panel, and an event editor.
3. **Messages** (`Messages.html`): team and direct message threads.
4. **Roster** (`Roster.html`): player cards, a player drawer, and join requests.
5. **Stats** (`Stats.html`): team stats, plus a player profile with Overview, Game detail, Rounds and Development tabs.

The target codebase is `njrini99-code/helmv3`. The design scopes golf styling to `data-helm-sport="golf"` and ports tokens into `src/styles/design-tokens.css`.

## About the design files
The HTML, JSX and CSS files here are **design references**. They are prototypes that show the intended look and behaviour; they are not production code to copy directly. Recreate them in helmv3's existing environment (Next.js, React, Tailwind, the `src/components/fairway/*` library), using its established patterns, data loaders and server actions. All data in the prototypes is sample data. Wire every screen to the real loaders.

To view the prototypes, open any `.html` file in a browser. They load React 18 and Babel from unpkg and the design system from `_ds/`.

## Fidelity
The screens are **high fidelity**. Colours, type, spacing, depth and interactions are final and owner-approved. Recreate them pixel-accurately.

## Design system (`design-system/` and `_ds/`)
- `design-system/SKILL.md` and `design-system/readme.md` hold the full doctrine. Read these first.
- `design-system/tokens/` contains `colors.css`, `typography.css`, `spacing.css`, `elevation.css`, `fonts.css` and `base.css`.
- `design-system/components/<group>/` has each component as a `.jsx` file, typed props in `.d.ts`, usage notes in `.prompt.md`, and a preview card in `.card.html`. The groups are icons, buttons, selection, identity, forms, surfaces, data, data-table, cards, cards-feature, charts, feedback, overlays and navigation.
- `design-system/guidelines/` has the foundation cards for colour, type, spacing and brand.
- `_ds/` is the compiled bundle the prototypes load (`window.FairwayClubhouseEdition_9c4f4d`).

### Non-negotiable rules
- **Red means under par, the pin flag, or a destructive action** (D-42). Use `--score-under`/`--chart-flag` `#B03A2E` for under par and the pin flag, and `--danger-600` for a destructive action such as Leave group or Delete, nothing else. Gains are green `--chart-gain` `#155A39`. Losses, misses and below-benchmark readings are **amber** `--chart-loss` `#9A6512`.
- **Type:** Instrument Sans only, with JetBrains Mono for `kbd`. Use sentence case everywhere. No tracked uppercase eyebrows, no serif.
- **Numbers:** always tabular (`.fw-num`). Use a true minus `−`, `E` for even and `—` for no data. Null, zero and "early read" must render differently.
- **Motion:** no count-ups and no entrance staggers. Durations are 90, 150, 220 and 360ms, all eased with `cubic-bezier(.2,.8,.2,1)`. Pressed controls scale to 0.985.
- No emoji and no exclamation marks.

## Design tokens

### Colour
| Token | Hex | Use |
|---|---|---|
| ivory-0 / 25 / 50 / 100 / 150 / 200 / 300 / 400 | `#FFFFFF` `#FDFCF8` `#F9F7F1` `#F4F2EA` `#EEEBE2` `#E7E3D8` `#DCD6C8` `#C9C2B1` | Page, surfaces, fills |
| ink-950 / 900 / 700 / 600 / 500 / 400 / 300 | `#141412` `#1C1B18` `#3A3833` `#55524B` `#6B6860` `#8F8B81` `#B3AFA5` | Text, rules |
| green-50 / 100 / 200 / 400 / 500 / 600 / 700 / 800 / 900 | `#EEF5F0` `#DDEBE1` `#BCD6C4` `#4F8A64` `#1F6B45` `#155A39` `#0F4A2F` `#0B3A25` `#082B1C` | Action, selection, good news |
| champagne-300 / 500 | `#DCCDA6` `#B09560` | Hairline detail, avatar rings, sidebar labels |
| positive / warning / danger / info 600 | `#1C6B43` `#94600E` `#B03A2E` `#2D5C77` | Status text; the tints are the matching `-100` tokens |
| chart-paper / gain / loss / flag / fairway / fairway-alt / rough | `#FBF8EF` `#155A39` `#9A6512` `#B03A2E` `#CBDDCC` `#BFD5C1` `#E4E6D6` | Charts |
| Shell frame | `#0A331F` | App background behind the inset canvas |

### Semantic roles
| Role | Value |
|---|---|
| Page background | ivory-100 |
| Surface | ivory-25 |
| Subtle fill | ivory-50 |
| Inset | ivory-150 |
| Selected | green-50 |
| Feature card | green-800 |
| Text primary / secondary / tertiary | ink-900 / ink-600 / ink-500 |
| Borders | ink at 7%, 10%, 14% and 24% alpha, for hairline, subtle, control and strong |

### Depth vocabulary (`depth.css`)
The owner calls this "depth like the toggles". Use it for every recessed, raised or sheet treatment:
- **`--dp-well-bg` / `--dp-well-shadow`:** a recessed track, for segmented controls and chip groups.
  - Background: gradient `#DCD7CA` → `#E6E2D7` → `#ECE8DE`.
  - Shadows: inset `0 2px 3px` ink at 20%; inset `0 4px 10px -2px` ink at 16%; inset `0 -1px 0` white at 55%; a 1px ink ring at 9%; `0 1px 0 #fff`.
- **`--dp-well-soft-*`:** a gentler well for figure panels and evidence blocks. Gradient `#E9E5DA` → `#F2EFE7`.
- **`--dp-raised-*`:** the pressed or selected chip. Gradient `#FFFEFB` → `#EFECE4`, a 1px ink ring at 10% with a layered drop, `inset 0 1px 0 #fff`.
- **`--dp-sheet-*`:** a lit paper sheet for large panels. Gradient `#FFFEFB` → `#FAF8F2`, a 1px ring at 8% and a soft 22/40 drop.
- **`--dp-green-raised-*`:** the green raised pill, used for the "Now" card and Next-event emphasis. Gradient `#1E6A45` → `#155A39` → `#0F4A2F`.
- **`.dp-chip`:**
  - 30px high, 12px horizontal padding, 8px radius, 500 13px type in `#6F6A5F` with a 1px white text shadow.
  - When `aria-pressed="true"` it takes the raised treatment with green-700 600-weight text.

### Typography (Instrument Sans)
| Style | Spec |
|---|---|
| Display titles | 600 weight, `font-variation-settings:"wdth" 88`, letter-spacing −0.034 to −0.036em |
| Page H1 | 36–38px (Stats and Roster heads 38px, CoachHelm 32–36px) |
| Section H2 | 16–21px, 600 |
| Figures | 500 weight, wdth 92, −0.04em, tabular; 24–32px in figure strips, 40–44px for hero numbers |
| Body | 14.5–15.5px, line-height 1.55–1.6, `text-wrap: pretty` |
| UI text | 13–14px |
| Captions and context lines | `--type-caption`, tertiary ink, sentence case |

### Radius
| Size | Use |
|---|---|
| 5 | Score cells, kbd |
| 7–8 | Badges, chips |
| 10 | Buttons, inputs, rows |
| 12–14 | Wells, cards |
| 16–20 | Sheets, heroes, modals |
| Full | Avatars, pills |

### Spacing
- 1200–1240px maximum content width, with 36–40px page gutters.
- Section gaps are 18–28px, card padding 18–32px, and table rows 56px (44px dense).

## Shell (shared by every screen)
- **`.h2-app`:**
  - A flex row on `#0A331F`.
  - `FairwaySidebar` (240px, green tone) on the left.
  - `.h2-canvas` inset 8px on the top, right and bottom, with a 14px radius, `--bg-page` fill and the shadow `0 1px 3px rgb(0 0 0/.25), 0 0 0 1px rgb(0 0 0/.12)`.
  - The canvas is the scroll container and `container-type: inline-size`. Responsive rules are container queries.
- **Sidebar ivory pass (`sidebar.css`):**
  - **Nav text:** `#E9E4D6`, icons `#CFC7B2`.
  - **Hover:** a 7% ivory wash.
  - **Active item:** an ivory gradient `#FDFCF8` → `#F4F1E8` with green-800 600-weight text, a champagne ring at 45% and a drop shadow.
  - **Other text:** section labels and counts are champagne `#DCCDA6`.
  - **Brand block:** a 6% ivory wash with a champagne inset ring at 16%.
  - **Footer "Next event" card:** ivory gradient, champagne ring and a green-600 progress bar.
- **Top bar:** `FairwayTopBar`, sticky, 56px, glass. It holds the breadcrumbs, search, and bell and settings icon buttons.
- **Nav order:**
  - Home, CoachHelm, Calendar, Messages (badge 3).
  - **Team:** Roster (badge 8), Stats, Rounds, Practice, Lineups.
  - **Program:** Events, Scouting.
- Below 820px the sidebar hides.

## Screens

### 1. Home (`Coach Home v3.html`, `coach-home-v3.jsx`)
- **Purpose:** the coach sees today at a glance.
- **Layout:** `.h3-main`, 1120px maximum, 52px top padding.
- **Header:** a greeting and today's date as a context line, then a large display title. The "New session" button was removed.
- **Body:** the calendar sits on the left and recent rounds on the right, in one `dp-sheet` split by a hairline. The leaderboard follows, with trend lines that are smooth, coloured by outcome and drawn against a dashed mean.
- **Style:** keep it calm and not card-heavy. The owner rejected card grids and imagery.

### 2. Calendar (`Calendar.html`, `cal-*.jsx`, `cal.css`)
- **Header:** a title button, for example "Oct 12 – 18", that opens a jump-to-date popover. Under it, "N team events this week · Eastern time".
- **Toolbar:** Today (only when away from today), prev/next arrows in a soft well, a Day/Week/Month/Agenda segmented control, an overflow menu, and a primary "New event" button (keyboard N).
- **Player filter bar:** chips in a `dp-well` ("Everyone" plus one per player), with a legend on the right.
- **Body:** a grid of `minmax(0,1fr)` and a 340px detail panel.
- **Week view:**
  - An hour grid from 6 AM to 9 PM at 52px per hour, with an all-day row.
  - Overlapping events split into lanes.
  - A green "now" line on today, labelled 2:40.
  - Today's date is a solid green-600 circle with a green day name, not a raised chip.
- **Event styles:**
  - Practice: green tint.
  - Competition: green raised.
  - Meeting: white.
  - Class: busy, shown as a soft well.
- **Month view:** a 7-column grid showing three events per cell, then "N more".
- **Agenda view:** day sections, a "Now · 2:40 PM" divider, and "Show earlier days".
- **Detail panel states:**
  - **Nothing selected:** a summary of today, "Needs attention" (overlaps and pending replies), and sources.
  - **Event:** facts, responses in a well (Accepted, Maybe, No, Pending), invitees, files, "Edit event" and "Attendance".
  - **Class:** shown to teammates only as Busy.
  - **Attendance:** Present, Late or No-show chips per player, then "Save attendance · N".
  - **Overlap:** lanes against the proposal, "Open times" chips, "Review new time" and "Keep as is".
- **Event editor:**
  - A 1040px modal in two columns: title, type chips, when, a switch for all day, repeat, location and notes; then invitees, Find a time, a verify line and a receipt.
  - **Find a time:** a band you can drag, snapping to 15 minutes, with busy blocks ringed in amber when they clash.
- **Subscribe modal:** "Add to your calendar app", three one-way webcal feeds.
- **Persistence:** view, week and day are kept in localStorage.
- **Keyboard:**
  - n: new event
  - t: today
  - ← / →: step back or forward
  - Esc: clear the selection

### 3. Messages (`Messages.html`, `messages.jsx`, `msg.css`)
- The thread list sits on the left and the conversation on the right, both using the depth vocabulary.
- Recreate it from the prototype; the owner approved it as is.

### 4. Roster (`Roster.html`, `roster.jsx`, `roster.css`)
- **Header:** a title, "Players / Staff" tabs, the join code and "Add player".
- **Player cards:**
  - A monogram avatar with extra depth and a champagne ring, name, year, role (for example Captain) and a status pill (Active or Inactive).
  - Handicap, scoring average and strokes gained.
- **Drawer:** "Open full profile" links to `Stats.html?player=<id>`; the overflow menu has "View stats".
- **Join requests:** approve or decline.
- The roster cards were reverted to the version from before the ivory pass, then given more avatar depth.

### 5. Stats (`Stats.html`, `stats*.jsx`, `stats*.css`)
**Team view:**
- **Header:** "Team stats", with a Last 10 / Season / Qualifiers switch and Export.
- **Content:** focused on trends and strokes gained (the owner removed the team stat sheet). It covers the team scoring trend, strokes gained by leg against D1, the players table and team putting.
- **Players table columns:** Player, Avg, HCP, GIR, Putts, SG by leg (four small up/down bars), and SG per round. A player with under three rounds shows "Early read" in the SG per round column.

**Player profile:**
- **Hero:**
  - A band of mown fairway stripes (`#D3E3D4` / `#C8DBCA`, 42px each) across the top.
  - A 112px avatar with a green-tinted ring.
  - Tags: Captain, Active, and a home-course flag chip.
  - The name at 32px, a details line and a personal note.
  - Message, "Schedule 1:1" and a primary "Add focus area" button.
  - A floating paper card with Scoring avg, Handicap, SG / round and Rounds.
- **Navigation:** "4 of 7" arrows for previous and next player.
- **Tabs:** Overview, Game detail, Rounds and Development.
  - **Overview:** a five-figure strip, then a scoring trend with per-round tiles, strokes gained by leg, a "vs. team vs. tour" table and a prediction card.
  - **Game detail:** sticky section pills for Scoring, Off the tee, Approach, Short game and Putting. Each section has a head-pro sentence, four figures against D1 and matched visuals:

    | Section | Visuals |
    |---|---|
    | Scoring | Score-mix bar, par 3/4/5 tiles |
    | Off the tee | Fairway strip, club distance, dispersion |
    | Approach | GIR and proximity ladders with a dashed D1 mark, 3×3 missed-green map, GIR by lie |
    | Short game | Up and down by lie and by distance |
    | Putting | Make curve against D1, cup miss diagram with low/high split, lag leave, make rate by break |

  - **Rounds:** each round with course, date, score, to-par (red when under), GIR, putts and SG.
  - **Development:** focus-area progress bars and goals.
- **Early read:** players with under three rounds get an amber note explaining that strokes gained appears at three.
- **Stat fields:** these map to `src/app/golf/actions/stats-data-types.ts` and `src/lib/utils/golf-stats-calculator-shots.ts`.

## Interactions and state
- **Links between pages:** these are relative `.html` links. Replace them with Next routes: `/golf/dashboard`, `/calendar`, `/messages`, `/roster` and `/stats?player=`.
- **Confirmations:** toasts use `ToastStack` and dismiss after about 4 seconds.
- **Popovers:** use `PopoverPanel`. They close when an item is picked.
- **Focus:** every clickable row is a real button with a 2px `--border-focus` outline. There are no nested interactive children.

## Assets
- `assets/helm-logo-white.png`: the Helm mark in the sidebar, from helmv3 `public/`.
- Icons are Lucide 0.460 at a 1.6 stroke, through `Icon`.
- There is no photography. Avatars are monograms.

## Out of scope
The CoachHelm screen is still in iteration and is **not** included. Sidebar links to `CoachHelm.html` will 404 in this bundle.

## Screenshots (`screenshots/`)
There are 42 reference captures at a 924px-wide viewport. Some tall sections were captured with the content above them hidden, so the part in question fills the frame.
- **home:** 01 top, 02 leaderboard
- **calendar:**
  - Views: 01 week, 02 day, 03 month, 04 agenda
  - Overlays: 05 jump to date, 06 new event, 07 edit event, 08 subscribe
  - Detail panel: 09 today summary, 10 event, 11 attendance, 12 overlap
- **messages:** 01 team thread, 02 direct thread, 03 group thread, 04 unread filter
- **roster:** 01 requests and attention, 02 filters, 03 cards, 04 player drawer, 05 list view
- **stats-team:** 01 header, 02 trend and strokes gained, 03 players table, 04 putting, 05 season bests
- **stats-player:**
  - 01 hero, 02 overview, 03 overview charts
  - Game detail: 04 section nav, 05 scoring, 06 off the tee, 07 approach, 08 approach visuals, 09 short game, 10 putting, 11 putting visuals
  - 12 rounds, 13 development, 14 early-read state (Luca)

## Files
- **Screens:** `Coach Home v3.html`, `Calendar.html`, `Messages.html`, `Roster.html`, `Stats.html`
- **Shared:** `depth.css`, `sidebar.css`, `assets/`, `_ds/`
- **Home:** `coach-home-v3.jsx`
- **Calendar:** `cal-data.js`, `cal-views.jsx`, `cal-inspector.jsx`, `cal-editor.jsx`, `cal.css`
- **Messages:** `msg-data.js`, `messages.jsx`, `msg.css`
- **Roster:** `roster-data.js`, `roster.jsx`, `roster.css`
- **Stats:** `stats.jsx`, `stats-game.jsx`, `stats-sg.jsx`, `stats-sheet.jsx` (legacy, still loaded but unused on the team view), `stats.css`, `stats-game.css`
- **Design system source:** `design-system/` (SKILL.md, readme.md, tokens, components, guidelines)
