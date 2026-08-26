# Admin Platform test ledger

## 2026-08-26 — error_rate_hourly → admin_events error-trend derivation coverage

- SHA: recorded in the follow-up ledger commit on `feat/bridge-todo`.
- New: `src/app/golf/actions/__tests__/admin-system-data.test.ts` (5 tests),
  mocking `createAdminClient`/`createClient` end-to-end and exercising the
  real exported `getSystemTabData()`:
  - `error_rate_hourly` is never among the tables queried; `admin_events` is
    queried with an `event_type = 'error'` filter, a `created_at` lower
    bound, and — pinned explicitly, because getting this backwards would
    reintroduce the same bug at the row cap — `order('created_at', {
    ascending: false })`.
  - Rows at distinct hours bucket into `totalErrors`/`criticalErrors`
    (`severity = 'critical'`)/`affectedUsers` (deduped by `user_id`)
    correctly, and each returned entry's key set is exactly `hour`,
    `totalErrors`, `criticalErrors`, `affectedUsers` — no `userFacingErrors`
    key survives.
  - An `admin_events` query error degrades `errorTrend` to `[]` and logs,
    without throwing and without affecting sibling fields
    (`authMetrics`/`backgroundJobs`) — the existing `allSettled`
    degrade-one-subtree contract, now proven for this field too.
  - An empty `admin_events` result still produces one entry per hour across
    the ~7-day window (167–170, allowing for wall-clock rounding at test
    run time) with `totalErrors === 0` throughout and `errorTrendTruncated:
    false` — a real measured zero, distinguishable in principle (a genuine
    query result) from the old always-absent-data zero, not just in
    appearance.
  - A row count at `ERROR_TREND_ROW_CAP` (20,000, hardcoded in the test with
    a comment pinning it to the source constant — the module is `'use
    server'` and cannot export a sync helper to import instead) sets
    `errorTrendTruncated: true` and logs a message containing `truncated at
    ERROR_TREND_ROW_CAP`.
- Guarantee now held by test: the System tab's hourly error trend cannot
  regress back to reading `error_rate_hourly`; `userFacingErrors` cannot be
  silently reintroduced as a fabricated field without a test failing on the
  exact-key-set assertion; the row-cap ordering cannot flip back to
  ascending (which would fabricate zeros in the newest hours on a future
  spike) without the ordering assertion failing; a capped fetch cannot look
  identical to a genuinely quiet window without `errorTrendTruncated`
  catching it.
- Verification: `./node_modules/.bin/vitest run --project unit
  src/app/golf/actions/__tests__/admin-system-data.test.ts` — 5 passed.
  `tsc --noEmit` — no errors attributable to this file. `eslint` on both
  changed files — clean.

## 2026-08-26 — Legacy `/golf/admin` dashboard shell deletion

- SHA: recorded in the follow-up ledger commit on `feat/bridge-todo`.
- No new tests — this was a pure deletion of unreachable code (dead route,
  next.config.mjs 308-redirects `/golf/admin` to `/admin`), not a behavior
  change to any live surface. Deleted the 3 test files colocated with the
  removed tree (`components/__tests__/AdminErrorBoundary.test.tsx`,
  `components/__tests__/system-tab-accuracy.test.ts`,
  `components/tracer/__tests__/truncated-flag-wiring.test.ts`,
  `components/tracer/__tests__/generate-alerts-rollup.test.ts`,
  `components/tracer/__tests__/round-priority.test.ts`) along with their
  targets.
- Updated 3 tests elsewhere that referenced deleted paths so they keep
  asserting real, current targets:
  `src/lib/utils/date-only.test.ts` (dropped the deleted
  `tracer/DataQualityIssueRow.tsx` call-site pin — the other 6 pinned sites
  are untouched and still guarded),
  `scripts/__tests__/admin-tables-mobile.test.mjs`, and
  `scripts/__tests__/badge-consolidation.test.mjs` (both dropped their now-
  deleted TARGETS/MIGRATED_PILLS entries; neither is wired into any runner
  today per vitest.config.ts's own note on `scripts/__tests__/`, so this was
  hygiene, not a CI fix).
