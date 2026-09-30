# Stats (player) catalog (5xxx)

Route `/golf/dashboard/stats?player=<id>` (coach) and `/golf/dashboard/stats` (player) · code
`src/clubhouse/screens/stats/StatsPlayer.tsx`, `GameDetail.tsx`, loader `src/clubhouse/data/stats-player.ts` ·
tests `src/clubhouse/__tests__/stats-player.test.tsx` · preview `/clubhouse-preview/player`
(`?state=early|self|failed`).

Loading is the Stats skeleton (CH-4401). Each tab is its own component inside
its own boundary, so a crash stays inside the tab.

## 50xx Error toasts

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-5001 | Proposing a focus area fails | "Couldn't add the focus area for Jonah" + "Your text is still here. Try again in a moment." Retry; the sheet stays open with the text. Done: "Focus area proposed to Jonah. It starts when Jonah accepts." | `useAction('stats.addFocusArea')` | stats-player.test › CH-5001 |

## 51xx Validation

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-5101 | A focus area with a name under three characters | "Give it a short name, at least three characters." under the field, which takes focus; a warning haptic; nothing is sent | `FocusAreaSheet` | stats-player.test › CH-5101 |

## 52xx Didn't load

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-5201 | Rounds don't load | "Rounds didn't load." + "Posted rounds are safe…" Try again | `StatsPlayer`; logged `clubhouse.stats.rounds` | stats-player.test › CH-5201 |
| CH-5202 | Shot-level detail doesn't load | Game detail reads "Shot-level detail didn't load." + "Scores and rounds above are correct…" Try again, never zeros | `StatsPlayer`; logged `clubhouse.stats.detailedStats` | stats-player.test › CH-5202 |
| CH-5203 | Focus areas or goals don't load | "Some development items didn't load." Try again, above what did load | `Development`; logged | stats-player.test › CH-5203 |
| CH-5204 | The overview crashes | "The overview couldn't be shown." + "The rest of the page is fine…" Try again; the tabs still work | `SectionBoundary stats.player.overview` | stats-player.test › CH-5204 |
| CH-5205 | Game detail crashes | "Game detail couldn't be shown." … | `SectionBoundary stats.player.game` | stats-player.test › CH-5205 |
| CH-5206 | The rounds table crashes | "The rounds table couldn't be shown." … | `SectionBoundary stats.player.rounds` | stats-player.test › CH-5206 |
| CH-5207 | Development crashes | "Development couldn't be shown." … | `SectionBoundary stats.player.development` | stats-player.test › CH-5207 |
| CH-5208 | D1 benchmarks don't load | The D1 column reads "—"; no figure is compared with a benchmark it doesn't have | `loadPlayerProfile`; logged `clubhouse.stats.d1Benchmarks` | existing |

## 53xx Empty

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-5301 | No rounds with shots in the window | "No shot-by-shot rounds in this window." + "Game detail fills in from rounds posted hole by hole with shots. Totals-only rounds still count toward scoring." | `StatsPlayer` | stats-player.test › CH-5301 |
| CH-5302 | No rounds in the window | "No rounds in this window." + "Try This season to see every round posted since August." | `RoundsTable` | stats-player.test › CH-5302 |
| CH-5303 | No focus areas | "No focus areas yet." + (coach) "Add one from a weak leg in Game detail." / (player) "Your coach adds focus areas; they show here." | `Development` | stats-player.test › CH-5303 |
| CH-5304 | No goals | "No goals set." + who sets them | `Development` | stats-player.test › CH-5304 |
| CH-5305 | Fewer than three rounds in the window | "Early read. Luca has 2 countable rounds in this window, so averages and trends will move a lot. Strokes gained shows once there are three." | `StatsPlayer` | stats-player.test › CH-5305 |
| CH-5306 | A coach opens a player who isn't on their team | The page empty state (v2 medallion): "That player isn't on your team" + "They may have been removed, or the link is from another team." + Back to team stats | `NotOnTeam` (route) | stats-player.test › CH-5306 |
| CH-5307 | A player who isn't on an active roster | The page empty state (v2 medallion): "Your stats aren't available" + "You aren't on an active team roster right now." | `NotOnTeam` (route) | stats-player.test › CH-5307 |

## 54xx Loading

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-5401 | A focus area is being proposed | The button reads "Adding" and can't be pressed again | `FocusAreaSheet` | stats-player.test › CH-5401 |
| CH-5402 | Changing the window or the player (pager) | The page dims and is marked busy until it lands; the scroll position stays | `useTransition`, `.ch-st[aria-busy]` | preview |

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

## 58xx Accessibility

| # | What | How | Test |
| --- | --- | --- | --- |
| CH-5801 | The sections are real tabs: selected state, each controls its panel | `role="tablist|tab|tabpanel"`, `aria-controls`, `aria-labelledby` | stats-player.test › CH-5801 |
| CH-5802 | A coach sees "Stats › Jonah Okafor" in the top bar, as in the handoff | `usePageCrumbs` | stats-player.test › CH-5802 |
| CH-5803 | The strokes gained route is an image with every leg's value in words; the hero figures are a proper definition list | `role="img"`, `aria-label`; `dt`/`dd` only | stats-player.test › CH-5803 |
| CH-5804 | The focus-area field's name is just "What to work on"; its help or error is read as its description | `label htmlFor`, `aria-describedby`, `aria-invalid` | stats-player.test › CH-5101 |
| CH-5805 | No axe violations on every tab and state, 1280px and 390px | `npm run clubhouse:a11y` | a11y scan |
| CH-5806 | On a phone the rounds table scrolls sideways; it is a named region that takes focus, so the arrow keys scroll it | `ScrollRegion` | a11y scan |
