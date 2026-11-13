# 2026-11-13 — Set up from calendar lands where the work is; Invite counts the listed

## 2026-11-13 — Set up from calendar ends in Tournaments, not here

```text
Design package: none (coach audit, 13 Nov 2026, §11 #1 and #3)
PR/commit:      agent/coach-fix-tournaments
Contract IDs:   none new
Actions:        none new
Data impact:    none
Held items:     none
```

### Changed

- `Calendar.tsx`: opened from the season home's Set up from calendar
  (`initialSetUp`), once that event is saved as a tournament the coach goes to
  `setUpLanding` (`editor-tournament.tsx`): Link rounds for an event whose first
  day is today or past (its players' rounds wait there), the event's desk for
  one still to come. Before, it ended on Calendar with a toast. The editor's own
  date move is skipped so it can't race the navigation. A tournament made
  straight on Calendar still stays here, with its toast.
- `editor.tsx`, `editor-round.tsx`: "Invite · n of m" counts only invitees on
  the list beside it (`listedCount`, `model.ts`): an invitee with no player
  profile read "12 of 11".
