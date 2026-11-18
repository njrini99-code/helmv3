# Stats player silent errors — Changelog

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

- `routes/stats.tsx`: a coach's player reads that throw past their own logging
  are logged (`clubhouse.stats.coachReads`); the section still shows its failed
  state.

### Why

- The owner asked to "just fix the errors" (2026-11-17): a failure the screen
  swallowed now reaches Sentry, error_logs and Bridge, tagged ui=clubhouse, so
  it can be seen and ranked.

### Verification

- `npx eslint` on the changed files, `npm run typecheck:fast`, and
  `npx vitest run` on the tests that import them.
