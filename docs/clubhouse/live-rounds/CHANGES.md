# 2026-10-25 — Live rounds (P-6): the live view and its lane

## 2026-10-25 — A new coach page lists everyone who is out, hole by hole

```text
Design package: build plan P-6 (handoff 4.34.6) with the 2026-10-25 changelog and recheck
                applied on top; no owner board (docs/clubhouse/phone/live.md is the draft)
PR/commit:      claude/clubhouse-live-rounds (slice 0, v0 poll)
Contract IDs:   CH-16600 to CH-16619, CH-16670 to CH-16677, CH-16685
                (docs/clubhouse/catalog/tournaments.md); later slices add the rest
Actions:        none (reads only)
Data impact:    reads golf_rounds, golf_holes and, when it exists, golf_round_live;
                no migration is applied. Shot tracking is not touched: how a shot or a
                score is entered or stored does not change.
Held items:     migrations 20261025050000 to 20261025050200 (slices 2, 3 and 5)
```

### Changed

- New page `/golf/dashboard/live` (coach): groups (On the course, Finished
  today, Not heard from), a filter that shows
  only the round types that have lanes, a sort kept on the device, a feed chip,
and on a wide screen a panel beside the
  list (a sheet below 1080 px and on the phone). The lane is the shared grammar
in `src/clubhouse/live/`.
- Until the live table exists it reads qualifier and tournament rounds the v0
  way, every 20 seconds, only while the
  page is visible, and an update never lands under the pointer.
- A lane that has gone quiet is told in words and grouped, never dimmed. A
  hole's time is the server's receive time.
- The qualifier board stops re-reading on every autosave (a repeat `updated_at`
  is ignored; at least five seconds apart).

### Why

- A coach on a qualifier day wants to see who is where without asking (plan
  section 1).

### Verification

- vitest in `src/clubhouse/live/__tests__`, `screens/live/__tests__`,
  `data/__tests__/live-rounds.test.ts`,
  `screens/qualifiers/__tests__/live-refresh-gate.test.ts` and
`__tests__/live-rounds-copy.test.ts`.
- Not done: before and after screenshots (no browser was run here) and the
  device pass. No VERIFY row is invented.

## 2026-10-25 — Sharing, the held migrations and the player's own card (slices 1 and 2)

```text
Design package: build plan P-6 sections 4.4, 4.6 and 8 with the 2026-10-25 changelog and recheck
PR/commit:      claude/clubhouse-live-rounds (slices 1 and 2)
Contract IDs:   CH-16680, CH-16681, CH-16683, CH-16660 to CH-16666, CH-16684
Actions:        setLiveShare, setNextLiveShare, setLivePrefs
Data impact:    three migrations written and held (golf_round_live and its prefs, the push policy, the sweep); the
                supabase/schemas mirror; no change to anything a player records
Held items:     docs/clubhouse/held/data/live-rounds.md, docs/clubhouse/held/data/live-rounds-realtime.md
```

### Changed

- The three held migrations, their rows in supabase/migrations/HELD.md, the
  declarative mirror and
  `supabase/tests/rls/golf_round_live.sql`.
- `OwnLiveCard` on Player Home; the Dock reads "Hole 12 · −2".
- The sharing controls (setup field, Exit sheet row and sheet, Settings group)
  and their three server actions.

### Why

- Practice rounds need a sharing control (OQ-72), and push needs the table; both
  wait for the owner to apply them.

### Verification

- `supabase/tests/rls/golf_round_live.sql` ran on a scratch Postgres 16 with a
  stub schema and a pgTAP stand-in (54 of
  54), not on a Supabase stack. The app tests are listed in the page manifest.

## 2026-10-25 — Surfaces on the other pages (slice 4)

```text
Design package: build plan P-6 (handoff 4.34.6) with the 2026-10-25 changelog and recheck applied; Live rounds has no page of its own (P016 is Tournaments)
PR/commit:      claude/clubhouse-live-rounds (slice 4)
Contract IDs:   CH-16620 to CH-16622, CH-16630, CH-16631, CH-16640, CH-16641, CH-16682
Actions:        none
Data impact:    see the P009, P006, P011 and P002 notes
Held items:     none
```

### Changed

- The live lanes now appear on the qualifier page and list, the calendar peek,
  inspector and week grid, Team rounds, the
  player's library and Player Home. `LiveNowCard` takes a `variant` (home, band,
qualifier) and a `scope`; `laneMatchesScope`
  takes a `day`.
