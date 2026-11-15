# 2026-11-14 — coachhelm

## 2026-11-14 — CoachHelm’s shared modules move out of Fairway paths

```text
Design package: none (owner decision 2026-11-14: "No allowlist, complete replacement of fairway")
PR/commit:      agent/retire-fairway
Contract IDs:   none added or reworded
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- The modules Clubhouse CoachHelm shares with lib moved out of Fairway's tree
  unchanged: `useCoachHelmChat` to `src/hooks/coachhelm/`, the Standing bar's
  types and utils to `src/lib/coachhelm/v3/standing/bar/`, tone derivation,
  value formatting and the insight vocabulary to `src/lib/coachhelm/`, and the
  player hub view model to `src/lib/coachhelm/player-hub/`. Imports and test
  mocks follow; behavior is unchanged.
- The CoachHelm page and its old addresses draw Clubhouse only.

### Why

- The owner retired Fairway's coach and player screens on 2026-11-14:
  Clubhouse is the only UI, for every team.

### Verification

- `coachhelm*.test.tsx`, the moved modules' tests in their new `__tests__`.
- Not checked in a browser or on a device in this change.
