# 2026-11-17 — silent errors (data loaders)

## 2026-11-17 — Shared stats action context reports a throw

```text
Design package: none (owner: "just fix the errors", 17 Nov 2026)
PR/commit:      branch agent/ch-silent-errors-data
Contract IDs:   none
Actions:        none
Data impact:    none (reporting only)
Held items:     none
```

### Changed

- Nothing changes on the page. The shared stats action context
  (`stats-detail.ts`) reports a throw; the actions still check for themselves.

### Why

- A read that failed without reporting left nothing in Sentry or error_logs, so
  a broken read could only be found by a coach or player noticing. Every such
  spot in the loaders now reports through the existing pipeline, tagged
  ui=clubhouse (chLogServer surface stats).

### Verification

- `npm run typecheck:fast`, `npx eslint` on the changed files, and the vitest
  files that import them.
