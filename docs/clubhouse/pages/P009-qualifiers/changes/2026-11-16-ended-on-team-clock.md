# 2026-11-16 — qualifiers

## 2026-11-16 — "Ended" follows the team's day

```text
Design package: none (launch readiness 2026-11-15, DF-P-12)
PR/commit:      claude/project-thread-vledif-pa-data-23
Contract IDs:   none added or reworded
Actions:        none
Data impact:    none (reads only)
Held items:     none
```

### Changed

- `screens/qualifiers/model.ts` and `data/qualifiers.ts`: a qualifier past
  its last day reads "Ended" once that day is over on the team's clock
  (`golf_team_settings.timezone`), on the list and on the detail page.
  Without a zone it keeps the old rule: over everywhere (UTC−12).

### Why

- A qualifier ending on a Wednesday still read Live until 8 AM Thursday on
  the East Coast, because the day was held to UTC−12.

### Verification

- `__tests__/qualifiers-premium.test.tsx` has team-zone cases that fail
  with the fixed offset. Not checked in a browser or on a device.
