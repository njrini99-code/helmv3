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
