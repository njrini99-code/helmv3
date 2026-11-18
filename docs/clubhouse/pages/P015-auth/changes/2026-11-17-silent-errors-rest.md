# Auth silent errors — Changelog

## 2026-11-17 — Swallowed failures are reported

```text
Design package: none
PR/commit: agent/ch-silent-errors-rest
Contract IDs: none
Actions: none
Data impact: none (reporting only)
Held items: none
```

### Changed

- `CoachPending.tsx`, `JoinTeam.tsx`, `StaffInvite.tsx`: a sign-out, join,
  accept or sign-up that throws is reported (`auth.pending`, `auth.join`,
  `auth.staff`); the messages are unchanged.
- `reset-writes.ts`: a link check or password save that throws, and a failed
  sign-out of other sessions, are reported (`auth.reset`). A spent link is not
  reported: that is the expected answer.
- `onboard/writes.ts`: a failed session read or avatar upload is reported
  (`onboard.photo`).
- `onboard/coach-guard.ts`: a failed coach or player row read is reported
  (`onboard.coach`).
- `onboard/flow.ts`, `onboard/logic.ts`: a comment on the storage and parse
  catches, which are not errors.
- `src/app/golf/(auth)/forgot-password`: a reset request or resend that throws
  is reported (`auth.forgot`).

### Why

- The owner asked to "just fix the errors" (2026-11-17): a failure the screen
  swallowed now reaches Sentry, error_logs and Bridge, tagged ui=clubhouse, so
  it can be seen and ranked.

### Verification

- `npx eslint` on the changed files, `npm run typecheck:fast`, and
  `npx vitest run` on the tests that import them.
