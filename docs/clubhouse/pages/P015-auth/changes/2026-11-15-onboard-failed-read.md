# P015 Auth — 2026-11-15

## 2026-11-15 — A failed profile read on /golf/player is said

```text
Design package: none (Nov 15 gap pass, GAP-PASS-FINDINGS.md, GAP-S-04, GAP-R-04)
PR/commit:      claude/project-thread-pryzf0
Contract IDs:   150690 (CH-15290)
Actions:        completePlayerOnboarding (guard added, no new action)
Data impact:    none (no schema change; the action now refuses to write a player
profile for an onboarded coach)
Held items:     none
```

### Changed

- `data/onboard.ts` (`loadPlayerOnboard`):
  - A failed coach, player or role read is `failed`. It is no longer taken as a
    new player.
  - The role follows the dashboard layout's own rule (`pickGolfDashboardRole`):
    when both profiles exist and neither is finished, users.role decides.
- `routes/onboard.tsx` and `screens/auth/GateLoading.tsx` (`GateFailed`): a
  failed read draws the sign-in room with "We couldn’t check your account just
  now. Nothing you saved is lost. Try again." and Try again (CH-15290). It
  never draws the blank player form.
- `src/app/golf/actions/onboarding.ts` (`completePlayerOnboarding`):
  - It reads both profiles first, and refuses when a read fails.
  - It refuses an onboarded coach.
  - It rewrites nothing for a player who already finished.

### Why

- GAP-S-04 (P0): a coach or an onboarded player whose read blipped was handed
  the blank player form. Submitting it could create a player profile for a
  coach.
- GAP-R-04: an account with an unfinished coach row and an unfinished player
  row was bounced between /golf/player and the dashboard.

### Verification

- `src/clubhouse/data/__tests__/onboard-load.test.ts` (new, 9 tests) passes.
