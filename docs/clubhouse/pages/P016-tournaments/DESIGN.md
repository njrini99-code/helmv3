# P016 — Tournaments: design

Source: the owner's Claude Design project "Coach home dashboard redesign", copied unchanged into `design/handoff/`
(v3 in `design/handoff/VERSIONS.md`): `Coach - Tournaments.html` (desktop), `Coach - Tournaments - Mobile.html`
(phone), `Tournaments Deck.html` (walkthrough), `tour.jsx`, `tour-m.jsx`, `tour-compare.jsx`, `tour-data.js`,
`tour.css`, `tour-m.css`. The plan that builds on them is the handoff's section 4.33, which wins where it changes the
boards (no NumberFlow or digit rolling, D-100; the comparison rebuilt around a question bar and tiered verdicts,
D-86 and D-101; the live round as the centerpiece, 5L).

Rules every view keeps (plan 0.4 and sections 8 and 9):

- Clubhouse tokens and `ui/*` primitives only, `.ch-tour-*` classes; Instrument Sans, sentence case, tabular figures,
  the true minus, `E` for even, `—` for no data.
- Red only for under par and destructive actions. Gain and loss are close in lightness, so a signed mark always
  carries a side, a sign triangle or a word (DeltaChip draws the triangle).
- Motion: durations 0, 110, 180, 260, 280, 520 ms from `lib/motion.ts`; nothing on first paint; a changed value takes
  its new value in place with the 520 ms changed-wash; Reduce Motion respected.

Each lane records here, for its views, every element on the boards it matches and every one it leaves out with the
reason (plan Phase 2 acceptance).

## Season home

Boards: `tour.jsx` (`Home`, `Upcoming`, `Ledger`) and `tour-m.jsx`
(`MEvents`). Code: `TournamentsHome.tsx`, the shared `SeasonLedger.tsx`.

Matched:

- The head: eyebrow, title, the one line, and the Events, Compare and History
  switch with Add event beside it. On the phone the switch and the key sit
  under the title at full width.
- Up next: the next event as the one green card (dates and course, the days
  away, the name, the format line and the event's note), beside the other
  events on the calendar (date block, name, course, holes and note, an
  Upcoming chip).
- The season ledger: finished events by season, newest first, with dates,
  format, team total and to-par, finish, and shot-data coverage; a past
  season reads "Scorecards only" where it has none. On the phone it is the
  board's grouped list (finish over team score, month and year for last
  season).

Changed from the board, and why:

- One primary action. The board has two (Add event in the head, Open
  qualifier on the card). The card's key is the primary and follows the week
  (`next.action`: Build lineup, Publish lineup, Open event, Follow live,
  Open review); Add event is a secondary key, and is the page's primary only
  when there are no events (CH-16310).
- Open qualifier is not drawn: the event carries no qualifier id, so the key
  has nowhere to go. Compare lineup options stays, as a second key on desktop
  while the lineup is still being built.
- The phone card is the same green card with the same action (the board's has
  none); other upcoming events follow it under "Coming up" so none is
  unreachable.
- The first missing readiness item ("Lineup isn’t set · locks Tue 7:50 AM")
  is a line on the card. The board has no readiness line; the sentence is the
  data's own.
- Sizes snap to the type scale (the board's 13.5, 14.5 and 26 px become 13,
  15 and 28 px); radius 16 is the cards', held once in `tournaments.css`.

Not drawn (the data is read, no board draws it, so nothing is invented):
`next.ticks` and `alsoThisWeek` (the week rail), `path` (the season path and
the ranking), `ladder`, `heatmap` and `links`. A failed `path` or `heatmap`
read therefore shows no notice on Home; `errors.events` shows CH-16210.

## Event desk

Boards: `tour.jsx` (`EventDesk`, `Contribution`, `Holes`), `tour-compare.jsx`
(`Evidence`) and `tour-m.jsx` (`MEvent`, `MEvidence`). Code: `EventDesk.tsx`,
`WhoCounted.tsx`, `HoleGrid.tsx`, `EvidenceDrawer.tsx`, `desk-model.ts`.

Matched:

