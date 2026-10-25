# 2026-10-25 — Live rounds (P-6): the shell knows the Live route

## 2026-10-25 — /golf/dashboard/live is a rebuilt coach route

```text
Design package: build plan P-6 (handoff 4.34.6)
PR/commit:      claude/clubhouse-live-rounds (slice 0)
Contract IDs:   none new here (see docs/clubhouse/catalog/live.md)
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- `shell/nav.ts` lists `/golf/dashboard/live` as rebuilt for coaches and as an aliased
  route for players (their layout sends them Home). It has no sidebar entry: Home's
  card is the way in.

### Why

- The live view is reached from Home, Calendar, Qualifiers and Rounds, not from the nav.

### Verification

- `__tests__/alias.test.ts` and `__tests__/route-label.test.ts` (unchanged and green).
