# Shared silent errors — Changelog

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

- `lib/sign-out.ts`: a local sign-out that fails after the route and global
  sign-out failed is reported (medium), never awaited on. A comment on the push
  teardown catch.
- `lib/use-class-day.ts`: a class-day read that fails or throws is reported
  (`classes.day`, low); the last good payload still stands.
- `lib/use-conversation-team.ts`: a failed conversation team read is reported
  (`messages.thread`, low); the class line stays hidden.
- `lib/dates.ts`, `lib/deep-link.ts`, `lib/haptics.ts`, `lib/light.ts`,
  `lib/session-state.ts`: a comment on each catch that is not an error (unknown
  zones, storage, a missing haptics plugin).
- Dashboard layout (`src/app/golf/(dashboard)/layout.tsx`): the coach team-name
  read and the slow path's profile re-reads log their errors
  (`clubhouse.shell.*`). Qualifier and round tab titles log a failed read.

### Why

- The owner asked to "just fix the errors" (2026-11-17): a failure the screen
  swallowed now reaches Sentry, error_logs and Bridge, tagged ui=clubhouse, so
  it can be seen and ranked.

### Verification

- `npx eslint` on the changed files, `npm run typecheck:fast`, and
  `npx vitest run` on the tests that import them.
