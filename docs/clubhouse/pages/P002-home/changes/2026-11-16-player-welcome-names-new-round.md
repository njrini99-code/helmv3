# 2026-11-16 — home

## 2026-11-16 — Home: the player's no-rounds welcome names New round

```text
Design package: owner, 16 Nov 2026 (decision card: "Fix the welcome wording only"), from the staging shots for lay-01
PR/commit:      claude/project-thread-labmrh
Contract IDs:   none added or reworded (CH-2312 wording in catalog/home.md)
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- The CH-2312 welcome that stands in for the rounds, scoring and game (the team
  has events, the player has no round yet) now reads "Post your first round
  with New round, and your latest round, scoring line and game fill in here."
  when round entry is on, so its words point at the head's New round and not
  only at Add classes. Without round entry it keeps the old line.

### Why

- On staging the welcome asked for a first round while its only button was Add
  classes. Player Home's layout is unchanged.

### Verification

- Unit: `no-rounds-welcome.test.tsx`. Not re-shot: the staging demo player.