- The head: crumb to the season, date, course and tees, the name, the chips
  (holes and play, the count, completed, the trust state, scorecards with
  shot data, amber where some have none), the result with the finish, and
  the event's actions. On the phone the result sits under the title.
- Overview: Who counted (every score by round, NC where it did not count,
  the team row under the lineup, individuals apart, the shot-data dot and
  the key) and Where the event turned (the three finding cards, each link
  opening its tab on its round).
- Holes: a round's grid with scores or to par, the par row, Out, In and Tot,
  the team-against-par row with the three costliest holes marked, and the
  note under it. On the phone it scrolls sideways inside its own region.
- The provisional note, from the data's `officialTotal`.

Changed from the board, and why:

- One primary action, by the week (`event.mood`): Build or Edit lineup,
  Follow live, Open review, and Compare once the event is a result (the
  board's). Manage lineup is left out of a completed event, where the board
  only answers it with a toast; Official results shows when the event has a
  results link.
- Tabs follow the URL state (`search.tab`): Overview, Live (only while live),
  Who counted, Holes, Compare, Review. The board's Compare players and Hole
  analysis tabs are Compare and Holes; Who counted is its own tab as well as
  the Overview's first section, with the round and the Team or Players view
  the URL carries (`round`, `view`). Players lists everyone flat by their own
  total; one round says in words who made the count.
- Holes gains a third view, Counting, which groups the rows by how the round
  counted (the board marks that only with "NC" and "Ind." in a name).
- The evidence drawer is the kit's `Modal` (a radius 20 sheet; the phone's
  bottom sheet): `ui/` has no side drawer, and the board's drawer is one.
  It shows the figure, the formula in words, the round's lineup scores with
  which counted, and the card, from the data with nothing recomputed.
- A tie at the line is an amber ring on the score; the key says NC and the
  words of the aria label say how each score counted.
- The Compare tab links to Compare with the event preset, and Live to the
  live view: the desk data carries neither view's data, so they cannot embed.
  Review embeds `Review` (`embedded`).

Not drawn: the field table, the story card (six-hole splits, bounce-back,
swing hole) and the trip, none of which a board shows. `errors.travel` has
no home on the desk and shows nothing.

## Review

Board: `tour.jsx` (`Review`). Code: `Review.tsx`, as its own page and as the
desk's Review tab (`embedded`: no head, no page root).

Matched:

- What the rounds show: each layer as an observation, its evidence and a
  possible reason, labelled in words (the board's italics are dropped; the
  label says "possible").
- Notes and reflections by author and kind, "Private to coaches until you
  share", and who has not reflected yet ("Sofia and Eli haven’t added
  reflections").

Left out, and why:

- Draft practice assignment, Discuss in 1:1 and Remind them: each is a write
  the board answers with a toast, and no action exists yet, so a key would
  claim something that did not happen. They arrive with the actions.
- The leak table, the per-player debrief lines (what is shared one by one)
  and Make it a focus: data is read, no board draws them.
- The findings the desk shows on Overview are not repeated here.

## History

Boards: `tour.jsx` (`History`, `Trend`, `Ledger`) and `tour-m.jsx`
(`MHistory`). Code: `History.tsx`, `history-model.ts`, the shared
`SeasonLedger.tsx`.

Matched:

- Across seasons: the actual-lineups or returning-players switch, the trend
  of team scoring against the course rating (a line a season, the dashed
  mean, a point per event that opens it, the figure and the event under it),
  and the sentence under it, worked out from the data and naming who left and
  who joined. Every event: the shared ledger. The phone is the bars card.

Changed from the board, and why:

- Measured against: the URL carries `adjust`, so a second switch draws the
  margin on the field where it is entered. Against the field, returning
  players has no figure and is disabled, and the sentence is left out.
- The sentence is computed (this season's mean against last season's) and
  not fixed copy, and it says nothing without both seasons.
- A point with no figure breaks the line, and a grey ring marks scorecards
  only (the label and the link name say so too).
- The phone has the same two switches under the title; the board has none.

Not drawn: head-to-head against other teams, the splits (by day length,
event type and start) and the middle-50% band, none of which a board shows.
