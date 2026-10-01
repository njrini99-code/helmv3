# P004 — Stats (team): page contract

Every behaviour Team stats promises, by the 25 V2 categories (D-69). A contract's number is its Bridge ID (D-68: namespace 4, category, item); `Code` is the catalog code on the element and in the test (`docs/clubhouse/catalog/stats-team.md`). Rows without a code are behaviours with no single element, recorded in `config/clubhouse/bridge-contracts.json` by hand. The shell's contracts (P001, namespace 1) apply here too and are named where they carry a category. A player's own profile is Stats (player), P005, with its own contracts. `clubhouse:check` holds this file to the registry.

## 01 — Default / core UI

Status: DEFINED

Team stats opens for the coach's own team on the last 10 rounds per player, with the figures, the trend, the legs and grid, putting and season bests already in the server's first render (40101). The address picks the window: ?window=season or ?window=qualifiers, anything else is Last 10 (40102). The old address /golf/dashboard/stats/team renders the same page in place with the default window, so it ignores ?window= and ?player= (read from the page, not tested).

Which rounds each window reads (owner, 2026-09-30, Q-122 and Q-123):

- Last 10 is each player's ten newest countable rounds in any season, read
  from a rolling 12 months back, with "vs. previous 10" the ten before them.
  Season and Qualifiers are this season only.
- A round posted as a total only (18 holes, no nines, no holes) counts in the
  scoring figures, and in no hole-level one (greens, putts, scrambling,
  birdies, strokes gained, the legs, putting). A hole-level card whose round
  count is fewer than the window's says "Hole stats from X of Y rounds".

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 40101 | — | `TEAM_STATS_READY` | Team stats opens for a coach on the last 10 rounds per player: the header (team, active players), five figure cards, the strokes gained trend, the four leg cards with the player grid, team putting and season bests, all in the server's first render; on the phone, the phone view with the same data. |
| 40102 | — | `WINDOW_FROM_THE_ADDRESS` | ?window=season or ?window=qualifiers opens that window and anything else opens Last 10; changing the switch writes the window back to /golf/dashboard/stats (Last 10 is the bare address) without moving the scroll. |

From the shell (P001): 10101 CH-1904, 10102 SHELL_READY.

## 02 — Initial loading / skeleton

Status: DEFINED

The route's loading state is the Stats skeleton (40201, CH-4401), in Team stats' shape: title, window switch, five figure cards and the trend card, sized to the loaded page so nothing below moves when the data lands. It shows inside the Clubhouse shell only. v2 timing: nothing for 150ms, then a fade (the shell's 11609). Nothing else on this page loads on its own: every section is rendered with the page, so there is no per-section skeleton.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 40201 | CH-4401 | `STATS_IS_LOADING` | Team stats are loading (a player's profile is CH-5403) |

From the shell (P001): 10201 CH-1401.

## 03 — Background loading / refresh

Status: DEFINED

Changing the window reloads the page in place: it dims and is marked busy, the figures on screen stay until the new window lands, and the address changes with scroll off (40301). There is nothing to refresh in the background: no polling and no realtime, so the figures change only on a window change, on Try again, or when the page is opened again.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 40301 | CH-4402 | `CHANGING_THE_WINDOW` | Changing the window (Last 10, Season, Qualifiers) or the round filter |

## 04 — Empty

Status: DEFINED