- Verification: `./node_modules/.bin/tsc --noEmit -p tsconfig.json` (pre-
  existing errors only, all in `src/app/golf/actions/golf.ts` and a test file
  under concurrent edit by another agent — zero errors reference
  `golf/admin`); `./node_modules/.bin/eslint` on the 3 changed test files
  (0 errors, 1 pre-existing unrelated warning); full
  `vitest run --project unit --project unit-dom`.

## 2026-08-26 — Tracer/Errors-tab shared grouping key coverage

- SHA: recorded in the follow-up ledger commit on `feat/bridge-todo`.
- `tracer-shared.test.ts` — new `tracerIncidentGroupKey` describe block:
  returns the fingerprint verbatim when present; two rows sharing a
  fingerprint produce the same key regardless of id; a NULL fingerprint falls
  back to `row:<id>`; two NULL-fingerprint rows do NOT collapse into one
  incident (each keys off its own id); an empty-string fingerprint is used
  verbatim (documents `??`'s nullish-only semantics, since `buildIncidentSignature`
  never actually emits `""`).
- Guarantee now held by test: the Tracer's grouping fallback for a
  NULL-fingerprint row is string-for-string identical to `mergeTriage`'s own
  fallback in `src/lib/admin/data/triage.ts` — verified by the test asserting
  the exact `row:<id>` shape, not just "some fallback string".
- `buildTracerIncidents` itself (the async-context caller in
  `admin-tracer-data.ts`, a `'use server'` file that may only export async
  functions) is exercised indirectly through the existing `getTracerData`
  auth-gate tests in `src/app/admin/__tests__/admin-gate-coverage.test.ts`;
  the grouping logic itself is covered directly and exhaustively through the
  now-extracted pure `tracerIncidentGroupKey`.

## 2026-08-26 — CodeQL-finding coverage

- SHA: recorded in the follow-up ledger commit on `feat/bridge-observability`.
- `sentry-api.test.ts` — seven malformed issue ids (path traversal, encoded
  traversal, protocol-relative host, absolute URL, backslash, newline,
  whitespace) must be refused BEFORE `fetch` is called, asserted on the mock
  never having been invoked; plus a real short-id still reaching the right path.
- `log-error.test.ts` — a context tree carrying `__proto__` / `constructor`
  leaves `Object.prototype` untouched while an ordinary sibling key survives;
  and a ~400KB adversarial payload is truncated to the storage budget before
  anything scans it, with the secret at the front still redacted.
- A note on what was deliberately NOT written: the first version of the ReDoS
  test asserted elapsed milliseconds. That would have passed with or without
  the fix at any input size a unit test can afford, and would be flaky in CI —
  a test that cannot fail is worse than no test, because it reads as coverage.
  Replaced with the structural assertion above.

## 2026-08-26 — review-round coverage

