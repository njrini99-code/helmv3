# 2026-10-24 — 44pt tap targets on touch for the short controls (row 38)

## 2026-10-24 — invisible hit areas under (pointer: coarse)

```text
Design package: none (Clubhouse A+ handoff, row 38; lane B, logged by S1)
PR/commit:      5814f08dc (agent/clubhouse-aplus-phase2, #2361)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     a 44pt check in scripts/clubhouse/a11y.mjs and the other F-10/AX-11 controls, which need measuring in a browser
```

### Changed

- Under `(pointer: coarse)`, the toast's action and close, the asks sheet's Open, the Ask composer's send and Round review's back take a centred `::before` of at least 44 by 44. The toast's two grow only in height.
- The toast's Dismiss X now shows on touch as well as with a mouse (decision J). New hit-area.test.ts.

### Why

- Row 38: controls under 44pt hit like iOS controls without looking bigger.

### Verification

- hit-area.test.ts. Judge on an iPhone.
