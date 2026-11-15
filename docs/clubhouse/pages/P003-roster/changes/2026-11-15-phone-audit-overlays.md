# 2026-11-15 — roster

## 2026-11-15 — Leader cards and the phone list are named by their face

```text
Design package: none (production audit 2026-11-15, CLUBHOUSE-PROD-AUDIT-FINAL.md)
PR/commit:      claude/project-thread-7ygzj3 (QUEUE pa-ovl-01 to pa-ovl-12)
Contract IDs:   none new
Actions:        none new
Data impact:    none
Held items:     none
```

### Changed

- A leader card is named from what it draws (label, figure, unit, player) with "Open profile" for a screen reader only, instead of an aria-label that disagreed with it (MAC-09, N13C-19).
- On the phone list the form stub bars are drawn only (aria-hidden) and the row's name says "no rounds yet" in words (MAC-20).
- Small keys reach 44 by 44 on the phone without changing how they are drawn.

### Why

- The 15 Nov production audit: phone layout, overlays and names that disagreed with the screen.

### Verification

- `screens/roster/__tests__/leaders-rule.test.tsx`, `__tests__/roster*.test.tsx` (jsdom).
- A real-iPhone pass (tier D) is still owed.
