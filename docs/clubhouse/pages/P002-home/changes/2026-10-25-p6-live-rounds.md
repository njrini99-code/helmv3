# 2026-10-25 — Live rounds (P-6): Home's Live now card

## 2026-10-25 — Coach Home shows who is on the course

```text
Design package: build plan P-6 (handoff 4.34.6) with the 2026-10-25 changelog and
                recheck applied; the page is P016 (Live rounds)
PR/commit:      claude/clubhouse-live-rounds (slice 0)
Contract IDs:   CH-16600 to CH-16605 (docs/clubhouse/catalog/live.md)
Actions:        none (reads only)
Data impact:    Home's page loads one more read beside loadCoachHome, in parallel
                (loadLiveRounds catches its own failure, so Home never fails on it).
                Home's own loader and its read waves are unchanged.
Held items:     none
```

### Changed

- Coach Home gets a "Live now · n on the course" card: the first section under the green hero on the phone, under the
  head on desktop. It exists only while someone is out, or finished within the last half hour; no card is the empty state.
  A lane opens the player's sheet; the head and "See all" open the live view (P016). A tournament that already tracks a
  live round shows as one row linking to its own live view.

### Why

- A coach opening Home on a qualifier day should see who is out first (plan section 4.2).

### Verification

- `screens/home/__tests__/home-live-now.test.tsx`. No screenshots were captured (no browser was run here).
