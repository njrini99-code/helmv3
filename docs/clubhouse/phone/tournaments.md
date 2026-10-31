# Phone: Tournaments (coach and player)

Status: the owner's phone board is the spec:
`design/handoff/Coach - Tournaments - Mobile.html` with
`design/handoff/tour-m.jsx` (owner boards v3, received 2026-10-23,
`design/handoff/VERSIONS.md`; D-80 to D-101 approved 2026-10-23). The board
wins over any prose here. This page maps the board to what is built and
records where the build departs from it. Written 2026-10-27 in the production
polish pass; until then P016 was the only page without a phone spec.

The routes are `/golf/dashboard/tournaments/**` behind `golf_tournaments_v1`
(off in production). On the phone Tournaments opens from More, as the board's
top bar says ("‹ More").

## Board to component

- `MEvents` (season list, hero for the next event, this season and last
  season rows): `TournamentsHome.tsx`. Built. The hero carries the event's one
  primary: Build lineup, Follow live or Review.
- `MEvent` (result line, Who counted, Holes, Compare): `EventDesk.tsx`,
  `WhoCounted.tsx`, `HoleGrid.tsx`. Built. Its tabs scroll as a strip.
- `MCompare` (two scopes, metric rows with strips): `Compare.tsx` and
  `compare/`. Built. Edit comparison is the phone's primary, so Add event is
  secondary there.
- `MHistory` (trend across seasons): `History.tsx`, `TrendBars` on the phone.
  Built.
- `MEvidence` (the round sheet behind a score): `EvidenceDrawer.tsx`. Built.
- No board: `Review.tsx` and `EventForm.tsx` (new event), built from the
  desktop board and stacked.
- No board, not built: `LineupBuilder.tsx`, `LinkInbox.tsx`, `LiveRound.tsx`,
  `PlayerEvent.tsx` and edit event are placeholders ("… isn't built yet").
  Keep the flag off until they are built.

## Where the build departs from the board

- **Back.** The board's top bar backs to More, and an event page draws a
  "‹ Tournaments" crumb in its body. The built top bar backs one level (an
  event to Tournaments, Review to its event), so the body crumb would repeat
  it: on the phone no view draws the crumb (2026-10-27).
- **History toggles.** The board has no toggles on the phone trend. The built
  page keeps the desktop's two (lineup mode, measured against); on the phone the
  section head wraps and they take their own row under "Across seasons"
  (visual pass, 2026-10-28).
- **The trend's dashed line** is the mean of the points shown, as on the board.

## Checks

- 390 and 375 wide: nothing runs off the right edge; every control is 44px to
  press.
- Light and dark; Text Size larger: the History toggles and the Compare scopes
  wrap, never clip.
- The evidence sheet opens from a score and closes with the swipe and Escape.
