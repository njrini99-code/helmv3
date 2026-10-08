# INC-2026-10-07: Close stamped designed paths REGRESSED

- Feature: `admin_selfheal`
- Surface: `/admin/errors` lifecycle (REGRESSED badge), `admin_error_resolutions.reopened_*`
- Fingerprint: 20ae8f27 (`/admin/errors/20ae8f27`), severity warning
- Status: fix in PR (agent/health-20261007-0948), commit 90ae5607f; awaiting merge and production deploy (production ef6e017a as of 2026-10-07 09:48Z)
- Risk: R1. Read-model and classifier only. No schema, RLS, grant or data change.
- Signal: `[updateShot] Shot not found` (`errorCode: shot_not_found`, `handled: true`, `soft_failure: true`), analysed NOT A DEFECT, resolved 2026-09-19, re-opened 4 times (last 2026-10-07 07:30Z).

## What was wrong

Two gaps, together:

1. `classifyIncident` did not recognise `shot_not_found`, the stable
   reconciliation code `updateShot`/`deleteShot` in `src/app/golf/actions/shot-actions.ts` (split out of golf.ts in PR 2176)
   return on purpose when a client still holds the ID of a shot that another tab
   or an earlier retry already deleted. It fell to the severity ladder
   (warning → actionable degradation).
2. `autoResolveFixedIncidents` counted every non-info row as a fault for
   regression detection, before Rule D closes non-actionable rows in the same
   pass. A designed path running again was stamped REGRESSED.

## Fix

- `classifyIncident`: `errorCode === 'shot_not_found'` → degradation,
  non-actionable, `matched: true`. Keyed on the code, so a "Shot not found"
  from any other path still shows.
- Regression detection skips rows the classifier recognises (`matched`) as
  non-actionable, the same exemption info rows already have. Unrecognised rows
  and operator-gated provider faults still regress.

## Proof

- `src/lib/admin/__tests__/auto-resolve.test.ts` "does NOT regress a
  fingerprint whose recurrence the classifier recognises as non-actionable"
  fails on 4e030fb14 (1 regression marked) and passes with the fix; the
  non-vacuity case ("still regresses an unrecognised warning") passes on both.
- `src/lib/admin/__tests__/incident-classification-benign-recurrences.test.ts`.
- Replay: `replay/manifests/designed-path-regression-noise-2026-10-07.yml`.

## Verify in production

After deploy and the next Close run: a new 20ae8f27 row is closed by Rule D and
`admin_error_resolutions.reopened_count` for 20ae8f27 stays at 4.
