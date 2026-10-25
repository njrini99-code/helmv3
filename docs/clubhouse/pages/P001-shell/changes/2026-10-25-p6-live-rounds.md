# 2026-10-25 — Live rounds (P-6): the Dock's Resume round shows the score

## 2026-10-25 — "Hole 12 · −2" on the Resume accessory

```text
Design package: build plan P-6 section 4.4 (handoff 4.34.6) with the 2026-10-25 changelog and recheck applied
PR/commit:      claude/clubhouse-live-rounds (slice 1)
Contract IDs:   none new
Actions:        none
Data impact:    data/shell.ts embeds golf_holes(par, score) in the existing in-progress round read; no new read
Held items:     none
```

### Changed

- The Dock's Resume round accessory reads the hole and the score to par, "Hole
  12 · −2" (`toParOf` from the live model).
  `nav.ts` lists `/golf/dashboard/live` as rebuilt for coaches and aliased (a
player's address opens Home); `Dock.tsx` draws the extra word.

### Why

- A player resuming a round sees where they stand without opening it (plan
  section 4.4).

### Verification

- `shell/__tests__` and `data/__tests__/shell.test.ts` pass in the full
  `src/clubhouse` run. No screenshots (no browser was run).
