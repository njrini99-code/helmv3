# P005 Stats (player) — 2026-11-12

## 2026-11-12 — The phone's Strokes gained card says why the figure sits below zero

```text
Design package: none (owner decision Q1, 12 Nov 2026)
PR/commit:      agent/preview-fixes
Contract IDs:   none new
Actions:        none new
Data impact:    none
Held items:     none
```

### Changed

- `screens/stats/StatsPlayerPhoneShs.tsx`: the Strokes gained card's caption is "Strokes a round." and the shared sentence, in place of "against the Tour".
- The desk's strokes gained definition (`OverviewZones.tsx`) already says "Below zero is normal for most players" and is unchanged, so the page says it once.

### Why

- Q1: keep the PGA Tour baseline and say what it means, once and quietly, so a coach does not read every negative as broken numbers. The sentence and where it goes: `docs/clubhouse/changes/2026-11-12-sg-below-zero.md`.

### Verification

- `src/clubhouse/lib/__tests__/sg-below-zero.test.ts`; the page's own suites pass unchanged.
