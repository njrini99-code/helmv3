# 2026-11-17 — silent errors (data loaders)

## 2026-11-17 — Home week roster filter commented as benign

```text
Design package: none (owner: "just fix the errors", 17 Nov 2026)
PR/commit:      branch agent/ch-silent-errors-data
Contract IDs:   none
Actions:        none
Data impact:    none (reporting only)
Held items:     none
```

### Changed

- Nothing changes. The week's roster filter `.catch` is commented: a rejected
  roster read rejects the loader's own read too, and a failed one is reported
  there.

### Why

- A read that failed without reporting left nothing in Sentry or error_logs, so
  a broken read could only be found by a coach or player noticing. Every such
  spot in the loaders now reports through the existing pipeline, tagged
  ui=clubhouse (no new report).

### Verification

- `npm run typecheck:fast`, `npx eslint` on the changed files, and the vitest
  files that import them.
