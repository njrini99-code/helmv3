# 2026-11-17 — silent errors (data loaders)

## 2026-11-17 — Recruiting extras report a failed read

```text
Design package: none (owner: "just fix the errors", 17 Nov 2026)
PR/commit:      branch agent/ch-silent-errors-data
Contract IDs:   none
Actions:        none
Data impact:    none (reporting only)
Held items:     none
```

### Changed

- Nothing a coach sees changes. The page's two quiet extras (the next-step
  columns probe and the program behind the recruiting calendar) report a
  thrown read, and the program's coach and team reads report an error, before
  falling back to "feature off" and "program unknown" as they did.

### Why

- A read that failed without reporting left nothing in Sentry or error_logs, so
  a broken read could only be found by a coach or player noticing. Every such
  spot in the loaders now reports through the existing pipeline, tagged
  ui=clubhouse (chLogServer surface recruiting).

### Verification

- `npm run typecheck:fast`, `npx eslint` on the changed files, and the vitest
  files that import them.