First-run and filtered are distinct, and a failed read is never shown as empty. A window with no 18-hole rounds (40401) or no qualifier rounds (40402) is one card with Show the season; then each section that has nothing says so on its own (40403 to 40407). A player with too few rounds is an Early read, never 0.0 (40408). No team is the v2 page empty state (40409). Open: v2 draws Stats with no rounds ever as a whole-page empty, "No stats yet" with View roster (D-71, gh-states.jsx); the built page shows the window-level card, because the loader reads only this season's rounds and cannot say "ever". Owner decision, not built.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 40401 | CH-4301 | `NO_18_HOLE_ROUNDS_IN_THE_WINDOW` | No 18-hole rounds in the window (including Season when the team has only 9-hole rounds: D-71's first-run page is for no round of either length) |
| 40402 | CH-4302 | `NO_QUALIFIER_ROUNDS` | No qualifier rounds |
| 40403 | CH-4303 | `NO_STROKES_GAINED_IN_THE_WINDOW` | No strokes gained in the window |
| 40404 | CH-4304 | `NO_SCORES_IN_THE_WINDOW` | No scores in the window (Scoring lens) |
| 40405 | CH-4305 | `NO_PLAYER_HAS_A_ROUND_IN_THE` | No player has a round in the window |
| 40406 | CH-4306 | `NO_PUTTS_LOGGED` | No putts logged |
| 40407 | CH-4307 | `NO_SEASON_BESTS_YET` | No season bests yet |
| 40408 | CH-4308 | `A_PLAYER_HAS_TOO_FEW_ROUNDS_FOR` | A player has too few rounds for strokes gained |
| 40409 | CH-4309 | `A_COACH_OR_PLAYER_WITH_NO_TEAM` | A coach or player with no team |
| 40410 | CH-4310 | `NO_COUNTABLE_ROUND_ALL_SEASON` | No countable round all season, of either length (D-71) |
| 40411 | CH-4311 | `THE_WINDOW_HAS_NO_ROUND_POSTED_WITH` | The window has no round posted with shots, so the team has no strokes gained |
| 40412 | CH-4312 | `THE_LAST_10_WINDOW_HAS_NO_EARLIER` | The last-10 window has no earlier rounds to set strokes gained against (none, or fewer than three with shots) |
| 40413 | CH-4313 | `THE_ROUND_FILTER_LEAVES_NO_ROUND` | The round filter leaves no round (a type, course, range or pick that matches nothing) |
| 40414 | CH-4314 | `THE_FILTER_LEAVES_FEWER_THAN_THREE_WHOLE` | The filter leaves fewer than three whole rounds (a 9-hole round counts as half: four 9-hole rounds are two, six are three) |
| 40415 | CH-4315 | `THE_SHEETS_ROUND_LIST_HAS_NOTHING_TO` | The sheet's round list (Only these, Exclude these) has nothing to offer |
| 40416 | CH-4316 | `THE_SHEETS_ROUND_LIST_IS_CUT_AT` | The sheet's round list is cut at 200 rounds |
| 40417 | CH-4317 | `A_FILTER_IS_ON_AND_SEASON_BESTS` | A filter is on and Season bests is showing |
| 40418 | CH-4318 | `THE_FILTER_LETS_9_HOLE_ROUNDS_IN` | The filter lets 9-hole rounds in (Holes: 9 holes or Both) |
| 40419 | CH-4319 | `NO_ROUND_OF_THE_DEFAULT_LENGTH_BUT` | No round of the default length (18 holes), but the team has 9-hole rounds in this window |

## 05 — Validation

Status: DEFINED

Team stats has no form. The one thing it writes out is the CSV export, which writes a player's name as text when it starts with =, +, - or @ (or a tab or a return) so a spreadsheet never reads it as a formula (40501).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 40501 | — | `EXPORT_CELLS_ARE_TEXT` | The CSV export writes a player's name that starts with =, +, - or @ (or a tab or a return) as text, with a leading apostrophe, so a spreadsheet never reads it as a formula; numbers are left as numbers. |
| 40502 | CH-4101 | `THE_FILTERS_DATE_RANGE_STARTS_AFTER_IT` | The filter's date range starts after it ends, and Done is tapped |

## 06 — Server / system error

Status: DEFINED

Each failed read is handled on its own. The rounds or roster (40602), the round figures (40603) and the putts (40604) have a notice with Try again, and a failed rounds or roster read hides every figure so nothing is shown half-built. A failed benchmark read (40610) or team row read (40611) has no notice: nothing claims a benchmark it does not have, and the header reads Your team. The one change, the export, has its own toast (40601). A crash stays in its section (40605 to 40609): each section is inside a SectionBoundary with a Suspense inside it, so a crash on the server render leaves the page standing (D-24). A page that fails to render at all is the shell's route error view (10603 to 10607).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 40601 | CH-4001 | `THE_BROWSER_BLOCKS_THE_CSV_EXPORT` | The browser blocks the CSV export |
| 40602 | CH-4201 | `TEAM_ROUNDS_DONT_LOAD` | Team rounds (or the roster) don't load |
| 40603 | CH-4202 | `PER_ROUND_FIGURES_DONT_LOAD` | Per-round figures (greens, putts, scrambling) don't load |
| 40604 | CH-4203 | `PUTTS_DONT_LOAD` | Putts don't load |
| 40605 | CH-4204 | `THE_FIGURE_CARDS_CRASH_IN_THE_BROWSER` | The figure cards crash, in the browser or on the first (server) render |
| 40606 | CH-4205 | `THE_TREND_CHART_CRASHES` | The trend chart crashes |
| 40607 | CH-4206 | `THE_LEG_TRENDS_OR_THE_PLAYER_GRID` | The leg trends or the player grid crash |
| 40608 | CH-4207 | `TEAM_PUTTING_CRASHES` | Team putting crashes |
| 40609 | CH-4208 | `SEASON_BESTS_CRASH` | Season bests crash |
| 40610 | CH-4209 | `D1_BENCHMARKS_DONT_LOAD` | Tour benchmarks don't load |
| 40611 | CH-4210 | `THE_TEAMS_OWN_DETAILS_DONT_LOAD` | The team's own details (name, men's or women's) don't load |

