# Stats (team) catalog (4xxx)

Route `/golf/dashboard/stats` (coach, no `?player`) · code `src/clubhouse/screens/stats/StatsTeam.tsx` (server)
and `StatsTeamIslands.tsx` (the client islands), loader `src/clubhouse/data/stats-team.ts` · tests
`src/clubhouse/__tests__/stats-team.test.tsx` · preview `/clubhouse-preview/stats`
(`?state=empty|failed|partial|crash|loading`).

Stats only reads, apart from the CSV export. Every section is its own
component inside its own boundary, so a crash in one never reaches the page.

## 40xx Error toasts

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-4001 | The browser blocks the CSV export | "Couldn't export team stats" + "Your browser blocked the download. Try a desktop browser." Done: "Team stats exported" | `TeamHeadActions` export, reported low | stats-team.test › CH-4001 |

## 41xx Validation

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-4101 | The filter's date range starts after it ends, and Done is tapped | "The start date is after the end date. Swap them, or clear one." under the dates, which are marked invalid; the start date takes focus and a warning plays; nothing is requested and the sheet stays open. Nothing is said while they are still typing | `FilterSheet` in `StatsFilter` (`aria-invalid`, `aria-describedby`) | stats-filter-ui.test › CH-4101 |

## 42xx Didn't load

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-4201 | Team rounds (or the roster) don't load | "Team rounds didn't load." + "Every figure below would be incomplete, so they're hidden." Try again. No figure is shown half-built, and Export is hidden | `StatsTeam`; logged `clubhouse.stats.rounds` / `members` | stats-team.test › CH-4201 |
| CH-4202 | Per-round figures (greens, putts, scrambling) don't load | "Some team figures didn't load." + "Scoring is correct; greens, putts and scrambling are missing." Try again; those cards read "—" | `TeamFigures`; logged `clubhouse.stats.roundCache` | stats-team.test › CH-4202 |
| CH-4203 | Putts don't load | "Team putting didn't load." Try again, in the putting card's place | `TeamPutting`; logged `clubhouse.stats.putts` | stats-team.test › CH-4203 |
| CH-4204 | The figure cards crash, in the browser or on the first (server) render | "Team figures couldn't be shown." + "The rest of the page is fine…" Try again | `SectionBoundary stats.team.figures`, with a `Suspense` inside it so a server-render crash is retried in the browser instead of failing the page (the same for CH-4205 to CH-4208; preview `?state=crash`) | stats-team.test › CH-4204 |
| CH-4205 | The trend chart crashes | "The trend chart couldn't be shown." … | `SectionBoundary stats.team.trend` | stats-team.test › CH-4205 |
| CH-4206 | The leg trends or the player grid crash | "Strokes gained by leg couldn't be shown." … | `SectionBoundary stats.team.legs` | stats-team.test › CH-4206 |
| CH-4207 | Team putting crashes | "Team putting couldn't be shown." … | `SectionBoundary stats.team.putting` | stats-team.test › CH-4207 |
| CH-4208 | Season bests crash | "Season bests couldn't be shown." … | `SectionBoundary stats.team.bests` | stats-team.test › CH-4208 |
| CH-4209 | Tour benchmarks don't load | Greens and putting bands compare with the sample instead of "Tour averages 67%"; nothing claims a benchmark it doesn't have | `loadTeamStats`; logged `clubhouse.stats.tourBenchmarks` | stats-team.test › CH-4209 |
| CH-4210 | The team's own details (name, men's or women's) don't load | The header reads "Your team"; greens and putting compare with the sample and the trend's dashed line is "the baseline", so no benchmark of the wrong tour is claimed | `loadTeamStats`; logged `clubhouse.stats.team` | stats-team.test › CH-4210 |

