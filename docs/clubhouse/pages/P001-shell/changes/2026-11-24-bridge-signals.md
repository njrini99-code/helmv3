# P001-shell — Changelog

## 2026-11-24 — Bridge signals (Bridge plan PR 1)

```text
Design package: Clubhouse Bridge redesign, 2026-11-18 (§4.2 E6-E8)
PR/commit: bridge/pr1-spine (#2611)
Contract IDs: 10103 (team switch), 12101 (CH-1954), 12201 (CH-1951)
Actions: none
Data impact: none until the held migration 20261124090000 is applied
Held items: 20261124090000_clubhouse_bridge_signals.sql; the clubhouse_signals flag stays off
```

### Changed

- The shell reads `clubhouse_signals` (`data/shell.ts`) and turns the
  signal queue on or off with it (`shell/use-signals.ts`).
- With the flag on, the shell counts a view per address and a team
  switch, INP, LCP and CLS (CH-1954), a tap on a numbered control, and
  three clicks on a dead element within 600 ms (CH-1951).
- Nothing changes on screen.

### Why

- Bridge plan PR 1: the shell is where a session starts, so it owns the
  queue's switch and the signals no single screen owns.

### Verification

- `shell/__tests__/use-signals.test.tsx`; the shell and team switch tests.
