# 2026-10-25 — New event form on the Tournaments page

## 2026-10-25 — A coach can create a tournament from the Tournaments page

```text
Design package: design/handoff v3 (unchanged)
PR/commit:      branch agent/tournament-creator
Contract IDs:   CH-16301 (no longer drawn by the new-event form); CH-6147,
                CH-6140, CH-6040 and the CH-614x refusals (reused, not new)
Actions:        createTournamentFromCalendar (existing; the calendar's write)
Data impact:    none; the same RPC and tables as the calendar editor
Held items:     none
```

### Changed

- `/tournaments/new` (the Add event buttons on Events, Compare and History)
  draws the real form instead of "isn’t built yet": the name, the calendar
  editor's shared tournament fields (days, course, rounds, counting, format,
  more details), an optional qualifier, the receipt sentence and Create
  tournament. Create saves through the calendar's own write, so a tournament
  made here and one made from the calendar are the same thing, then opens the
  event desk with the "is set up in Tournaments" toast. A refused save stays on
  the page with the reason.
- The form's data now carries `teamId`, `timezone` and `today`, read from the
  team by `loadTournamentForm` (the first tee is a wall-clock time in the team's
  zone).
- `?from=` prefills the name only; nothing links to it yet.
- Not in this change: editing an event (`/[id]/edit` still draws the
  placeholder), advice givers and field teams (the create RPC takes neither).
