# P003 Roster — 2026-11-15

## 2026-11-15 — CoachHelm counts that didn’t load are one quiet notice

```text
Design package: none (Nov 15 gap pass, GAP-PASS-FINDINGS.md, GAP-S-09, GAP-S-33)
PR/commit:      claude/project-thread-pryzf0
Contract IDs:   CH-3212 row updated
Actions:        none new
Data impact:    none
Held items:     none
```

### Changed

- `screens/roster/RosterPeek.tsx`: when CoachHelm's counts for a player fail to
  load, the panel shows one muted notice, "Counts didn’t load" + "The rest of
  the page is fine. Try again." with Try again (CH-3212), instead of dashes
  inside a sentence.
- `RosterPhoneCrh.tsx`, `TeamRosterPhoneCrh.tsx`: the one failure line
  (`FAILURE_COPY.page`).

### Why

- GAP-S-09: "— costing strokes · — working" read as data, not as a failure.

### Verification

- `roster.test.tsx` › CH-3212 (the case was changed on purpose to the new words).
