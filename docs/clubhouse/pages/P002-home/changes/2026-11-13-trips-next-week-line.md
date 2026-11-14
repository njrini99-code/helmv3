# 2026-11-13 — home

## 2026-11-13 — Trips on Home, what comes after the week, an honest pill and line

```text
Design package: none (audit 2026-11-13 findings F-0001, F-0006, F-0016, F-0002; built from Up next's own parts)
PR/commit:      agent/ch-look-home
Contract IDs:   20417 added (CH-2316); 20409 (CH-2309) and 21802 (CH-2802) reworded
Actions:        none
Data impact:    reads only: golf_travel_itineraries (team's, not is_test) and the first events past the week, beside the week's events (no new round trip)
Held items:     none
```

### Changed

- F-0001: a trip with no calendar event is on Home as Team Hub has it. Its
  days carry the week strip's gold travel mark ("on the road (Fall
  Invitational)" in words). From leaving to coming home it is an all-day row in
  Today and Up next: "Leaves tomorrow · 7:30 AM", a countdown to a saved
  departure time on the player's card, then "On the road · back Sun". The row
  opens the trip on Team Hub's Travel. A trip whose event is on the calendar is
  drawn once, as that event; its days keep the mark. While away, Up next gives
  way to an event still ahead today. A test trip is never shown; a failed trips
  read is logged and leaves the week as its events say.
- F-0006 (CH-2316): with nothing left this week, Up next reads "Nothing else
  this week" and "Next: Confirm live check, Tue 17 Nov, 2:00 PM", and opens
  it. The desk's hero says the same. "No events scheduled" (CH-2309) stays
  for nothing ahead at all. A player is not told of a meeting past the loaded
  week (their own replies reach only that window).
- F-0016: the team line names the longest-quiet player only when one is
  strictly longest. All tied, it reads "7 players haven’t posted a round in 48
  days."
- F-0002: Team scoring's pill reads "Last 10 | All time". "This season" named
  a window its figure never read (each player's last ten, back a year, Q-122).
  `ui/SpanSwitch` takes the caller's labels; only Home uses it.

### Why

- Audit 2026-11-13 (P002, graded C+): a travel day read "No events scheduled"
  and "A good day to play a round" while Team Hub said the team was on the
  road (S1); Friday evening read "No events scheduled" with meetings booked on
  Tuesday (S2); "Cole the longest at 48" named one of seven tied players (S3);
  "This season" sat over a figure that reached back to May (S2).

### Rulings

- F-0002: relabel, not refilter. The pill says "Last 10", as Stats names that
  window; the figure is unchanged.
- F-0001: a failed trips read does not fail the week; it is logged.
- F-0006: the read past the week goes with the week's events, so Home is no
  deeper; a player's meetings past the loaded window are left out (fails
  closed, Decision B).

### Verification

- Tests (vitest): `data/__tests__/home-week-trips.test.ts`,
  `screens/home/__tests__/trip-when.test.ts`,
  `screens/home/__tests__/subline-ties.test.ts`, the CH-2316 and F-0001 cases in
  `__tests__/home.test.tsx` and `__tests__/player-home.test.tsx`, and the Home
  switch in `screens/stats/__tests__/span-switch.test.tsx`. Read-depth pins in
  `home-reads.test.ts` list the two new first-wave reads at the same depth.
- No browser run and no screenshots in this pass (agent brief: no dev server or
  browser); the new state reuses Up next's own card and empty-state classes, so
  no stylesheet changed.
