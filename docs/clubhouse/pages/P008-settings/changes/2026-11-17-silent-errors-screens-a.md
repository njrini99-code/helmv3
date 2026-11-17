# 2026-11-17 — Silent errors reported (screens-a)

## 2026-11-17 — Settings failures that were swallowed now reach error tracking

```text
Design package: none
PR/commit: branch agent/ch-silent-errors-screens-a
Contract IDs: none
Actions: none
Data impact: none (reporting only)
Held items: none
```

### Changed

- A test push the server refuses is reported with `chReport` (low); a thrown
  one already was.
- Quiet-by-design catches (a body that is not JSON, no Supabase config in a
  preview) carry a one-line comment.

### Why

- The owner asked to fix the errors: every swallowed failure in Clubhouse is
  reported through the existing pipeline. Nothing the person sees changes.

### Verification

- Typecheck, eslint on the changed files, and the Settings vitest suites.
