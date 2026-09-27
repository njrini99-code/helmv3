# INC-2026-09-27: a network blip dropped insight exposure rows and opened a Bridge error

- Feature: `coachhelm_ai`
- Surface: `GET /golf/dashboard/coachhelm` (any surface that records insight exposure)
- Status: FIX IN PR #2082 (agent/health-20260927-1147); production 6ee77e98e as of 2026-09-27 15:48Z
- Risk: R1. Retry path of a fire-and-forget analytics insert. No schema, RLS, grant or data-shape change.
- Signal: Bridge fingerprint `f34bc102` (`recordInsightExposure insert failed: TypeError: fetch failed`, errorCode empty), 2026-09-27 15:41:58Z, 1 event, 17 rows; the same request raised Sentry JAVASCRIPT-NEXTJS-WX and YW. The fingerprint was previously resolved 2026-09-10 and reopened 2026-09-14; its only analysis ("ALREADY FIXED — migration 20260909230000") described a different failure.

## What was wrong

`recordInsightExposure` (`src/lib/coachhelm/v3/effectiveness/event-ledger.ts`)
has one bounded retry for transient network faults, but it sat in the `catch`
around the attempt, so it only saw a THROWN failure. postgrest-js catches the
fetch rejection and RESOLVES it as `{ message: 'TypeError: fetch failed', code: '' }`
(the second shape documented in `src/lib/utils/transient-error.ts`). That
shape fell through to `logServerError` at error severity: the exposure rows
were lost (undercounting `shown` and blinding the A9 confounding baseline) and
the Bridge opened an incident for a network blip.

## Fix

- After the insert, a returned error that `isTransientFetchError` classifies
  as transient is rethrown into the existing bounded retry. Constraint and RLS
  errors still log once and are never retried. The retry stays safe: the
  dedup read re-checks what committed.

## Proof

- `src/lib/coachhelm/v3/effectiveness/exposure-transient-retry.test.ts`: 2 of 3
  tests fail on origin/main 1a326692d (insert called once, not twice) and all
  pass with the fix; the 31 existing `event-ledger.test.ts` tests pass unchanged.
- Replay: `replay/manifests/exposure-returned-transient-retry-2026-09-27.yml`.

## Verify in production

After deploy: `f34bc102` stops recurring as an error; a blip that survives the
retry shows as a single warning, "recordInsightExposure threw (after 1 retry)".