## 43xx Empty

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-4301 | No 18-hole rounds in the window (including Season when the team has only 9-hole rounds: D-71's first-run page is for no round of either length) | "No 18-hole rounds in this window yet." + "Team stats fill in as players post countable rounds." + Show the season | `StatsTeam`, `StatsTeamPhone` | stats-team.test › CH-4301 |
| CH-4302 | No qualifier rounds | "No qualifier rounds this season yet." + "Qualifier rounds appear here once they are posted as qualifying." + Show the season | `StatsTeam` | stats-team.test › CH-4302 |
| CH-4303 | No strokes gained in the window | "No strokes gained in this window." + "Strokes gained appears for rounds posted with shots." | `TeamTrend` | stats-team.test › CH-4303 |
| CH-4304 | No scores in the window (Scoring lens) | "No scores in this window." | `TeamTrend` | stats-team.test › CH-4304 |
| CH-4305 | No player has a round in the window | "No player rounds in this window." in the grid's place | `LegGrid` | stats-team.test › CH-4305 |
| CH-4306 | No putts logged | "No putts logged in this window." + "Putting fills in from rounds posted with putt distances." | `TeamPutting` | stats-team.test › CH-4306 |
| CH-4307 | No season bests yet | "No season bests yet." + "Low round, most birdies and the rest appear once rounds are posted." | `SeasonBests` | stats-team.test › CH-4307 |
| CH-4308 | A player has too few rounds for strokes gained | "Early read" in Total, dashes in the leg cells; never 0.0 | `LegGrid` | stats-team.test › CH-4308 |
| CH-4309 | A coach or player with no team | The page empty state (v2 medallion): "You aren't on a team yet" + what fills in once they are | `StatsNoTeam` (route) | stats-player.test › CH-4309 |
| CH-4310 | No countable round all season, of either length (D-71) | The page empty state: "No stats yet" + "Team and player stats fill in as players post rounds this season." + View roster; other windows keep CH-4301 | `StatsTeamFirstRun` (desktop and phone) | stats-team.test › CH-4310 |
| CH-4311 | The window has no round posted with shots, so the team has no strokes gained | The "Team SG per round" headline reads "—" with "Needs rounds with shots" and what it is measured against ("vs Tour"), never a zero | `TeamFigures` (`FigureCards`, `data-ch-code` on the card); loader `figures[0].state = 'empty'` | strokes-gained.test › CH-4311 |
| CH-4312 | The last-10 window has no earlier rounds to set strokes gained against (none, or fewer than three with shots) | The headline keeps its value and says "No earlier rounds" (or "Too few earlier rounds with shots") where the change chip would be. The season and qualifier windows have no previous window by design and say nothing | `TeamFigures`; `sgChange` in `stats-common`, `figures[0].state = 'no-comparison'` | strokes-gained.test › CH-4312 |
| CH-4313 | The round filter leaves no round (a type, course, range or pick that matches nothing) | "No rounds match these filters." + "Try a wider time, fewer round types, or clear the filters to see every round again." + Clear filters. The Filter button, the chips and the count line ("0 rounds: qualifying rounds, at Pine Hollow, this season") stay, so the filter can be changed or cleared. Never the first-run page (CH-4310) or CH-4301 / CH-4302, which are for no filter | `FilterEmpty` via `TeamFilterEmpty` (desktop and phone) | stats-filter-ui.test › CH-4313 |
| CH-4314 | The filter leaves fewer than three whole rounds (a 9-hole round counts as half: four 9-hole rounds are two, six are three) | A note above the figures: "Early read. One round matches these filters, so the averages and trends will move a lot. Strokes gained shows once a player has three rounds with shots." With more rounds than that it says how many match and how they count ("4 rounds match these filters, 2 counting 9-hole rounds as half, so the averages..."). The figures still draw. Three whole rounds, or no filter, say nothing | `EarlyRead` (`StatsTeam`, `StatsTeamPhone`); keys on `roundsEffective` | stats-filter-ui.test › CH-4314 |
| CH-4315 | The sheet's round list (Only these, Exclude these) has nothing to offer | "No rounds to pick from." + "Nothing matches the round type, course and time above. Widen them, then pick." Or, when the range starts before the season, "Rounds before Aug 1 load once the range is applied. Apply it, then open Filter again to pick among them." | `FilterSheet` | stats-filter-ui.test › CH-4315 |
| CH-4316 | The sheet's round list is cut at 200 rounds | "Showing the newest 200 of 250 rounds. Narrow the time or the course to reach the rest." under the list | `FilterSheet`, `PICK_LIST_MAX` | stats-filter-ui.test › CH-4316 |
| CH-4317 | A filter is on and Season bests is showing | The card's subtitle reads "Countable rounds since August · the filter does not apply here": the bests are the whole season's and do not follow the filter. Without a filter it reads "Countable rounds since August" | `SeasonBests` | stats-filter-ui.test › CH-4317 |
| CH-4318 | The filter lets 9-hole rounds in (Holes: 9 holes or Both) | A note under the count line: "Per-round figures are per 18 holes: a 9-hole round counts as half a round." The chip reads "9 holes" or "18 and 9 holes" and the count line names the lengths ("3 rounds: 9-hole rounds, last 10"). Scoring, putts, birdies and strokes gained are per 18 holes (a 38 over nine holes is a 76); the rates pool the holes. At the default of 18 holes it says nothing | `StatsFilter` (desktop and phone), `PER_18_NOTE` | stats-filter-ui.test › CH-4318 |
| CH-4319 | No round of the default length (18 holes), but the team has 9-hole rounds in this window | Above CH-4301 (on Season too: a team with only 9-hole rounds this season is not a first run, D-71): "This team has 9-hole rounds in this window, which the 18-hole view leaves out. Choose 9 holes or Both in Filter to see them." Not shown when a filter is on (that is CH-4313), when there are rounds to show, or when Both would show nothing in this window (no 9-hole round of its time, such as a 9-hole practice round on Qualifiers, or one from before the season) | `NineHint` (`StatsTeam`, `StatsTeamPhone`) | stats-filter-ui.test › CH-4319 |

## 44xx Loading

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-4401 | Team stats are loading (a player's profile is CH-5403) | The page's header, five figure cards and chart frames as skeletons, each line and card sized like the loaded Team stats so nothing below moves when it lands | `StatsSkeleton`, `aria-busy` | stats-team.test › CH-4401 |
| CH-4402 | Changing the window (Last 10, Season, Qualifiers) or the round filter | The page dims slightly and is marked busy until the new rounds land; the scroll position stays | `StatsTeamFrame` (`useTransition`), `.ch-st[aria-busy]` | stats-team.test › CH-4402 |

## 46xx Motion

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-4601 | Focusing a player on the trend | Their line comes forward in green, the others fade back (180ms) | `TeamTrend` | preview |
| CH-4602 | Choosing a leg | The card takes the green ring and the grid column highlights (180ms) | `LegTrend`, `.is-col` | preview |

## 47xx Haptics

| # | When | They feel | How | Test |
| --- | --- | --- | --- | --- |
| CH-4701 | Choosing a leg, focusing a player, changing the window or lens | A selection tick | `TeamCharts` `haptic('select')`, `Segmented` | stats-team.test › CH-4701 |
| CH-4702 | An export lands / fails | The OS success pattern / the OS error pattern (D-70) | `TeamHeadActions` export | stats-team.test › CH-4702 |
| CH-4703 | Sorting the phone's players by Avg or SG | A selection tick; the current sort is silent | `StatsTeamPhone` `Segmented` | stats-team.test › phone players sort |
| CH-4704 | Choosing a round type, a length (18 holes, 9 holes, Both), a course or a round in the filter sheet, choosing a window or a pick mode there, or removing a chip / Clear | A selection tick. Done is a primary button and taps lightly; a range error plays the warning pattern (CH-4101) | `StatsFilter` (`haptic('select')`, `Checkbox`, `Segmented`), `haptic('warning')` | stats-filter-ui.test › CH-4101 |

## 48xx Accessibility

| # | What | How | Test |
| --- | --- | --- | --- |
| CH-4801 | The trend chart is an image with a written summary ("Strokes gained by week. The team has gained about 1.0 a round…"); the player list beside it is the chart's values as buttons | `role="img"`, `aria-label` | stats-team.test › CH-4801 |
| CH-4802 | The strokes gained grid is a table with a header for every value | `role="table|row|cell|columnheader"` | stats-team.test › CH-4802 |
| CH-4803 | Loss amber on a tinted grid cell is darkened to hold 4.5:1 | `--ch-chart-loss-on-tint` | a11y scan |
| CH-4804 | No axe violations in any preview state, 1280px and 390px | `npm run clubhouse:a11y` | a11y scan |
| CH-4805 | The phone's scoring line is an image with a written reading ("Team scoring average by week, from 74.8 to 73.4. Down 1.4 strokes…"); each player row is one link read as name, rounds, average and strokes gained ("Early read" under three rounds) | `ScoreLine` `role="img"`; `.ch-stm-row` | stats-team.test › phone view |
| CH-4806 | The round filter: the Filter button says it opens a dialog and how many filters are on; each chip is a button named "Remove filter: Tournament"; Clear is "Clear filters"; the count line is a polite status region; the sheet is a labelled dialog whose groups (Round type, Holes, Time, Course, Pick rounds) are labelled, round type, holes and pick mode are toggle buttons (`aria-pressed`), courses and rounds are checkboxes in labelled lists, and the dates are labelled inputs whose error is their description | `StatsFilter`, `Modal`, `Checkbox`, `Segmented` | stats-filter-ui.test › CH-4806; a11y scan |

## 49xx Network and UX

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-4901 | Changing the window (the switch, or Show the season) or the round filter while offline | "Couldn't open the season: you're offline" + "Reconnect, then try again. The figures shown are still the last 10 rounds." A filter change says "Couldn't apply the filter: you're offline" + "Reconnect, then try again. The figures shown are still the rounds you had." Nothing is requested, the control stays where it was, and the OS error pattern plays | `StatsTeamFrame` `go`, `isOffline` | stats-team.test › CH-4901 |
| CH-4902 | A window or filter change takes longer than 5 seconds | "Still loading the season…" + "This is taking longer than usual. The figures shown are still the last 10 rounds.", once (a filter change: "Still loading the filtered rounds…"); the page stays dimmed and busy (CH-4402) until the new window lands | `StatsTeamFrame`, `CH_SLOW_SAVE_AFTER` | stats-team.test › CH-4902 |
