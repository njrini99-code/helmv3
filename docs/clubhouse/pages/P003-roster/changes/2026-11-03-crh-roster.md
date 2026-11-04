# 2026-11-03 — Roster: the redesign behind the lane's flag

## 2026-11-03 — PR 8: team card, leaders, cards and profile (clubhouse_classes_roster_home_v1, off)

```text
Design package: design-refresh/classes-roster-home/ (PR 8)
PR/commit:      agent/crh-pr8-roster
Contract IDs:   as today's Roster (CH-32xx, CH-33xx)
Actions:        none new; today's actions, with busy and rollback states
Data impact:    none (practice rounds left out of the lane's averages under the
                flag)
Held items:     none
```

### Changed

- Phone Roster, player view and profile as new components beside today's, chosen
  by the flag. Desktop Roster and peek branch on it.
- data/season.ts: `countsForScoring`, `course_id` in the round columns.
- Modal: optional `detent` and `atRest`; every other caller is unchanged.

### Verification

- screens/roster/__tests__/roster-crh.test.tsx (new). Not run yet: the owner
  deferred testing to the end of the build.
