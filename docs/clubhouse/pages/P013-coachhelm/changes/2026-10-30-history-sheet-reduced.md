# 2026-10-30 — CoachHelm: History sheet under Reduce Motion

## 2026-10-30 — The History sheet keeps its drag under Reduce Motion (F-0018)

```text
Design package: none (Clubhouse audit 2026-10-29-720962bc4, F-0018; fix plan
                PR 5)
PR/commit:      claude/audit-fix-05-motion (#2416)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- chat/History.tsx passes reduced to useSheetDrag: the sheet follows the
  finger and settles at once.

### Verification

- sheet-drag-reduced.test: red on main, green after.
