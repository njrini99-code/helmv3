# 2026-11-17 — Rounds: silent errors reported

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

- Round entry (`entry/RoundRuntime.tsx`): a failed discard from the Exit sheet,
  a failed change to practice, and a discard or change the engine failed later
  through its `error`, are reported to Sentry (`rounds.entry`, high). Each was
  drawn on its sheet but, being quiet to `useAction`, never tracked.
- Recovery (`recover/ports.ts`, `recover/scan.ts`): a restore, discard or retry
  sync that throws is reported with the throw itself (high); a device copy that
  couldn't be cleared after the server took the round is reported (medium); a
  recovery cache or queue read that fails is reported (high) and still reads as
  empty.
- Library discard (`writes.ts`): a queued copy it couldn't drop is reported
  (medium); the discard mark still keeps it from syncing.
- Round setup (`setup/LiveShareField.tsx`): a live-share level the server never
  took (a thrown request, before an unhandled rejection) is reported.
- Round review: a recap request that throws, and a share card that fails to
  draw, are reported (low).
- Storage, wake lock, share sheet and history catches that are not failures now
  say why in a one-line comment.
- The retry and queue behaviour of round entry and the offline round queue is
  unchanged.

### Why

- A swallowed failure on the round paths can lose a player's scores without
  anyone seeing it; the owner asked for every Clubhouse error to reach the
  pipeline (ui=clubhouse).

### Verification

- `__tests__/rounds-silent-errors.test.ts` (new: a failed recovery cache or
  queue
  read and a queued copy a discard couldn't drop are reported; the scan and the
  discard still behave as before). Related suites (round entry, recovery, setup,
  qualifiers, roster, stats, tournaments import, practice) pass; tsgo
  `--noEmit` exit 0; eslint on every changed file exit 0;
  `node scripts/clubhouse/check.mjs` clean. Not re-shot: nothing drawn changed.
