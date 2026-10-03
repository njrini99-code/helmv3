# Stats (player) catalog (5xxx)

Route `/golf/dashboard/stats?player=<id>` (coach) and `/golf/dashboard/stats` (player) · code
`src/clubhouse/screens/stats/StatsPlayer.tsx`, `GameDetail.tsx`, loader `src/clubhouse/data/stats-player.ts` ·
tests `src/clubhouse/__tests__/stats-player.test.tsx` · preview `/clubhouse-preview/player`
(`?state=early|self|failed`).

Loading is the profile skeleton (CH-5403); the team page's is CH-4401. Each tab is its own component inside
its own boundary, so a crash stays inside the tab.

## 50xx Error toasts

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-5001 | Proposing a focus area fails | "Couldn't add the focus area for Jonah" + "Your text is still here. Try again in a moment." Retry; the sheet stays open with the text. Done: "Focus area proposed to Jonah. It starts when Jonah accepts." | `useAction('stats.addFocusArea')` | stats-player.test › CH-5001 |
| CH-5002 | Sharing a player's stats from the phone fails (the browser blocks the clipboard) | "Couldn't share the link" + "Your browser blocked it. Try again, or copy the address from the browser." Error haptic. Closing the share sheet is not a failure. Done: "Link copied" | `StatsPlayerPhone` share | stats-player.test › CH-5002 |
| CH-5003 | A player's Accept of a proposed focus area fails | "Couldn’t accept Lag putting" + Retry; it stays waiting. Done: "Started · Lag putting" and the page reads again | `useAction('stats.acceptFocusArea')` in `ProposalAnswer` → `acceptFocusArea` | stats-player.test › CH-5003 |
| CH-5004 | A player's Decline of a proposed focus area fails | "Couldn’t decline Lag putting" + Retry; it stays waiting. Done: "Declined · Lag putting" | `useAction('stats.declineFocusArea')` in `ProposalAnswer` → `declineFocusArea` | stats-player.test › CH-5004 |

## 51xx Validation

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-5101 | A focus area with a name under three characters | "Give it a short name, at least three characters." under the field, which takes focus; a warning haptic; nothing is sent | `FocusAreaSheet` | stats-player.test › CH-5101 |
| CH-5102 | The filter's date range starts after it ends, and Done is tapped | "The start date is after the end date. Swap them, or clear one." under the dates, which are marked invalid; the start date takes focus and a warning plays; nothing is requested and the sheet stays open | `FilterSheet` in `StatsFilter` (`aria-invalid`, `aria-describedby`) | stats-filter-ui.test › CH-5102 |

