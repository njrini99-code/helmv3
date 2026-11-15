# 2026-11-15 — qualifiers

## 2026-11-15 — A hole past the shape's cap is drawn broken (stats and charts audit, CH-17)

```text
Design package: none (owner's stats and charts audit, 15 Nov 2026, section 5)
PR/commit:      claude/project-thread-szdz3m
Contract IDs:   none added or reworded
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- Round shape (`RoundsShowcase.tsx`, `holeBars`): a hole more than 2.5 strokes
  from par draws at the cap with a break a little short of its end and
  `data-clipped`, so a triple and a quadruple bogey no longer draw as the same
  hole with nothing to say so. The hole's score prints in the row under it.

### Why

- The bars were clamped silently.

### Verification

- Test: `qualifiers/__tests__/rounds-showcase.test.tsx`.
- Screenshots: before and after in the PR description.
