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
| 80–89 in kinds 0–5, 8 and 9 | launch readiness (QUEUE lr-f01 to lr-f07, the Clubhouse parity & pages window; CH-16680 to CH-16685 stay Live rounds’) |

The plan's provisional codes (CH-16009 NoTeam, CH-16010 NotFound, CH-16011
CoachOnly, CH-16400 to 16418, 16420 to 16424, 16460 to 16463 and 16520 to
16532) were never used; each lane re-slots the ones it builds into its own range
with the right kind digit (plan 0.4, item 7). A row is added with the code that
uses it and the test that names it; then `node scripts/clubhouse/registry.mjs
sync` mints its Bridge ID.

## 160xx Error toasts

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-16050 | Stop tracking confirmed on the desk (CH-16550) and written (P-5) | "Pinehurst Invitational is no longer tracked. Its calendar entries stay." No Undo: the tournament's own rows are gone; the season home opens | `deskTrackToast`, `DeskTrackMenu` | tournaments-p5.test › CH-16050 |
| CH-16051 | Cancel tournament confirmed on the desk (CH-16551) | "Pinehurst Invitational is cancelled" with Undo. Shown cancelled at once; written when the toast goes or the page is left, so Undo sends nothing | `deskTrackToast`, `DeskTrackMenu` | tournaments-p5.test › CH-16051 |
| CH-16052 | Restore tournament on the desk | "Pinehurst Invitational is back on the calendar". Written at once, no Undo | `deskTrackToast`, `DeskTrackMenu` | tournaments-p5.test › CH-16052 |
| CH-16053 | Stop tracking refused: the results are official | "This tournament’s results are official, so it can’t stop being tracked." | refusal `tournament_official` (`golf_tournament_untrack`) | tournaments-p5.test › CH-16053 |
| CH-16038 | Link rounds: linking a GolfHelm round to an event round fails or is refused | Error toast "Couldn’t link Eli’s round" + the server’s words (for example "That player isn’t in this round’s lineup.") + Try again. The row stays and nothing is changed | `LinkRow` (`useAction`, `linkTournamentRound`) | tournaments-links.test › CH-16038 |
| CH-16039 | Link rounds: "Not a tournament round" fails | Error toast "Couldn’t dismiss Eli’s round" + the server’s words + Try again. The row stays | `LinkRow` (`useAction`, `dismissTournamentLink`) | tournaments-links.test › CH-16039 |
| CH-16060 | Edit event: the save is refused (stale, a round with scores, an out-of-order round, not a coach) | At the top of the form, "Couldn’t save the changes. Nothing was changed." + the server’s words. A stale event adds Reload the event. The fields keep what was typed | `EventForm` (`updateTournament`) | tournaments-eventform.test › CH-16060 |
| CH-16061 | Edit event: the changes are saved | Toast "Pinehurst Invitational is saved"; the event’s desk opens | `EventForm` | tournaments-eventform.test › CH-16061 |
| CH-16062 | Lineup: saving the draft fails or is refused (the event changed, the lineup is locked, too many players) | Error toast "Couldn’t save the lineup" + the server’s words + Try again. The draft stays on the page | `LineupBuilder` (`useAction`, `setTournamentEntries`) | tournaments-lineup.test › CH-16062 |
| CH-16063 | Lineup: publishing fails or is refused (the save before it is refused, or the publish itself) | Error toast "Couldn’t publish the lineup" + the server’s words + Try again. Nothing is published | `LineupBuilder` (`publishTournamentLineup`) | tournaments-lineup.test › CH-16063 |
| CH-16064 | Lineup: locking fails or is refused | Error toast "Couldn’t lock the lineup" + the server’s words + Try again. Nothing is locked | `LineupBuilder` (`lockTournamentLineup`) | tournaments-lineup.test › CH-16064 |
| CH-16070 | Live round: saving a score fails or is refused (not in the round’s lineup, not signed in, not set up) | Error toast "Couldn’t save Eli’s score" + the server’s words + Try again. The sheet stays open with what was typed | `ScoreSheet` (`useAction`, `enterTournamentScore`) | tournaments-live.test › CH-16070 |
| CH-16071 | Live round: starting, suspending, resuming or finishing the round fails or is refused (rounds out of order, a state it can’t move to) | Error toast "Couldn’t start the round" / "…suspend the round" / "…finish the round" + the server’s words + Try again. The round stays as it was | `LivePage` (`useAction`, `setTournamentRoundStatus`) | tournaments-live.test › CH-16071 |
| CH-16072 | Hole by hole: saving one hole fails or is refused (not in the round’s lineup, a total already entered, results official, not set up) | Error toast "Couldn’t save hole 7" + the server’s words + Try again. The sheet stays on that hole and the score is as it was. Used by the coach’s live round and the player’s own card | `HoleSheet` (`useAction`, `saveTournamentHole`) | tournaments-live.test › CH-16072 |
| CH-16092 | Player: saving their reflection fails or is refused | Error toast "Couldn’t save your reflection" + the server’s words + Try again. What they wrote stays in the box | `Reflection` (`useAction`, `saveTournamentReflection`) | tournaments-player.test › CH-16092 |
| CH-16080 | Import results: saving fails or is refused (the results are official, not a coach, a round that isn’t the event’s, a field row that isn’t) | Error toast “Couldn’t save the results” + the server’s words, or “Nothing new was lost. Try again; rounds already saved are left as they are.” + Try again. The check step stays as it was | `ImportResults` (`useAction`, `importTournamentResults`) | tournaments-import.test › CH-16080 |
| CH-16081 | Enter holes: saving the grid fails or is refused | Error toast “Couldn’t save the holes” + the server’s words + Try again. The grid keeps what was typed | `HoleEntry` (`useAction`, `importTournamentResults`) | tournaments-import.test › CH-16081 |
| CH-16082 | Export results fails: the browser refused the file (launch readiness F-02) | Error toast “Couldn’t export Oakmont’s results” + “Your browser didn’t take the file. Try again, or export from a computer.” Done: “Results exported · 12 teams, 5 players”. The key sits on Who counted (overview and its own tab) once there are scores | `EventDesk` → `ExportButton` (`resultsCsv`, `lib/csv.ts`) | exports.test › CH-16082 |

