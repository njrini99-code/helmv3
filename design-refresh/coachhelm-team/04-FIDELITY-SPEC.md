# CoachHelm Team (the hole): fidelity spec

> Superseded in detail by the build contract. `05-SCREENS.md`, `06-SCREEN-SPECS.md`, `07-MOTION.md` and `08-ACCEPTANCE.md` (written 3 Nov) are read first. Where they and this file differ, they win; the full list is "Spec 04 corrections" at the end of 05. The main ones: the large title is the team name ("Varsity"), not "Team"; the page has 14 open reads, not 10; the "+N" coin is a rule, not drawn; `#top` lands on the default board; under `early` the spot chips read "Early" and Course chips read "Early read"; phone captures are 390 by 844 and 430 by 932.

The design page is the drawing. This file turns it into numbers, states, taps and motion a builder can match one for one, and the check that proves the build matches. Where this file and the page disagree, the page wins and this file is the bug. Where the page and the app's own tokens disagree, section 8 says which wins.

Source of truth for every value: `redesign/coachhelm-team.html` (the page) and `redesign/redesign.css` (its device CSS pulled out, each block mapped to its app component). Values below are copied from those files.

Read with: `../DESIGN_LANGUAGE.md` (house rules), `02-PLAN.md` (files, PRs and preview routes), `03-DATA-CHECKS.md` (where each number comes from and the loader caps).

## 1. Capture links

Every state on the page has a link. Open the page with a hash and it lands on that exact state with motion at its end, ready to screenshot. The capture script uses the same hashes.

Shape: `#<token>-<token>...`, any order.