## 07 — Network / offline

Status: DEFINED

Changing the window while offline is refused before anything is requested: the switch stays where it was and the toast names both windows (40701). A change that takes longer than 5 seconds says so once (40702). The export is local and works offline. The offline banner (10701) and Try again while offline (10704) are the shell's.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 40701 | CH-4901 | `CHANGING_THE_WINDOW_WHILE_OFFLINE` | Changing the window (the switch, or Show the season) or the round filter while offline |
| 40702 | CH-4902 | `A_WINDOW_CHANGE_TAKES_LONGER_THAN_5` | A window or filter change takes longer than 5 seconds |

From the shell (P001): 10701 CH-1901, 10702 CH-1902, 10703 CH-1903, 10704 CH-1905.

## 08 — Permission / authorization

Status: DEFINED

Team stats is a coach's page (40801). On /golf/dashboard/stats a player is never given the team: the route hands them their own profile (P005) and no team data is read for them. On the old address /golf/dashboard/stats/team the Fairway page sends a non-coach to /stats before anything is read (read from the page, not tested), and the Clubhouse frame lists the address for a coach only. The team is always the caller's own: the route takes it from the session, never from the address, and the loader reads that team's row, its active roster and those players' rounds only (40802). A coach with no team gets the no-team page state (40409) and nothing is read. Every read uses the caller's own database session, so row-level security is the second lock, and this page uses no service role. Who may open one player is Stats (player)'s contract (50804). The whole Clubhouse is gated by the shell (10801) and each role sees its own navigation (10802).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 40801 | — | `COACH_ONLY_TEAM_STATS` | Team stats is a coach's page: a player on /golf/dashboard/stats gets their own profile and no team figure is read for them, and the old address /golf/dashboard/stats/team is a coach's route in the Clubhouse frame (the Fairway page sends a player back to /stats). |
| 40802 | — | `TEAM_IS_THE_COACHS_OWN` | The team is always the one resolveClubhouseTeam gives the signed-in coach, never one named in the address: the loader reads that team's row, its active roster (golf_team_members by team_id, status active) and only those players' rounds; a coach with no team gets the no-team state and nothing is read. |

From the shell (P001): 10801 CLUBHOUSE_GATE, 10802 ROLE_SCOPED_NAV.

## 09 — Success

Status: DEFINED

The only change that lands is the export: a toast names it and the success haptic plays (40901). Everything else on the page reads. The shell's change-landed rule (10901) is for changes made through useAction, which the export is not.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 40901 | — | `EXPORT_LANDED` | Export downloads the player grid as a CSV named for the team and window (for example varsity-stats-season.csv), one row per player with a round in the window, and a toast says Team stats exported with the success haptic; with nothing to export there is no button. |

## 10 — Warning

Status: N/A — Team stats has nothing to warn about: a window with too few rounds is an empty state or an Early read, and a figure the app cannot produce is a dash.

## 11 — Destructive

Status: N/A — Team stats changes nothing on the server, and the export only downloads a file, so there is nothing to confirm or undo.

## 12 — State preservation

Status: DEFINED

Changing the window keeps the chosen leg and the focused player on the page (41201). The address changes with scroll off, so the reader stays where they were. There is no form, so nothing a person typed can be lost.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 41201 | — | `CHOICES_KEPT_ACROSS_WINDOWS` | Changing the window keeps the chosen leg and the focused player on the page while the new figures arrive. |

