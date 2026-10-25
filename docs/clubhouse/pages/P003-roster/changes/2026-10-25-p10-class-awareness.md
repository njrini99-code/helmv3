# 2026-10-25 — Class awareness (P-10): the class line on Roster

```text
Design package: P-10 Class awareness (plan 2026-10-24, changelog 2026-10-25)
PR/commit: branch claude/clubhouse-class-awareness
Contract IDs: none (no new CH code)
Actions: none
Data impact: reads golf_team_class_day through the shared class-day cache; no Roster query changes. `ChRoster.teamId` is returned by loadRoster (optional in fixtures)
Held items: the migrations; with class_awareness_v1 off nothing is read and nothing is drawn
```

### Changed

- A player in a class, an exam or about to be in one reads "In class until 11:50 AM" (or "In an exam until", "Class at") in the face's note slot, the list row's second line, the phone row's second line and the peek, where a source line follows: "From Theo's class schedule · STAT 201".
- Priority in the note slot: a confirmed trip, then Injured or Away, then the class, then "needs a look" and form. A class line never hides an injury.
- The lines do not change under a finger: while a pointer is down on the list they hold still, and catch up when it lifts. A minute tick that changes no words changes nothing.
- The peek no longer draws a leading inset rim, and the team-average marker on the spread is a 6 px dot above its label instead of a 2 px left-border line (plan 4.0: no stripes).

### Verification

- class-line.test.ts and class-awareness-roster.test.tsx.
