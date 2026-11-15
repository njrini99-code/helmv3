# 2026-11-15 — qualifiers

## 2026-11-15 — A qualifier past its last day reads closed to a player

```text
Design package: none (prod audit 2026-11-15, P1-22, N13P-51)
PR/commit:      claude/project-thread-vledif
Contract IDs:   P009-D3 (unchanged for the coach)
Actions:        none new
Data impact:    none (reads only; no rows changed)
Held items:     none
```

### Changed

- `model.ts`, `parts.tsx`: `endedLabel` and `StatusPill` take who is looking. Past a live or upcoming qualifier's last day a player
  reads "Closed · awaiting coach’s final"; the coach still reads "Waiting on n rounds" or "Past last day" (P009-D3), since chasing
  the rounds and closing it is theirs. Every pill (list hero, list card, detail on desktop and phone) passes the viewer.
- `QualifiersList.tsx`: for a player, such a qualifier files under Concluded, not Active. The coach's list is as it was, with
  "Review and close" on the card (5d1f73de8), which is the reminder to finalise that the audit asked for.

### Why

The Fall Invitational Qualifier read Active, "Waiting on 7 rounds", 45 days after it closed, on the day the squad travelled; the
player could not tell whether they had made it (N13P-51).

### Verification

- `src/clubhouse/screens/qualifiers/__tests__/closed-for-players.test.tsx`: the label for each viewer; the player's list files it
  under Concluded with the closed label and no "Waiting on"; the coach's list keeps it under Active; before the last day is over a
  player still sees it live under Active.
- The qualifier suite (10 files, 42 tests) and `tsgo --noEmit` pass.
- Not checked in a browser or on a device in this change.
