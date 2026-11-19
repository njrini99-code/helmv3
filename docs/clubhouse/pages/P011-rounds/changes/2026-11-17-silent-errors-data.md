# 2026-11-17 — silent errors (data loaders)

## 2026-11-17 — Course key decode commented as benign

```text
Design package: none (owner: "just fix the errors", 17 Nov 2026)
PR/commit:      branch agent/ch-silent-errors-data
Contract IDs:   none
Actions:        none
Data impact:    none (reporting only)
Held items:     none
```

### Changed

- Nothing changes. A malformed escape in a hand-edited course address is
  commented as not a failure where it is caught.

### Why

- A read that failed without reporting left nothing in Sentry or error_logs, so
  a broken read could only be found by a coach or player noticing. Every such
  spot in the loaders now reports through the existing pipeline, tagged
  ui=clubhouse (no report needed).

### Verification

- `npm run typecheck:fast`, `npx eslint` on the changed files, and the vitest
  files that import them.
