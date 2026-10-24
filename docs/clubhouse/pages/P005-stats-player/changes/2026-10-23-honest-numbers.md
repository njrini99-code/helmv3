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

- `__tests__/no-raw-sign-tone.test.ts` and `lib/__tests__/change-tone-zero.test.ts`.

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

## 2026-10-23 — Ahead of or behind the team, on the shown values (A5)

```text
Design package: none (Clubhouse A+ handoff, section 5, A5)
PR/commit: #2356
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- The player Overview's strokes gained and scoring lines decide ahead of,
  behind or level on the values as printed (`versusTeam` in `lib/format.ts`),
  and give the printed gap. Two figures that print alike read "level with the
  team".

### Why

- See docs/clubhouse/changes/2026-10-23-honest-numbers.md.

### Verification

- `screens/stats/__tests__/honest-deltas.test.tsx`: 0.44 against 0.36 and
  72.04 against 71.96 read level; real gaps read ahead or behind, lower is
  better for scoring.

## 2026-10-23 — Average to par is the window's weighted value (A6)

```text
Design package: none (Clubhouse A+ handoff, section 5, A6)
PR/commit: #2356
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- The player Overview's "to par a round" and the phone scoring gauge read the
  window's own weighted `win.toPar` (per 18, a nine-hole round counts as
  half), the same figure as the Stats hero. A round with no par is left out
  instead of counting as 0; with none, the line is not drawn.

### Why

- See docs/clubhouse/changes/2026-10-23-honest-numbers.md.

### Verification

- New `screens/stats/__tests__/overview-topar.test.tsx`: an 18-hole +4 and a
  9-hole +1 make +3.3; the Overview prints `win.toPar`; a round with no par
  does not pull it toward 0.

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
  floors, on the Overview and on Game detail.

### Why

- See docs/clubhouse/changes/2026-10-23-honest-numbers.md.

### Verification

- `stats-player-floors.test.ts`, `stats-team.test.tsx`.
