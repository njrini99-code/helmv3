# 2026-11-17 — silent errors (data loaders)

## 2026-11-17 — Class reads report a failed read instead of a quiet null

```text
Design package: none (owner: "just fix the errors", 17 Nov 2026)
PR/commit:      branch agent/ch-silent-errors-data
Contract IDs:   none
Actions:        none
Data impact:    none (reporting only)
Held items:     none
```

### Changed

- Nothing a coach or player sees changes. The team's terms, breaks and schedule
  coverage reads (`data/class-day.ts`, browser side) now report a failed read
  through chReport (`home.classLine`, `classes.breaks`) before answering null,
  as they did. A table that isn't applied yet is still "none saved", unreported.

### Why

- A read that failed without reporting left nothing in Sentry or error_logs, so
  a broken read could only be found by a coach or player noticing. Every such
  spot in the loaders now reports through the existing pipeline, tagged
  ui=clubhouse (chReport).

### Verification

- `npm run typecheck:fast`, `npx eslint` on the changed files, and the vitest
  files that import them.