## 52xx Didn't load

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-5201 | Rounds don't load | "Rounds didn't load." + "Posted rounds are safe. Every figure that reads them would be incomplete, so they're hidden." Try again. The hero reads "—" for scoring average, strokes gained and the season's rounds, the Rounds tab and the phone's header carry no count, no early-read note shows, and the Overview, Game detail and Rounds tabs draw no figure and no empty state (Development still shows) | `StatsPlayer`; logged `clubhouse.stats.rounds` | stats-player.test › CH-5201 |
| CH-5202 | Shot-level detail doesn't load | Game detail reads "Shot-level detail didn't load." + "Scores and rounds above are correct…" Try again, never zeros | `StatsPlayer`; logged `clubhouse.stats.detailedStats` | stats-player.test › CH-5202 |
| CH-5203 | Focus areas or goals don't load | "Some development items didn't load." Try again, above what did load | `Development`; logged | stats-player.test › CH-5203 |
| CH-5204 | The overview crashes | "The overview couldn't be shown." + "The rest of the page is fine…" Try again; the tabs still work | `SectionBoundary stats.player.overview` | stats-player.test › CH-5204 |
| CH-5205 | Game detail crashes | "Game detail couldn't be shown." … | `SectionBoundary stats.player.game` | stats-player.test › CH-5205 |
| CH-5206 | The rounds table crashes | "The rounds table couldn't be shown." … | `SectionBoundary stats.player.rounds` | stats-player.test › CH-5206 |
| CH-5207 | Development crashes | "Development couldn't be shown." … | `SectionBoundary stats.player.development` | stats-player.test › CH-5207 |
| CH-5208 | Tour benchmarks don't load, or the team's own row (its men's or women's tour) doesn't | With no benchmark at all the profile leaves the Tour column out and each figure's context reads the sample ("10 rounds") instead of "vs. Tour"; when only some benchmarks exist the rest of the column reads "—". An unknown tour reads no benchmark, so a women's team is never graded against the men's | `loadPlayerProfile`; logged `clubhouse.stats.tourBenchmarks` / `clubhouse.stats.team` | stats-player.test › CH-5208 |
| CH-5209 | The hole read fails (the window's scored holes) | Scoring › More detail › Toughest holes reads "Toughest holes didn't load." + "The rest of Game detail is correct. Try again; the error has been reported." The table's Opening hole row is a dash, never "no holes" | `loadHoles`; logged `clubhouse.stats.holes` | stats-parity.test › CH-5209 |
| CH-5210 | The approach-shot read fails | Approach › Proximity against the Tour reads "Proximity against the Tour didn't load." + Try again; the table's three proximity rows are dashes. The rest of Game detail stays | `loadApproachShots`; logged `clubhouse.stats.approachShots` | stats-parity.test › CH-5210 |
| CH-5211 | The putt read fails | Putting › Make rate by distance: "Putts past 20 feet didn't load." + Try again; the curve stops at 20 feet, where the shot stats end | `loadPutts`; logged `clubhouse.stats.putts` | strokes-gained.test › CH-5211 |
| CH-5212 | The spray read throws | Off the tee and Approach › Where shots finish: "Where shots finish didn't load." + Try again. (Production's own action answers a failed read with an empty response, so that failure reads as CH-5315, not this) | `loadSpray`; logged `clubhouse.stats.spray` | stats-parity.test › CH-5212 |
| CH-5213 | The round cache doesn't load | "Some round figures didn't load." + Try again above the overview figures | `loadRoundCache`; logged `clubhouse.stats.roundCache` | stats-player.test › CH-5213 |

## 53xx Empty

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-5301 | No rounds with shots in the window | "No shot-by-shot rounds in this window." + "Game detail fills in from rounds posted hole by hole with shots. Totals-only rounds still count toward scoring." | `StatsPlayer` | stats-player.test › CH-5301 |
| CH-5302 | No rounds in the window | "No rounds in this window." + "Try This season to see every round posted since August." | `RoundsTable` | stats-player.test › CH-5302 |
| CH-5303 | No focus areas | "No focus areas yet." + (coach) "Add one from a weak leg in Game detail." / (player) "Your coach adds focus areas; they show here." | `Development` | stats-player.test › CH-5303 |
| CH-5304 | No goals | "No goals set." + who sets them | `Development` | stats-player.test › CH-5304 |
| CH-5305 | Fewer than three whole rounds in the window (or under the round filter; a 9-hole round counts as half) | "Early read. Luca has 2 countable rounds in this window, so averages and trends will move a lot. Strokes gained shows once there are three." With 9-hole rounds in it says how the whole rounds come out: "4 countable rounds, 2 counting 9-hole rounds as half" | `StatsPlayer`, `StatsPlayerPhone`; keys on `win.effRounds` | stats-player.test › CH-5305; stats-filter-ui.test › CH-5305 |
| CH-5306 | A coach opens a player who isn't on their team | The page empty state (v2 medallion): "That player isn't on your team" + "They may have been removed, or the link is from another team." + Back to team stats. Also for a link whose id is not an id, and for a pending or removed member; a read that fails raises the route error view instead (Try again), never this | `NotOnTeam` (route); `loadPlayerProfile` returns null | stats-player.test › CH-5306 |
| CH-5307 | A player who isn't on an active roster | The page empty state (v2 medallion): "Your stats aren't available" + "You aren't on an active team roster right now." Reached only when the team resolved but the roster has no row for the player when the profile is read; a player with no active team at all sees CH-4309, "You aren't on a team yet" | `NotOnTeam` (route) | stats-player.test › CH-5307 |
| CH-5308 | Three or more rounds in the window but fewer than three with shots (strokes gained needs three rounds posted with shots) | "Strokes gained needs three rounds posted with shots. Jonah has 1 of 5 rounds with shots in this window (with 9-hole rounds in: "4 of 6 rounds with shots (2 counting 9-hole rounds as half)"), so strokes gained shows a dash until there are three." (the phone says "You have" to a player). Fewer than three rounds keeps CH-5305 | `StatsPlayer`, `StatsPlayerPhone`; keys on `win.effSgRounds`, the rounds with shots in whole rounds | strokes-gained.test › CH-5308 |
| CH-5309 | Phone: no strokes gained in the window (no leg and no total) | The Strokes gained panel reads "No strokes gained in this window." + "Strokes gained by leg appears after three rounds with shots." instead of bars of dashes | `StrokesGained` in `StatsPlayerPhone` | strokes-gained.test › CH-5309 |
| CH-5310 | The last-10 window has no earlier rounds to set strokes gained against (none, or fewer than three with shots) | Under the SG / round figure, where the change chip would be: "No earlier rounds" (or "Too few earlier rounds with shots"). The season and qualifier windows have no previous window by design and say nothing | `SgChangeChip` in `StatsPlayer` (hero) and `StatsPlayerPhone`; `sgChange` in `stats-common` | strokes-gained.test › CH-5310 |
| CH-5311 | Holes were scored in the window but none has been played three times | Toughest holes: "Need 3+ plays of a hole before it can be ranked. No hole has been played that often in this window yet." | `ScoringMore` (`toughestHoles`, `belowFloor`) | stats-parity.test › CH-5311 |
| CH-5312 | A round type with no rounds in the window (practice, qualifying, tournament) | By round type: the tile reads "—" and "No rounds", never an average of nothing | `ScoringMore` | stats-parity.test › CH-5312 |
| CH-5313 | The Rounds tab has no earlier window to compare with | "Needs 3 earlier 18-hole rounds: this window has fewer than 13 in the season." (Last 10), "Needs 3 earlier rounds before the newest 10 that match these filters, counting a 9-hole round as half." (Last 10 with 9 holes or Both), "The season has no earlier window to compare with." (Season), "Qualifier rounds have no earlier window to compare with." (Qualifiers) | `RoundsExtra` | stats-parity.test › CH-5313 |
| CH-5314 | A per-round line has fewer than two rounds with the figure (score by round, fairways, greens, putts) | "A line needs two rounds with fairway holes; this window has 1." (the score line: "A line needs two rounds; this window has 1.") | `ByRound` in `GameMore`, `RoundsExtra` | stats-parity.test › CH-5314 |
| CH-5315 | No tee shots or approaches with a finish are logged in the window | Where shots finish: "No tee shots with a finish are logged in this window." / "No approach shots with a finish are logged in this window." | `TeeMore`, `ApproachMore` | stats-parity.test › CH-5315 |
| CH-5316 | Approach proximity against the Tour: a range under 10 shots, or no approaches with a finish distance | The range is left ungraded and named: "175+ yards: 7 shots, under 10"; with none: "No approach shots with a finish distance are logged in this window." | `GameDetail` | stats-parity.test › CH-5316 |
| CH-5317 | A More detail panel with no data behind it (outcomes by par, hole-out, toughest holes, fairways by tee type, tee miss by club, strokes to hole out, misses by distance, sand saves, up and downs, up and down by miss direction, finish after the chip, putting by distance, break tables, practice target, the Tour table) | One plain line in the panel, in its own words ("No par 4 or par 5 tee shots are logged in this window."; "No distance and break has 8 putts yet, so there is no reliable practice target."); a figure with none is a dash | `GameMore` (`Empty`) | stats-parity.test › CH-5317 |
| CH-5318 | A standing-table row is under its sample floor | Under the row's label, while it has no value: "Needs 10 approaches from the range.", "Needs 10 putts in the band.", "Needs 3 tournament or qualifier rounds and 3 practice rounds.", "Needs 5 rounds scored hole by hole." | `FieldTable` | stats-parity.test › CH-5318 |
| CH-5319 | The window has more 18-hole rounds than the shot-level reads take (100) | Under the Game detail tabs: "This window has more rounds than the shot-level figures read, so they cover the newest 100." | `GameDetail` (`extra.truncated`) | stats-parity.test › CH-5319 |
| CH-5320 | The round filter leaves none of this player's rounds | "No rounds match these filters." + "Try a wider time, fewer round types, or clear the filters to see every round again." + Clear filters, in place of the Overview, Game detail and Rounds content (on the phone, above Development). Development stays: focus areas and goals do not depend on rounds. No "early read" of nothing (CH-5305 and CH-5308 are not shown). The Filter button, the chips and the count line stay | `FilterEmpty` in `StatsPlayer`, `StatsPlayerPhone` | stats-filter-ui.test › CH-5320 |
| CH-5321 | The sheet's round list (Only these, Exclude these) has nothing to offer | "No rounds to pick from." + "Nothing matches the round type, course and time above. Widen them, then pick." Or, when the range starts before the season, "Rounds before Aug 1 load once the range is applied. Apply it, then open Filter again to pick among them." | `FilterSheet` | stats-filter-ui.test › CH-5321 |
| CH-5322 | The sheet's round list is cut at 200 rounds | "Showing the newest 200 of 250 rounds. Narrow the time or the course to reach the rest." under the list | `FilterSheet`, `PICK_LIST_MAX` | stats-filter-ui.test › CH-5322 |
| CH-5323 | The filter lets 9-hole rounds in (Holes: 9 holes or Both) | A note under the count line: "Per-round figures are per 18 holes: a 9-hole round counts as half a round." The chip reads "9 holes" or "18 and 9 holes". Scoring, putts, birdies, strokes gained and the trend are per 18 holes (a 9-hole score is doubled, and the lines say so); the rates pool the holes; personal bests list 18-hole and 9-hole rounds apart; Game detail says how the rounds count. At the default of 18 holes it says nothing | `StatsFilter`, `GameDetail`, `RoundsExtra` (desktop and phone) | stats-filter-ui.test › CH-5323 |
| CH-5324 | No round of the default length (18 holes), but this player has 9-hole rounds in this window | Above the figures: "Jonah has 9-hole rounds in this window, which the 18-hole view leaves out. Choose 9 holes or Both in Filter to see them." (a player sees "You have"). Not shown when a filter is on (that is CH-5320), when there are rounds to show, or when Both would show nothing in this window | `NineHint` (`StatsPlayer`, `StatsPlayerPhone`) | stats-filter-ui.test › CH-5324 |

## 54xx Loading

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-5401 | A focus area is being proposed | The button reads "Adding" and can't be pressed again | `FocusAreaSheet` | stats-player.test › CH-5401 |
| CH-5402 | Changing the window, the round filter or the player (pager) | The page dims and is marked busy until the new rounds land; the scroll position stays | `useTransition`, `.ch-st[aria-busy]` | stats-player.test › CH-5402 |
| CH-5403 | A player's stats are loading: their own, or a coach's `?player=` | The profile's shape in place: hero with avatar, name and four figures, the tabs and the window switch, then a chart frame (the team page keeps CH-4401) | `StatsProfileSkeleton` via `StatsRouteSkeleton` in the route's loading.tsx (the shell's role and `?player=`) | stats-player.test › CH-5403 |
| CH-5404 | A player's answer to a proposed focus area is being sent | The pressed button reads "Accepting" or "Declining" and both are disabled until it lands | `ProposalAnswer` | stats-player.test › CH-5404 |

## 56xx Motion

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-5601 | Changing tabs | The underline slides to the new tab (260ms) | `layoutId` on `.ch-tab-t__bar` | preview |
| CH-5602 | Opening Add focus area | The sheet rises and fades in (260ms) | `Modal` | preview |

## 57xx Haptics

| # | When | They feel | How | Test |
| --- | --- | --- | --- | --- |
| CH-5701 | Changing tabs, the window, or paging players; choosing a Game detail leg | A selection tick | `haptic('select')` | stats-player.test › CH-5701 |
| CH-5702 | Proposing a focus area with no name | The OS warning pattern | `FocusAreaSheet` | stats-player.test › CH-5101 |
| CH-5703 | Choosing a round type, a length (18 holes, 9 holes, Both), a course or a round in the filter sheet, choosing a window or a pick mode there, or removing a chip / Clear | A selection tick. Done is a primary button and taps lightly; a range error plays the warning pattern (CH-5102) | `StatsFilter` (`haptic('select')`, `Checkbox`, `Segmented`), `haptic('warning')` | stats-filter-ui.test › CH-5102 |

## 58xx Accessibility

| # | What | How | Test |
| --- | --- | --- | --- |
| CH-5801 | The sections are real tabs: selected state, each controls its panel | `role="tablist|tab|tabpanel"`, `aria-controls`, `aria-labelledby` | stats-player.test › CH-5801 |
| CH-5802 | A coach sees "Stats › Jonah Okafor" in the top bar, as in the handoff | `usePageCrumbs` | stats-player.test › CH-5802 |
| CH-5803 | The strokes gained route is an image with every leg's value in words; the hero figures are a proper definition list | `role="img"`, `aria-label`; `dt`/`dd` only | stats-player.test › CH-5803 |
| CH-5804 | The focus-area field's name is just "What to work on"; its help or error is read as its description | `label htmlFor`, `aria-describedby`, `aria-invalid` | stats-player.test › CH-5101 |
| CH-5805 | No axe violations on every tab and state, 1280px and 390px | `npm run clubhouse:a11y` | a11y scan |
| CH-5806 | On a phone the rounds table scrolls sideways; it is a named region that takes focus, so the arrow keys scroll it | `ScrollRegion` | a11y scan |
| CH-5807 | On the phone, "All N rounds" is a button that says whether the full list is open; Game detail's section chips say which one is showing | `aria-expanded`; `aria-pressed` | stats-player.test › phone rounds |
| CH-5808 | In the Rounds table each course opens that round's review (for a coach and the player), named "Finley GC, Oct 14: open the round"; where the review isn't rebuilt, it stays text | `RoundsTable`, `rebuiltHref` | stats-player.test › CH-5808 |
| CH-5809 | The round filter, as on Team stats (CH-4806): the Filter button opens a labelled dialog, each chip is "Remove filter: …", Clear is "Clear filters", the count line is a polite status region, choices (round type, holes, pick mode) are toggle buttons and courses and rounds are checkboxes, all in labelled groups, and the date fields carry their error as their description | `StatsFilter`, `Modal` | stats-filter-ui.test › CH-4806; a11y scan |

## 59xx Network and UX

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-5901 | Changing the window (the switch, on desktop or the phone) or the round filter while offline | "Couldn't open the season: you're offline" + "Reconnect, then try again. The figures shown are still the last 10 rounds." A filter change says "Couldn't apply the filter: you're offline" + "Reconnect, then try again. The figures shown are still the rounds you had." Nothing is requested, the control stays where it was, and the OS error pattern plays | `StatsPlayer` `changeWindow`, `isOffline` | stats-player.test › CH-5901 |
| CH-5902 | A window or filter change takes longer than 5 seconds | "Still loading the season…" + "This is taking longer than usual. The figures shown are still the last 10 rounds.", once (a filter change: "Still loading the filtered rounds…"); the page stays dimmed and busy (CH-5402) until the new window lands | `StatsPlayer`, `CH_SLOW_SAVE_AFTER` | stats-player.test › CH-5902 |
| CH-5903 | A window or filter change is in flight (after a beat of 150 ms; one that lands at once never shows it) | A pill under the top bar names the figures still on screen: "Showing the last 10 rounds, loading the season" (a filter change: "Showing the rounds you had, applying the filter"). The switch has already moved to the new choice; the figures stay, dimmed (CH-5402), and this keeps them from being read as the new period. A quick change back to what is on screen (Season, Qualifiers, Season) ends with the last tap: no pill and no CH-5902 notice. Fixed, so it moves nothing | `UpdatingNote` in `StatsPlayer` | stats-player.test › CH-5903 |
