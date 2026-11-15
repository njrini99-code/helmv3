# 2026-11-15 — Practice

## 2026-11-15 — Practice reads the team's clock, leaves called-off practices out, and keeps an all-day practice on its day

```text
Design package: none (launch readiness 2026-11-15, DF-C-07, DF-C-08 + DF-P-09, DF-C-09 P1; Batch 4)
PR/commit:      claude/project-thread-vledif
Contract IDs:   none added or reworded
Actions:        none
Data impact:    none (reads only)
Held items:     none
```

### Changed

- `data/practice-home.ts` and `data/practice-plan.ts` read the team's clock with `loadTeamZone` (the settings zone every Clubhouse
  loader reads). Before, they read `golf_teams.timezone`, which Settings never writes.
- Coach Practice: the read of plans' practices by id drops a practice the coach called off, as the week's read already did. A
  called-off practice is no longer a row, a day on the week strip or Up next. Its plan stays in the copy list, labelled "Cancelled",
  because the blocks are still the coach's to reuse.
- Player Practice: a practice the coach called off is left out of the week, Next and the lists. Its plan page reads as gone, even
  while the version stays live. The coach still opens their own plan.
- All-day practice: placed on the date it was written for (`eventDaySpan`, the calendar's helper), not zoned to the day before west
  of UTC. It reads "All day" on the strip and in the lists, adds no hours to "N h of practice this week", is over only after its last
  day, and its two first blocks are named without clock times.

### Why

- DF-C-07: the plan page, the week strip and Practice home could each be a day off the Calendar for a team whose zone is set in
  Settings.
- DF-C-08 + DF-P-09: cancelled practices came back, on the coach's Practice through the read by id and on the player's through a
  read with no filter.
- DF-C-09: an all-day Friday practice sat on Thursday in Los Angeles, and one with a next-day end added 24 hours to the week.

### Screenshots

- None taken in this change. The layout is unchanged; an all-day practice's time reads "All day", and a called-off practice's plan
  appears only in the copy list.

### Verification

- `data/__tests__/practice-home-dates.test.ts` (new): a Wednesday-evening practice in Los Angeles on Wednesday, an all-day Friday on
  Friday with two hours for the week, a called-off Thursday in no list and in the copy list; the player's Practice without it. Both
  cases fail on the old code.
- `data/__tests__/practice-plan.test.ts`: a player's plan for a called-off practice is gone while the coach's opens; the day reads
  the settings zone, not the team row's. Both fail on the old code.
- Not checked in a browser or on a device in this change.
