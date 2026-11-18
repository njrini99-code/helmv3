# 2026-11-17 — silent errors (data loaders)

## 2026-11-17 — Calendar and Hours loaders report what they swallowed

```text
Design package: none (owner: "just fix the errors", 17 Nov 2026)
PR/commit:      branch agent/ch-silent-errors-data
Contract IDs:   none
Actions:        none
Data impact:    none (reporting only)
Held items:     none
```

### Changed

- Nothing a coach or player sees changes. Hours now reports a failed team or
  organization read behind the division (the week was quietly drafted on the
  Division I default), and a thrown division read.
- Calendar: a stored recurrence rule the parser can't read is commented as
  benign where it is caught (nothing failed).

### Why

- A read that failed without reporting left nothing in Sentry or error_logs, so
  a broken read could only be found by a coach or player noticing. Every such
  spot in the loaders now reports through the existing pipeline, tagged
  ui=clubhouse (chLogServer surface hours).

### Verification

- `npm run typecheck:fast`, `npx eslint` on the changed files, and the vitest
  files that import them.