- theme: `dark` (default light)
- phone size: `lg` (6.9 inch, 20pt page edge); default 6.1 inch (390 wide)
- text size: `xxl` (`--k` 1.35, the app's Text Size cap of 23/17)
- desktop: `1280`, `1440`, `1728` (desktop at that size; the page scrolls to the desktop section)
- spot on the hole: `tee`, `app`, `sg`, `putt` (default `app`, the team's biggest loss), or `course` for the Course tab
- Course: `all` (both Course lists expanded), `crs` (the Hilltop course sheet)
- overlays: `read` (first open read at the spot), `assigned` (with `read`: after Assign as focus), `player` (Eli's sheet), `story` (first This week story)
- phone scroll target: `spot`, `huddle`, `roster`, `work`, `record`
- data state: `early`, `long`, `failed`, `loading`, `empty` (default normal)
- motion: `reduce`
- `live`: keep motion running (the Data switch on the page adds it). Without it, motion lands at its end state.

| Link | What it shows |
|---|---|
| `#top` | Phone, light, top of the board: This week, the hole on Approach |
| `#putt-spot-dark` | Putting spot card, dark |
| `#assigned-read` | Read sheet after Assign as focus: check mark, Proposed to Eli |
| `#early-spot` | Early season: hollow players, striped bars, thin reads with their wait |
| `#long-spot-xxl` | Long names and long read titles at XXL, checks every wrap and ellipsis |
| `#failed-record` | Track record source failed, its own notice |
| `#1440-read` | Desktop 1440 with the read in the inspector |
| `#1728-empty-dark` | Desktop 1728, no rounds yet, dark |
| `#course-spot` | The Course tab: scoring week by week, courses, course reads, team against Tour |
| `#course-1440-dark` | Course tab on desktop, dark, both columns level |
| `#course-all-spot` | Course tab with all reads and all courses showing |
| `#crs` | Hilltop course sheet: players here against their own season |
| `#course-early-spot` | Course tab early season: three weeks, three courses, no course reads yet |

The caption under each device shows the current state.

## 2. Tokens: page name to app name

The device uses short names so the page runs on its own. In the app use the token on the right. Never paste a hex into a component.

| Page token | Light | Dark | App token |
|---|---|---|---|
| `--bg` | #F2F0E9 | #0E120F | grouped background |
| `--card` | #FFFEFB | #191E1A | card surface |
| `--well` | #F6F4EE | #141815 | flat well |
| `--ink` / `--ink-2` / `--ink-3` | #1C1B18 / #46433D / #5F5C55 | #F1ECDF / #D0C9B8 / #ADA697 | text primary / secondary / tertiary |
| `--gain` | #14613D | #7CC79B | gain text |
| `--loss` | #9A5700 | #E7AE57 | loss text (amber, never red) |
| `--gain-fill` / `--loss-fill` / `--neutral-fill` | #1F6B45 / #B86F0C / #6B675F | #4FA877 / #E09A35 / #A39D90 | chart fills |
| `--track` / `--zero` | #EBE5D8 / #5F5C55 | #2C322D / #ADA697 | chart track / zero line |
| `--accent` | #155A39 | #7CC79B | accent |
| `--sep` / `--ring` | rgb(28 27 24/.10) / rgb(28 27 24/.07) | rgb(241 236 223/.10) / rgb(255 255 255/.06) | separator / card ring |
| `--shadow` | `0 1px 2px rgb(28 25 18/.05), 0 8px 20px -12px rgb(28 25 18/.12)` | `inset 0 1px 0 rgb(255 255 255/.04)` | card shadow |
| `--nav` / `--nav-ink` | #0a331f / #f4eedd | #08150e / same | `--ch-frame` / `--ch-on-green-ink` (green top bar, unchanged) |
| `--champ` | #dccda6 | same | switcher dot and flag (the app's champagne) |
| `--feat` | #0B3A25 | #123D29 | feature card green |
| `--f-ink` / `--f-ink-2` | #F4F1E8 / #D3D9CB | same | text on the feature card |
| `--f-gain` / `--f-loss` | #8FD3AA / #EDB867 | same | gain and loss on the feature card |
| `--tint-acc` / `--tint-loss` | rgb(21 90 57/.10) / rgb(154 87 0/.11) | rgb(124 199 155/.14) / rgb(231 174 87/.14) | chip and icon tints |
| `--loss-on-tint` | #8A4D00 | #E7AE57 | loss text on a loss tint chip. New, this lane's pick: `--loss` on its own tint is 4.8:1 on a card and 4.4:1 on the sheet's page colour, under the 4.9:1 floor; #8A4D00 is 5.7:1 and 5.1:1. Flip back to `--loss` if the app adds a darker tint instead (spec 8 AA) |
| `--scrim` | rgb(14 12 8/.34) | rgb(0 0 0/.5) | sheet scrim |
| `--spring` | `linear(...)` in the page | same | the app's shared spring; its curve peaks at 1.017 (1.7% overshoot) |
| `--spring-o` | `linear(...)` in the page | same | the app's shared spring with overshoot |
| `--ease` | cubic-bezier(.22,1,.36,1) | same | the app's ease out |

Player colours (`--c` on a coin) come from the existing roster colour, not new values.

## 3. Type, spacing, shape

All sizes scale with the text size multiplier (`--k`, 1.35 at XXL, the app's cap of 23/17), as the app's Text Size does today.

| Role | Size / line | Weight | Notes |
|---|---|---|---|
| Large title, the team name ("Varsity") | 34 / 1.2 | 600 | wdth 88, −.034em |
| Title meta | 15 / 1.35 | 400 | ink-2 |
| Green bar switcher "CoachHelm" | 18 / 1 | 600 | −.012em, champagne dot 6pt |
| Card title | 17 / 1.25 | 600 | inside the card |
| Card meta (right of title) | 15 / 1.33 | 400 | ink-2 |
| Hero figure | 40 / 1 | 500 | wdth 92, −.04em, tabular |
| Hero kicker / sub | 14 / 1.2, 14 / 1.3 | 500 / 400 | f-ink-2 |
| Station label / value (SVG) | 13 / 19 | 500 / 600 | value −.02em |
| Station chips | 13 / 1.15, value 14 / 1.2 | 500 / 600 | value in f-loss |
| Bar row name / value | 14.5 / 1.2 | 500 / 600 | value tabular, loss or gain |
| Read row title / evidence | 15.5 / 1.3, 13 / 1.2 | 500 / 400 | |
| Roster name / meta / total | 16 / 1.25, 13.5 / 1.3, 15 / 1.2 | 500 / 400 / 600 | |
| Track record big figure | 34 / 1 | 500 | wdth 92, −.035em |
| Sheet title | 23 / 1.18 | 600 | −.018em |
| Sheet lede | 15.5 / 1.45 | 400 | |
| Story headline | 30 / 1.1 | 600 | wdth 90, −.025em |
| Chips | 12.5 / 1 | 600 | radius 7, 5×8 padding |
| Buttons | 15 / 1 (small 14) | 600 | min height 42 (small 36), radius 12 |

Spacing and shape:

- Page edge 16pt, 20pt at 414pt wide and up (`.ph.lg`, `--edge`).
- 24pt between cards on phone. 18pt gap on desktop (both columns and between rows).
- Card radius 16, feature card radius 16, sheet top radius 20, chips 7, buttons 12, segmented 12 outer and 9 inner, story tiles 15.
- Card header padding 16 16 10, body 0 16 16.
- Row separators inset to the text (56pt on read rows, 58pt on roster rows), never full bleed.
- Tap targets 44pt minimum: green bar icons 44×44, rows ≥ 44 tall, station chips 36 tall inside a 44 band.
- One green feature card per view: the hole. No other card is green. No accent left-border cards anywhere.

## 4. Components

### The hole (`TeamHole.tsx`)

One SVG drawn two ways: vertical on phone (viewBox 330×400), horizontal on desktop (760×268). Coordinates are in `HOLE.v` and `HOLE.h` in the page script; copy them as is.

- Fairway: the flight path stroked 58 wide (desktop 74) at f-ink .075, with a mow stripe at .42 of that width at .035.
- Green: ellipse at fill rgb(143 211 170/.17), fringe ellipse at .10. Bunkers at rgb(237 184 103/.22). Tee box 32×16 radius 4 at f-ink .18.
- Flag: pole 34 tall, 1.5 stroke; flag a 16×10 triangle in champagne.
- Flight line: 1.7 stroke at f-ink .62. Ball: r 4.2 white with a 2pt drop shadow.
- Stations (tee, approach, short game, putting): halo radius R = 10 + |team value| × 22, fill rgb(237 184 103/.17), stroke f-loss 1.5; core r 4.5 in f-loss. Selected: fill .34, stroke 2.6, plus a pulse ring.
- Station label 13 and value 19, placed by `lx`/`ly` from the config.
- Player coins on the hole: r 11, the player's colour, initials 9.5/600 white. A player stands at the spot where they lose most. Early players (fewer than 5 rounds on file, see section 8 H) are hollow: card-green fill, dashed stroke 3/2.4.
- Under the hole: a five-up chip row (`.stchips`), radius 12, 3pt padding: the four spots with their strokes, then Course after a 1pt hairline (f-ink .16, inset 10pt top and bottom) showing its read count ("5 reads", "1 read", "No reads") in f-ink 500, not strokes. Selected chip: f-ink .10 fill plus a 1pt inset ring at f-ink .18 (f-loss on it is 5.4:1 on the light feature green, 5.1:1 on the dark one; at the old .15 it was 4.4:1). Desktop: the row is min(500pt, 64%) beside the season number.
- When Course is selected: no station is selected, stations dim to .38 and coins to .5 over 260ms, and the hole stays drawn so the coach keeps their place.
- Footer line: "Players stand where they lose most. Hollow: fewer than 5 rounds."
- Coins: at most three at a station, then "+N" (section 8 N).

### Spot card (`SpotCard.tsx`)

- Header: spot name, meta "−0.6 a round · biggest leak" (rank words from the four spots). One decimal everywhere (section 8 L).
- Bars: one row per roster player, worst first. Columns 92×k / 1fr / 52. Track 14 tall radius 7.
- Bar scale: zero line at 84% across the track. A loss of 1.30 a round fills the 84% to the left. A gain of 0.25 fills the 16% to the right. Clamp beyond that.
- Team average: a 1.5pt dashed ink-3 line at its place on the same scale.
- Early players' bars use a 45° stripe (4pt loss fill, 3pt mixed with card).
- Axis under the bars: "Team average dashed" left, "Tour" at the zero line.
- Then "What CoachHelm sees here · N open reads" and every open read at this spot from every player, in CoachHelm's own order (section 8 M). Each row: coin, "Eli: Long approaches finish short-right", a size chip ("0.6 a round", only when the read has an estimate), its sample, and how sure (Solid read, Early read or Thin read). Empty: "No open reads here yet. CoachHelm reads a spot once a player has enough rounds to stand behind it."
- Shared pattern (well, radius 14): overlapping coins, title, line, and Add to practice. Under three players: "No shared pattern here yet. CoachHelm needs three players with the same step before it calls one."
- Desktop: the bars and the reads sit side by side (`.spl`, two equal columns, a hairline on top).

### Course tab (`SpotCard` course variant: `team/CourseCard.tsx`)

Reads and history that have no spot on the hole. It takes the spot card's place when Course is selected; the hole above it stays.

- Header: "Course and scoring", meta "Not on the hole · 5 open reads" ("No open reads yet" when none).
- History (`.cmh`): the team's average to par this season, 32×k/600 at `wdth` 92, −.035em, beside "a round to par / This season · 62 rounds". Right of it a chip: "Last 4 weeks +6.0", green tint when better than the season, amber when worse, neutral when level; "Early season" when fewer than 6 weeks have rounds.
- Trend chart (`trendSVG`): viewBox 320×118, margins left 6, right 40, top 14, bottom 24. One point a week (team average to par that week); higher on the chart is better, so the y scale runs best at top. Line 2.2pt in accent, round joins; dots r 3.1 card fill with a 2pt accent ring, the latest week r 4.6 filled accent with its value above it (12.5/600 ink). Season average: a 1.2pt ink-3 line dashed 3/4 with its value at the right edge (11/600 ink-2). A hairline baseline under the dots; month names (11/500 ink-3) under the first week of each month.
- Key under the chart: "Team, week by week", "Season", "Higher is better", 12.5 ink-3, swatches 14pt wide.
- Courses this season: one row per course, most rounds first, at most 4, then "Show all N courses" (accent text button, 36pt tall). Row: name 15/500, "33 rounds · last Oct 26" (and "· 1 read" when a read is about that course) 12.5 ink-2; right: average to par 15/600 tabular and "0.5 under season" in gain or "1.1 over season" in loss, or "Level with season" in ink-2; chevron. Tap opens the course sheet.
- What CoachHelm sees here: the course, scoring and pressure reads from every player, the same rows as a spot (coin, "Eli: Penalty strokes: 1.1 per round", size chip, sample, how sure), at most 3, then "Show N more". Empty: "No course or scoring reads yet. Penalties, big numbers, par scoring and the first hole get read once a player has enough rounds to stand behind it."
- Team against Tour (`.shape`): a 3×2 grid with 1pt separator gaps: Par 3s, Par 4s, Par 5s (to par a hole, two decimals), Penalty strokes (a round, one decimal), Double or worse (% of holes, one decimal), First hole (against the average hole, two decimals). Each cell: label 12.5/500 ink-2, value 19/600 tabular, then "a hole · Tour +0.00" 12 ink-3. The subhead names the window: "this season", or "from 16 rounds" early.
- Phone order: header, history, reads, team against Tour, courses. Desktop (`.spl`): left column history then courses; right column reads, then team against Tour pinned to the bottom so both columns end level.

### Course sheet (`team/CourseSheet.tsx`)

- Same sheet and inspector as a read. Header: a 30pt round flag mark on accent tint, course name, "15 rounds this season · last Oct 29", close.
- Number: the team's average to par here (32/600) and "1.1 over the team's season of +6.4".
- Players here card, header meta "Against their own season": one row per player who played here, best first. Coin, first name and "5 rounds here", a dumbbell (their season as a hollow ink-3 dot, here as a filled ink dot, joined by a 2pt line in loss fill when worse here, gain fill when better), then the average here 14.5/600 and "1.6 over" or "0.4 under". Key under it: Here, Their season. Tap a row opens the player sheet.
- Reads about this course (worst holes reads), when any.
- "Read the story from Thursday at Hilltop" when a This week story came from a round here.
- Footnote: "Every counted round here this season, practice, qualifiers and tournaments. To par uses the tees each player played."

### The huddle (`Huddle.tsx`)

- SVG 320×256, margins left 36, right 12, top 16, bottom 36. Both axes run −1.8 to +0.2 strokes a round.
- x: ball striking (tee + approach). y: scoring (short game + putting).
- Tour lines at 0 in gain fill 1.5. Team average lines dashed 4/4 in ink-3.
- Quadrant labels 11 in ink-3: "Scores well, strikes poorly", "Behind on both", "Strikes well, leaks scoring".
- Player dots r 13 in their colour with initials 10.5/600. Early players hollow (card fill, dashed 3.5/2.5, stroke 2).
- Trail: a 2.5 line at .55 from where the player stood after their first 10 rounds (ghost dot r 4 at .35) to now. Drawn only when that window exists (section 8).
- Legend under it: "Line: from their first 10 rounds to now · Dashed: team average · Hollow: fewer than 5 rounds". The Line item drops when no player has a trail.

### Roster (`TeamRoster.tsx`)

- Every player, worst total first. Row columns: coin / name and "Jr · 22 rounds" / finger-print / total and "3 open".
- Finger-print: four 10pt bars around a zero line at y 9, 20pt a 1.1 stroke. Loss down in loss fill, gain up in gain fill, radius 2.5. Desktop adds T A S P labels at 8pt.
- Desktop roster row columns: `auto minmax(0,1fr) 112px auto 64px`.

### This week (`TodayStories.tsx`)

- Horizontal tiles 138×k wide, min 162 tall, radius 15, well fill. New tiles have a 2pt accent ring until opened.
- Each tile: a 44pt picture, a 14.5 headline, and the player and time at the foot.
- Opens the story viewer (phone) or the inspector (desktop).

### Story viewer (`StoryViewer.tsx`)

- Full screen on the feature green. Progress bars 3pt, 4pt gap. Header: coin, first name, when; close 34pt.
- Body: headline 30, the story's picture (18-hole strip, before and after bars, or first 10 against season), body 16/1.45, source line 13.
- Footer: the story's action (open the read, or go to Working on) and Next or Done.

### Working on (`TeamWorking.tsx`)

- One row per focus area: ring 38 (r 15, stroke 4) toward the target, "Jonah · Lag putting from 30 ft and out", the progress line, and its state in the app's words (Active, In progress, or the verdict word).
- A newly assigned read pops in with a dashed track ring, "From 38% now · Eli sets the target" and "Proposed · Eli accepts it in their app". The board sends no target.

### Track record (`TrackRecordCard.tsx`)

- Big figure "36 of 55" and "reads held up when re-checked".
- One row per claim ladder level, label column 128×k: Seen repeatedly (target at least 8 in 10), Observed (7), Likely (6), Working hypothesis (no target, neutral fill), Not enough yet (target under 5 in 10). Each: a 10pt track with the held-up share, a 2pt ink mark at the target, and "9 of 10". Desktop adds "· target 80%" or "· target under 50%". A level under 10 rechecked reads shows counts and "Not enough yet", never a share.
- Footer: "Line: the target for that level" and today's Recheck control with its own words (`Recheck.tsx`).

### Read sheet (shared `EvidenceSheet.tsx`, see section 8)

- Phone: bottom sheet, max 86% tall, grab handle 36×5. Desktop: inspector 420 wide from the right, under the top bar.
- Header: coin, player name, spot and rounds this season, close.
- Title 23, lede, chips (worth, how sure, cause, this season).
- Ladder card: player, team, Tour, bars 12 tall in loss, neutral and gain fill.
- Drill card, or Still gathering with its wait.
- Actions: Assign as focus (primary) and Ask about this. After assign: a tinted row with a drawn check, "Proposed to Eli · now in Working on".
- Link: Open the full read.

### Player sheet

- Header with year, rounds and season total. Four bars (same scale as the spot card). Open reads. "Open Eli's page" links to the coach and player lane.
- No rounds yet: "Nothing to show yet. Eli's four-area figures show after their first round this season."

### Desktop layout

- Two columns that always end level: `grid-template-columns: minmax(0,1fr) clamp(320px, 30%, 440px)`, gap 18, rows stretch.
- Left column: the hole (horizontal) then the spot card. Right rail: This week, Working on, the huddle.
- The last card in each column grows to fill; its contents spread (spot split) or centre (huddle) so the extra height never reads as a gap.
- Then the roster and the track record, side by side, same height.
- Sidebar and glass top bar are today's; nothing changes there.

## 5. States

| State | Page link | What changes |
|---|---|---|
| Normal | `#top` | As drawn |
| Spot | `#tee`, `#app`, `#sg`, `#putt` | Station selected, chip pressed, spot card for that spot |
| Read open | `#read` | Sheet or inspector with the first read at the spot |
| Assigned | `#assigned-read` | Sheet shows the check row; Working on shows the proposed row |
| Player open | `#player` | Eli's sheet |
| Story open | `#story` | Story viewer (phone, held at 45%), inspector (desktop) |
| Loading | `#loading` | Skeletons: hero block on green, three skeleton cards; shimmer 1.4s (off under Reduce Motion) |
| Early | `#early` | Few rounds each; every player hollow; striped bars; only reads that clear the bar show, as thin reads with their wait; one story; no shared pattern |
| Empty | `#empty` | No rounds yet: the hole drawn bare at 55% with "No rounds yet" and "The hole fills in after the team's first round this season", a "What fills in, and when" card with numbered steps, roster with no rounds, track record "No reads to check yet" |
| Empty player | `#empty-player` | Player sheet "Nothing to show yet" |
| Failed | `#failed` | This week shows "Couldn't load what's new" with Try again; Track record shows "Track record unavailable right now" with no number in its place. Never "nothing new" |
| Long | `#long` | Long names and read titles; names truncate on one line in bars, wrap to two lines in rows |
| Larger phone | `#lg` | 6.9 inch, 20pt edge |
| XXL | `#xxl` | Every size × 1.35; nothing clips, bars keep their scale |
| Desktop | `#1280`, `#1440`, `#1728` | Two level columns at each size |
| Dark | `#dark` with any of the above | Dark tokens |
| Course | `#course` | Course chip pressed, stations dimmed, Course card in the spot card's place |
| Course, all | `#course-all` | Every course read and every course listed, buttons read "Show fewer" |
| Course early | `#course-early` | "Early season" chip, three weekly points, three courses, the empty reads line |
| Course sheet | `#crs` | Hilltop: players here against their own season, the story link |
| Read with no Tour figure | open Eli's worst holes read on Course | The ladder has player and team rows only, with "No Tour figure for single holes, so none is drawn." |
| Reduce Motion | `#reduce` with any of the above | Every move becomes a 180ms fade |

## 6. Taps

Hooks are on the app components so the capture script can tap them. Server actions are named in `02-PLAN.md`.

| Tap | Hook | What happens |
|---|---|---|
| A station on the hole, or a station chip | `data-ch-team-station="tee|app|sg|putt"` | Station moves (section 7), bars re-sort, reads list for that spot |
| The Course chip | `data-ch-team-station="course"` | Stations dim, the Course card replaces the spot card (section 7) |
| A course row | `data-ch-team-course="<course id>"` | Course sheet |
| Show more on Course | `data-ch-team-more="reads|courses"` | That list expands in place; the button reads "Show fewer" |
| A bar row, a roster row, a huddle dot | `data-ch-team-player="<id>"` | Player sheet |
| A read row | `data-ch-team-read="<id>"` | Read sheet |
| Assign as focus | `data-ch-team-assign` | Calls `createFocusAreaFromInsightV2` (a proposal, as today). Spinner 700ms, then the check row; Working on gains the proposed row |
| Ask about this | `data-ch-team-ask` | Opens Ask with the read as context, once the Ask lane exports `askAboutHref`; not drawn until then |
| Open the full read | `data-ch-team-fullread` | The read page (lane 2) |
| A story tile | `data-ch-team-story="<index>"` | Story viewer or inspector; tile loses its ring |
| Story body or Next | inside the viewer | Next story; Done on the last closes |
| Add to practice | `data-ch-team-practice` | The practice plan wizard with the step and players, once that lane exports `practicePlanHref`; not drawn until then |
| Recheck | `data-ch-team-recheck` | Today's `Recheck` control (`refreshTeamAnalysisAsCoach`), unchanged |
| Open Eli's page | `data-ch-team-playerpage` | The coach and player view (Lenses lane) |
| Close, scrim, swipe down | `data-ch-team-close` on the sheet's and inspector's close button, `data-ch-team-scrim` on the scrim, `data-ch-team-grabber` on the grabber | Sheet down 280ms; inspector out; Escape closes the inspector |
| The story viewer | `data-ch-team-story-viewer` | Press and hold pauses; release resumes (capture clip `story-hold`) |
| Cards for scrolling | `data-ch-team-card="spot|huddle|roster|work|record"` | Capture script scroll targets only |

## 7. Motion

| Moment | What moves | Duration / curve | Reduce Motion |
|---|---|---|---|
| Board opens | Ball flies the flight line tee to green; each station grows from .3 as the ball passes | ball 1900ms ease-in-out quad; stations 520ms `--spring-o`; ball fades 500ms after a 300ms hold | No flight; stations shown |
| Tap a station | Selected halo fills, pulse plays; bars re-sort by FLIP; bars rescale | halo 260ms ease; FLIP 520ms `--spring`; bars `scaleX` 520ms `--spring` from the zero line (never width; section 8 Q) | 180ms fade |
| Selected station | Pulse ring 1 → 1.7, .7 → 0 | 2.4s ease, twice, then a still ring | Off |
| Read sheet in / out | Sheet slides up, scrim fades | in 462ms `--spring`; out 280ms ease | 180ms fade |
| Desktop inspector | Slides from the right | in 462ms `--spring`; out 280ms ease | 180ms fade |
| Ladder bars in the sheet | Grow from 0 | 520ms `--spring` | Shown |
| Assign as focus | Spinner, then a check draws, Working on row pops in | spinner .7s linear; check 360ms ease; row 520ms `--spring-o` from .94 | 180ms fade |
| Story viewer | Rises; slide in from 24pt right; progress bar fills | rise 462ms `--spring`; slide 420ms `--spring`; 5200ms a story, linear | Fade; no auto advance |
| Story bars | Grow | 700ms `--spring` | Shown |
| Huddle | Trails draw from the first-10 point; dots travel along them; early dots pop in | 1100ms `--spring`; early dots 500ms after 500ms delay | Shown at the end |
| Working on rings | Drawn at their value; no fill motion is built (`07-MOTION.md`, Must never animate) | none | none |
| Press | Rows and buttons scale to .97 | down 110ms, up 280ms ease | Same |
| Content swap | Fade up 6pt | 300ms ease | 180ms fade |
| Open the Course tab | Stations and coins dim; Course card content fades up; the week line draws from the left, dots pop in one after another, the two value labels fade in last | dim 260ms ease; fade 300ms ease; line 900ms cubic-bezier(.3,.7,.2,1); dots 420ms `--spring` from .4, 55ms apart after 120ms; labels 260ms at 760ms | 180ms fade, chart shown |
| Loading shimmer | Sweep | 1.4s ease, loops | Off |

The huddle plays once, when the card first scrolls into view. The hole flight is the hole's chart reveal: once a session, as one motion, skipped under Reduce Motion and Animations off (section 8 P).

## 8. Decisions

Reconciled with `02-PLAN.md` (sections 9 and 12) and `03-DATA-CHECKS.md`. Where the page and the code disagree, the code's rule wins and the page has been brought in line, except where marked.

- A. Reduce Motion is a 180ms fade, the shared `CH_FADE_MS`.
- B. One shared read sheet. Lenses plans `EvidenceSheet.tsx`, this plan `team/ReadPanel.tsx`. Build one; whichever lands second imports the first. Phone uses `ui/Modal` (there is no `ui/Sheet`); desktop uses the new 420pt `Inspector`.
- C. The sheet uses the page colour, not the card colour, because it holds cards.
- D. Huddle trails: worked out from each player's first 10 countable rounds this season, the same maths as the season figure, for players with at least 20 rounds, with a parity test (plan 9.2 B). Nothing new is collected. A player under 20 rounds shows a dot only; if nobody has a trail the legend's Line item drops. On staging nobody reaches 20 yet.
- E. Champagne is #dccda6 for the switcher dot and the flag, matching the app.
- F. Charts follow DESIGN_LANGUAGE's chart marks: amber loss, green gain, ink-3 dashed average, gain-fill baseline line.
- G. Desktop rail is 30% of the board, clamped 320 to 440.
- H. Hollow means fewer than 5 rounds on file, standing's own floor. Nothing in the code uses 15. A read's own wait uses `roundsToGo` (4 countable rounds in 90 days).
- I. Loader caps: one `getTopInsightsForPlayers` call with `limit: 4` (`NEEDS_MAX + WORKING_MAX`), then `partitionInsights` per player for 3 needs work and 1 working. No extra query. PR 0a adds `drawnLater` so only reads actually drawn count as shown. Line numbers are in `03-DATA-CHECKS.md`.
- J. Lenses' desktop player rail needs this lane's board loader. Land PR 0 first.
- K. Every figure names its window and sample. The hole and bars use this season's countable rounds since Aug 1 (Team Stats' maths, plan 9.1 A); if the held season table is used instead, the label reads "All time". The team figure is worked out from the current roster, never the stale `team_avg` on standing rows.
- L. One decimal for strokes (repo rule A20). The page now shows one.
- M. Reads keep CoachHelm's own order, never re-ranked by strokes. The size chip shows only when a read has an estimate (about half do).
- N. Coins: three at a station, then "+N". Rosters run 9 to 15.
- O. The hole's total is the stored total, never the sum of its legs. "Tour" is the team's chosen baseline, named when it isn't the Tour.
- P. The ball flight is the hole's chart reveal (DESIGN_LANGUAGE: chart marks once, when first seen). Once a session, one motion, not a stagger. The pulse plays twice and stops.
- Q. Bars animate `scaleX` from the zero line, never width (`css-quality`).
- R. Words follow the app: Solid read, Early read, Thin read; the five ladder levels and their targets; Active and In progress for focus areas; "This week" (the brief's 7 days), since there's no record of the coach's last visit.
- S. The read sheet's Team row reads "Team: not measured for this read" unless the read has a team pool (plan 9.5 A).
- T. The round story with the 18-hole strip reads that round's hole scores, display only, for a brief read whose player's newest round is inside the week (plan 9.3 B); otherwise it doesn't appear.
- U. Reads with no spot (course management, scoring, pressure) get a fifth tab, Course. Decided by Nick on Oct 31: "I like having 5th tab with course stuff like reads and perf history and the 4 open reads are good". Plan 9.4 B, extended with the scoring history, courses and team against Tour (section 4, Course tab). They also stay in each player's sheet. The penalty read now sits in Course, as the engine files it.
- V. Ask about this and Add to practice are drawn only once their lanes export a link.
- W. The Monday brief, team patterns and track record flags are already on in production and preview; the old board's layout hid them. The new board's own flag, `coachhelm_team_board_v1`, is off everywhere, and each piece keeps its own flag.
- X. Course figures. Weekly trend, season average and courses come from the season's countable rounds the board already reads for the hole (plan 9.1 A), with `course_id`, `course_name` and `score_to_par` added to that select. Season and course averages are round-weighted; a week's point is the mean of that week's rounds; "Last 4 weeks" is the rounds of the last 28 days, shown only when 6 or more weeks have rounds. Courses group by `course_id`, falling back to `course_name`. Team against Tour is the mean of each roster player's standing row (`scoring_par_3/4/5`, `penalty_rate_per_round`, `big_number_rate`, `opening_hole_delta`) against its `pga_value`, from the standing batch already loaded (plan section 4, step 3); never the stored `team_avg`. No new query, no new column.
- Y. Course reads are what `deliverReads` returns after folding (`FOLD_PAIRS` can fold a penalty or doubles read into the tee read, and `collapseParScoring` keeps one par read per player). The page draws them unfolded to show the list; the app shows whatever survives, in its own order. Their window is the read's own (course management reads are all rounds), not "This season".
- Z. The Team view opens on the hole (call 1, default yes). It's one constant, `TEAM_BOARD_FIRST_VIEW = 'hole'` in `team-board/flag.ts`; set it to `'board'` to open on today's board instead, with the new board one tap away. Up to 4 reads per player (call 3) is Nick's call too ("the 4 open reads are good"); it's `limit: NEEDS_MAX + WORKING_MAX` in one place, so lowering it is one line.
- AA. Text contrast floor is 4.9:1 everywhere on this board (DESIGN_LANGUAGE's lowest token pair). Two pairs were under it and are fixed on the page: loss text on loss chips (new `--loss-on-tint`, section 2) and the selected chip on the feature green (.10 fill). Default; flip by changing the token.

## 9. Fidelity check

1. On the Mac: `node capture/capture.mjs design --out screenshots/after`.
2. With the branch running on port 3100: `node capture/capture.mjs app --out screenshots/built`.
3. `node capture/capture.mjs compare --a screenshots/built --b screenshots/after --out screenshots/compare`. Each pair sits side by side, same size and theme.
4. `node capture/capture.mjs clips --out screenshots/clips` for the five motions, with and without Reduce Motion.
5. Walk every pair against sections 3 to 5, and every clip against section 7. A difference is a bug in the build unless section 8 says otherwise.
6. Done when every pair matches in light and dark, phone, larger phone, XXL and all three desktop sizes, and every clip matches its row.