## 161xx Validation

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-16180 | Import results: the file can’t be read (the old binary .xls, a PDF, a picture, another type, a damaged file, over 8 MB, empty) | A title and the way forward for each reason, for example “This is the old Excel format” + “Open it in Excel or Numbers, save it as .xlsx or CSV, then choose it again.” Choose another file / Paste instead | `ImportResults` (`FAIL`, `readResultsBytes`) | tournaments-import.test › CH-16180 |
| CH-16181 | Import results: the file opened, but no column reads as players with scores | “No scores found” + “Set the columns above: the player names, then the holes or the round scores.” The column editor opens on its own, with a peek at the sheet’s first rows | `ImportResults` (`CheckView`, `ColumnEditor`) | tournaments-import.test › CH-16181 |
| CH-16182 | Enter holes: a cell can’t be saved (not a whole number, over 15 strokes, a saved hole emptied) | The cell is marked invalid and a line under the grid names it: “Ava Lindqvist, hole 3: A saved hole can be changed here, not emptied.” Save stays off until it is fixed | `HoleEntry` (`gridErrors`) | tournaments-import.test › CH-16182 |
| CH-16183 | Import results: Read results with nothing pasted | “Paste the results first.” under the box; nothing is read | `ImportResults` | tournaments-import.test › CH-16183 |