## 13 — Optimistic UI

Status: N/A — Nothing is written, and a window change waits for the server: the page dims and stays busy until the new window lands rather than guessing its figures.

## 14 — Retry / recovery

Status: DEFINED

Try again on a failed-read notice asks the server for the whole page again (41401), so every read is retried, not one section's. Try again on a crash notice only draws that section again (the shared SectionBoundary). Show the season is the way out of an empty window (40401). A page that failed to render at all has the shell's Try again (11401).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 41401 | — | `TRY_AGAIN_REFRESHES_THE_PAGE` | Try again on a failed-read notice (team rounds, round figures, putting) asks the server for the whole page again (router.refresh), so every read is retried, not one section's. |

## 15 — Data freshness / sync

Status: N/A — Team stats has no live data and no write to reconcile: every figure is read on the server when the page is rendered for the request, and again on each window change or Try again. There is no client cache, polling or realtime.

## 16 — Micro animation

Status: DEFINED

Team stats' own motion is the trend focus and the leg choice (41601, 41602), and the busy dim of a window change (40301). Everything else is the shell's: v2 press, reveal, sheets and pushes (11601 to 11612, D-64).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 41601 | CH-4601 | `FOCUSING_A_PLAYER_ON_THE_TREND` | Focusing a player on the trend |
| 41602 | CH-4602 | `CHOOSING_A_LEG` | Choosing a leg |

From the shell (P001): 11601 CH-1601, 11602 CH-1602, 11603 CH-1603, 11604 CH-1604, 11605 CH-1605, 11606 CH-1606, 11607 CH-1607, 11608 CH-1608, 11609 CH-1609, 11610 CH-1610, 11611 CH-1611, 11612 CH-1612.

## 17 — Haptic

Status: DEFINED

Team stats' own haptics (41701 to 41703) on the v2 grammar (D-70): a selection tick for a window, a lens, a leg, a player or a sort; the success pattern when an export lands and the error pattern when it is blocked or a window change is refused offline. With the shell's (11701 to 11706).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 41701 | CH-4701 | `CHOOSING_A_LEG_FOCUSING_A_PLAYER_CHANGING` | Choosing a leg, focusing a player, changing the window or lens |
| 41702 | CH-4702 | `AN_EXPORT_LANDS_FAILS` | An export lands / fails |
| 41703 | CH-4703 | `SORTING_THE_PHONES_PLAYERS_BY_AVG_OR` | Sorting the phone's players by Avg or SG |
| 41704 | CH-4704 | `CHOOSING_A_ROUND_TYPE_A_LENGTH_A` | Choosing a round type, a length (18 holes, 9 holes, Both), a course or a round in the filter sheet, choosing a window or a pick mode there, or removing a chip / Clear |

From the shell (P001): 11701 CH-1701, 11702 CH-1702, 11703 CH-1703, 11704 CH-1704, 11705 CH-1705, 11706 CH-1706.

## 18 — Accessibility

Status: DEFINED

Team stats' own (41801 to 41805): the trend chart has a written summary and its players are buttons, the grid is a table with a header for every value, loss amber on a tinted cell holds 4.5:1, and the phone's scoring line and player rows read as sentences. The shell's skip link, landmarks and focus rules (11801 to 11811). This page has no dialogs, so Esc has nothing to close. Axe runs at 1280 and 390 (`clubhouse:a11y`).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 41801 | CH-4801 | `THE_TREND_CHART_IS_AN_IMAGE_WITH` | The trend chart is an image with a written summary ("Strokes gained by week. The team has gained about 1.0 a round…"); the player list beside it is the chart's values as buttons |
| 41802 | CH-4802 | `THE_STROKES_GAINED_GRID_IS_A_TABLE` | The strokes gained grid is a table with a header for every value |
| 41803 | CH-4803 | `LOSS_AMBER_ON_A_TINTED_GRID_CELL` | Loss amber on a tinted grid cell is darkened to hold 4.5:1 |
| 41804 | CH-4804 | `NO_AXE_VIOLATIONS_IN_ANY_PREVIEW_STATE` | No axe violations in any preview state, 1280px and 390px |
| 41805 | CH-4805 | `THE_PHONES_SCORING_LINE_IS_AN_IMAGE` | The phone's scoring line is an image with a written reading ("Team scoring average by week, from 74.8 to 73.4. Down 1.4 strokes…"); each player row is one link read as name, rounds, average and strokes gained ("Early read" under three rounds) |
| 41806 | CH-4806 | `THE_ROUND_FILTER_THE_FILTER_BUTTON_SAYS` | The round filter: the Filter button says it opens a dialog and how many filters are on; each chip is a button named "Remove filter: Tournament"; Clear is "Clear filters"; the count line is a polite status region; the sheet is a labelled dialog whose groups (Round type, Holes, Time, Course, Pick rounds) are labelled, round type, holes and pick mode are toggle buttons (`aria-pressed`), courses and rounds are checkboxes in labelled lists, and the dates are labelled inputs whose error is their description |

