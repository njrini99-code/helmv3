# CoachHelm Team (the hole): screen inventory

> Completeness pass, 4 Nov 2026: see the section of that name at the end of this file (adds 34 rows).

## Screen IDs (final; 06, 07, 08 and capture.mjs use these)

Fixed by the coordinator:

- `S-TEAM` board at rest, including the large title and context line
- `S-TEAM.hole` the green feature card: the hole and the five-up station chip row
- `S-TEAM.spot` spot card for tee, approach, short game or putting
- `S-TEAM.course` the Course tab card (takes the spot card's place)
- `S-TEAM.course-sheet` one course: players here against their own season
- `S-TEAM.read-sheet` a read: ladder, drill, Assign as focus
- `S-TEAM.player-sheet` a player: four bars and open reads
- `S-TEAM.story` the phone story viewer
- `S-TEAM.huddle` the huddle chart card
- `S-TEAM.roster` the roster card with finger-prints
- `S-TEAM.working` the Working on card
- `S-TEAM.record` the track record card
- `S-TEAM.inspector` the desktop right panel that hosts read, player, course and story

Added under them (sub-IDs):

- `S-TEAM.today` the This week card with its story tiles
- `S-TEAM.empty-steps` the "What fills in, and when" card (empty state only)
- `S-TEAM.toast` the inline confirmation that stands in for links into other lanes
- `S-TEAM.course.all` the Course card with both lists expanded
- `S-TEAM.read-sheet.assigning` Assign as focus pressed: spinner and today's `FocusActions` in-flight label (fixed 4 Nov: the page's "Proposing" is a stand-in; the shared read sheet uses `useFocusActions`' own strings in every lane, see the Completeness pass section)
- `S-TEAM.read-sheet.assigned` after Assign: check row "Proposed to Eli · now in Working on"
- `S-TEAM.read-sheet.gathering` a read with no drill: "Still gathering"
- `S-TEAM.read-sheet.no-tour` a read with no Tour figure (worst holes)
- `S-TEAM.player-sheet.no-rounds` a player with no rounds this season
- `S-TEAM.story.desk` a story opened in the desktop inspector

## How to read this file

- Source of truth: the design page `redesign/coachhelm-team.html`. Every value here was read off its CSS, its script and its computed styles. Where this file and `04-FIDELITY-SPEC.md` disagree, this file wins (BUILD_CONTRACT_STANDARD). Each disagreement is listed in "Spec 04 corrections" at the end.
- Design link: `https://claude.ai/artifact/HAWFGcKWn4hbZgn2jU6TjK#<tokens>` (from `BUILD_BRIEF.md`), and locally `redesign/coachhelm-team.html#<tokens>`. In the tables `…#x` is short for the artifact URL with that hash. Tokens join with `-` in any order. The page's parser knows these tokens:
  - data state: `early`, `long`, `failed`, `loading`, `empty`
  - look: `dark`, `reduce`, `lg` (430 phone), `xxl` (largest Text Size, `--k` 1.35, the app's cap: 23/17 in `lib/dynamic-type.ts`; the page's Largest button is `data-v="1.35"`)
  - desktop: `1280`, `1440`, `1728`
  - station: `tee`, `app`, `sg`, `putt`, `course`; `all` expands both Course lists
  - overlays: `crs` (Hilltop sheet), `read` (top read at the station), `assigned` (opens r8, Eli's penalty read, already proposed), `player` (Eli), `story` (story 1)
  - phone scroll targets: `spot`, `huddle`, `roster`, `work`, `record`
  - any hash freezes motion at its end state unless it also has `live`. `#top` is not a token; it lands on the default board.
- Capture state id: the hash tokens without the theme token. Theme is its own axis: `capture.mjs` shoots every state in light and dark, and design shots always add `reduce`. Ids that `capture.mjs` lists today are written plainly. Any other id is marked **add**: it is the hash to add to `SHOTS` (or the page parser change it needs).
- App route: `/clubhouse-preview/coachhelm-team` with `?state=` from 02-PLAN section 11. `station=course`, `open=course` and `all=1` are new in that list. Anything marked **add** has no fixture yet.
- Sizes: the page draws its phone at 390 (labelled 6.1 in) and 430 under `lg` (6.9 in). `capture.mjs` shoots the phone at 390 by 844 and 430 by 932 (BUILD_CONTRACT_STANDARD), so the measured values in 06 are at 390 by 844 unless a row says otherwise. Desktop shots are 1280 by 832, 1440 by 900 and 1728 by 1117.
- Every figure on the page is fixture data (five players, 62 rounds, 14 open reads). Where each comes from is in 06 and 03-DATA-CHECKS.

## Inventory

Roles for every row: coach only. The Team view is never drawn for a player and none of its markup is sent to a player (03-DATA-CHECKS "Visibility"). Claim words and the "Likely" cause stay coach only.

| ID | Kind | How you get there | Design link | App route | Roles | PR |
|---|---|---|---|---|---|---|
| `S-TEAM` | screen | Green bar switcher "CoachHelm", then the Team segment (`Team` / `Ask`; Team is the default). Desktop: CoachHelm in the sidebar, Team segment in the top bar. | `…#top`; `redesign/coachhelm-team.html#top` | `?state=default` | coach | 1 (shell, title, context line); 2 to 6 fill the cards |
| `S-TEAM.today` | inline state (first card) | Board, first card under the context line | `…#top` | `?state=default` | coach | 4 |
| `S-TEAM.hole` | inline state (green feature card) | Board, under This week (empty state: under the title) | `…#top` | `?state=default` | coach | 1 (hole at rest, StationControl); 7 (ball flight, station change) |
| `S-TEAM.spot` | inline state (card after the hole) | Default station is Approach (the biggest leak). Tap a station on the hole, or the Tee, Approach, Short game or Putting chip. | `…#spot`, `…#tee-spot`, `…#sg-spot`, `…#putt-spot` | `?station=app` (`tee`, `sg`, `putt`) | coach | 2 |
| `S-TEAM.course` | inline state (replaces the spot card) | Tap the Course chip, fifth in the chip row | `…#course-spot` | `?station=course` (new) | coach | 2 (CourseCard); 1 (fifth chip) |
| `S-TEAM.course.all` | inline state | On the Course card tap "Show 2 more" (reads) or "Show all 5 courses"; each then reads "Show fewer" | `…#course-all-spot` | `?station=course&all=1` (new) | coach | 2 |
| `S-TEAM.course-sheet` | sheet, hugs content, max 86% of the screen (Hilltop: 646.7 of 844, 77%) | Tap a course row on the Course card | `…#crs` | `?open=course` (new; the course with the latest round, Hilltop in the fixture) | coach | 3 |
| `S-TEAM.read-sheet` | sheet, hugs content, max 86% (r1: 654.2 of 844, 78%) | Tap a read row on the spot card, the Course card or the player sheet, or "Open the penalty read" in a story | `…#read`; Course read `…#course-read` | `?open=read`; Course read `?station=course&open=read&read=course` | coach | 3 |
| `S-TEAM.read-sheet.assigning` | inline state in the sheet (700ms on the page) | Tap "Assign as focus" | live only: `…#read-live`, then tap Assign | add (the `failwrites` fixture can hold it) | coach | 3 |
| `S-TEAM.read-sheet.assigned` | inline state in the sheet | Assign finishes, or open a read already proposed | `…#assigned-read` (r8, Eli: penalty strokes) | `?open=read&read=assigned` | coach | 3 |
| `S-TEAM.read-sheet.gathering` | inline state in the sheet | Open a read with no drill yet (r3, Sam: proximity 125 to 175) | `…#early-read` | add (`?state=early&open=read`) | coach | 3 |
| `S-TEAM.read-sheet.no-tour` | inline state in the sheet | Open a read with no Tour figure (r13, Eli: worst holes on Oak Hollow, third Course read) | no hash; tap the third read on `…#course-spot-live` | add | coach | 3 |
| `S-TEAM.player-sheet` | sheet, hugs content, max 86% (Eli: 693.9 of 844, 82%) | Tap a bar row on the spot card, a roster row, a huddle dot or a player row in the course sheet (coins on the hole are not tappable on the page) | `…#player` | `?open=player` | coach | 3 |
| `S-TEAM.player-sheet.no-rounds` | inline state in the sheet | Open a player with no rounds this season | `…#empty-player` | `?state=empty&open=player` | coach | 3 |
| `S-TEAM.story` | modal, full screen over the phone | Tap a This week tile, or "Read the story from Thursday at Hilltop" in the course sheet | `…#story` | `?open=story` | coach | 4 |
| `S-TEAM.story.desk` | inline state in the inspector | Desktop: tap a This week tile | `…#1440-story` | `?open=story` at 1280 and up | coach | 4 |
| `S-TEAM.huddle` | inline state (card) | Board, after the spot card | `…#huddle` | `?state=default`, scroll to the huddle | coach | 5 |
| `S-TEAM.roster` | inline state (card) | Board, after the huddle | `…#roster` | `?state=default`, scroll | coach | 6 |
| `S-TEAM.working` | inline state (card) | Board, after the roster; Assign lands here | `…#work` | `?state=default`, scroll | coach | 6 |
| `S-TEAM.record` | inline state (card) | Board, last card | `…#record` | `?state=default`, scroll | coach | 6 |
| `S-TEAM.empty-steps` | inline state (card, empty state only) | Board with no rounds this season, under the hole | `…#empty` | `?state=empty` | coach | 1 |
| `S-TEAM.inspector` | sheet, desktop right panel: 420 wide, full height under the 58 top bar | Desktop: any tap that opens a sheet on phone (read, player, course, story) | `…#1440-read`, `…#1440-player`, `…#1440-story`, `…#1440-crs` | `?open=read` (`player`, `story`, `course`) at 1280 and up | coach | 3 |
| `S-TEAM.toast` | toast (page only) | Tap a link into another lane: "Add to practice", "Ask about this", "Open the full read", "Open Eli's page", "Re-check reads", "Try again" | live only, e.g. "Ask about this" on `…#read-live` | not built: each is a real link or action in the app, or isn't drawn (02-PLAN: never a dead button) | coach | none |

## State matrices

Every matrix has the same 13 rows. "Drawn" names the anchor; "not drawn" gives the build rule.

### S-TEAM

| State | Drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | Drawn `#top` | `top` | Green bar, Team / Ask segmented, "Varsity", context line "5 players · 62 rounds this season · 14 open reads", then This week, hole, spot, huddle, roster, Working on, track record. |
| loading | Drawn `#loading` | `loading` | Segmented, title and context line stay. Four skeleton cards, 180, 406 (on the green), 258 and 216 tall. |
| empty | Drawn `#empty` | `empty` | Context line "5 players · no rounds yet this season". Cards: hole ("No rounds yet"), What fills in, Roster. No This week, spot, huddle, Working on or record. |
| error/failed | Drawn `#failed` | `failed` | `failed` = the weekly brief and the track record fail, each with its own notice (This week: notice with Try again; record: notice). The rest draws. Each part fails alone (03 "States the screen needs"). The players read failing is a separate fixture, `failed-all`, not drawn: notice in the hole's place, the spot card shows bars only if standing loaded, no figures invented. Roster failure (`noroster`) is not drawn: board-level notice, nothing else. |
| long text | Drawn `#long` | add `long` | Long player names wrap in their rows. The team name is not lengthened on the page. Rule: a long team name wraps to 2 lines at the large title size, then ellipsis. |
| lots of items | Not drawn (page has 5 players) | add (needs `?state=long` with 25 players) | Cards keep their order; the roster lists every player with no inner scroll; the hole shows at most three coins per station; with four or more, two coins (worst losses first) and a "+N" coin in the third slot, N = players there minus 2 (fixed 4 Nov: this row said 5, which contradicted 02 §5.2, 04 N and AC-HOLE-05; the page has three slots). |
| one item | Not drawn | add | One player: "1 player · …"; the huddle draws one dot; no shared pattern (it needs three players). |
| offline/stale | Not drawn | add | A read flagged `ChInsight.stale` shows "Out of date" and is not counted in "open reads". Offline keeps the last board. |
| XXL | Drawn `#xxl` | `top-xxl` | Every size times 1.35 (large title 45.9, card title 22.95). Rows grow; nothing clips. |
| dark | Drawn `#dark` | `top` (dark) | Tokens swap per 06; the green bar keeps its green. |
| Reduce Motion | Drawn `#reduce` | `top` (design shots add `reduce`) | Board at rest, no ball flight. Motion is in 07-MOTION. |
| phone 390 | Drawn (the page's own phone, 6.1 in) | `top` | 16 edge; 24 between cards; cards 358 wide. |
| large phone 430 | Drawn `#lg` | `top-lg` | 20 edge. |
| desktop 1280 | Drawn `#1280`, `#1440`, `#1728` | `1280`, `1440`, `1728`; `1440-early`, `1440-failed`, `1440-loading`, `1440-empty` | 232 sidebar, 58 top bar, main column plus rail `clamp(320px, 30%, 440px)` (320 at 1280, 345.6 at 1440, 432 at 1728), gap 18. Both columns end level. |

### S-TEAM.today

| State | Drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | Drawn `#top` | add `today` (the `top` shot shows it) | "This week", meta "4 rounds · 2 new reads · 1 cleared", three tiles scrolling sideways. Unread tiles carry a 2px inset accent ring. |
| loading | Drawn `#loading` | `loading` | First skeleton card, 180 tall. |
| empty | Drawn (absent) `#empty` | `empty` | No rounds: no card. Rounds but no stories in 7 days: keep the card with one line "Nothing new in the last 7 days" (03 section 6, `isEmptyBrief`). |
| error/failed | Drawn `#failed` | `failed` | Notice "Couldn't load what's new" / "The weekly brief didn't load. Everything below is current." and a "Try again" button. Never "nothing new". |
| long text | Drawn `#long` | add `long` | Tile feet use first names ("Elijah", "Priyanka"). Titles wrap to 2 lines, then ellipsis. |
| lots of items | Not drawn | add | More than 3 stories: the row keeps scrolling sideways; no "see all". |
| one item | Drawn `#early` | `early` | One tile. The page's meta stays "4 rounds · 2 new reads · 1 cleared" (static text); the build takes the brief's own counts. |
| offline/stale | Not drawn | add | Stories older than 7 days drop off (03 section 6). |
| XXL | Drawn `#xxl` | `top-xxl` | Tiles grow with text; title still 2 lines max. |
| dark | Drawn `#dark` | `top` (dark) | |
| Reduce Motion | Drawn `#reduce` | `top` | No change at rest. |
| phone 390 | Drawn | `top` | Tiles 138 by 162, gap 8. |
| large phone 430 | Drawn `#lg` | `top-lg` | Same tile size, 20 edge. |
| desktop 1280 | Drawn `#1280` | `1280` | Tiles become rows 288 wide with a 96 by 36 picture. |

### S-TEAM.hole

| State | Drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | Drawn `#top` | add `hole` (needs a `hole` scroll target in the page parser; `top` shows only its top half at 844 tall) | Kicker, "−1.9 a round to Tour", hole with four stations and coins, five-up chip row (Tee, Approach, Short game, Putting, Course), foot line. Approach selected. |
| loading | Drawn `#loading` | `loading` | Skeleton block 406 tall on the green, shimmer f-ink .10. |
| empty | Drawn `#empty` | `empty` | "No rounds yet" in the figure's place, explainer, hole at opacity .55; no stations, coins or chips. |
| error/failed | Not drawn | add `failed-all` (new fixture: the players read fails) | Reads or standing failed: notice in the hole's place ("Didn't load", never "off"). The chip row still switches spots. Not part of `failed`, where the hole draws normally. |
| long text | Drawn `#long` | add `long` | Coins carry initials, so long names never reach the hole. |
| lots of items | Not drawn | add | At most three coins per station; with four or more, two coins and a "+N" coin (same 22 circle) in the third slot, N = players there minus 2 (fixed 4 Nov: was 5; see S-TEAM lots of items). |
| one item | Not drawn | add | One coin at that player's worst station. |
| offline/stale | Not drawn | add | Last values. |
| XXL | Drawn `#xxl` | `top-xxl` | Figure and chip text scale; the hole SVG doesn't. Chip labels never wrap. |
| dark | Drawn `#dark` | `top` (dark) | Feature green #123D29. |
| Reduce Motion | Drawn `#reduce` | `top` | No flight; stations at rest. |
| phone 390 | Drawn | `top` | Hole 338 by 409.7 with a −6 margin each side; chip row 326 wide, chips 61.6 by 64.7. Early: Course chip reads "No reads". |
| large phone 430 | Drawn `#lg` | `top-lg` | Hole and chips take the width. |
| desktop 1280 | Drawn `#1280` | `1280` | Hole lies flat, 610 by 215 at 1280; chip row `min(500px, 64%)`, 390.4 at 1280. |

### S-TEAM.spot

| State | Drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | Drawn `#spot` | `spot`; also `tee-spot`, `sg-spot`, `putt-spot` | "Approach", "−0.7 a round · biggest leak", five bar rows worst first, axis, "What CoachHelm sees here · 3 open reads", read rows in feed order (the reads feed's own order, no sort by size), shared pattern with "Add to practice". |
| loading | Drawn `#loading` | `loading` | Third skeleton card, 258. |
| empty | Drawn (absent) `#empty` | `empty` | No rounds: no card. Rounds but no reads at the spot: bars draw, one line in the reads' place (CH-13306 wording, 02 `empty`). |
| error/failed | Not drawn | add | Reads failed: bars draw, notice in the reads' place (03 `players.error`). |
| long text | Drawn `#long-spot` | `long-spot` | Names wrap inside the 92 column, 2 lines max. Read titles wrap with no cap. |
| lots of items | Not drawn | add | All bar rows draw. Reads: top 3, then "Show N more", as on the Course card. |
| one item | Drawn `#early-spot` | `early-spot` | One read (Sam, chip "Early"), "No shared pattern here yet…". Says "1 open read" (singular fixed on the page 3 Nov). |
| offline/stale | Not drawn | add | Stale read: chip "Out of date", not counted. |
| XXL | Drawn `#xxl-spot` | `spot-xxl` | Bar names 19.575, read titles 20.925; rows grow; the name column grows to 124.2. |
| dark | Drawn `#spot-dark` | `spot` (dark) | |
| Reduce Motion | Drawn `#spot-reduce` | `spot` | Station change without travel: the card content crossfades 180ms linear (`.rmfade`, 07). |
| phone 390 | Drawn | `spot` | Track 150 wide; card 758.1 tall (the Eli read title wraps to 2 lines at 390). |
| large phone 430 | Drawn `#lg-spot` | add `lg-spot` | Track takes the extra width. |
| desktop 1280 | Drawn `#1280` | `1440-putt` | Two columns in the card: bars left (padding-top 12), reads right (padding-top 6). |

### S-TEAM.course

| State | Drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | Drawn `#course-spot` | `course-spot` | "Course and scoring", "Not on the hole · 5 open reads", "+6.4 a round to par", weekly trend, 3 reads then "Show 2 more", Team against Tour grid, 4 courses then "Show all 5 courses". Stations dim to .38 and coins to .5 on the hole. |
| loading | Drawn `#loading-course-spot` | add `loading-course-spot` | Skeleton as the spot card. |
| empty | Drawn (absent) `#empty-course-spot` | add `empty-course-spot` | No rounds: no chip row, so no Course card. |
| error/failed | Not drawn | add | Course rows failed: trend and grid still draw, notice in the list's place. Trend failed: figure stays, chart's place says "Didn't load". |
| long text | Drawn `#long-course-all-spot` | add `long-course-all-spot` | Course names wrap, 2 lines max. Read titles wrap. |
| lots of items | Not drawn (5 courses) | add | 4 courses then "Show all N courses"; 3 reads then "Show N more". |
| one item | Not drawn | add | One course: no button; "Courses this season · 1". |
| offline/stale | Not drawn | add | As the spot card. |
| XXL | Not drawn as a shot | add `course-spot-xxl` | Figure and rows scale; the trend SVG doesn't. |
| dark | Drawn `#course-spot-dark` | `course-spot` (dark) | |
| Reduce Motion | Drawn `#course-spot-reduce` | `course-spot` | No trend draw; content crossfades 180ms linear (`.rmfade`, 07). |
| phone 390 | Drawn | `course-spot`; early `course-early-spot` | Title wraps to 2 lines; card 1209.4 tall. Early draws 3 courses, chip "Early season", "No course or scoring reads yet. Penalties, big numbers, par scoring and the first hole get read once a player has enough rounds to stand behind it.", grid label "Team against Tour · from 16 rounds". |
| large phone 430 | Drawn `#lg-course-spot` | add `lg-course-spot` | |
| desktop 1280 | Drawn `#1440-course` | `1440-course` | Split as the spot card. |

### S-TEAM.course.all

| State | Drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | Drawn `#course-all-spot` | `course-all-spot` | All 5 reads and all 5 courses; both buttons read "Show fewer". |
| loading | Not drawn | add | Expanding never loads; the lists are already in hand. |
| empty | Not drawn | add | 3 reads or fewer and 4 courses or fewer: no buttons, no expanded state. |
| error/failed | Not drawn | add | As S-TEAM.course. |
| long text | Drawn `#long-course-all-spot` | add `long-course-all-spot` | As S-TEAM.course. |
| lots of items | Not drawn | add | All rows draw; the board scrolls; the card never scrolls inside. |
| one item | Not drawn | add | Not reachable. |
| offline/stale | Not drawn | add | As S-TEAM.course. |
| XXL | Not drawn | add `course-all-spot-xxl` | Rows grow. |
| dark | Drawn `#course-all-spot-dark` | `course-all-spot` (dark) | |
| Reduce Motion | Drawn `#course-all-spot-reduce` | `course-all-spot` | Rows appear without travel. |
| phone 390 | Drawn | `course-all-spot` | |
| large phone 430 | Not drawn as a shot | add `lg-course-all-spot` | |
| desktop 1280 | Drawn `#1728-course-all` | `1728-course-all` | Columns end level (1196 tall at 1728). |

### S-TEAM.course-sheet

| State | Drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | Drawn `#crs` | `crs` | Hilltop: "+7.5 a round to par here", "1.1 over the team's season of +6.4", "Players here" (5 dumbbell rows), key, story link, footnote. |
| loading | Not drawn | add | Opens on rows loaded with the Course card; no spinner. |
| empty | Not drawn | add | A course with no counted rounds has no row, so no sheet. |
| error/failed | Not drawn | add | Player rows failed: figure stays, notice in the card's place. |
| long text | Drawn `#long-crs` | add `long-crs` | The page keeps short first names here; long ones wrap, the dumbbell keeps its column. |
| lots of items | Not drawn | add | Every player who played there, best first; the sheet scrolls inside its 86% cap. |
| one item | Not drawn | add | One row; key still shows. |
| offline/stale | Not drawn | add | Last values. |
| XXL | Not drawn | add `crs-xxl` | Rows grow; sheet scrolls. |
| dark | Drawn `#crs-dark` | `crs` (dark) | |
| Reduce Motion | Drawn `#crs-reduce` | `crs` | 180ms fade (07). |
| phone 390 | Drawn | `crs`; early add `early-crs` | Early: "5 rounds this season", "+8.0", "1.4 over the team's season of +6.6", every player "1 round here". |
| large phone 430 | Not drawn as a shot | add `lg-crs` | |
| desktop 1280 | Drawn `#1440-crs` | add `1440-crs` | In the inspector. |

### S-TEAM.read-sheet

| State | Drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | Drawn `#read` | `read`; Course read `course-read` | Eli Brandt, "Long approaches finish short-right", lede, four chips, ladder Eli / Team / Tour, drill, "Assign as focus" and "Ask about this", "Open the full read". |
| loading | Not drawn | add | Opens on board data. |
| empty | Not drawn | add | A read always has evidence; no empty sheet. |
| error/failed | Not drawn | add (`failwrites`) | Assign failed: button back to "Assign as focus", the sheet stays open, and today's `useFocusActions` toast shows its own words and code (CH-13001) (fixed 4 Nov: the inline "Didn't send. Try again." line is dropped so the shared read sheet fails the same way in Team and Lenses). |
| long text | Drawn `#long-read` | add `long-read` | Title "Long approaches from 175 yards and out finish short and right of the green" wraps, no cap. The page's lede keeps "Eli's" while the header says "Elijah"; build uses one name source. |
| lots of items | n/a | n/a | One read per sheet. |
| one item | Drawn `#read` | `read` | As default. |
| offline/stale | Not drawn | add | Stale read: chip "Out of date", no Assign. |
| XXL | Not drawn | add `read-xxl` | Sheet scrolls in its cap. Buttons stack when they no longer fit side by side. |
| dark | Drawn `#read-dark` | `read` (dark) | |
| Reduce Motion | Drawn `#read-reduce` | `read` | 180ms fade, no travel. |
| phone 390 | Drawn | `read` | Panel 654.2 tall; title wraps to 2 lines (54.3). |
| large phone 430 | Not drawn as a shot | add `lg-read` | |
| desktop 1280 | Drawn `#1440-read` | `1440-read` | In the inspector. |

### S-TEAM.read-sheet.assigning

| State | Drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | Live only (`#read-live`, tap Assign) | add `assigning` (page needs a frozen hash) | Primary button: 18 spinner and today's `FocusActions` in-flight label (fixed 4 Nov: not "Proposing"), disabled. 700ms on the page; in the app until the write returns. |
| loading | This row is the loading state | add | As default. |
| empty | n/a | n/a | |
| error/failed | Not drawn | add | Write fails: back to "Assign as focus" and today's `useFocusActions` toast (fixed 4 Nov: no inline line). |
| long text | Not drawn | add | Button text never wraps. |
| lots of items | n/a | n/a | |
| one item | n/a | n/a | |
| offline/stale | Not drawn | add | Offline: button stays disabled; nothing is queued. |
| XXL | Not drawn | add | Spinner stays 18; label scales. |
| dark | Not drawn | add | Spinner in the button's text colour. |
| Reduce Motion | Not drawn | add | Spinner still turns (status, not decoration). |
| phone 390 | Live only | add | Button keeps its width while busy. |
| large phone 430 | Not drawn | add | As phone. |
| desktop 1280 | Not drawn | add | Same in the inspector (buttons 185 wide at 1440). |

### S-TEAM.read-sheet.assigned

| State | Drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | Drawn `#assigned-read` | `assigned-read` | r8 (Eli, "Penalty strokes: 1.1 per round"). The primary button is replaced by a 42 tall row "Proposed to Eli · now in Working on" with a drawn check, gain on accent tint. "Ask about this" stays. |
| loading | n/a | n/a | |
| empty | n/a | n/a | |
| error/failed | Not drawn | add (`duplicate`) | Already proposed by another coach: same row naming that coach. |
| long text | Not drawn | add | Row wraps to 2 lines with a long first name. |
| lots of items | n/a | n/a | |
| one item | Drawn | `assigned-read` | As default. |
| offline/stale | n/a | n/a | |
| XXL | Not drawn | add | Row grows past 42. |
| dark | Drawn `#assigned-read-dark` | `assigned-read` (dark) | |
| Reduce Motion | Drawn `#assigned-read-reduce` | `assigned-read` | Check drawn, not stroked in. |
| phone 390 | Drawn | `assigned-read` | |
| large phone 430 | Not drawn as a shot | add | |
| desktop 1280 | Drawn `#1440-assigned-read` | add `1440-assigned-read` | |

### S-TEAM.read-sheet.gathering

| State | Drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | Drawn `#early-read` | add `early-read` | Sam: chips "Worth .4 a round", "Early", "Cause: Not traced", "This season"; ladder 41 ft / 33 ft / 27 ft; "Still gathering" / "4 more rounds before CoachHelm suggests a drill" in the drill's place; no Assign. |
| loading | n/a | n/a | |
| empty | n/a | n/a | |
| error/failed | Not drawn | add | Rounds to go unknown: "Still gathering" with no count. |
| long text | Not drawn | add | Line wraps. |
| lots of items | n/a | n/a | |
| one item | Not drawn | add | "1 more round before …" singular. |
| offline/stale | n/a | n/a | |
| XXL | Not drawn | add | Grows. |
| dark | Drawn `#early-read-dark` | add `early-read` (dark) | |
| Reduce Motion | Drawn `#early-read-reduce` | add `early-read` | |
| phone 390 | Drawn | add `early-read` | The fixture's header says "2 rounds this season" while the lede says "from 6 rounds"; the build takes both from the read. |
| large phone 430 | Not drawn | add | |
| desktop 1280 | Not drawn as a shot | add `1440-early-read` | |

### S-TEAM.read-sheet.no-tour

| State | Drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | Live only (third read on `#course-spot-live`) | add `no-tour` (page needs a hash) | Ladder has Eli and Team rows, then "No Tour figure for single holes, so none is drawn." in ink-3. |
| loading | n/a | n/a | |
| empty | n/a | n/a | |
| error/failed | Not drawn | add | Team figure missing too: "Not measured yet…" (`ChLadderRow.missing`). |
| long text | Not drawn | add | Line wraps. |
| lots of items | n/a | n/a | |
| one item | Live only | add | As default. |
| offline/stale | n/a | n/a | |
| XXL | Not drawn | add | Grows. |
| dark | Not drawn | add | |
| Reduce Motion | Not drawn | add | |
| phone 390 | Live only | add | |
| large phone 430 | Not drawn | add | |
| desktop 1280 | Not drawn | add | |

### S-TEAM.player-sheet

| State | Drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | Drawn `#player` | `player` | Eli Brandt, "Jr · 21 rounds · −2.1 a round to Tour", "Where Eli gains and loses" (Tee −0.3, Approach −1.1, Short game −0.2, Putting −0.5), "Open reads" 3 in feed order, "Open Eli's page". |
| loading | Not drawn | add | Opens on board data. |
| empty | Drawn `#early-player` | add `early-player` | Rounds but no open reads: "Open reads" 0, "No open reads." |
| error/failed | Not drawn | add | Reads failed: bars draw, notice in the reads card. |
| long text | Drawn `#long-player` | add `long-player` | "Elijah Brandt-Whitaker" wraps to 2 lines in the header. |
| lots of items | Not drawn | add | More than 3 reads: top 3, then "Show N more". |
| one item | Not drawn | add | One read; count "1". |
| offline/stale | Not drawn | add | Stale rows say "Out of date". |
| XXL | Not drawn | add `player-xxl` | Sheet scrolls in its cap. |
| dark | Drawn `#player-dark` | `player` (dark) | |
| Reduce Motion | Drawn `#player-reduce` | `player` | 180ms fade. |
| phone 390 | Drawn | `player` | |
| large phone 430 | Not drawn as a shot | add `lg-player` | |
| desktop 1280 | Drawn `#1440-player` | `1440-player` | In the inspector. |

### S-TEAM.player-sheet.no-rounds

| State | Drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | Drawn `#empty-player` | `empty-player` | "Jr · no rounds yet this season", notice "Nothing to show yet" / "Eli's four-area figures show after their first round this season." No bars, no reads; "Open Eli's page" stays. |
| loading | n/a | n/a | |
| empty | Drawn | `empty-player` | As default. |
| error/failed | n/a | n/a | |
| long text | Not drawn | add | Name wraps. |
| lots of items | n/a | n/a | |
| one item | n/a | n/a | |
| offline/stale | n/a | n/a | |
| XXL | Not drawn | add | Grows. |
| dark | Drawn `#empty-player-dark` | `empty-player` (dark) | |
| Reduce Motion | Drawn | `empty-player` | |
| phone 390 | Drawn | `empty-player` | |
| large phone 430 | Not drawn | add | |
| desktop 1280 | Drawn `#1440-empty-player` | add `1440-empty-player` | |

### S-TEAM.story

| State | Drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | Drawn `#story` | `story` | Story 1 of 3: three progress bars (first held at 45%), Eli, "Thursday at Hilltop", "Eli made two doubles from penalties at Hilltop", 18-hole grid, body, source line, "Open the penalty read" and "Next". |
| loading | Not drawn | add | Opens from loaded tiles; no spinner. |
| empty | Not drawn | add | No stories, no tiles, no viewer. |
| error/failed | Not drawn | add | Hole grid missing: the grid's place says "Shots not tracked on every hole"; the body still shows. |
| long text | Drawn `#long-story` | add `long-story` | Header "Elijah"; headline wraps, no cap; body scrolls above the fixed footer. Story copy uses the name or "their" unless the player's own profile states a pronoun (the page copy was fixed 3 Nov). |
| lots of items | Not drawn | add | One progress bar per story, gap 4; bars shrink to fit. |
| one item | Drawn `#early-story` | add `early-story` | One bar. On the last story the second button reads "Done". |
| offline/stale | n/a | n/a | |
| XXL | Not drawn | add `story-xxl` | Headline 40.5; body scrolls. |
| dark | Drawn `#story-dark` | `story` (dark) | |
| Reduce Motion | Drawn `#story-reduce` | `story` | No auto-advance under Reduce Motion: Next only; the viewer fades 180ms (07). Without Reduce Motion each story runs 5200ms. |
| phone 390 | Drawn | `story` | Full 390 by 844, flat `--feat` fill (no radial light). Stories 2 and 3 have no hash: add `story2`, `story3` to the parser. |
| large phone 430 | Not drawn as a shot | add `lg-story` | |
| desktop 1280 | n/a | see S-TEAM.story.desk | Desktop opens stories in the inspector. |

### S-TEAM.story.desk

| State | Drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | Drawn `#1440-story` | `1440-story` | Green block (padding 18), headline 22, grid, body, source line, full-width "Open the penalty read". |
| loading | n/a | n/a | As phone. |
| empty | n/a | n/a | As phone. |
| error/failed | Not drawn | add | As phone. |
| long text | Not drawn | add `1440-long-story` | Headline wraps. |
| lots of items | Not drawn | add | No progress bars; the This week list is the index. |
| one item | Not drawn | add | As default. |
| offline/stale | n/a | n/a | |
| XXL | Not drawn | add | Inspector scrolls. |
| dark | Drawn `#1440-story-dark` | `1440-story` (dark) | |
| Reduce Motion | Drawn | `1440-story` | Inspector fades 180ms. |
| phone 390 | n/a | n/a | Phone uses S-TEAM.story. |
| large phone 430 | n/a | n/a | |
| desktop 1280 | Not drawn as a shot | add `1280-story` | Inspector stays 420 wide at every desktop size. |

### S-TEAM.huddle

| State | Drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | Drawn `#huddle` | `huddle` | Scatter 338 by 270.4: quadrant labels, axis titles, "Tour" cross, five dots with initials, three-line legend. |
| loading | Drawn `#loading` | `loading` | Fourth skeleton card. |
| empty | Drawn (absent) `#empty` | `empty` | No card with no rounds. |
| error/failed | Not drawn | add | Standing failed: notice in the plot's place. |
| long text | Drawn `#long-huddle` | add `long-huddle` | Initials only. |
| lots of items | Not drawn | add | 25 dots: dots overlap in total order; initials stay inside each dot. |
| one item | Not drawn | add | One dot. |
| offline/stale | n/a | n/a | |
| XXL | Not drawn | add `huddle-xxl` | Labels scale; the plot doesn't. |
| dark | Drawn `#huddle-dark` | `huddle` (dark) | |
| Reduce Motion | Drawn `#huddle-reduce` | `huddle` | No trail play (07). |
| phone 390 | Drawn | `huddle` | Early: the legend drops "Line: from their first 10 rounds to now" when no trails draw (fixed on the page 3 Nov). |
| large phone 430 | Not drawn as a shot | add | |
| desktop 1280 | Drawn `#1280` | `1280` | |

### S-TEAM.roster

| State | Drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | Drawn `#roster` | `roster` | Meta "T · A · S · P"; rows by total, biggest loss first: Theo −2.2 3 open, Eli −2.1 3, Sam −1.9 2, Jonah −1.8 3, Priya −1.7 3. Under 5 rounds the meta adds "· early". |
| loading | Drawn `#loading` | `loading` | Skeleton. |
| empty | Drawn `#empty` | `empty` | Phone and desktop both show "no rounds yet" in the figure's place for 0-round players, with no totals or open count (fixed on the page 3 Nov). |
| error/failed | Not drawn | add (`noroster`) | Board-level notice. |
| long text | Drawn `#long-roster` | add `long-roster` | "Priyanka Natarajan-Okonkwo" wraps to 2 lines; finger-print and total keep their columns. |
| lots of items | Not drawn | add | 25 rows, no cap, no inner scroll. |
| one item | Not drawn | add | One row. |
| offline/stale | n/a | n/a | |
| XXL | Not drawn | add `roster-xxl` | Rows grow. |
| dark | Drawn `#roster-dark` | `roster` (dark) | |
| Reduce Motion | Drawn | `roster` | |
| phone 390 | Drawn | `roster` | Early: every player "· early", rounds 2 to 4. |
| large phone 430 | Not drawn as a shot | add | |
| desktop 1280 | Drawn `#1280` | `1280` | Rows 68 tall with a "Loses most: …" chip and a 78 by 44 finger-print with T A S P labels. Roster and record are equal height (387.3; empty 355). |

### S-TEAM.working

| State | Drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | Drawn `#work` | `work` | "Working on", "2 focus areas"; Jonah (Active · 5 rounds in) and Priya (In progress · 3 rounds in), each with a 38 ring. |
| loading | Drawn `#loading` | `loading` | Skeleton. |
| empty | Drawn `#early-work` | add `early-work` | "0 focus areas" and "Nothing in progress yet. Assign a read as a focus and it shows here." |
| error/failed | Not drawn | add | Focus read failed: own notice (03 `readFocus` null). |
| long text | Drawn `#long-work` | add `long-work` | "Priyanka · Wedges from 50 to 100 yd" wraps. |
| lots of items | Not drawn | add | All rows, no cap. |
| one item | Not drawn | add | "1 focus area". |
| offline/stale | n/a | n/a | |
| XXL | Not drawn | add | Rows grow. |
| dark | Drawn `#work-dark` | `work` (dark) | |
| Reduce Motion | Drawn | `work` | Rings drawn full, no sweep. |
| phone 390 | Drawn | `work` | After a live Assign the row is added and the meta count updates, "2 focus areas" to "3 focus areas" (fixed on the page 3 Nov). |
| large phone 430 | Not drawn as a shot | add | |
| desktop 1280 | Drawn `#1280` | `1280` | |

### S-TEAM.record

| State | Drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | Drawn `#record` | `record` | "How often CoachHelm is right", "36 of 55" "reads held up when re-checked", five level rows with target marks, footer "Line: the target for that level" and "Re-check reads". |
| loading | Drawn `#loading` | `loading` | Skeleton. |
| empty | Copy in the page script; the empty board drops the card | add | "No reads to check yet" / "Reads are re-checked against new rounds once the team has some." |
| error/failed | Drawn `#failed-record` | `failed-record` | "Track record unavailable right now" / "It shows again once the check runs. No number is shown in its place." |
| long text | Drawn | `record` | "Working hypothesis" wraps to 2 lines in the 128 column. |
| lots of items | n/a | n/a | Always five levels. |
| one item | Not drawn | add | A level with no reads keeps its row; empty bar and "None yet", never "0 of 0". |
| offline/stale | n/a | n/a | |
| XXL | Not drawn | add `record-xxl` | Label column grows with text. |
| dark | Drawn `#record-dark` | `record` (dark) | |
| Reduce Motion | Drawn | `record` | |
| phone 390 | Drawn | `record` | Under `early` the page still shows "36 of 55" (fixture). |
| large phone 430 | Not drawn as a shot | add | |
| desktop 1280 | Drawn `#1280` | `1280` | Each level adds its target as text in ink-3. |

### S-TEAM.empty-steps

| State | Drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | Drawn `#empty` | `empty` | "What fills in, and when", three numbered steps. |
| loading | n/a | n/a | Shown only once data says no rounds. |
| empty | Drawn | `empty` | This card is the empty state. |
| error/failed | n/a | n/a | Never shown when a read failed. |
| long text | Not drawn | add | Lines wrap. |
| lots of items | n/a | n/a | Always three steps. |
| one item | n/a | n/a | |
| offline/stale | n/a | n/a | |
| XXL | Not drawn | add `empty-xxl` | Number circles stay 26. |
| dark | Drawn `#empty-dark` | `empty` (dark) | |
| Reduce Motion | Drawn | `empty` | |
| phone 390 | Drawn | `empty` | |
| large phone 430 | Not drawn as a shot | add | |
| desktop 1280 | Drawn `#1440-empty` | `1440-empty` | |

### S-TEAM.inspector

| State | Drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | Drawn `#1440-read` | `1440-read`, `1440-player`, `1440-story`; add `1440-crs` | 420 wide at the right edge, top 58, on `--bg`, padding 18 20 40. Same content as the phone sheets. |
| loading | n/a | n/a | As the sheets. |
| empty | Drawn `#1440-empty-player` | add `1440-empty-player` | As S-TEAM.player-sheet.no-rounds. |
| error/failed | Not drawn | add | As the sheets. |
| long text | Not drawn | add `1440-long-read` | Wraps in 380 of content width. |
| lots of items | Not drawn | add | Scrolls on its own; the board doesn't move. |
| one item | n/a | n/a | |
| offline/stale | n/a | n/a | |
| XXL | Not drawn | add | Scrolls. |
| dark | Drawn `#1440-read-dark` | `1440-read` (dark) | |
| Reduce Motion | Drawn | `1440-read` | Fades 180ms, no slide (07). |
| phone 390 | n/a | n/a | Phone uses sheets. |
| large phone 430 | n/a | n/a | |
| desktop 1280 | Not drawn as a shot | add `1280-read` | Same 420 width at 1280; it overlays the main column (no reflow). |

### S-TEAM.toast

| State | Drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | Live only | none | Page stand-in: bottom 28, ink fill, 13.5/500, held 2600ms. Not built: each of these taps is a real link or action in the app, or isn't drawn. |
| loading | n/a | none | |
| empty | n/a | none | |
| error/failed | n/a | none | |
| long text | n/a | none | |
| lots of items | n/a | none | |
| one item | n/a | none | |
| offline/stale | n/a | none | |
| XXL | n/a | none | |
| dark | n/a | none | |
| Reduce Motion | n/a | none | |
| phone 390 | n/a | none | |
| large phone 430 | n/a | none | |
| desktop 1280 | n/a | none | |

## Page bugs found and fixed (3 Nov)

The screens pass found these on the page. Each is now fixed on the page, so the page and this file agree. They stay listed because each is an easy mistake for the build to make too.

1. `.dev button{font:inherit;color:inherit}` outranked `.lk` and `.more`, so links rendered 16/400 ink. Fixed: links render the declared 14.5/600 accent ("More" 14/600). The build uses the declared values (06).
2. `.insh span`, `.pat span`, `.sto-h span`, `.drill span` and `.steps span` recoloured child coins, icons and titles to ink-2 or f-ink-2. Fixed: coin initials are white 600 on the player colour (5.77 to 6.68:1), titles are ink (f-ink on the story), icon glyphs are accent.
3. Spot bar rows kept the browser's default button padding (1px 6px). Fixed: 0, matching the player sheet.
4. The phone empty roster showed figures for 0-round players. Fixed: "no rounds yet".
5. The Working on meta didn't update after Assign. Fixed.
6. The huddle legend kept the trail line when no trails drew. Fixed.
7. "1 open reads" under `early`. Fixed: "1 open read".
8. Story 1's body used a gendered pronoun for Eli. Fixed: the name or "their".
9. The segmented control's selected fill is a gradient (`--seg-on`, #1D7048 to #135A38). This one stays: SHARED-2 allows the segmented chip's green shade (Nick, 16 Oct). It belongs to the shared control, not this lane.

## Spec 04 corrections

Where 04-FIDELITY-SPEC says otherwise, the page and this file win:

- The large title is the team name ("Varsity"), not "Team".
- The spot card meta says "biggest leak", not "biggest loss".
- The phone frame is labelled 6.1 in (390 wide), not 6.3.
- The "+N" coin is not drawn on the page; its rule is S-TEAM.hole "lots of items".
- `#top` is not a parser token; it lands on the default board.
- 02's fixture has ten reads; the page has 14 open reads.
- 02's `failed` fails the players read; the page's `failed` fails the weekly brief and the track record. Both are listed above.
- 02's `long` has 15 players; the page has 5 with two long names.
- Under `early` the spot card chips read "Early"; Course card chips read "Early read".
- f-loss on the selected station chip is 4.46:1 light and 4.23:1 dark, not 5.4 / 5.1 (fix in 06).
- Reduce Motion: the page makes most transitions instant (1ms); the sheet, scrim, story and inspector fade 180ms, and the spot and Course card content crossfades 180ms linear (`.rmfade`). Stories don't auto-advance (07 owns the rule).
- XXL is `--k` 1.35 (the app's cap), not 1.24.
- The feature card and story viewer are flat `--feat` fills; 04's radial lights are removed (SHARED-2).
- Reads at a spot and in a player sheet keep feed order; there is no sort by size.
- Phone sizes are 390 by 844 and 430 by 932, not 402 / 440.

## Completeness pass, 4 Nov 2026

Added after a front-to-back check of every ID against states, sizes, entry points, flags and the handoffs to Read and Lenses. Same shapes as above: new inventory rows first, then added state rows per ID. Rows fixed in place carry `(fixed 4 Nov: ...)`; the log is in `lane-reports/coachhelm-team.md`.

### New inventory rows

| ID | Kind | How you get there | Design link | App route | Roles | PR |
|---|---|---|---|---|---|---|
| `S-TEAM.noplayers` | inline state (first run) | A coach with no players on the roster opens Team | Not drawn | add `?state=noplayers` | coach | 1 |
| `S-TEAM.off` | inline state (flag off) | `coachhelm_team_board_v1` off: CoachHelm opens today's board, unchanged | Not drawn (today's screen) | `/clubhouse/coachhelm` with the flag off | coach | 1 |
| `S-TEAM.player` | inline state (player role) | A player opens a Team link or URL | Not drawn (today's player CoachHelm) | `?viewer=player` add | player | 1 |
| `S-TEAM.read-sheet.gone` | inline state in the sheet | Open a read that was removed, or one from a player who left the team | Not drawn | add `?open=read&read=gone` | coach | 3 |
| `S-TEAM.read-sheet.stale` | inline state in the sheet | Open a read flagged `ChInsight.stale` | Not drawn | add `?state=stale&open=read` | coach | 3 |
| `S-TEAM.read-sheet.partfail` | inline state in the sheet | One part of the read (strip or holes) fails to load | Not drawn | add `?state=partfail&open=read` | coach | 3 |

### S-TEAM.noplayers

| State | Drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | Not drawn | add `noplayers` | Title and segmented stay. Context line "No players yet". One card in today's empty pattern (icon circle 44, title "Add your players", one line "Team fills in once your players are on the roster and log rounds.", secondary button "Go to Roster" to today's roster page). No hole, spot, huddle, Working on or record. |
| dark, XXL, 430, 1280 | Not drawn | add | Same card; on desktop it sits in the main column and the rail is empty with no inspector. |

### S-TEAM.off

| State | Drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | today's screen | n/a | No segmented Team / Ask, no Team URL handling: `?view=team` and `?player=` are ignored and the board renders. Lenses and Read links from today's board work as their own flags say. |

### S-TEAM.player

| State | Drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | Not drawn | add | A player never sees Team. A Team URL opens the player's own CoachHelm (Lenses `S-BOARD` when `coachhelm_player_file_v1` is on, today's board when off), with the query dropped by replace. No teammate figure loads (Nick's rule). |

### S-TEAM (added states)

| State | Drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| 821 to 1179 (tablet, small laptop) | Not drawn | add `1024` | The desktop shell (sidebar and 58 top bar) with one column in phone order, max width 720, centred. The hole is drawn horizontal when the card's inner width is 610 or more, else the vertical 338 hole. Sheets open in the 420 inspector, which overlays the column from the right with no scrim. The two-column grid starts at 1180 (fixed 4 Nov: the page has no rule here and the build used `!useChPhone()`, which left the desktop grid squeezed from 821). |
| 1180 to 1279 | Not drawn | add `1180` | Two-column grid as 1280, rail at its 320 floor; the white space fix (DECISIONS) holds: the main column fills, no empty band to the right. |
| first run (season with rounds, first visit) | Drawn `#top` | `top` | The fly-in plays once a session (M-TEAM-01). Nothing else is first-run only. |
| deep link `?player={id}` | Not drawn | add `deeplink-player` | Board renders, then the player sheet (phone) or inspector (desktop) opens once on that player. The param is dropped with replace so Back closes the sheet, not the board. A bad or removed id: plain board, param dropped, no error. |
| deep link `?open=read&insight={id}` | Not drawn | add `deeplink-read` | As above, opening the read sheet. A read that is gone or not on this team opens `S-TEAM.read-sheet.gone`. |
| notification | Not drawn | n/a | `insight-notifier.ts:119` lands on the board (`/golf/dashboard/coachhelm`); with the flag on that is Team at the hole, with no sheet open. `verdict-job.ts:320` lands on the players page, unchanged. |
| cold start | Not drawn | n/a | Same as first paint: board at the hole (`TEAM_BOARD_FIRST_VIEW`), fly-in once. |
| pull to refresh | Not drawn | n/a | Today's pull to refresh on this route, unchanged. A refresh re-reads the loader and redraws in place: no fly-in, no huddle replay, open sheet stays open on the newest data. |
| scroll restore | Not drawn | n/a | Back from Read or Lenses returns to the same scroll and station (session state). |
| player removed mid-session | Not drawn | n/a | Next load drops them from every card. An open sheet on that player stays until a write fails; the write shows today's not-on-team error (CH-13311). |
| two devices | Not drawn | n/a | An Assign made on another device shows on the next load; opening that read shows the Assigned row (shared sheet "duplicate"). |
| 1 Aug season rollover | Not drawn | add `rollover` | From 1 Aug the board reads the new season: no rounds gives `empty`; huddle trails and Course weeks reset; last season stays reachable in Lenses and Stats only. |
| timezone | Not drawn | n/a | Round dates are date-only and render as stored, no UTC shift; "this week" uses the coach's local week. |
| keyboard and screen reader | Not drawn | n/a | Tab order follows the card order; every row and chip is a button with a visible focus ring (today's `:focus-visible`); Esc closes the top sheet or the inspector and focus returns to the opener. |
| share and print | n/a | n/a | No share and no print styles on this board. |

### S-TEAM.read-sheet (added states; contract in 06 Completeness pass)

| State | Drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| stale | Not drawn | add `stale` + read | "Out of date" chip leads the chips; no Assign. |
| part failed | Not drawn | add `partfail` + read | The failing card reads "Couldn't load this part" with Try again; the rest draws. (fixed 4 Nov wiring: the Team host carries no strip or holes, so its parts are the ones `ChBoardMissing` names: drill text, focus status and Tour; Try again is `router.refresh()`) |
| gone | Not drawn | add `gone` + read | Compact gone card (CH-13861 wording) with Close; no figures load. |
| double submit | Live | `failwrites` | A second tap while Assign is in flight does nothing; one write, one success feedback. |
| link "Open the full read" | Live | n/a | With `coachhelm_read_v1` on: `readHref` pushes the Read page; Back returns to the board with this sheet closed and the scroll kept. With it off: `coachReadHref` (today's Deep dive). |
| links Ask and Add to practice | Not drawn | n/a | Absent until those lanes export their hrefs and their flags are on. The page's toast for them is not built. |

### S-TEAM.player-sheet (added states)

| State | Drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| "Open Eli's page" | Live | n/a | With `coachhelm_player_file_v1` on: pushes the Lenses file (`playerFileHref`); off: today's player page. Back returns to Team with the sheet closed. |
| removed player | Not drawn | n/a | As S-TEAM "player removed mid-session". |

### S-TEAM.toast

| State | Drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| build | Page only | n/a | Not built. Links into other lanes navigate; write results use today's `useToast` through `useFocusActions`. Capture lists it as page only. |
