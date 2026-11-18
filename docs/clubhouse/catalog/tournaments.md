# Tournaments catalog (16xxx)

Page P016 (`config/clubhouse/pages/P016-tournaments.json`; plan: the handoff's
section 4.33). Routes, wired 2026-10-25 behind `golf_tournaments_v1` (off in
production): `/golf/dashboard/tournaments` and its children in plan 14.1; the
preview (`/clubhouse-preview/tournament*`) keeps drawing every state from
fixtures.

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
| CH-16210 | Home: the events read fails while the page itself loads (`errors.events`) | The head stays, then "The events didn’t load" + "Nothing has changed. Try again." + Try again; never an empty ledger or "No tournaments yet" | `InlineNotice` in `TournamentsHome` | tournaments-home.test › CH-16210 |
| CH-16220 | Event desk, Holes tab: the scorecards read fails (`errors.holes`) | "The scorecards didn’t load" + "Team scores are unaffected. Try again." + Try again, in place of the grid; never "No hole-by-hole scores yet" | `InlineNotice` in `HoleGrid` | tournaments-desk.test › CH-16220 |
| CH-16221 | Event desk: the field read fails (`errors.field`) | Under the head: "The field didn’t load" + "Where the team finished needs the field, so it is left out for now. Scores are unaffected. Try again." + Try again; the scores stay | `InlineNotice` in `EventDesk` | tournaments-desk.test › CH-16221 |
| CH-16222 | Event desk, Overview and Who counted: the rounds read fails (`errors.rounds`) | "The rounds didn’t load" + "Scores are saved; they just can’t be shown right now. Try again." + Try again, in place of the table | `InlineNotice` in `EventDesk` | tournaments-desk.test › CH-16222 |
| CH-16235 | Review (its own page and the desk's Review tab): the review read fails (`errors.review`) | "The review didn’t load" + "Nothing has changed. Try again." + Try again, in place of the layers; never "Nothing to review yet" | `InlineNotice` in `ReviewBody` | tournaments-review.test › CH-16235 |
| CH-16236 | History: the trend read fails (`errors.trend`) | Under "Across seasons": "The trend didn’t load" + "The events below are unaffected. Try again." + Try again; the ledger of every event stays | `InlineNotice` in `History` | tournaments-history.test › CH-16236 |
| CH-16250 | Compare: the rounds read fails (`errors.rounds`) | Under the head: "The rounds didn’t load" + "Nothing has changed. Try again." + Try again, in place of the presets, sides and grid; never "No rounds to compare yet" | `InlineNotice` in `Compare` | tournaments-compare.test › CH-16250 |
| CH-16251 | Compare: the field read fails (`errors.field`) | Above the grid: "The field didn’t load" + "Versus field needs it, so it is left blank. The other figures are unaffected. Try again." + Try again; Vs field reads "—" and every other figure stays | `InlineNotice` in `Compare` | tournaments-compare.test › CH-16251 |
| CH-16252 | Compare: the hole figures read fails (`errors.holes`) | Above the grid: "The hole figures didn’t load" + "Birdies, greens, fairways and putts are left blank. Scores and strokes gained are unaffected. Try again." + Try again | `InlineNotice` in `Compare` | tournaments-compare.test › CH-16252 |

## 163xx Empty

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-16301 | A view its lane hasn't built yet (the event form, lineup builder, link inbox, live round and player view; their routes are wired and draw it with real data) | The view's head, then "[View] isn’t built yet", one line read from the view's data, and "Its data, types and preview states are ready." It goes when the last placeholder does | `TourPlaceholder` | tournaments/views.test › CH-16301 |
| CH-16302 | A Tournaments route opens before the held migrations are applied (a tournament table or RPC is missing: PGRST205, 42P01, PGRST202) | The head, then "Tournaments aren’t set up yet" + (coach) "Your events, lineups and results show here once Tournaments is set up for your team. Nothing is missing: there is nothing saved here yet." (player) "Your team’s events show here once your coach’s Tournaments is set up." Never an empty season, never a crash | `TourNotice kind="not_set_up"`, from every loader's `not_set_up` (`data/tournaments.ts`) | tournaments-wired.test › CH-16302 |
| CH-16303 | A Tournaments route, signed in but on no team | "You aren’t on a team yet" + "Tournaments fill in once your team is set up." (a player: "…once a coach adds you to a team roster.") | `TourNotice kind="no_team"` in `routes/tournaments.tsx` | tournaments-wired.test › CH-16303 |
| CH-16304 | An event address that is not this team's (deleted, another team's, not an id) | "That event isn’t on your team" + "It may have been deleted, or the link is from another team." + Back to tournaments | `TourNotice kind="not_found"` | tournaments-wired.test › CH-16304 |
| CH-16305 | A player on a coach's Tournaments page (new or edit event, lineup, live, compare, history, link rounds) | "Only coaches open this page" + "You can see your team’s events and your own results in Tournaments." + See your tournaments | `TourNotice kind="coach_only"` | tournaments-wired.test › CH-16305 |
| CH-16310 | Home: no event in the season, nothing failed | The head (without Add event), then "No tournaments yet" + "Add your first event to see who counted, how the team finished and how it compares with qualifying and last season." + Add event (the page's one primary) | `EmptyState size="page"` in `TournamentsHome` | tournaments-home.test › CH-16310 |
| CH-16311 | The season ledger (Home, History): the season has no finished event yet | Under the season's heading, one line: "No finished events yet" + "Results show here once an event is complete." A past season with none is left out | `EmptyState compact` in `SeasonLedger` | tournaments-home.test › CH-16311 |
| CH-16312 | Home: no event is upcoming or live | In place of the next-event card, one line: "Nothing on the calendar" + "Add an event and it shows here with its lineup and travel." | `EmptyState compact` in `TournamentsHome` | tournaments-home.test › CH-16312 |
| CH-16320 | Event desk: the event has no scores yet (not played, nothing entered) | Where Who counted would be: "No scores yet" + "Scores show here as rounds are entered." + where the lineup stands ("Draft lineup · 4 of 5 set · locks Tue 7:50 AM.") and the event's note | `EmptyState compact` in `EventDesk` (`NoScores`) | tournaments-desk.test › CH-16320 |
| CH-16321 | Event desk, Holes tab: no scorecard has holes (a totals-only event, or none entered) | "No hole-by-hole scores yet" + "Holes show here once scorecards are in. Team scores use whole rounds either way." For one round with none: "Round 3 has no scorecards with holes." | `EmptyState compact` in `HoleGrid` | tournaments-desk.test › CH-16321 |
| CH-16335 | Review: the event has a review that is not open yet (`review.open` is false: a round is not final) | "The review opens when every round is final" + "Until then the scores can still change, so nothing is concluded from them." | `EmptyState compact` in `ReviewBody` | tournaments-review.test › CH-16335 |
| CH-16336 | Review: the event has no review (not played, nothing to read) | "Nothing to review yet" + "The review is written once the event has scores." | `EmptyState compact` in `ReviewBody` | tournaments-review.test › CH-16336 |
| CH-16337 | Review: the review is open and has no notes or reflections | Under "Notes and reflections": "No notes or reflections yet" + "A coach’s note or a player’s reflection shows here once it is written." | `EmptyState compact` in `ReviewBody` | tournaments-review.test › CH-16337 |
| CH-16340 | History: no event is finished (the read worked) | The head (without Add event), then "No results to compare yet" + "Once events are finished, the team’s scoring against the course rating shows here, season by season." + Add event (the page's one primary) | `EmptyState size="page"` in `History` | tournaments-history.test › CH-16340 |
| CH-16350 | Compare: a side selects no rounds (a player with none in that context or period) | In that side's summary: "No rounds in this sample" (the phone's card says the same under the side's label); its figures read "—" with "No data", and the difference says "No rounds on one side"; the other side is unchanged | `SummaryLine` and the phone's scope card in `Compare` | tournaments-compare.test › CH-16350 |
| CH-16351 | Compare: there are no rounds at all (the read worked) | The head, then "No rounds to compare yet" + "Rounds from events, qualifiers and practice show here once they are in, and you can set any two samples side by side." | `EmptyState size="page"` in `Compare` | tournaments-compare.test › CH-16351 |

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
