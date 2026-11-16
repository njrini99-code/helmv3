# 2026-11-15 — hub

## 2026-11-15 — Named delete confirms and the task count in words

```text
Design package: none (production audit 2026-11-15, CLUBHOUSE-PROD-AUDIT-FINAL.md)
PR/commit:      claude/project-thread-7ygzj3 (QUEUE pa-ovl-01 to pa-ovl-12)
Contract IDs:   none new
Actions:        none new
Data impact:    none
Held items:     none
```

### Changed

- Delete asks with the item's own name and focuses Cancel: an action sheet on
  the phone, an alert dialog on a desk (NP-05, S3.6).
- A task row's count is words in the button's name (", 3 of 5 done"), and the
  mini bar is drawn only (MAC-20).
- Ledger rows set `aria-controls` only while their panel is open (PMAC-13).

### Why

- The 15 Nov production audit: phone layout, overlays and names that disagreed
  with the screen.

### Verification

- `__tests__/hub.test.tsx` (jsdom).
- A real-iPhone pass (tier D) is still owed.