- SHA: recorded in the follow-up ledger commit on `feat/bridge-observability`.
- Added coverage:
  - `with-golf-action.test.ts` — two SQLSTATEs on one action (`23505` and
    `40001`) must produce two different fingerprints. This is the guard that
    keeps the forensics page from showing one incident with a mixed history;
    the defect it catches is invisible until an operator is mid-incident.
  - `feature-health.test.ts` — `fetchFeatureHealthRedCount` returns a real
    count from DB signals alone with the Sentry fetch never called, and
    returns `null` (never `0`) when the RPC fails.
  - `admin-shell-health-badge.test.tsx` — a null count renders no badge.
  - `helm-flight-recorder.test.ts` — the rescued-outcome ordering proven
    against the real (unmocked) recorder, so it exercises the actual
    forced-failure override; plus a hung `persistStart` degrading cleanly
    under fake timers without hanging the caller.
  - `golf-round-submit-fallback-flight-recorder.test.ts` (new) — both submit
    branches still finalize `failure` in the right order when the fallback
    also fails.
  - `observe-action-result.test.ts` — the two messaging denials classify as
    expected soft failures, and the infrastructure failure beside them
    deliberately does not.
  - `RecentTimelines.test.tsx` — empty state asserts the real empty state
    rather than the old click hint.
  - `log-error.test.ts` / `server-error-logger.test.ts` — 21 tests over the
    shared `redactFreeTextForStorage`: URL secrets in stack, message and the
    serialized Postgres cause; path-segment tokens; the slice-before-mask
    ordering (masking silently no-ops above 20k, so the wrong order would let
    a fat payload skip masking entirely); title inheriting the fix; and both
    fail-open paths. The fail-open tests force the throw through
    `redactSensitiveUrl` rather than `maskEmails` — once the redaction moved
    into `redact-pii.ts`, the mask call stopped crossing a module boundary and
    a mock on it could no longer reach inside. Worth knowing before anyone
    "fixes" that mock back.
- Guarantees now held by tests: one incident per cause rather than per action;
  a failed feature-health lookup can never render as "no red features"; the
  flight recorder can neither stall a save nor mislabel a rescued round.

## 2026-08-26 — observability refit coverage

- SHA: recorded in the follow-up ledger commit on `feat/bridge-refit`.
- Added coverage:
  - `src/test/admin/resolve-error.test.ts` rewritten against the unified
    RPC path — the old tests asserted the deleted direct-`UPDATE` shape. Now
    pins the read→RPC id forwarding, the cache-tag bust, the no-open-rows
    short circuit, the super-admin gate ordering, and the real (unmocked)
    `describeResolveFailure` translation of a Forbidden/42501 RPC error.
  - `ResolveErrorButton.test.tsx` and `BulkResolveButton.test.tsx` — the
    second exists specifically to pin the confirm shape the first was unified
    onto, so the two buttons cannot drift apart again silently.
  - `src/test/api/log-error.test.ts` — a token-bearing URL goes in, a redacted
    one is written, and the write still happens (redaction is fail-open).
  - `analyze-error.test.ts`, `rca.test.ts` — the unconfigured-provider path
    returns a status rather than throwing, the stored-analysis shape, and the
    `rca_analysis` exclusion that keeps an analysis out of the incident feed.
  - `sentry-resolve.test.ts` — success, the 403 missing-scope message, and the
    unconfigured-token path.
  - `feature-health-summary.test.tsx` plus a pin on `computeFeatureStatus`
    outputs, so the three-call-site consolidation stayed a rendering change
    and not a status-logic change.
  - `severity-mix-strip.test.tsx`, `posture-disclosure.test.tsx`,
    `kpi-source-note.test.tsx`, `admin-shell-health-badge.test.tsx`,
    `ForensicsHeader.test.tsx`, `FieldCopy.test.tsx`, `RcaPanel.test.tsx`,
    `TrendStrip.test.tsx`, `RecentTimelines.test.tsx`, and
    `tracer-shared.test.ts` (waterfall grouping, ordering, missing-required
    ghosting).
- Guarantees now held by tests: one resolution path with one privilege model;
  an RCA analysis is never counted as an occurrence of the incident it
  annotates; client error context cannot be persisted with URL secrets or raw
  emails; feature-health status thresholds and hysteresis are unchanged by the
  UI consolidation.
- Verification: full unit + unit-dom suite in the refit worktree —
  1210 files, 11,120 tests, 0 failures, 6 pre-existing skips. `tsc --noEmit`
  clean. ESLint clean across `src/app/admin/**`, `src/lib/admin/**`,
  `src/lib/golf/**`, `src/lib/supabase/**`, `src/app/golf/actions/*.ts`.
