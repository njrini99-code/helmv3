# 2026-11-14 — tournaments

## 2026-11-14 — Tournaments asks its own flag only

```text
Design package: none (owner decision 2026-11-14: "No allowlist, complete replacement of fairway")
PR/commit:      agent/retire-fairway
Contract IDs:   none added or reworded
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- The tournament server actions (`tournaments.ts`, `tournaments-player.ts`,
  `tournaments-holes.ts`) no longer check `golf_clubhouse_ui`, which is
  removed; `golf_tournaments_v1` and the role still decide.

### Why

- The owner retired Fairway's coach and player screens on 2026-11-14:
  Clubhouse is the only UI, for every team.

### Verification

- `src/app/golf/actions/__tests__` tournament tests.
- Not checked in a browser or on a device in this change.
