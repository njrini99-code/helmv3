# P016 Tournaments — 2026-11-13

## 2026-11-13 — Set up from calendar shows a multi-day entry's span (F-0025)

```text
Design package: none (audit 2026-11-13, F-0025)
PR/commit:      agent/ch-look-data-honesty
Contract IDs:   none new
Actions:        none new
Data impact:    none (reads end_time too)
Held items:     none
```

### Changed

- `data/tournaments.ts`: the untracked tournament read takes `end_time`.
- `screens/tournaments/setup-groups.ts`: `calendarEntryOf` reads each entry's
  first and last day as the calendar does (`eventDaySpan`: a timed entry on the
  team's clock, an all-day one by its written dates or the team's own day
  edges), and a group ends on its latest day.

### Why

- F-0025: "Tri-State Invitational · Aug 27 · 1 calendar entry" for one entry
  from 27 to 29 Aug; it now reads "Aug 27 – 29 · 1 calendar entry". Fall
  Invitational (all day, 04:00Z to 03:59Z) reads Oct 2 – 3, not a third day.

### Verification

- `src/clubhouse/screens/tournaments/__tests__/setup-groups-span.test.ts`
  (RED, then GREEN); `src/clubhouse/__tests__/tournaments-p5.test.tsx` passes.
- No screenshots: no browser in this slice (lead's instruction).
