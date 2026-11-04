# 2026-11-03 — CoachHelm: a player's private goals stay out of the coach's Deep dive

## 2026-11-03 — L0: readPlans holds a coach to the rule of goals_coach_view

```text
Design package: design-refresh/coachhelm-lenses/ (PR 0; 06 "Goals in the plan",
                W-LNS-1)
PR/commit:      agent/l0-private-goals
Contract IDs:   none
Actions:        none
Data impact:    none (read filter only)
Held items:     none
```

### Changed

- data/coachhelm-dive.ts: `readPlans` takes the viewer. For a coach it keeps a
  goal only when it is on the coach's team and is coach-made or shared with the
  coach. The player's own read is unchanged.
- data/coachhelm-player.ts: the coach's Deep dive passes its scope's team.

### Why

- Goals load through the service client, which skips RLS, so a coach's Deep dive
  could show a goal the player kept private.

### Verification

- coachhelm-read-plans.test (new). Not run yet: the owner deferred testing to
  the
  end of the build.
