# P002 Home — 2026-11-15

## 2026-11-15 — Home’s loading skeleton is declared once

```text
Design package: none (Nov 15 gap pass, GAP-PASS-FINDINGS.md, GAP-S-34)
PR/commit:      claude/project-thread-pryzf0
Contract IDs:   none (CH-2401 unchanged)
Actions:        none new
Data impact:    none
Held items:     none
```

### Changed

- `src/app/golf/(dashboard)/loading.tsx` (it drew `HomeSkeleton` a second time)
  is removed; `dashboard/loading.tsx` stays the one Home skeleton. Two comments
  that named the removed file now name the right one.

### Why

- GAP-S-34: two loading files for one page could draw two skeletons in turn.

### Verification

- `route-skeleton-address.test.tsx`, `large-title-skeletons.test.tsx`.
