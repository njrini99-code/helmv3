# 2026-10-24 — One section-header style and one card-title style (row 32)

## 2026-10-24 — the section and card-title roles in use

```text
Design package: none (Clubhouse A+ handoff, row 32; lane B, logged by S1)
PR/commit:      c02956d12 (agent/clubhouse-aplus-phase2, #2361)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     Round review's zone card heads and the briefing card title stay at 15 (they would grow)
```

### Changed

- `.ch-sec__title` and 10 screens' section heads read `--ch-type-section`; three screens' card heads at 17 semibold read `--ch-type-card-title` (same values).
- `.ch-surface__title` moves from 15/1.35 with a raw -0.012em to the card-title role (17/22, step tracking): every Surface card title grows 15 -> 17 (decision J).

### Why

- Row 32: one style each for section headers and card titles.

### Verification

- look-feel-pass-css.test.ts (the primitives are the roles). Needs a screenshot review of Surface titles.
