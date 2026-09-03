# Admin Platform test ledger

## 2026-09-02 — second audit of `agent/fix-bridge-errors`

- SHA: recorded on merge of `agent/fix-bridge-errors`.
- New: `src/test/observability/instrumentation-register.test.ts` (3 —
  `register()` resolves only after the start-up report has, never rejects
  because of it, and the process handlers are not held behind it; runtime
  `edge` runs no report).
- Extended, each red before its fix: `emit-throttle.test.ts` (`releaseEmit`
  ×3), `credentials.test.ts` (a write that does not land — rejected, timed
  out, failed inside the `after()` task — does not consume the window; one
  that lands does ×4), `schedule-bridge-write.test.ts` (awaited fallback
  registers with `waitUntil`; the `after()` path does not ×2),
  `integration-health-scheduling.test.ts` (resolves only after the awaited
  write settled) and `integration-health.test.ts` (async contract),
  `durable-collapse.test.ts` (guard on the count read / on absence, re-read
  and retry once on a miss, fail open on a second miss ×4),
  `server-error-logger-bridge.test.ts` (fake client grew the guarded
  `update().eq().eq|is().select()` chain).

## 2026-09-01 — error pipeline: scheduling, durable collapse, Inngest credentials, honest badge, aliases, shapes

- SHA: recorded on merge of `agent/fix-bridge-errors`.
- New: `src/lib/admin/__tests__/schedule-bridge-write.test.ts` (8),
  `src/lib/admin/__tests__/durable-collapse.test.ts` (8),
  `src/lib/observability/__tests__/vercel-wait-until.test.ts` (2),
  `src/lib/observability/__tests__/register-process-error-handlers.test.ts` (7),
  `src/lib/admin/__tests__/observed-action-scheduling.test.ts` (3),
  `src/test/lib/admin/integration-health-scheduling.test.ts` (2),
  `src/lib/inngest/__tests__/credentials.test.ts` (9),
  `src/lib/inngest/__tests__/is-inngest-configured.test.ts` (4),
  `src/lib/admin/__tests__/feature-aliases.test.ts` (17),
  `src/lib/admin/__tests__/credential-shape.test.ts` (26),
  `src/test/scripts/check-helm-bridge-env.test.ts` (5 — spawns the real
  script in an env-file-free directory).
- Extended: `server-error-logger-bridge.test.ts` (durable collapse ×5, Sentry
  title/fingerprint ×4, alias continuity), `bridge-honest-failure.test.ts`
  (badge resolves `null`), `admin-shell-health-badge.test.tsx` (unknown chip
  ×3), `inngest-signature-diagnosis.test.ts` (missing key named as MISSING,
  silent off production), `use-presence.test.tsx` (value-shaped RPC failure
  reaches `logError`; success does not), `admin-logger-bridge.test.ts`
  (sport/feature tags; `bridge_write_failed` capped at 5/min; PGRST205 stays
  a warning), `vercel-api.test.ts` (negative cache ×2; 11-char token
  unconfigured), `sentry-api.test.ts` / `vercel-api.test.ts` fixtures moved to
  well-formed tokens because the old short fixtures are exactly what the
  shape validators now reject.
