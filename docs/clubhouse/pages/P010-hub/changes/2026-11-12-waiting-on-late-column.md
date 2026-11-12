# 2026-11-12 — hub

## 2026-11-12 — Waiting on: one figure a cell, and who is late (W22)

```text
Design package: none (preview grade fix, PREVIEW_ISSUES.md)
PR/commit:      agent/preview-fixes-f9
Contract IDs:   none new
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- Late tasks are a column of their own (sortable); every cell is one number; rounds are only the count. A late task or no rounds takes the warning ink.
- The heading counts who has a late task ("Nothing late" when none), not who owes anything.

### Why

- Nick's walk (W22): "5 late 7" read as one figure, and "8 of 8 owe something" flagged everyone.

### Verification

- `hub.test.tsx` (heading, cells, Late sort, colspan), `hub-summary.test.ts`: exit 0.
