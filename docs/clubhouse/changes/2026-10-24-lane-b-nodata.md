# 2026-10-24 — A NoData primitive (row 46, partly)

## 2026-10-24 — the dash a screen reader hears as "No data"

```text
Design package: none (Clubhouse A+ handoff, row 46; lane B, logged by S1)
PR/commit:      45bf86201 (agent/clubhouse-aplus-phase2, #2361)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     the call-site sweep was continued by S1 on 2026-10-24 (2026-10-24-nodata-sweep.md); the pinned "— SG" form (2026-10-23-cross-screen.md) is untouched
```

### Changed

- ui/NoData.tsx: a visible em dash, aria-hidden, in tertiary ink (`.ch-nodata`, 4.5:1), with a `ch-sr-only` label, "No data" or a word that fits ("Not played"). The nine-hole card's empty par and totals and the player peek's empty figures use it. ScoreMark keeps its own "Not played".

### Why

- Row 46: a readable dash that a screen reader names.

### Verification

- ui/__tests__/NoData.test.tsx.