- Guarantees now covered:
  - **An error-path Bridge write is handed to `after()` in a request scope
    and AWAITED under a bound elsewhere — never dropped.** Verified both
    directions: with `after()` mocked to capture, the logger is not called
    inline and IS called when the captured task runs; with `after()` throwing,
    the logger is called synchronously and a hung write resolves at the
    timeout.
  - **Correlation survives deferral.** The task re-enters the caller's
    request-context scope; `getRequestId()` inside it equals the caller's.
  - **A provider fault inside 15 minutes of an open row bumps
    `metadata.metadata.collapsed_count` (plus the throttle's own count) and
    writes NOTHING to either table; an unreadable lookup or failed update
    inserts as before.** Non-provider codes never look; opt-in/out honoured.
  - **Process-level handlers await the write (resolve after
    `logServerException` settles), time out at 3s, hand the promise to the
    Vercel `waitUntil` when present, and rate-limit at 20/min while Sentry
    still sees every one.**
  - **A missing/malformed Inngest key in production writes ONE throttled row
    with `provider_inngest_missing_credential` on `integrations`, naming the
    variable and never the value; off production it writes nothing; the
    route names it MISSING and still returns the SDK's own 500.**
  - **`fetchBridgeErrorBadge` resolves `null` when the feed read throws;
    `AdminShell` renders no numeric badge plus the "unreadable" chip for
    `null`, and no chip for 0 or a positive count.**
  - **Every alias resolves to a registered key and none shadows one; `crm`
    and `lifting-onboarding` are asserted NOT aliased; an explicit `feature`
    is aliased exactly like a `featureArea`.**
  - **Eight 11-character placeholders fail every shape check; the script
    exits 1 on them, 0 on well-formed values, skips on nothing-set under
    `--drift`, and fails `--drift` on a placeholder.** Output never contains
    the value.

## 2026-08-27 — resolution lifecycle, severity single-source, cn() token drift

- SHA: recorded on merge of `feat/bridge-shot-tracing`.
- New: `src/lib/reliability/__tests__/resolution.test.ts` (24 tests),
  `src/lib/__tests__/cn-font-size.test.ts` (12),
  `src/app/admin/traces/__tests__/trace-tree.test.ts` (22), plus the surface
  tests the parallel build produced (feature-health-detail 27,
  team-detail-extras 30, player-detail 32, qualifier-logic 7).
- Guarantees now covered:
  - **Silence alone never archives a fault.** A quiet fault with NO production
    deploy after its last occurrence is not auto-resolved — the test constructs
    exactly that shape, because a nightly cron is silent 23 hours a day and
    archiving on silence would hide live faults.
  - **Unknown deploy time archives NOTHING and says why** — not an empty list
    that reads as "nothing qualified".
  - **Reopen beats archive in the same pass**, so a fault that recurred and then
    went quiet still raises its regression instead of being re-hidden.
  - **The regression baseline is `last_seen_at_resolution`, not `resolved_at`** —
    a test pins the case where comparing against `resolved_at` would cry wolf on
    every fix.
  - **A regression counts once, not per tick** (verified against the real RPC on
    Docker: three `mark_regressed` calls produced `reopened_count = 1`).
  - **Auto never overwrites manual** — the RPC returns false and the human's PR
    and note survive. Verified against the real function, not a mock.
  - **`shipStatus` has three outcomes**; unreachable Vercel yields `unknown`,
    never `pending`, because telling someone their fix has not shipped when we
    could not find out is a false claim about their work.
  - **`cn()` preserves custom size tokens**, with a drift test that re-reads
    `tailwind.config.ts` and fails if a token is added there and not registered.
    The default scale is asserted unchanged, and last-wins conflict resolution
    within one group still holds.
- Pre-existing contract tests this work had to satisfy, all passing:
  `severity-single-source` (which caught a hand-written severity filter),
  `cron-job-log-coverage`, `cron-registry` cadence, `admin-nav` order and
  keyboard map, and `event-reminders` (19/19 — two of which correctly rejected a
  change proposed during this work; they were not weakened, the change was).
- Verification limits, stated plainly: the FULL unit suite and `npm run build`
  were not run for the final tree state — the full run was declined and the
  build has no `.env.local` in this worktree. `test:rls` matches 0 files
  (quality-gates.md records this), so the RLS policy added here was verified
  directly against Docker and then against the production catalog.

## 2026-08-26 — reliability tab view helpers + cron wiring contracts

- SHA: recorded on merge of `feat/reliability-collector`.
- New: `src/app/admin/reliability/__tests__/reliability-view.test.ts` (19 tests)
  covering the pure view layer, split out of `page.tsx` for the same reason
  `tracer-shared.ts` was.
- Guarantees now covered:
  - **An evidence reference is only rendered as a link when it resolves to one.**
    Sentry permalinks become external links labelled by issue id; an 8-char
    fingerprint becomes `/admin/errors/<fp>`; a Vercel deployment id and a
    pre-fingerprint `row:<uuid>` stay opaque rather than linking to a 404. A
    `javascript:` or `data:` value is never rendered as an external link.
  - **The history sparkline skips unreadable runs rather than plotting zero.** A
    zero means "looked, found nothing"; an unreadable payload means we do not
    know, and plotting it as zero would draw a reassuring dip that never
    happened.
  - **`readingCount` never counts a blind arm**, so "sources reading" cannot
    overstate coverage.
  - Severity grouping is worst-first with empty buckets omitted; `relativeAge`
    returns an em-dash for a future or unparseable timestamp rather than a
    negative age.
  - **The two job types stay distinct** and only the cron one is in
    `CRON_REGISTRY` — if they collided the Bridge would read back the
    scalars-only cron row and render every run as unreadable.
  - **The self-emission title is derived from the shared constant**, so a rename
    moves the exclusion filter and the test together.
- Pre-existing contracts this change had to satisfy, all now passing:
  `cron-job-log-coverage` (every registered cron calls `recordJobRun` — this
  one initially did not), `cron-registry` cadence-vs-vercel.json, `admin-nav`
  order and keyboard map.
- Verified with the FULL unit suite (`npm test`), not a scoped run: 1215 files,
  11,243 passed, 6 skipped, 0 failures. The scoped run is what let the
  `recordJobRun` violation reach CI in the first place.

## 2026-08-26 — reliability collector: degradation and the self-feeding read

- SHA: recorded on merge of `feat/reliability-collector`.
- New: `src/lib/reliability/__tests__/normalize.test.ts` and
  `src/lib/reliability/__tests__/sources.test.ts` — 31 tests, plus the two
  existing contract tests this change had to satisfy
  (`cron-registry.test.ts`, `admin-nav.test.ts`).
- Guarantees now covered:
  - **A blind source can never present as a clean run.** `worstStatus` degrades
    blind > partial > ok, and one test asserts that a healthy-empty arm and a
    blind-empty arm — both carrying zero signals — stay distinguishable. This
    is the OS contract's `error→[]` prohibition in executable form.
  - **The self-feeding read stays closed.** `collectSupabase` must exclude
    `event_type='rca_analysis'` and any row naming its own job type. Verified
    red/green: deleting the two `.not()` filters turns the suite red (1 failed
    / 10 passed); restoring them turns it green. The guard is load-bearing, not
    decorative.
  - **Cross-source folding.** One root cause seen by Sentry and Supabase with
    different round ids in the route collapses to a single signal with summed
    count, both sources listed, and both evidence refs retained.
  - **Folding survives sources disagreeing about severity** — Sentry `error` +
    Supabase `warning` for one root cause must be ONE entry with the worse
    severity kept. The first draft's version of this test passed two rows of the
    same severity and therefore could not fail; the replacement was verified
    red/green against the severity-bearing key (22 pass → 1 fail).
    Two neighbouring ratchet tests also gained `toHaveLength(1)` assertions:
    without them they passed under the broken implementation, because splitting
    a pair into two entries left `critical` first in the sort order and reading
    only `signals[0].severity` found it either way.
  - **Bounded coverage is counted, never silent** (quality-gates §1).
  - **Redaction at the boundary.** Emails in a title or message do not survive
    into stored signal text.
  - **Privileged work is never proposed as low risk.** Anything naming auth,
    RLS, billing, migrations, secrets or sessions proposes R3 — including when
    the keyword appears only in the title and the route looks innocuous.
- Not covered, deliberately: nothing asserts the collector's behaviour against
  live Sentry or Vercel, because neither token is available to CI. The arms are
  tested through mocked clients, so the first production run is the first real
  exercise of the network paths.

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

## 2026-08-26 — qualifier bounded-read truncation

- `src/lib/admin/data/__tests__/qualifier-logic.test.ts` gains two cases that
  pin the guarantee the previous implementation could not deliver:
  - **ceiling reached + count probe unavailable => `truncated: true`.** The
    mock returns a FULL 1,000-row page every call, exactly as PostgREST does
    when more rows remain, so accumulation runs to the 2,000 ceiling instead
    of draining. Verified RED against the old single-request shape: with the
    read stopped after one page it reports `evaluated: 1000, truncated: false`
    and this case — and only this case — fails.
  - **short page => `truncated: false`.** The other half of the same rule:
    stopping because the source ran out is not truncation and must not be
    reported as it, even with no count probe to confirm.
- The pre-existing mock gained `range`, since the read now pages rather than
  calling `.limit()`.

## 2026-08-27 — resolution ledger

- `src/lib/admin/__tests__/auto-resolve.test.ts` gains 7 cases covering only
  what the ledger adds; the archive judgement itself is Rule A/B's and its 17
  existing tests are untouched and still pass.
  - Rule A credits the production SHA and records the fault's OWN last
    occurrence as the regression baseline, not "now".
  - Rule B records with the SHA argument OMITTED. Verified against local
    Docker that omitting it stores NULL (`omitted_sha_is_null=true`), so the
    "claims no deploy evidence" property is a checked fact.
  - A recurrence is marked regressed AND excluded from re-archiving in the
    same pass. Verified RED: disabling the exclusion guard fails exactly this
    case.
  - An already-flagged regression is not re-raised.
  - A failed resolutions read sets `regressionSkippedReason` instead of
    reporting zero regressions.
  - A declined overwrite of a MANUAL resolution counts as `skippedManual`,
    never as `failed`.
  - Rule C writes nothing to the ledger.
- `src/lib/reliability/__tests__/resolution.test.ts` drops the archive-branch
  cases with the branch itself and gains two for `planReopens`: a fault never
  claimed fixed cannot regress, and each fault matches its OWN resolution.

## 2026-09-01 — self-heal flow and the Errors page

- `src/lib/admin/__tests__/selfheal-flow.test.ts` (new, 30 cases): the stall
  threshold is `STALL_CYCLES` × the registry cadence, never a literal; a
  `new`/`diagnosing` incident stalls at Diagnose exactly past the threshold
  and not one millisecond before; "analysis exists, repair lookup failed"
  is `unknown`, never a Diagnose stall; a `repairing` incident never stalls;
  Close's wait starts at deploy + `PRODUCTION_PROOF_WINDOW_MS` and cannot be
  measured (so cannot stall) without a deploy time; every off-loop lifecycle
  state maps to its position with no stage; `summarizeFlow` counts per stage
  in registry order and reports unplaced incidents separately;
  `selectStalled` orders longest wait first; `describeFlow` names where the
  stalls are and reads "idle", never an all-clear, on an empty board.
- `lens.test.ts` gains the `stalled` lens (judged against `computedAt`; a
  failed repair read is never stalled), the `awaiting-proof` blindness
  exclusion, and `countLensesForKind` agreeing with `applyIncidentFacets` for
  every lens under every kind.
- `attention.test.ts`: `ATTENTION_PRIORITY` contract and sort updated for
  `stage-stalled`; new cases pin that it outranks `repairable-untouched` for
  the same incident, never fires on `repair.status === 'unknown'`, and gives
  a twice-skipped `new` incident the row that state otherwise lacks.
- `truth-strip.test.ts`: the self-heal cell escalates `ok` to `N STALLED`
  (warning, linking to the stalled lens), never softens `danger`, keeps
  PROVEN when work is inside its cycles, carries the backlog when the
  heartbeats are unreadable, and is byte-identical without `flow`.
- `error-trend.test.ts` (new): the hourly fold reproduces bucket timestamps
  from the builder's own clock and returns `[]` for no buckets;
  `describeWindowDelta` refuses a percentage against a zero prior window and
  reports unreadable as `unknown`.
- `error-code-hint.test.ts` (new): known codes, the shared provider-fault
  hint, and `null` for unknown codes.
- `unified-incident-card.test.tsx` gains the feature tag (registry label, not
  key; "untagged" out loud; unregistered key rendered as itself), the sport
  word, the lifecycle headline, and the details disclosure (code hint, source
  health word, lifecycle checks with their status word). The Details panel
  deliberately omits route, action, event and user counts — the row already
  carries them, and the pre-existing `getByText` assertions caught the
  duplication first.
- `errors-filter-bar.test.tsx` (new): groups with label and hint, pressable
  pills with `aria-pressed`, navigation to the server-computed href, active
  filters summarised in words each with a clear link, open-by-default only
  when a filter is active.
- Verified on the worktree: `vitest --project unit` over
  `src/lib/admin/incidents`, `selfheal-flow`, `error-trend`, `data/errors`,
  `incident-count-agreement` (16 files / 251 tests, exit 0 before the last
  two new files were added); `vitest --project unit-dom src/app/admin`
  (34 files / 236 tests after the `TriageQueue` default fix); typecheck exit
  0 before the Errors page rewrite, re-run after it (result recorded in the
  PR). The page test (`errors/__tests__/page.test.tsx`) covers
  `loadErrorsPageData` only, by design, and is unchanged.

## 2026-09-02 — Flight Recorder: canonical observed-step-count, undeclared/point-in-time step states, audit-lib pure functions

- SHA: branch `agent/tracer-gaps`, PR pending.
- New/extended, each written red before its fix (TDD): `trace-tree.test.ts`
  gains cases for `observedStepCount` (equals the normalized input length,
  including on a fixture with a genuine `parent_step_key` cycle — the
  existing cycle case only asserted an upper bound, which passed even when
  a cyclic node was silently dropped from the flattened output),
  `isUndeclared` (true for the fixture's postgres-layer children of a
  declared parent, and for every observed row under an unrecognised
  workflow), `isPointInTime` (true only for `finished_at` present /
  `started_at` absent / no `duration_ms`), and the `metadata.sqlstate` /
  `metadata.failure_code` fallback chain for `errorCode`.
  `trace-view-helpers.test.ts` gains `resolveTotalDurationMs` (pinned to
  `run.duration_ms`, with a regression case guarding against it ever being
  reimplemented as a sum of step durations) and `extractStatusDowngrade`
  (reads the two downgrade keys from a run's `metadata`, returns `null` on
  absent/malformed metadata).
  `scripts/lib/__tests__/flight-recorder-audit-lib.test.ts` (new, 19 cases)
  covers the pure summarization functions the new audit script calls:
  window filtering, distinct-step-key counting, identity-carrying-step
  counting, zero-step-run and downgraded-run detection, and the 200-row-cap
  truncation warning.
- Guarantees now covered:
  - **The fleet-list step count and the per-trace tree's step count are
    computed from one named field**, `TraceTree.observedStepCount` — a test
    fails if the KPI strip is ever re-derived inline instead of reading it.
  - **A trace's total duration is never resummed from its steps.** Point-in-time
    and postgres-checkpoint child steps exist specifically so a naive sum would
    double-count nested time; `resolveTotalDurationMs`'s test pins the
    single-source-of-truth read from `run.duration_ms`.
  - **An observed-but-undeclared step (e.g. a postgres checkpoint child) is
    never confused with a missing (declared-but-unobserved) one** — the two
    booleans are asserted mutually exclusive on every fixture node.
  - **The audit script's counts are labelled as a floor, never presented as
    exact, once the list RPC's 200-row cap is hit** — tested directly against
    `coverageNotGuaranteed`'s boundary condition (199 vs 200 vs 201 returned
    rows).
- Verification: `npx vitest run src/app/admin/traces scripts/lib` — 6 files,
  109 tests, all passing. `npm run typecheck` / `npm run lint` / `npm run
  lint:ratchet` (68 warnings, no regression) all clean on the full tree.
