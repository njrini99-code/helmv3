# INC-2026-08-22 — active-round stale shot delete

- Feature: `shot_tracking` (also affects the Golf Round Lifecycle feature)
- Status: repairing
- Status: released — immediate production verification passed; 24-hour Sentry observation pending.
- Risk: R2 — product workflow semantics; requires owner approval and release train.
- First seen: 2026-08-21
- Last seen: 2026-08-22
- External tracker: https://github.com/njrini99-code/helmv3/issues/1598
- Sentry: https://helm-xs.sentry.io/issues/7685521046/

## User impact

Two iOS golfers encountered `deleteShot` failures during active round tracking.
The action returned a soft `Shot not found` result that the observability
wrapper presented as a server error; clients left their stale local shot in
place and told the golfer to retry.

## Root cause and invariant

Undo and Edit Shot had separate in-flight state. Overlapping actions could act
on the same local history, and a delete whose row was already absent had no
stable reconciliation contract. An active round must not remove more than the
requested local shot, and a user-scoped server absence must not block recovery.

This does not prove which external event caused every production stale ID
(another tab, lost response, or another device remain possible). The local
overlap is reproduced by regression coverage and is repaired independently.

## Repair

- `deleteShot` preserves auth/RLS and in-progress-round checks, returning
  `shot_not_found` only for the existing non-disclosing absent-row response.
- Undo and Edit Shot share a single-flight ref and reconcile that code locally.
- Edit cascade writes are awaited before releasing the mutation gate.
- The observability layer records this result as a handled warning, not a Sentry
  error.

## Verification

- `src/hooks/golf/__tests__/shot-mutation-recovery.test.tsx`
- `src/lib/admin/__tests__/observe-action-result.test.ts`
- Remaining before release: typecheck, static preflight, production-owner
  release approval, and post-release Sentry verification.
- All required CI gates passed for PR #1601, including TypeScript, the Next
  production build, unit-test shards, Supabase RLS, CodeQL, Review Gate, and
  authenticated smoke.
- Production release: `dpl_3cEBhP4RZ72qXbY2W8UWW19Svnkp`, built from verified
  SHA `5eececafc930c1d10718371bd2954c9ec32e758c` and ready at
  `https://helmsportslabs.com` on 2026-08-22.
- Immediate smoke: homepage returned HTTP 200; the protected continuation
  route returned the expected login redirect; no error-level Vercel runtime
  logs were present for the new deployment after the smoke requests.
- Remaining: observe Sentry for recurrence over the next 24 hours before
  closing the incident.
