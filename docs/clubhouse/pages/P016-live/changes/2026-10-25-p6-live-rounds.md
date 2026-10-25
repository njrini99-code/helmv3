# 2026-10-25 — Live rounds (P-6): the live view and its lane

## 2026-10-25 — A new coach page lists everyone who is out, hole by hole

```text
Design package: build plan P-6 (handoff 4.34.6) with the 2026-10-25 changelog and recheck
                applied on top; no owner board (docs/clubhouse/phone/live.md is the draft)
PR/commit:      claude/clubhouse-live-rounds (slice 0, v0 poll)
Contract IDs:   CH-16600 to CH-16619, CH-16670 to CH-16677, CH-16685
                (docs/clubhouse/catalog/live.md); later slices add the rest
Actions:        none (reads only)
Data impact:    reads golf_rounds, golf_holes and, when it exists, golf_round_live;
                no migration is applied. Shot tracking is not touched: how a shot or a
                score is entered or stored does not change.
Held items:     migrations 20261025050000 to 20261025050200 (slices 2, 3 and 5)
```

### Changed

- New page `/golf/dashboard/live` (coach): groups (On the course, Finished today, Not heard from), a filter that shows
  only the round types that have lanes, a sort kept on the device, a feed chip, and on a wide screen a panel beside the
  list (a sheet below 1080 px and on the phone). The lane is the shared grammar in `src/clubhouse/live/`.
- Until the live table exists it reads qualifier and tournament rounds the v0 way, every 20 seconds, only while the
  page is visible, and an update never lands under the pointer.
- A lane that has gone quiet is told in words and grouped, never dimmed. A hole's time is the server's receive time.
- The qualifier board stops re-reading on every autosave (a repeat `updated_at` is ignored; at least five seconds apart).

### Why

- A coach on a qualifier day wants to see who is where without asking (plan section 1).

### Verification

- vitest in `src/clubhouse/live/__tests__`, `screens/live/__tests__`, `data/__tests__/live-rounds.test.ts`,
  `screens/qualifiers/__tests__/live-refresh-gate.test.ts` and `__tests__/live-rounds-copy.test.ts`.
- Not done: before and after screenshots (no browser was run here) and the device pass. No VERIFY row is invented.
