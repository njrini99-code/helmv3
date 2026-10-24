# 2026-10-24 — Pressed looks read :active only where a pointer hovers (auditor B6)

## 2026-10-24 — 182 pressed rules split; Ask's stop key presses

```text
Design package: none (Clubhouse A+ handoff, row 10 follow-up; lane B, logged by S1)
PR/commit:      422054a8d, f33451b87, 5c6cef5dd (agent/clubhouse-aplus-phase2, #2361)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     decision K: a control the press controller doesn't mark has no pressed look on a touch-only device
```

### Changed

- `scripts/clubhouse/pressed-hover.mjs` split each `:is(:active, [data-ch-pressed])` rule: the rule keeps `[data-ch-pressed]` (the press controller's mark, after its delay) and a copy right after it, inside `@media (hover: hover)`, carries `:active`. iOS no longer flashes a row a finger only passes over.
- tokens.css: `--ch-ink-press`, an ink key's pressed tone; Ask's stop key presses to it.
- pressed-sweep.test.ts: no `:active` outside a hover query, and each copy follows and matches its twin.

### Why

- Auditor B6: iOS painted :active on the first frame of a scroll.

### Verification

- pressed-sweep.test.ts. Needs a look in light and dark (the stop key).
