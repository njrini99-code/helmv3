# 2026-11-15 — home

## 2026-11-15 — Home: coach Home drawn as Player Home, phone and desktop

```text
Design package: owner, 15 Nov 2026 ("I want the coach home page matching the players. Both mobile and desktop."); QUEUE lay-01 (HOME-P-04/05/09/12/16/20, HOME-D-07, SYS-04)
PR/commit:      claude/project-thread-labmrh
Contract IDs:   none added or reworded; 20103 (links), 21901 (phone order) and 22301 (breadcrumbs) re-pinned to the new layout in home.test.tsx
Actions:        none
Data impact:    none (same ChCoachHome reads; no query, loader or figure changed)
Held items:     none
```

### Changed

- Phone: the coach's Home is Player Home's page (`ch-hm ch-hm--coach`, no
  `data-ch-crh`): the hero with the date, greeting and a plain subline, Up next
  with its countdown, Message team and New event as the player's two actions,
  and Waiting on you; then the week with today inside it, the latest round as
  the player's paged card (`CoachLatest`: player, scorecard, GIR, putts, strokes
  gained, Open recap or the player's stats), Team scoring on the player's
  scoring chart (`TeamScoring`, the shared `ScoreChart` with the team average
  dashed), and the team's game as the player's four cards (`TeamGame`).
- Desktop: Player Home's framed head on the canopy, the week beside the latest
  round with Up next leading it (or "Nothing else this week" and what comes
  after, CH-2316), Team scoring under the hairline, the team's game below. The
  coach-only green hero card, its cards grid and the leaderboard left Home.
- First run: the same framed head and hero as the loaded page; the setup steps
  sit on the page, not in a card.
- Team scoring prints a signed change only when it clears its standard error
  (HOME-P-09); Greens and Putts take the same green or amber as the average.
  Best and toughest day count only days with two rounds or more.
- The loading skeleton no longer swaps in the coach-only lane shape: coaches
  wait on the same page shape as players.
- Dropped from the phone: the per-round trend sparks, the round sheet from the
  rows (the card links straight on), and Nudge from Home (Calendar keeps it).

### Why

- The owner's call: coach Home matches the locked Player Home at phone and
  desktop, keeping the coach's own content (the team, its rounds, its figures).

### Verification

- Unit: the Home suites (home.test.tsx, screens/home/__tests__, span-switch),
  typecheck (tsgo), lint on the changed files.
- Screenshots: preview fixtures in Chromium (tier C), coach next to player,
  phone and desktop, in the PR. Real-team data and the real iPhone are not yet
  checked.
