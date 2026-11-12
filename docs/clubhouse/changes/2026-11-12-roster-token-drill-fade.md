# 2026-11-12 — shared

## 2026-11-12 — Roster's Freshmen tone as a token; drill chips fade (G4, G3/G13)

```text
Design package: none (preview grade fixes; G3/G13's page entry is P013's 2026-11-12-drill-areas-fade.md)
PR/commit:      agent/preview-fixes-f9
Contract IDs:   none new
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- tokens.css: `--ch-yr-fr-roster`, light and dark, the muted violet Roster draws Freshmen in (G4); roster.css points `--ch-yr-fr` at it instead of two hex values. The shared `--ch-yr-fr` is unchanged.
- practice.css: the drills area chips fade past their bleed padding on a phone (G3/G13).

### Why

- The tokens-only rule and the CSS hex ratchet (G4); chips cut mid-word at the edge (G3/G13).

### Verification

- `freshmen-not-red.test.ts`, `areas-fade-past-padding.test.ts`: exit 0.
