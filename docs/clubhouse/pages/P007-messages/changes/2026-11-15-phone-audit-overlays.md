# 2026-11-15 — messages

## 2026-11-15 — The hold menu arrives as a menu; the thread scrolls one way

```text
Design package: none (production audit 2026-11-15, CLUBHOUSE-PROD-AUDIT-FINAL.md)
PR/commit:      claude/project-thread-7ygzj3 (QUEUE pa-ovl-01 to pa-ovl-12)
Contract IDs:   none new
Actions:        none new
Data impact:    none
Held items:     none
```

### Changed

- The hold's reaction bar and menu, and the glass menu, open from .96 over the quick beat on the sheet curve, not from .5 on the overshooting pop or .8 on the lift spring (OVL-15, OVL-16).
- The Messages sheet has no blur under its dim; it dims as every Modal does (OVL-14). Layers: popover under sheet under toast.
- The thread scrolls up and down only; the hidden time column can no longer drag it sideways (DM-01, PL-MSG-01).
- Safe-area insets come from the shared `lib/safe-area.ts`.

### Why

- The 15 Nov production audit: phone layout, overlays and names that disagreed with the screen.

### Verification

- `screens/messages/overlays/__tests__/glass-menu.test.tsx`, `lift-motion.test.tsx` (jsdom).
- A real-iPhone pass (tier D) is still owed.
