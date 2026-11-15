# 2026-11-14 — home

## 2026-11-14 — Home is Clubhouse’s for every coach and player

```text
Design package: none (owner decision 2026-11-14: "No allowlist, complete replacement of fairway")
PR/commit:      agent/retire-fairway
Contract IDs:   none added or reworded
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- `src/app/golf/(dashboard)/dashboard/page.tsx` draws the Clubhouse coach or
  player Home (or the no-team state) with no flag and no Fairway branch.

### Why

- The owner retired Fairway's coach and player screens on 2026-11-14:
  Clubhouse is the only UI, for every team.

### Verification

- `home.test.tsx`.
- Not checked in a browser or on a device in this change.