## 162xx Didn't load

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-16201 | A Tournaments view's one read fails (any view; `load: 'failed'`) | The view's head, then "Tournaments didn’t load" + "Nothing is lost. Your events and scores are still saved; try again in a moment." + Try again (which re-runs the server render; offline it says so, CH-1905) | `TourFailed` (`EmptyState size="page" tone="danger"`) in every view | tournaments/views.test › CH-16201 |
| CH-16210 | Home: the events read fails while the page itself loads (`errors.events`) | The head stays, then "The events didn’t load" + "Nothing has changed. Try again." + Try again; never an empty ledger or "No tournaments yet" | `InlineNotice` in `TournamentsHome` | tournaments-home.test › CH-16210 |
| CH-16220 | Event desk, Holes tab: the scorecards read fails (`errors.holes`) | "The scorecards didn’t load" + "Team scores are unaffected. Try again." + Try again, in place of the grid; never "No hole-by-hole scores yet" | `InlineNotice` in `HoleGrid` | tournaments-desk.test › CH-16220 |
| CH-16221 | Event desk: the field read fails (`errors.field`) | Under the head: "The field didn’t load" + "Where the team finished needs the field, so it is left out for now. Scores are unaffected. Try again." + Try again; the scores stay | `InlineNotice` in `EventDesk` | tournaments-desk.test › CH-16221 |
| CH-16222 | Event desk, Overview and Who counted: the rounds read fails (`errors.rounds`) | "The rounds didn’t load" + "Scores are saved; they just can’t be shown right now. Try again." + Try again, in place of the table | `InlineNotice` in `EventDesk` | tournaments-desk.test › CH-16222 |
| CH-16235 | Review (its own page and the desk's Review tab): the review read fails (`errors.review`) | "The review didn’t load" + "Nothing has changed. Try again." + Try again, in place of the layers; never "Nothing to review yet" | `InlineNotice` in `ReviewBody` | tournaments-review.test › CH-16235 |
| CH-16236 | History: the trend read fails (`errors.trend`) | Under "Across seasons": "The trend didn’t load" + "The events below are unaffected. Try again." + Try again; the ledger of every event stays | `InlineNotice` in `History` | tournaments-history.test › CH-16236 |
| CH-16250 | Compare: the rounds read fails (`errors.rounds`) | Under the head: "The rounds didn’t load" + "Nothing has changed. Try again." + Try again, in place of the presets, sides and grid; never "No rounds to compare yet" | `InlineNotice` in `Compare` | tournaments-compare.test › CH-16250 |
| CH-16251 | Compare: the field read fails (`errors.field`) | Above the grid: "The field didn’t load" + "Versus field needs it, so it is left blank. The other figures are unaffected. Try again." + Try again; Vs field reads "—" and every other figure stays | `InlineNotice` in `Compare` | tournaments-compare.test › CH-16251 |
| CH-16238 | Link rounds: the candidate rounds read fails (`errors.candidates`) | Under "Rounds to link": "The rounds didn’t load" + "Nothing has changed. Try again." + Try again, in place of the rows; never "No rounds to link" | `InlineNotice` in `LinkInbox` | tournaments-links.test › CH-16238 |
| CH-16262 | Lineup: the roster read fails (`errors.roster`) | Under the head: "The roster didn’t load" + "Nothing has changed. Try again." + Try again, in place of the spots and roster; never "No players on the roster" | `InlineNotice` in `LineupBuilder` | tournaments-lineup.test › CH-16262 |
| CH-16271 | Live round: the holes of linked GolfHelm rounds fail to load (`errors.holes`) | Under the head: "Some live scores didn’t load" + "Entered totals are unaffected. Holes from GolfHelm rounds are left out for now." + Try again. The lanes and entered scores stay | `InlineNotice` in `LiveRound` | tournaments-live.test › CH-16271 |
| CH-16290 | Player: the events read fails (`errors.events`) | "The events didn’t load" + "Nothing has changed. Try again." + Try again, in place of the list; never "No tournaments yet" | `InlineNotice` in `PlayerEvent` | tournaments-player.test › CH-16290 |
| CH-16291 | Player event: the coach’s shared notes read fails (`errors.notes`) | "Your coach’s notes didn’t load" + "Nothing has changed. Try again." in place of the notes; never "Nothing shared yet" | `InlineNotice` in `PlayerEvent` | tournaments-player.test › CH-16291 |
| CH-16292 | Player event: the player’s reflection read fails (`errors.reflection`) | "Your reflection didn’t load" + "Nothing has changed. Try again in a moment." in place of the box, so nothing typed can overwrite what is saved | `InlineNotice` in `Reflection` | tournaments-player.test › CH-16292 |
| CH-16293 | Player event: the player’s own spot (the lineup reveal) fails to load (`errors.reveal`) | "Your spot didn’t load" + "Nothing has changed. Try again in a moment." in place of the spot, so a failed read is never shown as "not published" | `InlineNotice` in `PlayerEvent` | tournaments-player.test › CH-16293 |
| CH-16252 | Compare: the hole figures read fails (`errors.holes`) | Above the grid: "The hole figures didn’t load" + "Birdies, greens, fairways and putts are left blank. Scores and strokes gained are unaffected. Try again." + Try again | `InlineNotice` in `Compare` | tournaments-compare.test › CH-16252 |
| CH-16253 | Home (coach): the read of the calendar's untracked tournaments fails (`errors.untracked`, P-5) | In place of Set up from calendar: "Couldn’t load your tournaments" + "The calendar’s untracked tournaments didn’t load. Try again." + Try again. The rest of the home is unaffected | `SetUpFromCalendar` | tournaments-p5.test › CH-16253 |
| CH-16294 | A section of the live round, the lineup builder, History or Live throws while drawing (GAP-S-10) | In place of that section only: "The team line couldn’t be shown", "The lineup …", "The individuals …", "The field …" (live round); "Playing …", "Alternate and individuals …", "Roster couldn’t be shown" (lineup); "The trend …", "Every event couldn’t be shown" (History); "Players on the course …", "{name}’s round …", "Where everyone is couldn’t be shown" (Live) + the shared body + Try again, which redraws it. The rest of the page keeps working | `SectionBoundary` in `LiveRound`, `LineupBuilder`, `History`, `LiveView`, `LiveViewPhone` | tournaments-history.test, LiveView.test |
| CH-16295 | History: the roster or the season profiles read fails (`errors.profiles`, GAP-S-08) | Above the trend: "Player names didn’t load" + "The results below are unaffected. Try again." + Try again. Before, names silently fell back and nothing said why | `InlineNotice` in `History` | tournaments-history.test › CH-16295 |

## 163xx Empty

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-16302 | A Tournaments route opens before the held migrations are applied (a tournament table or RPC is missing: PGRST205, 42P01, PGRST202) | The head, then "Tournaments aren’t set up yet" + (coach) "Your events, lineups and results show here once Tournaments is set up for your team. Nothing is missing: there is nothing saved here yet." (player) "Your team’s events show here once your coach’s Tournaments is set up." Never an empty season, never a crash | `TourNotice kind="not_set_up"`, from every loader's `not_set_up` (`data/tournaments.ts`) | tournaments-wired.test › CH-16302 |
| CH-16303 | A Tournaments route, signed in but on no team | "You aren’t on a team yet" + "Tournaments fill in once your team is set up." (a player: "…once a coach adds you to a team roster.") | `TourNotice kind="no_team"` in `routes/tournaments.tsx` | tournaments-wired.test › CH-16303 |
| CH-16304 | An event address that is not this team's (deleted, another team's, not an id) | "This event isn’t here" + "It may have been deleted, or the link is wrong. Everything else is where you left it." (the one not-found line, CH-1306, GAP-S-24) + Back to Tournaments | `TourNotice kind="not_found"` | tournaments-wired.test › CH-16304 |
| CH-16305 | A player on a coach's Tournaments page (new or edit event, lineup, live, compare, history, link rounds) | "Only coaches open this page" + "You can see your team’s events and your own results in Tournaments." + See your tournaments | `TourNotice kind="coach_only"` | tournaments-wired.test › CH-16305 |
| CH-16301 | Retired 2026-11-07: a view its lane hasn't built yet. Every Tournaments view is built, so no screen draws it | (retired) | `TourPlaceholder`, deleted | (retired) |
| CH-16310 | Retired 2026-10-25 (P-5 4.11.1): replaced by CH-16352. Home: no event in the season, nothing failed | The head (without Add event), then "No tournaments yet" + "Add your first event to see who counted, how the team finished and how it compares with qualifying and last season." + Add event (the page's one primary) | `EmptyState size="page"` in `TournamentsHome` | tournaments-home.test › CH-16310 |
| CH-16311 | The season ledger (Home, History): the season has no finished event yet | Under the season's heading, one line: "No finished events yet" + "Results show here once an event is complete." A past season with none is left out | `EmptyState compact` in `SeasonLedger` | tournaments-home.test › CH-16311 |
| CH-16312 | Home: no event is upcoming or live | In place of the next-event card, one line: "Nothing on the calendar" + "Add an event and it shows here with its lineup and travel." | `EmptyState compact` in `TournamentsHome` | tournaments-home.test › CH-16312 |
| CH-16320 | Event desk: the event has no scores yet (not played, nothing entered) | Where Who counted would be: "No scores yet" + "Scores show here as rounds are entered." + where the lineup stands ("Draft lineup · 4 of 5 set · locks Tue 7:50 AM.") and the event's note | `EmptyState compact` in `EventDesk` (`NoScores`) | tournaments-desk.test › CH-16320 |
| CH-16321 | Event desk, Holes tab: no scorecard has holes (a totals-only event, or none entered) | "No hole-by-hole scores yet" + "Holes show here once scorecards are in. Team scores use whole rounds either way." For one round with none: "Round 3 has no scorecards with holes." | `EmptyState compact` in `HoleGrid` | tournaments-desk.test › CH-16321 |
| CH-16335 | Review: the event has a review that is not open yet (`review.open` is false: a round is not final) | "The review opens when every round is final" + "Until then the scores can still change, so nothing is concluded from them." | `EmptyState compact` in `ReviewBody` | tournaments-review.test › CH-16335 |
| CH-16336 | Review: the event has no review (not played, nothing to read) | "Nothing to review yet" + "The review is written once the event has scores." | `EmptyState compact` in `ReviewBody` | tournaments-review.test › CH-16336 |
| CH-16337 | Review: the review is open and has no notes or reflections | Under "Notes and reflections": "No notes or reflections yet" + "A coach’s note or a player’s reflection shows here once it is written." | `EmptyState compact` in `ReviewBody` | tournaments-review.test › CH-16337 |
| CH-16338 | Link rounds: no GolfHelm round is waiting to be linked (the read worked) | Under "Rounds to link": "No rounds to link" + "A GolfHelm round logged as a tournament round shows here with the event it probably belongs to." | `EmptyState compact` in `LinkInbox` | tournaments-links.test › CH-16338 |
| CH-16362 | Lineup: the team has no players on its roster (the read worked) | The head, then "No players on the roster" + "Add players to your roster, then build the lineup from them." + Open the roster | `EmptyState size="page"` in `LineupBuilder` | tournaments-lineup.test › CH-16362 |
| CH-16363 | Lineup: a player in the draft is injured, out for academics, not travelling, or has left the team | A line above the spots: "Theo is marked injured." (a warning; the coach decides) or "Will has left the team and can’t be in a lineup." (blocks Publish) | `LineupBuilder` (`notesOf`) | tournaments-lineup.test › CH-16363 |
| CH-16370 | Live round: nobody is in the round (no lineup, no individuals) | "Nobody is in this round yet" + "Set the lineup, then the lanes show here as scores come in." + Open the lineup. No team line over it and no Go live (G15: nobody to score) | `EmptyState size="page"` in `LiveRound` | tournaments-live.test › CH-16370 |
| CH-16390 | Player: no tournaments in the season (the read worked) | "No tournaments yet" + "When your coach sets up an event, it shows here with the days and your scores." | `EmptyState size="page"` in `PlayerEvent` | tournaments-player.test › CH-16390 |
| CH-16391 | Player event: the event has no rounds yet | Under "Your rounds": "No rounds set yet" + "Your coach hasn’t added the days. They show here once they do." | `EmptyState compact` in `PlayerEvent` | tournaments-player.test › CH-16391 |
| CH-16392 | Player event: the coach has shared nothing | Under "From your coach": "Nothing shared yet" + "A note your coach shares with you shows here." | `EmptyState compact` in `PlayerEvent` | tournaments-player.test › CH-16392 |
| CH-16393 | Player event: the team’s result is not on the player’s page (teammates’ scores and the lineup are the coach’s until held file 4) | Under "Team results": "Your own scores are above. The team’s result is on your coach’s page for now." (before the rounds are final: "Team scores show here once every round is final.") | `PlayerEvent` | tournaments-player.test › CH-16393 |
| CH-16340 | History: no event is finished (the read worked) | The head (without Add event), then "No results to compare yet" + "Once events are finished, the team’s scoring against the course rating shows here, season by season." + Add event (the page's one primary). Its medallion is the trophy the Events view's first run draws, not a plus (G17) | `EmptyState size="page"` in `History` | tournaments-history.test › CH-16340 |
| CH-16350 | Compare: a side selects no rounds (a player with none in that context or period) | In that side's summary: "No rounds in this sample" (the phone's card says the same under the side's label); its figures read "—" with "No data", and the difference says "No rounds on one side"; the other side is unchanged | `SummaryLine` and the phone's scope card in `Compare` | tournaments-compare.test › CH-16350 |
| CH-16351 | Compare: there are no rounds at all (the read worked) | The head, then "No rounds to compare yet" + "Rounds from events, qualifiers and practice show here once they are in, and you can set any two samples side by side." | `EmptyState size="page"` in `Compare` | tournaments-compare.test › CH-16351 |
| CH-16352 | Home: no event in the season, nothing failed (P-5 4.11.1; replaces CH-16310) | The head (without Add event), then "Your season starts on the calendar" + "Add a tournament on the calendar and it shows up here with its rounds, lineup and results." + Add a tournament (to the calendar's editor on Tournament, the page's one primary) and Plan from here instead, or Set up from calendar (2) when the calendar has untracked tournaments | `FirstRun` | tournaments-p5.test › CH-16352 |
| CH-16380 | Import results: none of our players are in the file, or the file has team scores only | “None of your players are in this file” + the file’s teams and “Choose your team above if it is there under another name.”; or “No player rows in this file” + “Team scores and places can still be saved.” | `ImportResults` (`CheckView`) | tournaments-import.test › CH-16380 |
| CH-16381 | Enter holes: no grid for the round (the course has no hole pars, no one is in the round) | “The course has no hole pars yet” + add the pars on the event; “No one is in this round yet” + set the lineup first | `HoleEntry` (`gridFor`) | tournaments-import.test › CH-16381 |
| CH-16382 | Lineup builder: the lineup's lock time has passed and it is not locked (launch readiness F-05; nothing locks it at that time) | “The lock time, Tue 20 Oct 7:50 AM, has passed. Lock the lineup now; it locks itself when round 1 starts.” The head's chip reads “Lock by …” in amber | `LineupBuilder` | tournaments-b-team.test › CH-16382 |

## 164xx Loading

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-16401 | A Tournaments view is on its way (`load: 'loading'`) | The head's eyebrow and title as placeholders, then the body's block, in place; the page is marked busy and named "Loading [view]" | `TourLoading` / `TournamentsLoading`: each view draws its own skeleton at its final geometry | tournaments/views.test › CH-16401 |
| CH-16480 | Import results: the file is being read on the device | Nothing for the first 150 ms, then “Reading the results…” + “Finding players, rounds and holes” with the working ring, held at least 450 ms so it never flashes | `ImportResults` | tournaments-import.test › CH-16480 |

## 165xx Confirm

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-16550 | Stop tracking, from the desk's tournament menu (P-5) | "Stop tracking Pinehurst Invitational?" + "Its 3 calendar entries stay, so players still see the days. The lineup, tee times and notes for it are removed." Keep tracking / Stop tracking (felt: warning). With scores entered or results official it says why instead ("Scores are entered for R1, so this tournament stays tracked.") with only Close | `DeskTrackMenu` | tournaments-p5.test › CH-16550 |
| CH-16551 | Cancel tournament, from the desk's tournament menu (P-5; the calendar's CH-6541) | "Cancel Pinehurst Invitational?" + "All 3 rounds are struck through for players. Nothing is deleted, so you can restore it." An optional reason. Keep tournament / Cancel tournament (felt: warning) | `DeskTrackMenu` | tournaments-p5.test › CH-16551 |
| CH-16560 | Lock the lineup, from the lineup builder | "Lock the lineup?" + "3 of 5 spots are set. Once it is locked, a change is a substitution made round by round. This can’t be undone from here." Keep editing / Lock lineup. A change on screen is saved first | `LineupBuilder` (`Modal`) | tournaments-lineup.test › CH-16560 |
| CH-16570 | Finish the round, from the live round | "Finish round 2?" + "Scores can still be corrected after this. The round counts as final and the next one can start." Keep playing / Finish round (felt: warning) | `LivePage` (`Modal`) | tournaments-live.test › CH-16570 |
| CH-16580 | Import results: Start over once choices are made on the check step | “Start over?” + “The choices you made on this file are let go, and nothing is saved.” Keep checking / Start over (the ask is felt as a warning; the yes is silent) | `ImportResults` (`Modal`) | tournaments-import.test › CH-16580 |
| CH-16581 | Enter holes: closing with holes typed and not saved | “Leave without saving?” + “The holes you typed for 3 players aren’t saved.” Keep typing / Leave | `HoleEntry` (`Modal`) | tournaments-import.test › CH-16581 |

## 166xx Motion

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-16601 | A value changes after first paint (a live score, a team total, a place) | It takes its new value in place (no rolling, D-100) and its cell is washed in `--ch-bg-selected` for 520 ms, then fades on `--ch-dur-reveal`. Never on first paint. Under reduced motion and Animations off the wash still shows; only its fade is skipped | `useChangedWash` + `.ch-tour-washable` / `.ch-tour-changed` (`styles/tournaments.css`) | tournaments/use-changed-wash.test |
| CH-16650 | Home: a tournament arrives while the page is open (another tab or coach set it up; P-5 M9) | Its row (or the next-event card) takes the changed wash for the reveal duration, then fades; nothing moves, and never on first paint. On a fresh load the row instead carries "Set up today" | `useArrivals`, `.ch-tour-washable` | tournaments-p5.test |

## 167xx Haptics

| # | When | They feel | How | Test |
| --- | --- | --- | --- | --- |

## 168xx Accessibility

| # | When | They get | How | Test |
| --- | --- | --- | --- | --- |
| CH-16801 | A signed difference or a trust state is read | A delta says "Better by 1.4 strokes than his season average", "Worse by …" or "Level: … no clear change"; the triangle is hidden and points by better or worse, not by sign, so hue never carries the meaning alone. A trust chip says its state in words; the live dot and the check are hidden | `ui/DeltaChip.tsx`, `ui/TrustChip.tsx` | delta-chip.test, trust-chip.test |
| CH-16850 | Home: a tournament arrives while the page is open | One polite line: "Pinehurst Invitational added to your season." | `useArrivals`, the home's status region | tournaments-p5.test |
| CH-16880 | Enter holes: the grid by keyboard and screen reader | Each cell is named “Ava Lindqvist, hole 7, par 4”; the arrows move between cells, Enter moves down, and a whole score (2 to 9, or 10 to 15) moves on to the next hole, a 1 waits for its second digit. An invalid cell is described by its line under the grid | `HoleEntry` | tournaments-import.test › CH-16880 |

## 169xx Network and UX

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-16920 | Event desk: the host's published number differs from our scorecard (`officialTotal` set and unequal) | A status note under the head: "Results are provisional" + "The imported leaderboard has Sofia at 73 in round 3. The scorecard says 74. Team totals use the scorecard until you confirm which is right." (and "2 more differ."). Shown, never silently picked (D-82) | `EventDesk` (`.ch-tour-desk-warn`, `role="status"`) | tournaments-desk.test › CH-16920 |
| CH-16980 | Import results: a round in the file differs from the player’s card or submitted round | Both are shown, never one silently picked (D-82): “Round 1: the file says 73, the card says 73. Holes 1 and 5 differ.” + Keep the card / Use the file. The card is kept by default when the totals agree. A submitted round is never changed: Use the file enters the official score, and the round stays on the player’s Rounds page | `ImportResults` (`PlayerRow`) | tournaments-import.test › CH-16980 |
| CH-16981 | Lineup builder: the roster is over its limit (F-05) | The chip beside "x of y set" reads "Roster 10 of 9, 1 over" in amber; within the limit it reads "Roster 8 of 9" with no tone, and with the limit off there is no chip. The count is the Roster header's (active players less those marked as not counting) | `loadTournamentLineup` → `rosterLimit`, `LineupBuilder` meta | roster-limit.test › CH-16981 |

## Live rounds (P-6)

> Rows CH-16600 to CH-16677 (CH-16650 to CH-16653 are the tournaments lanes')
  and CH-16680 to CH-16685 belong to Clubhouse P-6, Live rounds, which registers
  no page of its own. Plan: handoff 4.34.6; notes in
  `docs/clubhouse/live-rounds/`.

Route `/golf/dashboard/live` (coaches) · surfaces Coach Home (`LiveNowCard`),
the live view, the player's sheet, the player's own card, the Teammates card,
Round setup and the in-round sheet, Team rounds, the player's library, Calendar
and Qualifiers · code `src/clubhouse/live/` (the lane, beads, feed, queries and
model), `src/clubhouse/screens/live/` · loader
`src/clubhouse/data/live-rounds.ts` · tests
`src/clubhouse/__tests__/live-rounds-copy.test.ts`,
`src/clubhouse/live/__tests__/` · preview `/clubhouse-preview/live`
(`?state=busy|one|many|finished|starts|event|longnames|empty|failed|denied`) and
`/clubhouse-preview/home?live=busy|one|many|finished|event|failed`.

Live rounds (build plan P-6, handoff 4.34.6): who is on the course now, hole by
hole, for the coach; the player's own round and the practice rounds teammates
share. It only reads what the save path already writes: how shots and scores are
entered and stored does not change. The numbers follow the plan's copy deck, so
the second digit of a code here does not follow the kinds in [the catalog
README](README.md): every CH-166xx row is the words of a live surface, and the
checker does not require them to be used or tested by kind. A test names each of
them regardless (`live-rounds-copy.test.ts`). The sharing words use open-call
version 2 until the owner answers: the first level reads "Not live" (stored
`off`), and rounds that a tournament tracks are shown by the tournament's own
live view.

Where things live:

- The lane (`live/PlayerLane.tsx`), the bead row (`live/HoleBeads.tsx`), the
  momentum line, the feed chip (`live/FreshnessChip.tsx`) and the polite live
  region (`live/LiveAnnouncer.tsx`) are shared by every live surface; the
  stylesheet is `styles/live.css` (`.ch-lv-*`).
- `live/model.ts` holds the pure rules (freshness, groups, sort, moments, the
  late rule, the next hole); `live/live-rounds-adapter.ts` turns a
  `golf_round_live` row or a v0 poll row into one lane; `live/live-queries.ts`
  is the read, run on the server for the first paint and in the browser for the
  20 second poll.
- Until held migration `20261025050000_golf_round_live.sql` is applied the live
  table is absent and the page reads the v0 poll (qualifier and tournament
  rounds only; no practice, no sharing).

## 166xx Copy: the live surfaces

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-16600 | Coach Home, someone is on the course | "Live now · {n} on the course" with a static green dot, a chevron to open the live view on the phone, "Open live view" on a wide screen. Up to four lanes on a phone, six on a wide screen | `LiveNowCard` (`screens/home`), `LIVE_COPY.homeTitle` | live-rounds-copy.test › CH-16600 |
| CH-16606 | More lanes than the card shows | "See all {n}", a 44px key to the live view | `LiveNowCard` | live-rounds-copy.test › CH-16606 |
| CH-16602 | Coach Home, only finished lanes remain (each stays 30 minutes after it posted) | "Finished today · {n}" as the title, without the dot | `LiveNowCard` | live-rounds-copy.test › CH-16602 |
| CH-16603 | The head of the card | "Open live view": the chevron's VoiceOver name on a phone, a text button on a wide screen | `LiveNowCard` | live-rounds-copy.test › CH-16603 |
| CH-16604 | A live read failed or the feed dropped | "Can’t refresh right now" in the card head in place of the dot, with the lanes it has. In the live view (desktop and phone, F-0012), before any lane has loaded, a notice with the same title, "Nothing you saved is lost. Try again." and Try again; the feed chip reads "No signal" with Retry, and Connecting while the first read failed on the phone | `feedProblem`, `FreshnessChip`, `InlineNotice`, `FAILURE_COPY.page` | live-rounds-copy.test › CH-16604 |
| CH-16605 | The device is offline while the card or the live view is open | "You’re offline" in the card head; the feed chip reads "Paused · {time}" | `feedProblem`, `FreshnessChip` | live-rounds-copy.test › CH-16605 |
| CH-16609 | Live: the coach has no active team, or a team they may not read (GAP-S-12) | No team: the shared not-on-a-team state, "Once your team is set up, the players out on the course show here." A team they may not read: page "Live isn’t available for this team" + "Live shows the players of the team you coach. Your team, rounds and stats are on Home." + Back to Home. Before, a bare sentence | `LiveNoTeam`, `LiveDenied` (`ClubhouseLiveRoute`) | LiveView.test › CH-16609, live-rounds-copy.test › CH-16609 |
| CH-16610 | The live view | Title "Live" | `LiveView`, `LiveViewPhone` | live-rounds-copy.test › CH-16610 |
| CH-16611 | Two or more round types have lanes | A filter: All, Qualifier, Practice, Tournament, showing only the types that have lanes. Hidden when only one type is live | `LiveFilter` (`Segmented`) | live-rounds-copy.test › CH-16611 |
| CH-16612 | Lanes on the course | Group "On the course · {n}" | `LiveGroupsList` | live-rounds-copy.test › CH-16612 |
| CH-16613 | Lanes that posted or stopped today | Group "Finished today · {n}" | `LiveGroupsList` | live-rounds-copy.test › CH-16613 |
| CH-16614 | Lanes with no word for 90 minutes | Group "Not heard from · {n}", so they do not sit among the live ones | `LiveGroupsList` | live-rounds-copy.test › CH-16614 |
| CH-16615 | The sort control | "Sort: To par" and its options To par, Thru, Name, Tee time; the choice is kept on this device. The menu also holds Announce updates and Refresh now (R) | `LiveSortMenu` (`Menu`) | live-rounds-copy.test › CH-16615 |
| CH-16616 | A player's sheet, the hole they play next | "12 · Par 4 · 412 yds"; yards are left out when unknown | `PlayerLiveBody`, `LIVE_COPY.nextHole` | live-rounds-copy.test › CH-16616 |
| CH-16617 | A player's sheet, Moments | A list of up to eight lines, newest first: "Birdie on 12", "Double on 13", "Caught up · thru 15", "{name} posted {total} ({toPar})", each with its time | `PlayerLiveBody`, `momentsFrom` | live-rounds-copy.test › CH-16617 |
| CH-16618 | Wide live view, nobody selected | "Where everyone is": the course in two rows of nine, a token on the hole each player plays next | `CourseRibbon` | live-rounds-copy.test › CH-16618 |
| CH-16619 | Nobody is on the course | "No one is on the course right now" and "Rounds show up here as soon as a player starts one." in the shared page empty state with Live's glyph (G6; it was two grey lines with no card) | `LiveEmpty` (`EmptyState size="page"`) | live-rounds-copy.test › CH-16619 |
| CH-16620 | Qualifier detail (built in slice 4) | "On the course · {n}" above the board: compact lanes for this qualifier's rounds in progress | `QualifierLiveSection` | live-rounds-copy.test › CH-16620 |
| CH-16621 | A player with their own round on this qualifier (slice 4) | "Standings update when your round is posted." The board holds its state at the start of their round | `QualifierDetail` | live-rounds-copy.test › CH-16621 |
| CH-16622 | The qualifier list (slice 4) | "Round {r} live · {n} on the course" under the qualifier's name | `QualifiersList` | live-rounds-copy.test › CH-16622 |
| CH-16630 | The Team rounds band (slice 4); Home when only tournaments are live | "Live now" | `LiveNowCard` | live-rounds-copy.test › CH-16630 |
| CH-16631 | The share chip on an in-progress round in the player's library (slice 4) | The level in words: Not live, Coaches, Coaches and team. It opens the share sheet | `RoundsLibrary` | live-rounds-copy.test › CH-16631 |
| CH-16640 | Calendar peek and inspector, an event with lanes linked to it (slice 4) | "Live · {n} on the course", a 44px row with the live dot, opening the live view for the event | `peek.tsx`, `inspector.tsx` | live-rounds-copy.test › CH-16640 |
| CH-16641 | Calendar grid block (slice 4) | A 6px static live dot in the block's corner; VoiceOver adds "{n} on the course" | `views.tsx` | live-rounds-copy.test › CH-16641 |
| CH-16660 | Round setup (slice 2) | "Show this round live to" | `LiveShareField` | live-rounds-copy.test › CH-16660 |
| CH-16661 | Round setup (slice 2) | Three choices: "Not live", "Coaches", "Coaches and team". The stored value of the first is still `off` | `LiveShareField` (`Segmented`) | live-rounds-copy.test › CH-16661 |
| CH-16662 | A qualifier round in setup (slice 2) | "Qualifier rounds are always shown to coaches." Not live is unavailable, and so is Coaches and team | `LiveShareField` | live-rounds-copy.test › CH-16662 |
| CH-16663 | Round setup (slice 2) | "They see your score and the hole you’re on, not your location." | `LiveShareField` | live-rounds-copy.test › CH-16663 |
| CH-16664 | Changing the share level fails (slice 2) | "Couldn’t change sharing. Try again." The control returns to the level it had | `setLiveShare`, `LiveShareField` | live-rounds-copy.test › CH-16664 |
| CH-16665 | A round's sharing was changed 30 times (slice 2) | "Sharing was changed too many times on this round." | `setLiveShare` | live-rounds-copy.test › CH-16665 |
| CH-16666 | The share function is not in the database yet (slice 2) | "Sharing isn’t available yet." The control is normally not drawn then | `setLiveShare` | live-rounds-copy.test › CH-16666 |
| CH-16670 | A qualifier lane's second line | "Qualifier · R2 · 12 · Par 4" | `laneSubline` | live-rounds-copy.test › CH-16670 |
| CH-16671 | A practice or tournament lane's second line | "Practice · 12 · Par 4" | `laneSubline` | live-rounds-copy.test › CH-16671 |
| CH-16672 | A lane silent for 10 minutes with the last hole at least as old | "Last update 14 min ago" in the warning ink; the lane keeps full contrast | `PlayerLane`, `laneFreshness` | live-rounds-copy.test › CH-16672 |
| CH-16673 | A lane silent for 90 minutes | "No update since 11:40", in the viewer's clock; the lane moves to Not heard from. Nothing is dimmed | `PlayerLane`, `laneFreshness` | live-rounds-copy.test › CH-16673 |
| CH-16674 | A round the player stopped | "Stopped thru 9" and "Stopped" in the thru column. The lane leaves after 30 minutes | `PlayerLane` | live-rounds-copy.test › CH-16674 |
| CH-16675 | All holes scored, not posted | "Finished · not posted", thru reads F | `PlayerLane` | live-rounds-copy.test › CH-16675 |
| CH-16676 | A round was posted | The Moment "{name} posted {total} ({toPar})" | `momentsFrom` | live-rounds-copy.test › CH-16676 |
| CH-16677 | Two or more holes land in one read (a phone that reconnected) | The Moment "Caught up · thru {n}", with no wash on the to-par | `momentsFrom`, `isLate` | live-rounds-copy.test › CH-16677 |

## 168xx Copy: the player's own cards and the sharing words

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-16680 | The player's own live card (slice 1) | "Round in progress" | `OwnLiveCard` | live-rounds-copy.test › CH-16680 |
| CH-16681 | The player's own live card (slice 1) | "Next: {hole} · Par {par} · {yds} yds" | `OwnLiveCard` | live-rounds-copy.test › CH-16681 |
| CH-16682 | The player's Teammates card (slice 4) | "Teammates on the course · {n}" | `TeammatesLiveCard` | live-rounds-copy.test › CH-16682 |
| CH-16683 | The player's own live card, not saved for 10 minutes (slice 1) | "Last saved {n} min ago" | `OwnLiveCard` | live-rounds-copy.test › CH-16683 |
| CH-16684 | Round setup, open call (a) version 2 (slice 2) | "Not live keeps this round off live views. Your team can still open it in Rounds." The raw round reads are unchanged until the owner decides | `LiveShareField` | live-rounds-copy.test › CH-16684 |
| CH-16685 | Coach Home, a tournament tracks a live round | One 44px row per live tournament: "{event} · live" with the static dot, linking to the tournament's own live view. Tracked rounds get no lane | `LiveNowCard`, `readLiveEvents` | live-rounds-copy.test › CH-16685 |
