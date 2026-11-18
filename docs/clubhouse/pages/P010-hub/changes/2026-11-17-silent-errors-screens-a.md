# 2026-11-17 — Silent errors reported (screens-a)

## 2026-11-17 — Team Hub failures that were swallowed now reach error tracking

```text
Design package: none
PR/commit: branch agent/ch-silent-errors-screens-a
Contract IDs: none
Actions: none
Data impact: none (reporting only)
Held items: none
```

### Changed

- A post's attachment list that fails (thrown or refused) is reported with
  `chReport`; it keeps its failed notice and Try again.
- Marking an update read and marking Travel seen are reported when they throw
  or are refused; the badge behaves as before.

### Why

- The owner asked to fix the errors: every swallowed failure in Clubhouse is
  reported through the existing pipeline. Nothing the coach sees changes.

### Verification

- Typecheck, eslint on the changed files, and the Hub vitest suites.
