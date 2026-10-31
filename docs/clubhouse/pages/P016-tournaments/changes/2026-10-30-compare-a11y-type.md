# 2026-10-30 — Tournaments: Compare roles, targets and tags

## 2026-10-30 — The comparison table holds only rows; tags follow Text Size (F-0016, F-0022, F-0024)

```text
Design package: none (Clubhouse audit 2026-10-29-720962bc4, F-0016, F-0022,
                F-0024; fix plan PR 8)
PR/commit:      claude/audit-fix-08-a11y-touch-type (#2419)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- CompareGrid.tsx: role="table" moves to a display: contents wrapper
  (.ch-tour-cmp-tbl) that holds only the rows; the divider and the foot sit
  beside it (F-0016).
- tournaments-compare.css: the A/B tags are the 12 role on the phone and their
  box grows with Text Size (F-0024); the divider and thumb reach 24px under a
  mouse (shared rule, F-0022).

### Verification

- screens/tournaments/__tests__/compare-grid-a11y.test.tsx (axe
  aria-required-children): red on main, green after.
