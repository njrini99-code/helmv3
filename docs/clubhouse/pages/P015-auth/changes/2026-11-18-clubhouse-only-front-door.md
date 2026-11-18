# P015 Auth — Changelog

## 2026-11-18 — Forgot password, error pages and the 404 are Clubhouse's

```text
Design package: none (the sign-in room's existing pieces)
PR/commit: agent/clubhouse-screen-audience
Contract IDs: CH-15920 (reworded), CH-1202 to CH-1206, CH-1290 and CH-1306 drawn outside the shell
Actions: none
Data impact: none
Held items: none
```

### Changed

- `/golf/forgot-password` for a signed-in visitor: `SignedInReset`
  (`screens/auth/SignedInReset.tsx`) draws `ResetForm` and `ResetSent` in
  `GateFrame`, with their address filled in (`ClubhouseSignedInResetRoute`)
  and Settings as the way back. The Fairway page, its sent confirmation and
  the Fairway auth canvas and golf scenes it drew are deleted. A signed-out
  visitor still goes to the sign-in panel's reset form.
- `GateError` (`screens/auth/GateError.tsx`): every non-admin golf `error.tsx`
  hands it to `RouteErrorBoundary` as `outsideShell`. A page that crashes
  outside the shell (sign in, onboarding, a join link, the shell itself) shows
  the route error's own words and number in the sign-in room, never the
  generic fallback.
- `GateNotFound`: `golf/not-found.tsx` draws GolfHelm's 404 (CH-1306) in the
  sign-in room instead of the platform page. Admin keeps the platform 404
  (`golf/admin/not-found.tsx`).
- `forgot-state.ts`: comment only (the rules came from the retired page).

### Why

- The owner, 2026-11-18: "Needs to be updated all for clubhouse only." No
  GolfHelm address outside admin draws anything but Clubhouse now, and
  `clubhouse:check` holds that (`checkGolfRoutesClubhouseOnly`).

### Verification

- `signed-in-reset.test.tsx` (ported the retired page's guard: a malformed or
  empty address never reaches the action), `auth-forgot.test.tsx`,
  `route-error-outside-shell.test.tsx`, `not-found-page.test.tsx`,
  `forgot-password/layout.test.tsx`.
