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
| CH-4209 | D1 benchmarks don't load | Greens and putting bands compare with the sample instead of "D1 averages 67%"; nothing claims a benchmark it doesn't have | `loadTeamStats`; logged `clubhouse.stats.d1Benchmarks` | stats-team.test › CH-4209 |
| CH-4210 | The team's own details (name, men's or women's) don't load | The header reads "Your team"; greens and putting compare with the sample and the trend's dashed line is "the baseline", so no benchmark of the wrong tour is claimed | `loadTeamStats`; logged `clubhouse.stats.team` | stats-team.test › CH-4210 |

## 43xx Empty

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-4301 | No 18-hole rounds in the window | "No 18-hole rounds in this window yet." + "Team stats fill in as players post countable rounds." + Show the season | `StatsTeam` | stats-team.test › CH-4301 |
| CH-4302 | No qualifier rounds | "No qualifier rounds this season yet." + "Qualifier rounds appear here once they are posted as qualifying." + Show the season | `StatsTeam` | stats-team.test › CH-4302 |
| CH-4303 | No strokes gained in the window | "No strokes gained in this window." + "Strokes gained appears for rounds posted with shots." | `TeamTrend` | stats-team.test › CH-4303 |
| CH-4304 | No scores in the window (Scoring lens) | "No scores in this window." | `TeamTrend` | stats-team.test › CH-4304 |
| CH-4305 | No player has a round in the window | "No player rounds in this window." in the grid's place | `LegGrid` | stats-team.test › CH-4305 |
| CH-4306 | No putts logged | "No putts logged in this window." + "Putting fills in from rounds posted with putt distances." | `TeamPutting` | stats-team.test › CH-4306 |
| CH-4307 | No season bests yet | "No season bests yet." + "Low round, most birdies and the rest appear once rounds are posted." | `SeasonBests` | stats-team.test › CH-4307 |
| CH-4308 | A player has too few rounds for strokes gained | "Early read" in Total, dashes in the leg cells; never 0.0 | `LegGrid` | stats-team.test › CH-4308 |
| CH-4309 | A coach or player with no team | "You aren't on a team yet." + what fills in once they are | `StatsNoTeam` (route) | stats-player.test › CH-4309 |

## 44xx Loading

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-4401 | Stats is loading (team or player) | The page's header, five figure cards and chart frames as skeletons, each line and card sized like the loaded Team stats so nothing below moves when it lands | `StatsSkeleton`, `aria-busy` | stats-team.test › CH-4401 |
| CH-4402 | Changing the window (Last 10, Season, Qualifiers) | The page dims slightly and is marked busy until the new window lands; the scroll position stays | `StatsTeamFrame` (`useTransition`), `.ch-st[aria-busy]` | preview |

## 46xx Motion

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-4601 | Focusing a player on the trend | Their line comes forward in green, the others fade back (180ms) | `TeamTrend` | preview |
| CH-4602 | Choosing a leg | The card takes the green ring and the grid column highlights (180ms) | `LegTrend`, `.is-col` | preview |

## 47xx Haptics

| # | When | They feel | How | Test |
| --- | --- | --- | --- | --- |
| CH-4701 | Choosing a leg, focusing a player, changing the window or lens | A selection tick | `TeamCharts` `haptic('select')`, `Segmented` | stats-team.test › CH-4701 |
| CH-4702 | An export lands / fails | A medium tap / the OS error pattern | `TeamHeadActions` export | preview |

## 48xx Accessibility

| # | What | How | Test |
| --- | --- | --- | --- |
| CH-4801 | The trend chart is an image with a written summary ("Strokes gained by week. The team has gained about 1.0 a round…"); the player list beside it is the chart's values as buttons | `role="img"`, `aria-label` | stats-team.test › CH-4801 |
| CH-4802 | The strokes gained grid is a table with a header for every value | `role="table|row|cell|columnheader"` | stats-team.test › CH-4802 |
| CH-4803 | Loss amber on a tinted grid cell is darkened to hold 4.5:1 | `--ch-chart-loss-on-tint` | a11y scan |
| CH-4804 | No axe violations in any preview state, 1280px and 390px | `npm run clubhouse:a11y` | a11y scan |

## 49xx Network and UX

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-4901 | Changing the window (the switch, or Show the season) while offline | "Couldn't open the season: you're offline" + "Reconnect, then try again. The figures shown are still the last 10 rounds." Nothing is requested, the switch stays where it was, and the OS error pattern plays | `StatsTeamFrame` `go`, `isOffline` | stats-team.test › CH-4901 |
| CH-4902 | A window change takes longer than 5 seconds | "Still loading the season…" + "This is taking longer than usual. The figures shown are still the last 10 rounds.", once; the page stays dimmed and busy (CH-4402) until the new window lands | `StatsTeamFrame`, `CH_SLOW_SAVE_AFTER` | stats-team.test › CH-4902 |
