# 2026-10-28 — Classes: the phone names a team event under the days

## 2026-10-28 — Design picks: the timetable header on the phone

```text
Design package: none (design picks 2026-10-28, changes/2026-10-28-design-picks.md)
PR/commit:      polish/clubhouse-design-picks
Contract IDs:   none (the header is drawing, aria-hidden)
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- Phone: a team event that meets a class this week ("Pinehurst qualifier") is
  named on a line under the days, at 12px, its day first ("Thu Pinehurst
  qualifier"). Its day column keeps the field-green band. The chip in the day
  column was 11px, under the phone's 12px floor, and at 12px "Pinehurst" no
  longer fit the column. Desktop keeps the chip in the day's column.

### Verification

- `classes.test.tsx` (P012-A1/A2 header case).
