# 2026-11-14 — auth

## 2026-11-14 — The Clubhouse entrance is the only one

```text
Design package: none (owner decision 2026-11-14: "No allowlist, complete replacement of fairway")
PR/commit:      agent/retire-fairway
Contract IDs:   none added or reworded
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- The old entrance pages and `golf_clubhouse_front_door` are gone. Login,
  sign-up, demo, welcome, reset password, coach and player onboarding and join
  render Clubhouse's screens from their pages; each loading boundary is drawn
  in the sign-in room. `FrontDoorProvider` (`routes/front-door.tsx`) is
  deleted.
- `SkyScript` always carries the boot cover (`skyBoot()` takes no flag).
- `/golf/forgot-password` stays for a signed-in visitor (CH-15920); a
  signed-out one always resets inside the sign-in panel.

### Why

- The owner retired Fairway's coach and player screens on 2026-11-14:
  Clubhouse is the only UI, for every team.

### Verification

- `front-door-routes.test.tsx`, `auth.test.tsx`, `auth-logic.test.ts`,
  `auth-sky-script.test.ts`, `auth-reset.test.tsx` (the old page's answers
  kept as a recorded oracle), `forgot-password/layout.test.tsx`.
- Not checked in a browser or on a device in this change.
