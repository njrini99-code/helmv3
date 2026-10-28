# 2026-10-27 — Polish pass: Recruiting

## 2026-10-27 — "Committed" fits its stage segment

```text
Design package: none (production polish pass before launch; doctrine in .claude/rules/clubhouse.md)
PR/commit:      agent/clubhouse-polish
Contract IDs:   none changed
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- In the Add and Edit prospect sheet, the Stage control's four columns kept the
  segmented control's 16px sides, leaving "Committed" (70px of 13px type) 52px
  at 390: it started at the segment's left edge and ran past the well. The
  segments keep 4px sides here, so every label is centred in its own segment
  (`styles/recruiting.css` `.ch-rec-field .ch-seg__b`).

### Why

- A label running off its control reads as clipped.

### Verification

- Measured in WebKit: one row of four at 375 (80.8px segments) and 390 (84.5px),
  each label inside its segment; desktop unchanged in layout. Recruiting tests pass.
