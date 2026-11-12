# 2026-11-12 — why strokes gained reads below zero

## 2026-11-12 — One sentence says why a college team's strokes gained sits below zero

```text
Design package: none (owner decision Q1, 12 Nov 2026)
PR/commit:      agent/preview-fixes
Contract IDs:   none new
Actions:        none new
Data impact:    the CoachHelm Team loader reads golf_teams.gender beside the name (read only)
Held items:     none
```

### Changed

- `lib/sg.ts`: `sgBaseline(tour)` gains `why` ("Measured against PGA Tour pros,
  so below zero is normal for nearly everyone else.") and `whyNamed` (the same,
  opening "Strokes gained is …"). LPGA Tour pros for a women's team; Tour pros
  when the tour could not be read. Written here and nowhere else.
- Said once on each page whose headline is a strokes gained figure, in the
  caption the page already had:
  - Team stats: the four leg cards' scale note (desk); the Strokes gained by
    leg card's caption (phone), replacing "against the Tour".
  - Home, The team's game: the head's line (desk), replacing "vs Tour"; the
    card's footer (phone).
  - Roster: the page head (desk), once rather than on each card.
  - CoachHelm Team: the line under the hole.
  - My stats: the Strokes gained card's caption (phone), replacing "against
    the Tour". The desk's strokes gained definition already says "Below zero
    is normal for most players", so it is not said twice there.
- The sentence names no college, division or level: the Tour is the only
  benchmark on these pages (Q-88).

### Why

- The owner asked CoachHelm "Why are all my players negative … is something
  wrong with the numbers?". The baseline stays the PGA Tour (Q1); the pages now
  say what that means, quietly and once.

### Verification

- `src/clubhouse/lib/__tests__/sg-below-zero.test.ts` (the wording, one place,
  once a page), the CoachHelm Team board render case, and the existing
  strokes gained suite with its Q-88 guard.
