# P004 Stats (team) — 2026-11-15

## 2026-11-15 — The phone’s first run is the shared one

```text
Design package: none (Nov 15 gap pass, GAP-PASS-FINDINGS.md, GAP-S-22)
PR/commit:      claude/project-thread-pryzf0
Contract IDs:   CH-4310 row updated
Actions:        none new
Data impact:    none
Held items:     none
```

### Changed

- `screens/stats/StatsTeamPhoneShs.tsx`: a team with no rounds this season gets
  `StatsTeamFirstRun` on the phone too ("No stats yet", with View roster, or
  Invite players when nobody is on the roster), replacing a hand-rolled block.

### Why

- GAP-S-22: the phone drew its own empty block with different words and no
  action.

### Verification

- `screens/stats/__tests__/stats-states.test.tsx` (rewritten on purpose to
  assert CH-4310; an Invite players case added).
