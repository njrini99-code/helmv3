# 2026-11-17 — Qualifiers: silent errors reported

## 2026-11-17 — Swallowed failures reach the error pipeline (screens-b)

```text
Design package: none
PR/commit: agent/ch-silent-errors-screens-b
Contract IDs: none
Actions: none
Data impact: none (reporting only)
Held items: none
```

### Changed

- `QualifierForm.tsx`: a tie rule or exemptions write that fails after Create (thrown or refused) is reported (`qualifiers.form`, high). The toast already said it didn't save; nothing tracked it, since the create itself succeeded.
- `return-state.ts`: the storage read says why its catch is empty.

### Why

- A write whose failure was invisible to the error pipeline.

### Verification

- `__tests__/rounds-silent-errors.test.ts` (new: a failed recovery cache or queue
  read and a queued copy a discard couldn't drop are reported; the scan and the
  discard still behave as before). Related suites (round entry, recovery, setup,
  qualifiers, roster, stats, tournaments import, practice) pass; tsgo
  `--noEmit` exit 0; eslint on every changed file exit 0;
  `node scripts/clubhouse/check.mjs` clean. Not re-shot: nothing drawn changed.
