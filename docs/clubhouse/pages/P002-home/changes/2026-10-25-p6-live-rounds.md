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

## 2026-10-25 — Player Home shows the round in progress (slice 1)

```text
Design package: build plan P-6 section 4.4 (the player's own live card)
PR/commit:      claude/clubhouse-live-rounds (slice 1)
Contract IDs:   CH-16680, CH-16681, CH-16683 (docs/clubhouse/catalog/live.md)
Actions:        none (reads only; shot tracking, the save path and draft_data are untouched)
Data impact:    Home's page loads loadPlayerLive beside loadPlayerHome, in parallel. It reads the viewer's own
                in-progress round (any type) and, for a practice round only, golf_shots, golf_holes and
                sg_scale_for_player for the strokes gained by leg. A failed read hides the card or the grid; Home never fails on it.
Held items:     none
```

### Changed

- Player Home gets a "Round in progress" card while the player has a round going, of any type: to-par at 34, thru, the last
  three holes with their numbers, "Next: 12 · Par 4 · 412 yds", "Last saved n min ago" once the round has been quiet for
  10 minutes, and a full-width Resume round. A practice round also shows strokes gained by leg (Off the tee, Approach,
  Around the green, Putting); a qualifier or a tournament round never does. The card is the first section under the hero on the
  phone and sits under the head on desktop, including on the first-run page.
- The card refreshes itself every 20 seconds while the page is visible, with the same reads the server made.

### Why

- A glance between holes should say where the round stands and where the next tee is (plan section 4.4).

### Verification

- `screens/home/__tests__/own-live-card.test.tsx`, `data/__tests__/live-rounds.test.ts`. No screenshots were captured
  (no browser was run here).
