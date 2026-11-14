# 2026-11-13 — calendar

## 2026-11-13 — The week strip days and the title are named by what they show

```text
Design package: none (audit 2026-11-13, F-0011; no visible change)
PR/commit:      agent/ch-look-a11y
Contract IDs:   none added or reworded
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- The phone week strip's days are named with their face first, "S 8, Sun 8, 0 events"
  (the shared `WeekStrip`, logged in `docs/clubhouse/changes/2026-11-13-a11y-names-focus.md`).
- The desktop title (`.ch-cal-title`) keeps "October 2026" apart for its name to match
  it; the space is not drawn (a flex row).

### Why

- Audit 2026-11-13 F-0011 (S2, axe `label-content-name-mismatch`, WCAG 2.5.3 Label in
  Name): the name a screen reader and Voice Control use did not hold the words on the
  control, so a voice-control user who said what they saw could not reach it.

### Verification

- `src/clubhouse/__tests__/calendar.test.tsx` (strip names),
  `calendar-keyboard-focus.test.tsx` (the title's name opens with its face).
