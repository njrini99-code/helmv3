# 2026-11-17 — Roster: silent errors reported

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

- The export, invite share and copy catches say why they are not reported (a
  browser refusal, already told in a toast). No behaviour change.

### Why

- Every swallowed failure is either reported or says why it is not.

### Verification

- `__tests__/rounds-silent-errors.test.ts` (new: a failed recovery cache or
  queue
  read and a queued copy a discard couldn't drop are reported; the scan and the
  discard still behave as before). Related suites (round entry, recovery, setup,
  qualifiers, roster, stats, tournaments import, practice) pass; tsgo
  `--noEmit` exit 0; eslint on every changed file exit 0;
  `node scripts/clubhouse/check.mjs` clean. Not re-shot: nothing drawn changed.
