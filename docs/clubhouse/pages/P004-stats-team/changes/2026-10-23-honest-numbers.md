# 2026-10-23 — Honest numbers (Clubhouse A+ WP-1)

## 2026-10-23 — Zero is no change (A2)

```text
Design package: none (Clubhouse A+ handoff, section 5, A2)
PR/commit: #2356
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- A figure that shows as 0.0 on this page is neutral ink, never a gain or a
  loss. Its tone comes from `changeTone` with the digits it prints.

### Why

- The cross-page entry, docs/clubhouse/changes/2026-10-23-honest-numbers.md,
  holds the reasons.

### Verification

- `__tests__/no-raw-sign-tone.test.ts` and
  `lib/__tests__/change-tone-zero.test.ts`.

## 2026-10-23 — One change-signal rule (A1)

```text
Design package: none (Clubhouse A+ handoff, section 5, A1)
PR/commit: #2356
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- A trend on this page compares the newer half of the window with the older
  half and calls it a change only past its standard error; otherwise "No
  clear change". First against last is gone.

### Why

- See docs/clubhouse/changes/2026-10-23-honest-numbers.md.

### Verification

- `strokes-gained.test.tsx`, `stats-team.test.tsx`, `stats-player.test.tsx`.

## 2026-10-23 — Rate floors on Fairways, GIR, Scrambling and Sand saves (A7)

```text
Design package: none (Clubhouse A+ handoff, section 5, A7)
PR/commit: #2356
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- Fairways hit, Greens in regulation, Scrambling and Sand saves show no value
  under their floor (with what they need) and an early-read tag between the
  floors.

### Why

- See docs/clubhouse/changes/2026-10-23-honest-numbers.md.

### Verification

- `stats-player-floors.test.ts`, `stats-team.test.tsx`.

## 2026-10-23 — Team strokes gained obeys the three-round floor (A4)

```text
Design package: none (Clubhouse A+ handoff, section 5, A4)
PR/commit: #2356
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- The strokes gained headline and the leg totals read only the players with
  three whole rounds with shots in the window; with none yet, the headline
  says what it needs.

### Why

- See docs/clubhouse/changes/2026-10-23-honest-numbers.md.

### Verification

- `stats-team.test.tsx`, `strokes-gained.test.tsx`,
  `stats-filter-data.test.tsx`.
