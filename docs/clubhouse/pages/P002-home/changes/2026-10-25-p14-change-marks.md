# 2026-10-25 — Home: change marks (P-14)

## 2026-10-25 — Since you last looked tells of a schedule change; Up next and the agenda show what it was

```text
Design package: none (Clubhouse premium features, build plan P-14 and the 2026-10-25 changelog)
PR/commit:      claude/clubhouse-change-marks
Contract IDs:   CH-6023 (shared with the Calendar; Home reads the same marks)
Actions:        none
Data impact:    reads golf_events.metadata->change (one extra read per Home load); nothing is written
Held items:     supabase/migrations/20261025080000_golf_events_change_marks.sql (HELD.md)
```

Version B of the plan's open call 12.5: no automatic push. Home only reads what the Calendar already shows.

### Changed

- "Since you last looked" leads with other people's schedule changes from the last 72 hours, newest first, three rows at
  most and then one row "N more changes · Calendar". A row is a Ledger row like the others: the new start as the lead
  ("4:00", or "16:00" on the 24-hour clock), "Moved · Practice" or "Cancelled · Putting lab" as the title, and "Was 3:00 PM
  · Wed 15 April · Coach Reyes" as the line under it. A move to another day leads with the new day; a cancelled event leads
  with its old start, struck; a series edited together is one row with its count. A row opens that event on the Calendar.
- A change someone made themselves is never a row. A change this device already listed, or the player cleared with Got it on
  the Calendar, is not listed again. The first visit on a device lists nothing, as before.
- The player's phone Home gets the section for the first time, and only when there is a change row to show; it records what it
  listed either way.
- Up next (phone and desktop, coach and player) shows the same small badge in its kicker and the old value struck on its own
  line ("~~3:00 PM~~ · Finley GC"). The week's agenda rows start their detail with the old value struck.
- The loader (`data/home-changes.ts`) is one read of the team's marked events (a day back to three weeks ahead, newest 50,
  classes left out). A player's read keeps only the meetings their week already shows them, so a meeting they are not invited
  to is never a row.

### Why

A change to the plan outranks a posted round, and a player had no way to learn practice moved short of opening the Calendar.

### Not changed

- The coach's phone Home still returns early with no Since section when nothing is on today (as it does for rounds).

### Verification

- home-change-marks.test: the row for each kind, own changes left out, the series row, order, the visible filter, the cap of
  three, shown and cleared ids, the first visit, the second visit rendering and recording, the struck cancelled start, a
  player's phone with and without a change, Up next, and the loader's read and its failure path.
