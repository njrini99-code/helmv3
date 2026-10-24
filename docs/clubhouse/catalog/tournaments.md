# Tournaments catalog (16xxx)

Page P016 (`config/clubhouse/pages/P016-tournaments.json`; plan: the handoff's
section 4.33). Routes, once wired (Phase 7, behind `golf_tournaments_v1`):
`/golf/dashboard/tournaments` and its children in plan 14.1. Until then every
view renders in the preview only (`/clubhouse-preview/tournament*`).

Numbers are `CH-16` + the kind digit + a two-digit serial. Several lanes build
this page in parallel, so each owns a serial range in every kind and never
writes a number outside it (`src/clubhouse/screens/tournaments/README.md` has
the file ownership):

| Serials | Owner |
| --- | --- |
| 01–09 | base (page-level states, the placeholders, shared pieces) |
| 10–19 | home |
| 20–34 | desk (desk, who counted, holes, evidence drawer) |
| 35–44 | review (review, history, link inbox) |
| 45–59 | compare |
| 60–69 | lineup (event form, lineup builder) |
| 70–89 | live |
| 90–99 | player |

The plan's provisional codes (CH-16009 NoTeam, CH-16010 NotFound, CH-16011
CoachOnly, CH-16400 to 16418, 16420 to 16424, 16460 to 16463 and 16520 to
16532) were never used; each lane re-slots the ones it builds into its own range
with the right kind digit (plan 0.4, item 7). A row is added with the code that
uses it and the test that names it; then `node scripts/clubhouse/registry.mjs
sync` mints its Bridge ID.

## 160xx Error toasts

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |

## 161xx Validation

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |

## 162xx Didn't load

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-16201 | A Tournaments view's one read fails (any view; `load: 'failed'`) | The view's head, then "Tournaments didn’t load" + "Nothing is lost. Your events and scores are still saved; try again in a moment." + Try again (which re-runs the server render; offline it says so, CH-1905) | `TourPlaceholder` → `EmptyState size="page" tone="danger"`; a built view keeps this code for its page failure | tournaments/views.test › CH-16201 |
| CH-16210 | Home: the events read fails while the page itself loads (`errors.events`) | The head stays, then "The events didn’t load" + "Nothing has changed. Try again; the error has been reported." + Try again; never an empty ledger or "No tournaments yet" | `InlineNotice` in `TournamentsHome` | tournaments-home.test › CH-16210 |
| CH-16220 | Event desk, Holes tab: the scorecards read fails (`errors.holes`) | "The scorecards didn’t load" + "Team scores are unaffected. Try again; the error has been reported." + Try again, in place of the grid; never "No hole-by-hole scores yet" | `InlineNotice` in `HoleGrid` | tournaments-desk.test › CH-16220 |
| CH-16221 | Event desk: the field read fails (`errors.field`) | Under the head: "The field didn’t load" + "Where the team finished needs the field, so it is left out for now. Scores are unaffected. Try again; the error has been reported." + Try again; the scores stay | `InlineNotice` in `EventDesk` | tournaments-desk.test › CH-16221 |
| CH-16222 | Event desk, Overview and Who counted: the rounds read fails (`errors.rounds`) | "The rounds didn’t load" + "Scores are saved; they just can’t be shown right now. Try again; the error has been reported." + Try again, in place of the table | `InlineNotice` in `EventDesk` | tournaments-desk.test › CH-16222 |

## 163xx Empty

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-16301 | A view its lane hasn't built yet (preview only: no route serves Tournaments yet) | The view's head, then "[View] isn’t built yet", one line read from the view's data, and "Its data, types and preview states are ready." It goes when the last placeholder does | `TourPlaceholder` | tournaments/views.test › CH-16301 |
| CH-16310 | Home: no event in the season, nothing failed | The head (without Add event), then "No tournaments yet" + "Add your first event to see who counted, how the team finished and how it compares with qualifying and last season." + Add event (the page's one primary) | `EmptyState size="page"` in `TournamentsHome` | tournaments-home.test › CH-16310 |
| CH-16311 | The season ledger (Home, History): the season has no finished event yet | Under the season's heading, one line: "No finished events yet" + "Results show here once an event is complete." A past season with none is left out | `EmptyState compact` in `SeasonLedger` | tournaments-home.test › CH-16311 |
| CH-16312 | Home: no event is upcoming or live | In place of the next-event card, one line: "Nothing on the calendar" + "Add an event and it shows here with its lineup and travel." | `EmptyState compact` in `TournamentsHome` | tournaments-home.test › CH-16312 |
| CH-16320 | Event desk: the event has no scores yet (not played, nothing entered) | Where Who counted would be: "No scores yet" + "Scores show here as rounds are entered." + where the lineup stands ("Draft lineup · 4 of 5 set · locks Tue 7:50 AM.") and the event's note | `EmptyState compact` in `EventDesk` (`NoScores`) | tournaments-desk.test › CH-16320 |
| CH-16321 | Event desk, Holes tab: no scorecard has holes (a totals-only event, or none entered) | "No hole-by-hole scores yet" + "Holes show here once scorecards are in. Team scores use whole rounds either way." For one round with none: "Round 3 has no scorecards with holes." | `EmptyState compact` in `HoleGrid` | tournaments-desk.test › CH-16321 |

## 164xx Loading

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-16401 | A Tournaments view is on its way (`load: 'loading'`) | The head's eyebrow and title as placeholders, then the body's block, in place; the page is marked busy and named "Loading [view]" | `TourPlaceholder`; a built view replaces the placeholder with its own skeleton at its final geometry and keeps this code | tournaments/views.test › CH-16401 |

## 165xx Confirm

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |

## 166xx Motion

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-16601 | A value changes after first paint (a live score, a team total, a place) | It takes its new value in place (no rolling, D-100) and its cell is washed in `--ch-bg-selected` for 520 ms, then fades on `--ch-dur-reveal`. Never on first paint. Under reduced motion and Animations off the wash still shows; only its fade is skipped | `useChangedWash` + `.ch-tour-washable` / `.ch-tour-changed` (`styles/tournaments.css`) | tournaments/use-changed-wash.test |

## 167xx Haptics

| # | When | They feel | How | Test |
| --- | --- | --- | --- | --- |

## 168xx Accessibility

| # | When | They get | How | Test |
| --- | --- | --- | --- | --- |
| CH-16801 | A signed difference or a trust state is read | A delta says "Better by 1.4 strokes than his season average", "Worse by …" or "Level: … no clear change"; the triangle is hidden and points by better or worse, not by sign, so hue never carries the meaning alone. A trust chip says its state in words; the live dot and the check are hidden | `ui/DeltaChip.tsx`, `ui/TrustChip.tsx` | delta-chip.test, trust-chip.test |

## 169xx Network and UX

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-16920 | Event desk: the host's published number differs from our scorecard (`officialTotal` set and unequal) | A status note under the head: "Results are provisional" + "The imported leaderboard has Sofia at 73 in round 3. The scorecard says 74. Team totals use the scorecard until you confirm which is right." (and "2 more differ."). Shown, never silently picked (D-82) | `EventDesk` (`.ch-tour-desk-warn`, `role="status"`) | tournaments-desk.test › CH-16920 |
