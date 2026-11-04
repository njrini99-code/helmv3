# 2026-11-03 — Classes: the redesign behind the lane's flag

## 2026-11-03 — PR 9: term card, Today, Overlaps, binders (clubhouse_classes_roster_home_v1, off)

```text
Design package: design-refresh/classes-roster-home/ (PR 9)
PR/commit:      agent/crh-pr9-classes
Contract IDs:   as today's Classes
Actions:        + opens Add class and Import schedule; both today's sheets
Data impact:    none
Held items:     none
```

### Changed

- Phone Classes branches on the flag in ClassesView; new cards in ClassesCrh.tsx. Desktop and flag-off screens are unchanged.

### Verification

- classes-crh.test.tsx (new). Not run yet: the owner deferred testing to the end of the build.