From the shell (P001): 11801 CH-1801, 11802 CH-1802, 11803 CH-1803, 11804 CH-1804, 11805 CH-1805, 11806 CH-1806, 11807 CH-1807, 11808 CH-1808, 11809 CH-1809, 11810 CH-1810, 11811 CH-1811, 11812 CH-1812.

## 19 — Responsive layout

Status: DEFINED

At 820px and below Team stats is the phone view (41901); the phone spec is `docs/clubhouse/phone/stats-team.md` (approved). Above that the desktop layout follows its container, not the viewport, with steps at 1080, 900 and 720px in `stats.css`.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 41901 | — | `PHONE_VIEW` | At 820px and below Team stats is the phone view (window switch, four figures, scoring line, strokes gained by leg, players sorted by Avg or SG, team putting), never a shrunken desktop; the server renders desktop and the phone view takes over at hydration. |

From the shell (P001): 11901 PHONE_CHROME.

## 20 — Keyboard / input

Status: DEFINED

The window switch is a radio group that moves and chooses with the arrow keys, the leg cards and the trend's player list are buttons, and a grid row is a link that marks its player on the trend when it takes focus (42001). Export and Try again are buttons, in reading order. The shell's edge swipe and browser back are 12001.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 42001 | — | `KEYBOARD_PATH` | The window switch moves and chooses with the arrow keys, a leg card takes Enter, and a grid row is a link that marks its player on the trend when it takes focus. |

From the shell (P001): 12001 CH-1906.

## 21 — Performance

Status: DEFINED

One pass on the server (42101). Client code is limited to the islands (the window switch, Export, Try again, the trend, the legs and the grid); the figures, putting and season bests are server HTML. Web vitals are the shell's (12101).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 42101 | — | `ONE_PASS_LOADER` | loadTeamStats reads the team and its roster together, starts the D1 benchmarks before the rounds come back, then reads the round figures and the putts together, once each (id chunks in parallel); every failed read is logged and flagged, never thrown. |

From the shell (P001): 12101 CH-1954.

## 22 — Analytics

Status: DEFINED

The shell records rage, dead and slow clicks for every page (12201 to 12203). Team stats adds no events of its own.

From the shell (P001): 12201 CH-1951, 12202 CH-1952, 12203 CH-1953.

## 23 — Logging / observability

Status: DEFINED

Failed reads logged, section crashes and the blocked export reported, intents breadcrumbed (42301).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 42301 | — | `FAILURES_REPORTED` | A failed read is logged through chLogServer('stats', team\|members\|rounds\|roundCache\|putts\|tourBenchmarks); a section crash is reported through chReport with its surface (stats.team.figures, trend, legs, putting, bests) at high severity, a blocked export at low severity as stats.team.export; a window change and a focused player leave a chTrail breadcrumb. |

From the shell (P001): 12301 FAILURES_REPORTED.

## 24 — CI / automated test

Status: DEFINED

Every catalog code is forced by a named test, and each hand contract is named in a test title (42401); `clubhouse:check` fails a catalog row of kinds 0 to 5 that no test names.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 42401 | — | `TESTS_NAME_CONTRACTS` | src/clubhouse/__tests__/stats-team.test.tsx names, in a test title, every Stats team catalog code it forces (the rows whose Test column names it) and each hand contract above. |

From the shell (P001): 12401 TESTS_NAME_CONTRACTS.

## 25 — Helm Bridge action

Status: N/A — the Bridge is wired later (owner, D-68). Every contract above already has its Bridge ID; the commands (change the window, open a player, export the grid) are defined when the Bridge is.
