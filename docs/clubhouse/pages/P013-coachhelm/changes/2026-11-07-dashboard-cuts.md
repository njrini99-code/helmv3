# 2026-11-07 — coachhelm

## 2026-11-07 — Dashboard cuts

```text
Design package: design-refresh/redesign-ui-sweep-2026-11-06
PR/commit:      agent/ch-dash-cuts
Contract IDs:   none new
Actions:        none new
Data impact:    none
Held items:     none
```

The CoachHelm Brief tab is gone, with its `?view=brief` page and its link on the board. An old `?view=brief` is the board; an old /intelligence link is the board, the named player, or Ask. Its loaders stay: they feed the Team board. Only the Brief drew goals and standing, the cleared and out-of-date rows, the team line and `since` on focus rows.

The Team player sheet is a peek: name, rounds and strokes gained on one line, and the way into the player's file. The Read summary card (`ReadSummaryCard`, `toChReadSummary`) is gone with its board preview. With `coachhelm_player_file_v1` on (preview), a player's board is Your week and a coach's player is the file; the flag and its off branch stay, since no flag is flipped here.
