# 2026-10-25 — Live rounds (P-6): the shell knows the Live route

## 2026-10-25 — /golf/dashboard/live is a rebuilt coach route

```text
Design package: build plan P-6 (handoff 4.34.6)
PR/commit:      claude/clubhouse-live-rounds (slice 0)
Contract IDs:   none new here (see docs/clubhouse/catalog/tournaments.md)
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- `shell/nav.ts` lists `/golf/dashboard/live` as rebuilt for coaches and as an
  aliased
  route for players (their layout sends them Home). It has no sidebar entry:
Home's
  card is the way in.

### Why

- The live view is reached from Home, Calendar, Qualifiers and Rounds, not from
  the nav.

### Verification

- `__tests__/alias.test.ts` and `__tests__/route-label.test.ts` (unchanged and
  green).

## 2026-10-25 — The Resume accessory carries the score (slice 1)

```text
Design package: build plan P-6 section 4.4 (Dock subtitle)
PR/commit:      claude/clubhouse-live-rounds (slice 1)
Contract IDs:   none new (CH-1820 to CH-1822 keep their codes)
Actions:        none
Data impact:    the shell's existing in-progress round read embeds golf_holes(par, score); no new read
Held items:     none
```

### Changed

- The phone Dock's Resume round accessory and the desktop sidebar's round card
  read "Oakmont CC · Hole 12 · −2" and
  "Hole 12 · −2": the score so far rides with the hole. Nothing scored yet, no
figure.
- `ChRoundInProgress` gains an optional `toPar`.

### Why

- The same figure as the own card, one glance from any screen (plan section 3,
  Dock row).

### Verification

- `__tests__/shell-dock.test.tsx` (P-6 case).
