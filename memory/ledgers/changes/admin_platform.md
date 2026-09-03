<!-- markdownlint-disable MD003 MD007 MD012 MD013 MD022 MD028 MD032 MD034 MD036 MD037 MD038 MD040 MD041 MD050 MD060 -->
# Admin Platform change ledger

## 2026-09-02 — Correction to (e) and (h): a critical expected-recurrence must still page, and a fixture must still be visible

Two follow-up fixes to the same session's own defect-(e) and defect-(h)
commits, found by a stronger-model review before the branch was handed off —
recorded as their own entries rather than folded silently into the originals,
since both change behaviour the first pass shipped.

- **(e) — `attention.ts`'s `UNRESOLVED_STATES` now includes
  `'expected-recurrence'`.** The first pass left it out (matching
  `'not-a-defect'`, which it is NOT the same as). Consequence: a CRITICAL,
  still-unresolved fault whose latest analysis said NOT A DEFECT produced NO
  attention row at all — rule 1 (regression) no longer matched by design,
  and rule 2 (critical) requires `UNRESOLVED_STATES.has(state)`, which it
  didn't. An LLM-authored `suggestedFix` string was able to silence a
  critical fault outright, not merely soften the regression-specific alarm
  it was wrong about. Fixed by including the state in `UNRESOLVED_STATES`
  while keeping it OUT of `NEEDS_ATTENTION_STATES` — the regression alarm
  stays gone, but rule 2 can still fire for one.
- **(h) — `mergeTriage` no longer forces `actionable: false` for a fixture;
  the exclusion moved to each count site.** The first pass forced it at the
  source, which removed the row from `matchesKind`'s default view entirely
  (`kind === undefined -> incident.actionable`) — the fixture vanished into
  "N held back" and the FIXTURE badge nobody would ever see it on became the
  literal opposite of the task's ask ("label them... in the incident feed").
  `actionable` is now left as `classifyIncident`'s real verdict; the
  exclusion from "the actionable COUNT" happens explicitly, keyed on
  `isFixture`, at `lens.ts`'s `actionable` lens, `truth-strip.ts`'s
  `actionable` cell, `errors/page.tsx`'s `shownActionable`, and
  `incident-feed.ts`'s `actionableGroups` (the last one because
  `overview.ts` and `errors/page.tsx` both render that exact field and would
  otherwise disagree).
- **Verified**: new failing-first case in `attention.test.ts` (critical
  expected-recurrence produces a `critical` row); a new case in
  `truth-strip.test.ts` and `lens.test.ts` pinning the fixture exclusion at
  each site; a new case in `incident-feed.test.ts` (verified red against a
  temporarily-reverted fix, then restored); `correlate.test.ts` and
  `triage.test.ts`'s fixture cases updated to assert `actionable` is left
  untouched rather than forced false. Full ripple:
  `src/lib/admin src/lib/reliability src/app/admin` 1748/1748 passing.
  `npm run typecheck`, `lint`, `lint:ratchet`, `audit:supabase-errors` (1039
  baseline, no regression) all green, and `npm run build` run once (network
  sandbox disabled) confirming a clean webpack compile + TypeScript pass —
  see `memory/ledgers/tests/admin_platform.md` for what it did and did not
  prove.

## 2026-09-02 — Reliability/Bridge defect sweep (agent/reliability-bridge-fixes): catalogued defect (h) — QA fixture rounds get a FIXTURE badge and drop out of the actionable count

- SHA: pending (branch `agent/reliability-bridge-fixes`, defect (h) — the
  last of the six-defect sweep).
- **New `src/lib/admin/qa-fixture-rounds.ts`**: `QA_FIXTURE_ROUND_IDS`, a
  literal copy of the four ids
  `supabase/migrations/20260901120000_integrity_completed_round_zero_scored_holes.sql`
  names as seeded fixtures (owner decision 2026-09-02: KEPT), plus
  `isQaFixtureRoundId`. Copied rather than read at runtime — nothing in this
  code path can read a `.sql` file — so `qa-fixture-rounds.test.ts` instead
  reads the migration itself and asserts the constant still matches it
  exactly, closing the drift gap a hand-maintained copy would otherwise open.
- **New `extractRoundId` in `incident-report.ts`**: `metadata.roundId`, a
  TOP-LEVEL key (same shape as the existing `extractRoute`/`extractActionName`
  — `normalizeContext` in `server-error-logger.ts` writes it from
  `ObservedActionContext.roundId`).
- **`mergeTriage` (`triage.ts`) sets `TriageItem.isFixture` and forces
  `actionable: false` at the source.** Any row in an app-origin bucket naming
  a QA fixture round makes the whole grouped item a fixture — same
  "any-occurrence-counts" shape `regressed` already uses — and its
  `actionable` is forced `false` regardless of what `classifyIncident`
  decided from the message/severity text alone. Forcing it HERE, once,
  rather than adding a parallel exclusion at every downstream consumer, is
  what keeps a fixture out of every actionable count that already gates on
  `.actionable`: the Incidents tab's `shownActionable`, the default-kind
  facet (`matchesKind`), and the Truth Strip's `actionable` cell all needed
  NO additional change. Sentry-origin items are always `isFixture: false` — a
  Sentry issue carries no round-id metadata to match against.
- **`correlate.ts` carries `isFixture` onto `UnifiedIncident`** (new field,
  `bucket.appItems.some(i => i.isFixture)`) purely so the card can explain
  WHY — the exclusion itself already happened upstream.
  `UnifiedIncidentCard.tsx` renders a neutral-tone FIXTURE chip, SECOND
  priority (right after the lifecycle chip, ahead of stalled/corroboration/
  RCA/PR/blind-source) — a fact about the data outranks everything derived
  from it, including outranking the blind-source chip under the 5-chip cap.
- **Verified**: `qa-fixture-rounds.test.ts` (3/3, including the drift guard
  against the live migration file); a new `extractRoundId` case in
  `incident-report.test.ts` (failing-first); three new `mergeTriage` cases in
  `triage.test.ts` pinning `isFixture`/forced `actionable: false`
  (failing-first — all three were red against the pre-fix code); three new
  `correlateIncidents` cases in `correlate.test.ts`; three new
  `UnifiedIncidentCard` cases in `unified-incident-card.test.tsx` (chip
  renders, does not render for an ordinary incident, and outranks the
  blind-source chip under the cap). Full ripple:
  `src/lib/admin src/lib/reliability src/app/admin` 1745/1745 passing
  (six pre-existing `TriageItem`/`UnifiedIncident` test fixtures across five
  files needed the new required field added — a compile-time gap TS itself
  surfaced, all fixed). `npm run typecheck`, `lint`, `lint:ratchet`,
  `audit:supabase-errors` (1039 baseline, no regression) all green.

## 2026-09-02 — Reliability/Bridge defect sweep (agent/reliability-bridge-fixes): catalogued defect (e) — a fingerprint the analysis already ruled NOT A DEFECT stops re-triggering as a regression

- SHA: pending (branch `agent/reliability-bridge-fixes`, defect (e) of the
  six-defect sweep).
- **New lifecycle state `'expected-recurrence'`, and a new rule-1 branch in
  `deriveLifecycle` (`src/lib/admin/incidents/lifecycle.ts`).** A fault
  recurring after a prior human resolution used to ALWAYS verdict
  `'regressed'` — the single loudest signal this system produces. Now, when
  the latest RCA `analysis.category === 'not-a-defect'` (the analysis already
  explained the recurrence — e.g. an access denial that is supposed to keep
  firing), it verdicts `'expected-recurrence'` instead: neutral tone, not
  `danger`; excluded from `NEEDS_ATTENTION_STATES`; excluded from the
  `actionable` lens (`lens.ts`) and the Truth Strip's `actionable` count
  (`truth-strip.ts`), same treatment as the pre-existing `'not-a-defect'`
  state; `selfheal-flow.ts` places it `offLoop('done', …)`, same as
  `'not-a-defect'`. Deliberately a SEPARATE state from `'not-a-defect'`
  (the classifier's `!actionable` verdict, which never had a resolution to
  regress from) — this keeps "recurred after being fixed" countable apart
  from "was never a defect".
- **A new `expected-recurrence` lens** (`INCIDENT_LENSES`,
  `INCIDENT_LENS_LABEL`, `INCIDENT_LENS_DESCRIPTION` in `types.ts`) counts
  these separately from `regressions`. The `regressions` lens predicate
  itself is UNCHANGED (`state === 'regressed'`) — no exclusion clause needed,
  because the underlying data no longer produces `'regressed'` for these
  incidents. `countLenses`/`IncidentLensRail` both derive from the
  `INCIDENT_LENSES` array, so the new lens renders and counts with no other
  code change.
- **Verified**: new failing-first cases in `lifecycle.test.ts` (the
  `not-a-defect` category case was red against the pre-fix code; a companion
  case pins that every OTHER category — or none — still verdicts
  `'regressed'`), a new case in `lens.test.ts` pinning the lens split and the
  `actionable`-lens exclusion. Full ripple check across
  `src/lib/admin src/lib/reliability src/app/admin`: 1731/1731. `npm run
  typecheck` surfaced the three sites TS's exhaustiveness checking forces on
  a new union member (`lens.ts`'s and `selfheal-flow.ts`'s non-exhaustive
  switches, and one test's inline `IncidentLensCounts` literal) — all three
  fixed. `npm run lint`, `lint:ratchet`, `audit:supabase-errors` (1039
  baseline, no regression) all green.

## 2026-09-02 — Reliability/Bridge defect sweep (agent/reliability-bridge-fixes): catalogued defect (d) — Sentry-origin incidents get an advisory feature tag instead of grouping as unknown

- SHA: pending (branch `agent/reliability-bridge-fixes`, defect (d) of the
  six-defect sweep).
- **`mergeTriage` (`src/lib/admin/data/triage.ts`) falls back to a per-issue
  advisory feature tag when the batch-level `sentryTagHint` is absent.** Every
  un-scoped Sentry issue used to carry `feature: null` unconditionally, so the
  feature lens on `/admin/errors` (`featureBreakdown` in `errors/page.tsx`)
  grouped all of them under the empty-string "unknown" bucket. It now applies
  `resolveFeatureId(issue.culprit)` per issue — `culprit` is the only
  per-issue location field `SentryIssue` returns; there is no
  transaction/url. The batch hint still wins outright when present (honest,
  Sentry-tag-scoped attribution beats a route-string guess); `feature: null`
  still results when the culprit doesn't map to anything, unchanged. The same
  resolved value now also feeds `buildIncidentReport`'s `featureKey` so the
  Copy-for-Claude report and the row's rendered tag agree.
- **`resolveFeatureId` moved from `collect.ts` to `normalize.ts`, exported.**
  It was a private function in `collect.ts` used only for the Reliability
  tab's own correlation pass; it is pure (no I/O) and belongs beside the
  module's other pure logic so `triage.ts` can reuse the SAME map rather than
  writing a second copy that eventually drifts. `collect.ts` now imports it
  back. Its doc comment states explicitly that three of the six ids it
  returns (`golf_round_lifecycle`, `coachhelm_ai`, `admin_platform`) are NOT
  `FEATURE_REGISTRY` keys — a pre-existing mismatch (the Reliability tab's own
  `CorrelatedSignal.featureId` has used this function since the collector
  shipped) left as-is rather than silently reinterpreted; an unregistered tag
  still renders, unlinked, in `UnifiedIncidentCard` rather than falling into
  "unknown".
- **Verified**: renamed the now-overbroad sport/feature test in
  `triage.test.ts` (it previously implied NEITHER field had a fallback; only
  sport doesn't) and added 3 new cases, one written failing first (per-issue
  culprit fallback fires; batch hint still wins; a non-mapping culprit stays
  null) — `npx vitest run src/lib/admin/data/__tests__/triage.test.ts`
  (20/20). Full ripple check: `npx vitest run src/lib/reliability src/lib/admin`
  (1312/1312, unchanged pass count). `npm run typecheck`, `lint`,
  `lint:ratchet` all green.

## 2026-09-02 — Reliability/Bridge defect sweep (agent/reliability-bridge-fixes): catalogued defect (b) — the capture-quality panel stops penalising cron rows for lacking a user, and observed-action user attribution is pinned

- SHA: pending (branch `agent/reliability-bridge-fixes`, defect (b) of the
  six-defect sweep).
- **`analyzeCaptureQuality` (`src/lib/admin/data/capture-quality.ts`) gives the
  'user' field its own, smaller denominator.** A `source: 'cron'` row
  (`job-log.ts`'s `Cron failed: <jobType>`, including the reliability
  collector's own) or `source: 'system'` row (`deploy-marker.ts`) is a machine
  invocation — it has no session to resolve a user from, so counting it
  against 'user' coverage blamed a call site for a gap it could never close.
  New `SELF_REFERENTIAL_SOURCES` set + `isSelfReferentialRow`; the 'user'
  field's `total`/`present`/`ratio` are computed over the user-eligible
  subset, every other field (and `report.rows`, and `weakestSources`' row
  counts) is unchanged — a cron failure legitimately carries error-code,
  stack, route, feature and action, and stays eligible to rank as a weakest
  emitter on those. `rca_analysis` rows need no matching filter: they are
  already excluded upstream by `queryAppErrorEvents`'s `event_type='error'`
  clause, so a second check here would be a guard that can never fire — not
  added.
- **Observed-action user attribution ("second half" of this defect): verified
  correct, not a bug.** `withAdminObserved` (`src/lib/admin/observed-action.ts`)
  and its three consumers — `withGolfAction`, `withBaseballAction`,
  `withLiftingAction` — already resolve `userId`/`userEmail` from the session
  before calling `observeActionSoftFailure`/`logServerException`, and
  `observe-action-result.ts` forwards them unchanged into the logger context.
  No code change was needed; a new test pins the soft-failure path (only the
  thrown-error path had coverage before) so a future refactor can't silently
  drop it.
- **Verified**: new failing-first cases in `capture-quality.test.ts` (11/11
  passing — 3 new cases were red against the pre-fix code); a new pinning
  case in `observe-action-result.test.ts` (30/30, passed immediately — see
  above); `npm run typecheck`, `lint`, `lint:ratchet`, `audit:supabase-errors`
  all green on this change alone.

## 2026-09-02 — Reliability/Bridge defect sweep (agent/reliability-bridge-fixes): catalogued defect (f) — a Sentry 429 gets one honoured retry before it reads as blind

- SHA: pending (branch `agent/reliability-bridge-fixes`, defect (f) of the
  six-defect sweep).
- **`fetchSentryIssues` no longer gives up on the first 429.** On a 429 it
  waits out `Retry-After` (parsed, clamped to 30s max, a fixed 1s fallback
  when the header is missing) and retries the same request exactly once.
  Only if that retry ALSO fails does it give up — any other status (500,
  403, ...) still fails immediately, since there's no reason to believe a
  second attempt changes those.
- **A rate limit that survives the retry is `degraded`, not `blind`.**
  `AdminFetchResult` gained an optional `degraded?: boolean` (`fetch-result.ts`,
  `failed()`); `SourceStatus` in `src/lib/reliability/types.ts` gained a
  `'degraded'` member, ranked in `worstStatus` between `partial` and `blind`
  (worse than partial, better than blind — a rate limit usually clears on
  its own). `statusFromFetch` (`sources.ts`) maps a degraded envelope to
  `{status: 'degraded', reason: 'rate limited'}`. `readingCount`
  (`reliability-view.ts`) excludes degraded arms from "arms that returned
  data", same as blind. `collectVercel`... n/a here; `collect.ts`'s job-log
  `error_message` now names degraded arms alongside blind ones without
  flipping the run's `completed`/`failed` status for a degraded-only run.
- **Deliberately NOT widened**: the Incidents tab's separate `SourceHealth`
  union (`src/lib/admin/incidents/types.ts`) has no `'degraded'` member. A
  degraded reliability arm folds into its existing `'blind'` there via
  `readReliability()`'s ternary in `fetch.ts` — the conservative direction,
  and consistent with "no all-clear while a required source is blind". A
  full second-union widening (8 files: `types.ts`, `fetch.ts`, `correlate.ts`,
  `sources.ts`, `reconciliation.ts`, `triage-engine.ts`,
  `SourceCoverage.tsx`, `EvidenceWall.tsx`) was assessed and set aside as
  disproportionate to this fix; the Reliability tab is where the fact
  ("Sentry reads ... mark the source degraded") is anchored and is now
  correct end to end.
- **Verified**: new failing-first retry/degraded cases in
  `src/lib/admin/__tests__/sentry-api.test.ts` (43/43 passing — a test-only
  `__setSentryRetryDelayForTests` stub keeps the 429 tests instant instead of
  actually pausing 30s), new `worstStatus` ranking cases in
  `normalize.test.ts`; `npx vitest run src/lib/reliability/__tests__/
  src/lib/admin/__tests__/sentry-api.test.ts src/app/admin/reliability`
  (139/139); `npm run typecheck`, `lint`, `lint:ratchet`,
  `audit:supabase-errors` all green.

## 2026-09-02 — Reliability/Bridge defect sweep (agent/reliability-bridge-fixes): catalogued defect (c) — canceled preview deploys stop reading as a build problem

- SHA: pending (branch `agent/reliability-bridge-fixes`, defect (c) of a
  six-defect catalogued sweep; each defect lands as its own commit).
- **`collectVercel` (`src/lib/reliability/sources.ts`) no longer rates every
  `CANCELED` deployment `warning`.** A canceled `preview` deploy (or one with
  no recorded `target`) is routine — a push superseded by a later push, or a
  manual cancel — and now reports `info`. A canceled `production` deployment
  still reports `warning`: there the intended release never shipped, which is
  exactly the build-health signal this arm exists to carry. `ERROR` deploys
  are unaffected (`error` at any target).
- New helper `vercelDeploySeverity(state, target)` is the single place this
  is decided; `src/lib/reliability/__tests__/sources.test.ts` pins preview,
  null-target, and production CANCELED cases plus the untouched ERROR case.
- **Verified**: `npx vitest run src/lib/reliability/__tests__/sources.test.ts`
  (25/25 passing, new cases written failing first), `npm run typecheck`,
  `npm run lint`, `npm run lint:ratchet`, `npm run audit:supabase-errors` all
  green on this change alone.
## 2026-09-02 — Diagnose moves off the Anthropic-hosted cloud routine onto a Vercel cron

- Branch: `agent/selfheal-diagnose-cron`.
- **Why**: the Diagnose stage's cloud-routine environment carried no
  `SUPABASE_SERVICE_ROLE_KEY`, so `npm run triage` failed before reading a
  row every time it actually ran there — every `selfheal-triage` heartbeat
  that ever read `completed` was a human substituting via MCP or a manual
  run. This deployment already carries `SUPABASE_SERVICE_ROLE_KEY`,
  `ANTHROPIC_API_KEY` and `CRON_SECRET`, so Diagnose runs here instead.
- **Extracted, no behaviour change**: `collectAdminEvents`,
  `collectReliabilitySignals`, `collectRelAnalyses` and `applyPlan` moved out
  of `scripts/run-triage.ts` into `src/lib/admin/triage-collect.ts` /
  `triage-apply.ts`; the CLI is now a thin wrapper over both, byte-identical
  output. `runRcaForFingerprint` / `persistRcaAnalysis` moved out of
  `src/app/admin/actions/analyze-error.ts` into `src/lib/admin/rca-run.ts`
  (server-only, no `requireSuperAdmin` gate — the action keeps its own gate
  and delegates), which also gains `runRcaForReliabilitySignal` for
  `rel:<signature>` groups with no `admin_events` rows to analyse.
- **One real behaviour change while extracting**:
  `collectReliabilitySignals` used to read only the NEWEST
  `reliability-snapshot` row (`.limit(1)`). It now reads every row inside the
  triage window and unions their signals (dedupe by correlation signature,
  count = MAX across rows never sum, firstSeen/lastSeen widened,
  `sourceHealth` still taken from the newest row only) — a Sentry/Vercel/
  Supabase signal that fired early in a 72h window and quieted down before
  the most recent 3-hourly snapshot was previously invisible to triage.
- **New**: `src/app/api/cron/selfheal-triage/route.ts`, four times a day
  (`vercel.json`'s `17 3,9,15,21 * * *`, 6h cadence; `09:17 UTC` sits 83
  minutes before Repair's `10:40 UTC`). Applies the closeable set exactly as
  `--apply` does, then analyses the queue up to `SELFHEAL_TRIAGE_MAX_ANALYSES`
  (default 8) groups, persists per-member with deterministic
  `relatedFingerprints`, and resolves only `not-a-defect` and the SHA-free
  half of `already-fixed` (a Vercel function has no git checkout to verify a
  named commit's ancestry, so a SHA-bearing claim is left analysed-but-open
  for `auto-resolve.ts`'s nightly Rule A or a human run). A provider-fault
  guard re-classifies each member's own message text
  (`classifyProviderFault`), not just a stored `errorCode` — three of the
  four production "Inngest signature" fingerprints carry no persisted
  `errorCode` at all. The heartbeat is written LAST, directly (not through
  `recordJobRun`, which drops nested fields), under the same `job_type` both
  `CRON_REGISTRY` and `SELFHEAL_STAGES` already used; an unregistered,
  separate `recordJobRun` call wraps the handler purely for crash-safety.
  `status='failed'` only on a genuine collector read failure or an analyzer
  error — a blind arm inside an otherwise-readable snapshot reports
  `completed` with `degraded: true`, because Repair's STEP 0b refuses to run
  at all on a `failed` Diagnose row and a single flaky Sentry poll should
  never silently disable Repair.
- **Registries updated**: `SELFHEAL_STAGES.triage.runner` → `'vercel-cron'`,
  `cadenceMinutes` → 360 (contract path unchanged); `CRON_REGISTRY` gains the
  `selfheal-triage` entry; the contract test's `cronScheduleToMinutes` helper
  (`cron-registry.test.ts`) extended to parse a comma-separated, evenly-spaced
  hour list — it threw on `vercel.json`'s new schedule string otherwise.
- **Docs**: `docs/ai-system/selfheal/README.md` and `triage-contract.md`
  record the new runner and the SHA-ancestry capability gap; the cloud
  routine is retired, `npm run triage` stays the full-contract fallback.
- **Verified**: `npm run typecheck`, `npm run lint` (whole repo, both clean);
  targeted `vitest run` over `src/lib/admin/__tests__`,
  `src/app/api/cron/**/__tests__`, `src/app/admin/actions/__tests__`, and
  `scripts` (1172 tests, all passing, including the pre-existing
  `analyze-error.test.ts` unmodified against the extraction). New tests cover
  the reliability-collector union fix (two-snapshot fixtures), the extracted
  analyzer (regression-tested against the same fixtures `analyze-error.test.ts`
  used), and the route's five required scenarios: cap reached, a blind arm
  degrading rather than failing the run, an analyzer error leaving one group
  open while the closeable set still applies, the provider-fault guard
  refusing to resolve, and the heartbeat write landing last in call order.

## 2026-09-02 — second audit of `agent/fix-bridge-errors`: a throttle that outlived its write, a `void` the siblings had lost, a lost increment

- SHA: recorded on merge of `agent/fix-bridge-errors` (same PR as the entry
  below; three findings from two independent reviewers against the branch).
- **The start-up Inngest report could silence the next one and land nothing**
  (HIGH). `instrumentation.ts` `void`ed `reportInngestCredentialFault('startup')`
  outside any request scope, so the write took `scheduleBridgeWrite`'s
  awaited fallback and nothing held that promise either — on a function
  frozen after start-up the row never landed, while `shouldEmit` had already
  opened the 60s window and refused the next `send`/`inbound` report. Two
  halves: `register()` now AWAITS the report (started before the
  process-handler import, awaited after it, bounded at 2.5s, free in the
  healthy case), and the awaited fallback in `schedule-bridge-write.ts` also
  registers the pending write with the Vercel request context's `waitUntil`
  (`vercel-wait-until.ts`) — the same pair `logProcessErrorToBridge` uses.
  And a write that does not land gives the window back: `emit-throttle.ts`
  gains `releaseEmit(key, collapsed)`; `credentials.ts` releases on a
  rejection inside the deferred task, and on the awaited path whenever the
  write is not known to have landed (rejection or timeout), at most once per
  attempt.
- **`reportIntegrationFault` still `void`ed its scheduled write** (MEDIUM)
  while `observed-action.ts` and `job-log.ts` await theirs. It is now async
  and awaited at all eleven call sites in `sentry-api.ts` / `vercel-api.ts`
  (all inside async functions; the one-liner becomes
  `failed(await reportIntegrationFault(...))`).
- **`absorbIntoRecentEvent` computed `collapsed_count` in JS and wrote it
  unguarded** (LOW): two lambdas reading N both wrote N+1. `admin_events` has
  no `updated_at` and no increment RPC, so the guard is on the counter itself
  — `.eq('metadata->metadata->>collapsed_count', <as read>)` or `.is(..., null)`
  for a never-bumped row, `.select('id')` to see a miss, one re-read and
  retry, then fail open (`reason: 'lost_race'`). Undercount was the only
  exposure; a lost row never was.

## 2026-09-01 — Bridge error pipeline: durable collapse, scheduled writes, a missing Inngest key made visible, an honest badge, aliasing, credential shapes

- SHA: recorded on merge of `agent/fix-bridge-errors`.
- Twelve review findings against HEAD 6a7577c71 (production fb425aa2b), fixed
  test-first. Measured facts behind each are in the code comments; the rules
  are in `memory/features/admin-platform.md` (Business Rules, seven new
  bullets).
- **Durable flood collapse** (`src/lib/admin/durable-collapse.ts`, wired into
  `server-error-logger.ts` for every `provider_*` code; `durableCollapse`
  opt-in/out on the context). 99 identical `provider_vercel_unavailable` rows
  in 2h05m came from a per-PROCESS throttle on serverless. Fails open. The
  Vercel insights reader also negative-caches its failure for 5 minutes.
- **Scheduled, not detached, error-path writes**
  (`src/lib/admin/schedule-bridge-write.ts`: `after()` in a request scope,
  awaited-with-timeout otherwise; `bindRequestContext` keeps `requestId`).
  Wired into `observed-action.ts`, `observe-action-result.ts` (now returns
  `Promise<void>`; the three sport wrappers call it unawaited, which is safe
  by construction — the awaited path starts the write synchronously),
  `job-log.ts`, `integration-health.ts`. Process-level handlers now import
  the logger statically, use the Vercel request-context `waitUntil` when
  present (`src/lib/observability/vercel-wait-until.ts`) and await under
  `BRIDGE_PROCESS_WRITE_TIMEOUT_MS`.
- **A missing/malformed Inngest credential in production is a Bridge error
  row** (`src/lib/inngest/credentials.ts`,
  `provider_inngest_missing_credential`, feature `integrations`) from process
  start, from every `isInngestConfigured() === false`, and from every signed
  inbound request to `/api/inngest` (the SDK answers 500 there, never the 401
  the route's mismatch diagnosis keys on). `isInngestConfigured()` is now
  shape-aware. The registry entry keeps NO heartbeat, by design; its
  `knownGaps` say why AMBER, not RED, is what one fingerprint earns.
  **OWNER ACTION:** set `INNGEST_SIGNING_KEY` (and `INNGEST_EVENT_KEY`) in
  Vercel Production and redeploy — 4 Sentry "no signing key found" events on
  fb425aa2b since 14:31Z; this change reports it, it cannot fix it.
- **Honest nav badge**: `fetchBridgeErrorBadge` returns `null` on a failed
  read; `AdminShell` renders a distinct "Incidents unreadable" chip.
- **Feature aliasing**: `resolveFeatureKey` aliases `feature` too; aliases
  added for `calendar`, `insights`, `coachhelm_chat`,
  `coachhelm_effectiveness`, `teams`, `rounds`; `budget.ts` tags
  `coachhelm_ai_engine`. `crm` (directive) and `lifting-onboarding` (no Lift
  Lab registry entry) deliberately left unaliased and stated as such.
- **Sentry titles** for message-shaped traces: `ServerTrace: <code>: <summary>`;
  fingerprint pinned to the `admin_events` fingerprint (tag
  `bridge_fingerprint`). Existing server-trace issues will regroup once.
- **admin-logger**: a non-PGRST205 insert failure emits the capped, stably
  fingerprinted `bridge_write_failed` Sentry message instead of a bare
  `console.error`; `logRoundSubmitted`/`logAIGeneration` tag sport+feature.
- **Credential shapes** in one `.mjs` (`src/lib/admin/credential-shape.mjs`)
  shared by `scripts/check-helm-bridge-env.mjs`, `sentry-api.ts`,
  `vercel-api.ts`, `inngest/credentials.ts`. The script now fails on the
  eight 11-character placeholders it used to pass; `--drift` treats a
  placeholder as provisioned-and-wrong; DSN shape is advisory.
- **Heartbeat 42501** (finding 3): the client hook now routes the VALUE-shaped
  RPC failure through `logError` (feature `auth_onboarding`, severity `low`).
  Grants verified against production 2026-09-01 via the read-only connector:
  `public.heartbeat()` is SECURITY DEFINER, EXECUTE for `authenticated` and
  `service_role`, NOT `anon` or PUBLIC — correct, so NO migration was written.
  The last Sentry occurrence is 2026-08-28T14:50Z, before the `getSession()`
  guard shipped; the fault was a dead JWT evaluated as `anon`.
- **rca_analysis rows** (finding 9): already born resolved on HEAD
  (`analyze-error.ts:143`), pinned by `analyze-error.test.ts:220`; the finding
  was stale against 6a7577c71. Doc corrected to say so; no code change.
- Verified from the worktree: `npm run typecheck` exit 0; `npm run lint` exit
  0 (`--max-warnings 0`); vitest over the four named bridge tests plus every
  test under `src/lib/admin/**`, `src/app/admin/**`,
  `src/lib/observability/**`, `src/lib/inngest/**`, `src/app/api/inngest/**`
  and the added/adjacent suites: 257 files / 3020 tests, 0 failed (255/2976
  in the batch run + 2/44 for the two files edited last); `npm run build` —
  see the PR body for the recorded exit.
- NOT done, and left explicitly: the systemic 1,044-unchecked-reads class
  (PostgREST failures returned as values) is untouched beyond the one
  heartbeat call site; the ~21 remaining `Promise.allSettled` sites from
  INC-2026-08-27 follow-up 2 are still not individually cleared; Lift Lab has
  no feature-registry entry, so its rows stay visibly unregistered; the three
  sport action wrappers still call `observeActionSoftFailure` without `void`
  (outside this change's territory — harmless, the returned promise never
  rejects).

## 2026-08-27 — self-healing: error resolution lifecycle, and a cron that lied

- SHA: recorded on merge of `feat/bridge-shot-tracing`.
- **APPLIED TO PRODUCTION 2026-08-27 (owner-instructed):**
  `supabase/migrations/20260827031754_admin_error_resolutions.sql`. Verified on
  the local Docker stack FIRST (per standing instruction), then applied and
  re-verified against production: 13 columns, RLS enabled, 1 policy, 4
  functions, `anon` cannot SELECT, `anon`/`authenticated` cannot EXECUTE the
  auto-resolve RPC (service_role only), 0 rows.
- **Why a table and not `admin_events.resolved`.** Those columns are per-ROW.
  Resolving an incident means marking N rows, and the next occurrence of the
  SAME fault arrives as a new unresolved row — so the thing an operator fixed
  cannot be recorded as fixed, and returns indistinguishable from a regression.
  Resolution belongs to the FINGERPRINT.
- **The regression rule — why "never show it again" is not what was built.** An
  archived fault that recurs after its fix shipped is a REGRESSION, and that is
  the most valuable signal here. Permanent suppression would turn the archive
  into a way to lose bugs. Nothing is deleted; archiving is a read-time join, so
  dropping the table would make every incident reappear — the correct failure
  direction for a feature whose job is hiding things.
- **Auto-resolve requires a DEPLOY, not just silence.** A nightly cron is silent
  23 hours a day; a seasonal feature is silent for months; an outage that ended
  on its own is silent until it returns. Only "production shipped something
  AFTER the last occurrence" separates a fix from an absence. When the deploy
  time is unreadable, NOTHING is auto-resolved and the plan says why, rather
  than archiving live faults on a false premise.
- Auto never overwrites a human's `manual` resolution (the RPC returns false),
  and `reopened_count` survives a re-resolve so "fixed three times already"
  cannot be laundered.
- `shipStatus` has THREE outcomes. `unknown` exists because Vercel can be
  unreachable, and rendering that as `pending` would tell an operator their fix
  had not shipped when the truth is we could not find out.

## 2026-08-27 — a failing cron reported healthy for two days

- Incident: `memory/incidents/admin_platform/INC-2026-08-27-swallowed-cron-failure-invisible-to-bridge.md`
- `event-reminders` discarded the rejection REASON from `Promise.allSettled`
  (`failed += 1`), so nothing threw, the route returned 200, `recordJobRun`
  wrote `completed`, and `admin_events` learned nothing. Sentry saw 47
  escalating occurrences no Bridge surface could reach.
- Repaired by capturing, deduping and bounding the reasons, logging them at
  `error` severity, and carrying them in the response as a STRING —
  `extractOutcomeMetadata` keeps only top-level scalars and drops arrays, so an
  array would have reproduced the invisibility.
- A first attempt returned 500 on total failure; two existing tests rejected it
  and were right (one flaky APNs push would have reddened the cron). The bug was
  the invisibility, not the status code. Tests were updated only where they
  encoded the OLD contract; none were weakened.
- The underlying permission fault is NOT fixed and is R3. `service_role` already
  holds SELECT on both objects — the shared property of the two failing objects
  is that neither grants `anon`, so the path is using the wrong client. Granting
  `anon` would expose coach data via a `SECURITY DEFINER` view with an open
  ERROR advisory.

## 2026-08-27 — observability accuracy fixes

- `cn()` silently dropped ALL 43 custom font-size tokens (`text-caption`,
  `text-eyebrow`, `text-h3`…) whenever merged with a text colour: tailwind-merge
  files unknown `text-*` under text-COLOUR, so the colour superseded the size.
  That silently unstyled the shared `<Eyebrow>` primitive everywhere it is used.
  Fixed at the source in `src/lib/utils.ts` with a drift test pinning the token
  list to `tailwind.config.ts`.
- `NOTICE_SEVERITIES` added to `@/lib/admin/severity`, DERIVED from the gap
  between the two existing tiers rather than hand-listed. A literal `['warning']`
  would have been a third hand-written definition of the thing that module
  exists to declare once — the same drift that once left 41.5% of visible events
  out of the headline count.
- Sentry `sport` tagging: `cron` and `unattributed` are now distinct from
  `marketing`. A real cron failure arrived tagged `sport: marketing`, so
  filtering by the marketing site returned a broken background job and filtering
  the other way hid it. A wrong label is worse than an honest gap.
- `tracesSampler` keeps `db.*` spans at 1.0 (was a flat 0.2, discarding four of
  five Supabase spans); Postgres error codes now drive Sentry grouping, after
  finding ONE Inngest key mismatch occupying FOUR fingerprints split only by
  "signature was 1s old" vs "2s".

## 2026-08-26 — reliability tab: wired to the cron contract, and made legible

- SHA: recorded on merge of `feat/reliability-collector`.
- **Wiring defects caught by CI, not by local runs.** The first draft hand-rolled
  its own `background_job_logs` insert and never called `recordJobRun`, which
  `cron-job-log-coverage.test.ts` requires of every registered cron. It also
  wrote `status: 'success'` — a word no other writer in the table emits (verified:
  every existing row is `completed` or `failed`), so the Jobs board and every
  status filter would have skipped it. Both fixed. The lesson recorded for the
  next agent: a scoped `vitest run <dirs>` is not a substitute for `npm test`
  when the change touches a cross-cutting registry.
- Two rows per run now, deliberately: `recordJobRun` writes the cron-board row,
  and the correlated payload goes under `reliability-snapshot`. One row cannot
  serve both — `extractOutcomeMetadata` keeps only top-level scalars by design,
  so `signals[]` would have been stripped and the tab would have shown every run
  as "recorded but unreadable".
- The route now returns **503 when any arm is blind**, so the Jobs board shows
  the cron red until `SENTRY_READ_TOKEN` and a Vercel token exist. That couples
  to the self-feed filter: a failed run makes `recordJobRun` write an
  `admin_events` row titled `Cron failed: reliability-triage`, which is precisely
  what `collectSupabase` excludes. The exclusion test now asserts against that
  exact string, derived from the shared constant rather than hand-typed.
- **Evidence attribution was a parallel-array bug that broke the drill-through
  this change added.** `sources[]` and `evidenceRefs[]` were separate lists
  deduped on DIFFERENT keys, and the view paired them by index. One source
  contributing two refs — two Sentry issues folding to one signature, the common
  case — shifted every later index, so a Supabase fingerprint got attributed to
  Sentry, failed `evidenceTarget`'s source check, and rendered as dead text
  instead of `/admin/errors/<fingerprint>`. Replaced with
  `evidence: Array<{source, ref}>`; a ref means nothing without knowing which
  system it addresses, so the pair is the unit. Verified red/green. Note why the
  original tests could not catch it: every `evidenceTarget` case passed a
  hand-matched `(ref, source)` pair, so the pairing itself was never exercised —
  the assertion had to move up to `correlateSignals`.
- **The 503-on-any-blind-arm would have manufactured errors into the shared
  triage queue.** `recordJobRun` does more than write a job row on a >=400: it
  also calls `logServerEvent(..., 'error')`, writing an `admin_events` row. At a
  3-hour cadence with one unreadable source that is eight error rows a day,
  indefinitely, landing in `/admin/errors`, the incident feed and the nav error
  badge — a system whose thesis is "never hide errors" quietly generating them
  where an operator looks for real ones. Now only a TOTALLY blind run returns
  503. A partially blind run is still reported honestly twice: the snapshot row
  carries `status='failed'` and the tab renders a danger band naming each blind
  source.
- **Visualisation.** The tab was a flat list; it is now KPI strip (needs
  attention / cross-source / correlated / sources reading, each a drill-through)
  → source health + severity mix → signals grouped by severity with a severity
  stripe → run history. Built from the Bridge's existing vocabulary
  (`StatStrip`, `KpiTile`, `SegmentBar`, `Eyebrow`, `Badge`, `StatusPill`), not
  new primitives.
- **Evidence references are now links where they resolve to one.** A Sentry
  permalink opens the stack trace; an 8-char `buildIncidentSignature`
  fingerprint drills through to `/admin/errors/<fingerprint>`, which the Bridge
  already renders. A Vercel deployment id and a pre-fingerprint `row:<uuid>` are
  rendered as opaque text rather than linked to a page that would 404. Only
  `http(s)` refs become external links, so a `javascript:`/`data:` value cannot
  be rendered as one.
- Cross-surface visibility came free from doing the wiring correctly rather than
  from new plumbing: because the cron is in `CRON_REGISTRY` and calls
  `recordJobRun`, the Jobs board picks it up automatically and shows its cadence
  and failures with no extra query. A nav badge was considered and rejected — the
  badge path is bottom-nav-only and would have cost a DB read on every Bridge
  navigation for data that changes once every 3 hours.

## 2026-08-26 — reliability collector: three sources, one correlated view

- SHA: recorded on merge of `feat/reliability-collector`.
- Change: new cron `/api/cron/reliability-triage` (`0 */3 * * *`, registered in
  both `vercel.json` and `cron-registry.ts` at `cadenceMinutes: 180`) reads
  Sentry, Supabase `admin_events` and Vercel deployments, folds them into one
  deduped signal set, and writes a single `background_job_logs` row with
  `job_type='reliability-triage'`. New Bridge tab `/admin/reliability` renders
  that row live. Collector core is `src/lib/reliability/**`.
- Correlation reuses `buildIncidentSignature`'s normalisation rather than
  inventing a second scheme, but calls it through `correlationSignature` with a
  FIXED severity. Caught in review: `buildIncidentSignature` folds severity into
  its key, so a Sentry `error` and an `admin_events` `warning` describing one
  root cause would have produced two signatures, two entries, and never the
  "confirmed by 2 sources" badge that is the tab's entire reason to exist apart
  from the Errors tab. The first draft shipped a test that asserted the severity
  ratchet using two rows of the SAME severity — it could not fail, and its own
  comment noted the awkwardness instead of following it. Replaced with a test
  that folds `error` + `warning` and asserts one entry; verified red/green.
- Consequence recorded precisely, since the looser claim would rot: what is
  shared with the Errors tab and the Golf Tracer is the normalisation and the
  notion of "same failure", NOT the literal hash. The correlation signature is
  deliberately not equal to the stored `admin_events.fingerprint`.
- Storage is `background_job_logs.metadata`, NOT a new table. A new table is R3
  (owner-applied migration) and would have blocked the pipeline on a production
  schema change. A CI-committed JSON artifact was rejected on a harder
  constraint: production pins to the last released SHA and releases are capped
  at 2/week, so a committed file would be up to a week stale in the Bridge.
  Precedent for this store: `ingest-gmail-replies` ("the only cross-invocation"
  store), `coachhelm-validation`, `helm-debug-prune`.
- A blind source is never rendered as zero problems. Each arm returns
  `{status, reason, signals}`; the run's status is the WORST arm, and the jobs
  board shows `failed` when any arm could not be read. As of this date
  `SENTRY_READ_TOKEN` and a Vercel token are absent from GitHub Actions
  secrets, and `VERCEL_API_TOKEN` is unverified in production env — so arms can
  legitimately start blind and must say so.
- The self-feeding read is closed at the query: this collector is a cron that
  reads the table crons write failures to, so `collectSupabase` excludes both
  `event_type='rca_analysis'` and any row naming its own job type. Guarded by a
  test that fails when either filter is removed (verified red/green).
- Registry gap closed in the same change: `src/lib/admin/**` and
  `src/lib/reliability/**` previously mapped to NO feature, so `knowledge:map`
  resolved a Bridge page to `admin_platform` while resolving the data module
  that page reads to nothing.
- **Phase 1 is read-and-record only.** It opens no issues, files no PRs and
  merges nothing. The correlation is keyed on a signature whose real
  cross-source distribution has never been observed, and wiring an auto-fix
  loop to an unvalidated dedupe rule is how a system opens noise PRs against
  production every three hours. What this job records is the evidence the next
  phase gets designed from.
- Why: error tracking existed per-source and nothing correlated across them, so
  one root cause read as three unrelated problems, and no surface answered
  "which sources could we actually read just now".

## 2026-08-26 — integration fixes across the follow-up sweep

- SHA: recorded in the follow-up ledger commit on `feat/bridge-todo`.
- Found by the adversarial review over the combined diff, not by the agents
  that made the individual changes — each was correct in isolation and wrong
  in combination.
- **Six `revalidatePath('/golf/admin')` calls were pointing at a route that no
  longer renders.** Five sit inside the round-repair actions in
  `admin-tracer-data.ts`, which the LIVE Bridge calls through
  `src/app/admin/actions/golf-tracer.ts` — so after an operator repaired a
  round, the page they were looking at did not refresh. Repointed to
  `/admin/golf/tracer`. The sixth, in `demo-request.ts`, refreshes the CRM
  lead list: repointed to `/golf/admin/crm`, because `revalidatePath` does
  not cascade to children and the CRM page is a child of the removed route.
- **`resolveDashboardIncident` in `admin-data.ts` is now uncalled** — its only
  consumer was the deleted ErrorFeed. Annotated in place rather than removed:
  deleting exports there moves a count that
  `coverage-contract.foundation.test.ts` pins, so it belongs in a deliberate
  dead-action sweep, not as a side effect of a UI deletion.
- **Three docs pointed at deleted files**, failing `docs:path-drift` (a
  required check). `REPO_MAP.md`'s error-boundary note now records that the
  class boundary is gone and names the Bridge's `PanelBoundary` instead;
  `golfhelm-features.md`'s Admin Dashboard row repoints to
  `src/app/admin/page.tsx`; this ledger's own deletion entry is phrased as
  "was removed", which is both accurate and the gate's documented escape for
  history that legitimately names an absent file.
- **`memory/registry.yml` still routed `src/app/golf/admin/components/**`** —
  a dead entry means live code maps to no feature while a retired path still
  demands ceremony. Removed; the CRM components path stays.
- Baseline moved DOWN, and was locked in: unchecked Supabase reads 1046 → 1044
  (the audit refuses to leave slack, because slack is room for a fix to be
  silently reverted).

## 2026-08-26 — System-tab error trend now reads admin_events, not the never-written error_rate_hourly

- SHA: recorded in the follow-up ledger commit on `feat/bridge-todo`.
- Change: `getSystemTabData()` (`src/app/golf/actions/admin-system-data.ts`)
  no longer queries `public.error_rate_hourly`. That table has a schema, RLS
  policies, and a service-role write grant, but a production read-only check
  (2026-08-26) confirmed 0 rows, no `pg_cron` job, no trigger, and no
  function referencing it anywhere — nothing in this repo or the live
  database ever writes to it. The hourly error trend is now derived
  in-process, by a new pure helper `deriveErrorTrend`, from `admin_events`
  rows (`event_type = 'error'`, same trailing-7-day window) — the table app
  code actually writes (96,426 rows / 93,829 `event_type='error'` at
  verification time). `ErrorRateEntry.userFacingErrors` is removed rather
  than faked: nothing in the codebase classifies an `admin_events` row as
  user-facing, and 91% of error rows carry `source: null`, so there is no
  genuinely equivalent number to compute for that one field.
- Two honesty follow-ups from review, both landed in the same change:
  `SystemTabData` gained `errorTrendTruncated: boolean` — the query orders
  `created_at` DESCENDING with a 20,000-row cap, so a future spike drops the
  OLDEST rows in the 7-day window and keeps the most recent ones (the
  ordering is load-bearing: ascending would instead fabricate zeros in the
  newest, most-watched hours right when a spike made someone open the tab).
  `affectedUsers`' doc comment now states plainly that it is a lower bound —
  ~54% of `event_type='error'` rows in the trailing 7-day window carry a
  null `user_id` (verified 2026-08-26), same class of gap as
  `userFacingErrors` but real enough (46% attributable) to keep rather than
  drop, with the caveat stated instead of implied.
- Why: a permanently-empty rollup was being read and rendered exactly like
  measured data — "0 errors this hour" that was actually "never measured".
  See `memory/incidents/admin_platform/INC-2026-08-26-error-rate-hourly-never-written.md`
  for the full verification trail.
- Scope note: `getSystemTabData`/`SystemTabData` had zero consumers anywhere
  in the repo at the time of this fix — confirmed by repo-wide grep, and
  since corroborated by the concurrent deletion of `SystemTab.tsx` recorded
  below. `src/app/api/admin/debug-rollup/route.ts` was checked and does not
  consume this file — untouched. `auth_metrics_hourly`, queried a few lines
  below in the same file, is *also* empty in production with the same
  absent-writer shape; out of this fix's named scope (`error_rate_hourly`
  only) and left as-is, flagged in the incident doc so it isn't mistaken for
  checked.

## 2026-08-26 — Legacy `/golf/admin` dashboard shell deleted

- SHA: recorded in the follow-up ledger commit on `feat/bridge-todo`.
- Change: `src/app/golf/admin/page.tsx` was removed, along with the entire
  `src/app/golf/admin/components/**` directory (90 files: TracerTab and its
  10-file `tracer/` sub-tree, SystemTab, OverviewTab + its `overview/`
  sub-tree, PeopleTab, GrowthTab, BusinessIntelligenceTab,
  AdminRealtimeProvider, and ~65 shared cards/charts/badges). The route was
  unreachable — `next.config.mjs` 308-redirects the exact `/golf/admin` path
  to `/admin` (Helm Bridge) — but still shipped in the client bundle and held
  live Supabase Realtime subscriptions.
- Kept, deliberately, despite sitting directly in `src/app/golf/admin/`
  outside `crm/`/`demo-sessions/`: `layout.tsx` (the auth gate — redirects to
  `/golf/login` when unauthenticated or non-admin — plus
  `SessionActivityProvider`/`AdminNativeGuard`/`AdminMotionProvider`),
  `loading.tsx` (the Suspense boundary wrapping that layout's async auth
  check), `error.tsx`, and `_motion-provider.tsx` (imported by layout.tsx).
  Next.js App Router makes a segment's `layout.tsx` an unskippable ancestor
  of every nested route, and `demo-sessions/` has no `layout.tsx`/`loading.tsx`
  /`error.tsx` of its own — it relies entirely on these. Deleting them would
  have taken down the two LIVE Bridge sub-surfaces this task was required to
  leave untouched.
- Fixed after deletion (files outside `src/app/golf/admin/` that referenced
  deleted paths):
  - `src/lib/utils/date-only.test.ts` — removed the pinned call-site entry for
    the deleted `tracer/DataQualityIssueRow.tsx`.
  - `scripts/__tests__/admin-tables-mobile.test.mjs`,
    `scripts/__tests__/badge-consolidation.test.mjs` — dropped the deleted
    files from their target lists (both currently run under `node --test`
    only, which nothing in this repo invokes — see vitest.config.ts's own
    comment on that — so neither was breaking CI, but both stayed accurate).
  - `.duplicate-exports-baseline.json` — regenerated via
    `node scripts/check-duplicate-exports.mjs --update`: 32 → 27 known
    duplicates. Deleting the legacy copies resolved `ActivityFeed`,
    `LiveActivityFeed`, and `generateAlerts` (the surviving copy is now the
    only export of that name) and fully removed the `isStuckRound` pair (both
    sides of that duplicate lived in `tracer/`). `AdminMotionProvider`'s
    duplicate with `src/app/admin/_motion-provider.tsx` remains — the
    golf-admin copy survives as ancestor-layout infrastructure.
- Not ported (see review below) — logic present in the legacy tree with no
  live equivalent in `src/app/admin/golf/tracer/`, flagged rather than
  silently discarded:
  - The hole-by-hole shot browser and in-place incident resolve — both already
    named as deliberately dropped in `src/app/admin/golf/tracer/page.tsx`'s own
    port-strategy comment (resolve moved to `/admin/errors`, since Tracer
    incidents are `admin_events` rows; the shot browser has no Bridge
    equivalent yet).
  - Fleet-wide data-quality analytics with no equivalent in the live port:
    `TracerDataQuality.tsx` (cached-vs-computed stats-accuracy comparison
    across every player, `SCORING_THRESHOLD`/`PUTTS_THRESHOLD`/
    `FAIRWAY_THRESHOLD`/`GIR_THRESHOLD` mismatch detection) plus
    `tracer-utils.ts`'s `computeCompleteness` / `detectDataQualityIssues` /
    `computePlayerQualityScores` / outlier detection. The live port's
    `bridgeGetTracerRoundDiagnostic` is per-round, not fleet-wide across all
    players' cached stats — this capability has no equivalent at any
    granularity. Reported for deliberate triage, not ported (out of this
    task's ownership — `src/app/admin/**` and `src/app/golf/actions/**`
    belong to other agents).

## 2026-08-26 — Tracer now groups incidents by the same write-time fingerprint as the Errors tab

- SHA: recorded in the follow-up ledger commit on `feat/bridge-todo`.
- Change: the Golf Tracer (`admin-tracer-data.ts`'s `buildTracerIncidents`)
  stopped recomputing its own read-time grouping key
  (`normalizeTracerIncidentKey` — normalized message + normalized route + raw
  `action` + `errorCode`, both deleted) and now groups `admin_events` rows by
  the SAME write-time `fingerprint` column the Errors tab's triage queue
  groups by (`mergeTriage` in `src/lib/admin/data/triage.ts`, set once at
  insert by `buildIncidentSignature()` in `src/lib/admin/incident-grouping.ts`).
  A new pure helper, `tracerIncidentGroupKey(fingerprint, id)` in
  `tracer-shared.ts`, holds the key derivation — `fingerprint`, or a synthetic
  `row:<id>` for a NULL fingerprint (pre-column rows), matching
  `mergeTriage`'s own `row.fingerprint ?? \`row:${row.id}\`` fallback exactly
  rather than inventing a second convention. The three `admin_events` selects
  in `admin-tracer-data.ts` now fetch `fingerprint`. The Tracer's
  shot-tracking LENS (`isShotTrackingTracerEvent` — featureArea/action-prefix/
  route filtering) is unchanged and still applied to the raw event list
  BEFORE grouping; it is now a filter over the shared grouping, not a second
  grouping algorithm.
- Why: two views of the same `admin_events` rows were bucketing them into
  incidents two different ways, so the Tracer's and the Errors tab's
  open/resolved counts for the same underlying failures could disagree.
- **Visible-count impact, stated plainly (not discovered):** the new key
  drops `action` as a grouping dimension (the write-time fingerprint doesn't
  carry it), truncates the message component to 80 chars instead of the full
  normalized message, and collapses every `provider_*` errorCode to one
  incident regardless of route/message/severity. Net effect is that grouping
  gets COARSER — some rows that showed as separate Tracer incidents before
  (same route/errorCode/message-prefix, different `action`, or long messages
  sharing an 80-char prefix) now merge into one, so the Tracer's incident
  count can go DOWN and per-incident occurrence counts up. Since
  `admin_events.fingerprint` has been populated since 2026-07-01 and the
  Tracer's error window is 45 days, this mostly isn't the NULL-fallback path
  firing — it's the two signature *shapes* differing, now removed by
  consuming one shape instead of two.

## 2026-08-26 — four CodeQL findings on the refit's own new code

- SHA: recorded in the follow-up ledger commit on `feat/bridge-observability`.
- CodeQL flagged 4 alerts (1 critical, 3 high) on code this branch added. None
  were in the required-check set, so none would have blocked the merge
  mechanically. All four were real and all four are fixed.
- **Critical — SSRF in the new Sentry resolve action.** `updateSentryIssueStatus`
  interpolated the caller-supplied issue id straight into a URL path segment,
  on a request carrying a Sentry token far more privileged than the operator
  holding it. `../../` walks to a different endpoint; a leading `//`
  re-points the request at another host entirely. Now validated against
  `^[A-Za-z0-9_-]{1,64}$` and encoded — super-admin gating is not a reason to
  skip validation when the credential outranks the caller.
- **High — polynomial ReDoS on an unauthenticated route.** The shared
  redaction regex ran across the *entire* client payload before truncation, so
  a megabyte of attacker-chosen text on `/api/log-error` was scanned in full.
  Fixed structurally (truncate to the storage budget FIRST, so nothing scans
  more than we agreed to keep) and locally (the key-name quantifier is bounded
  at 256 — the part that actually backtracks; the URL alternative stays
  unbounded on purpose, since it is greedy with nothing required after it and
  bounding it would leave the tail of a long URL, where tokens sit, unredacted).
- **High — a second ReDoS in the route's own `stripUrlSecrets`.** The scheme
  test and the query cut were both regex scans over client text; both are now
  index math and a bounded prefix scan, which is also a truer statement of the
  rule (a scheme is short by definition).
- **High — prototype pollution.** The context-tree walker rebuilt objects with
  `out[key] = …` using keys an unauthenticated client chose. Now a
  null-prototype accumulator that drops `__proto__` / `constructor` /
  `prototype` outright. Ordinary keys still survive — this drops dangerous
  names, not telemetry.
- Worth stating: these were introduced by this branch's own work, and three of
  the four sit on a public, unauthenticated ingest endpoint. The observability
  code got the same scrutiny it exists to provide.

## 2026-08-26 — review round on the observability refit

- SHA: recorded in the follow-up ledger commit on `feat/bridge-observability`.
- Four independent reviews (correctness, security, UI/mobile, and a final pass
  over the committed diff) ran against the refit below. No blockers; these are
  the fixes that came out of them.
- **The Health nav badge stopped hammering Sentry, and stopped lying.** It was
  calling `fetchFeatureHealth()` — an 85-feature, ~15-round sequential Sentry
  sweep — from inside a `force-dynamic` layout, so it re-ran on every `/admin/*`
  navigation *and* every 30s `AutoRefresh` tick from any open tab. On failure it
  fell back to `0`, which renders identically to "no red features". Replaced
  with `fetchFeatureHealthRedCount()`, a DB-only count off the same
  `get_feature_health()` rows: verified that `computeFeatureStatus`'s red branch
  never reads `sentryUnresolved` (only the amber branch does), so the DB-only
  red count is *identical* to the Sentry-backed one rather than an
  approximation. It returns `number | null`, and null renders no badge at all.
- **One fingerprint per cause, not per action.** `withGolfAction` passed an
  explicit 3-element fingerprint, which short-circuits `buildFingerprint`'s
  shared default and drops the `errorCode ?? severity` element. Every distinct
  failure of a wrapped action collapsed into one incident — a unique-violation
  and a serialization failure on `removePlayerFromTeam` would have shared a
  fingerprint, giving the new detail page a mixed history and handing an RCA run
  two unrelated causes at once. Restored the 4th element, with a regression test.
- **A rescued round no longer records as a failed trace.** The submit path
  marked the RPC step failed *before* the direct-write fallback ran, and
  `finalize()` forces `failure` when any step failed — so a round the fallback
  saved was recorded as a failure. Now the outcome is deferred until the fallback
  resolves: on rescue the RPC step is a warning, a `db.direct_submit_fallback`
  step records the recovery, and the trace finalizes `success`. (Currently
  unreachable in production — `attemptDirectSubmitFallback` has been a stub
  returning failure since the 2026-08-20 round-destruction incident — so the
  success path is proven directly against the real recorder instead.)
- **The recorder cannot stall a save.** `persistStart` was awaited unbounded;
  it now races a 1500ms timeout and degrades to the inert no-op recorder,
  closing its Sentry span rather than leaking it.
- Smaller: feature-health chips were ~20px tap targets across four surfaces
  (now `min-h-11`); `RecentTimelines` rendered a click hint where an empty state
  belonged; two authorization denials in messaging were paging Sentry as errors
  and are now classified as expected soft failures — while the genuine
  infrastructure failure beside them deliberately was not.
- **Redaction now covers `stack`, `message` and `title`, not just `url` and
  `context`** — and it is ONE implementation, in
  `src/lib/observability/redact-pii.ts`, called by both write paths. The client
  ingest route and the server logger write to the same two columns, and both
  are read back by the RCA action and forwarded to a third-party model; two
  copies of a redaction rule is one copy that eventually stops matching the
  other, and the half that drifts fails silently. A URL-shaped secret is found
  anywhere inside free text (a whole-string check missed one embedded
  mid-stack), path-segment credentials go through `redactSensitiveUrl` before
  the query/fragment cut, and the length slice happens BEFORE email masking
  because `maskEmails` silently no-ops above 20k characters and a client
  controls stack length. Failure falls back to a fixed placeholder, never the
  raw value: a cheap fallback can only protect against one of the two hazards.
- **Expect a one-time fingerprint shift on deploy.** `buildIncidentSignature`
  hashes the message, and messages are now URL-stripped in both write paths, so
  any open incident whose message carried a query string re-fingerprints once
  and appears as a new group in triage. This is a net improvement — per-request
  tokens were already fragmenting one root cause across many fingerprints — but
  it will look like a burst of new incidents for one cycle.
- `expectRows` ships unwired on purpose. The obvious first call site
  (`removePlayerFromTeam`) was checked against production RLS read-only and
  would have raised false alarms: `user_is_coach_of_golf_player()` requires
  `status = 'active'`, while the membership check gating that read does not
  filter on status. A false RLS alarm is worse than none; the module names its
  real first candidate instead.

## 2026-08-26 — Helm Bridge observability refit: capture, forensics, and organization

- SHA: recorded in the follow-up ledger commit on `feat/bridge-refit`.
- Audit: four-agent code audit of `src/app/admin`, `src/app/golf/admin`, the
  error pipeline, and the round-lifecycle migrations (2026-08-25).
- Change, in four parts:
  - **Resolution is one path.** `resolveErrorFingerprint` no longer performs a
    direct service-role `UPDATE`. It reads the open event ids for a fingerprint
    with the admin client, then resolves them through the same user-scoped
    `resolve_admin_event` RPC the triage queue uses, with the same
    `describeResolveFailure` translation and the same cache-tag bust. The
    fingerprint button gained the two-step confirm the bulk button already had.
    Before this, two privilege models wrote one `resolved` column and only one
    of them refreshed the nav badge.
  - **Detail that was captured is now shown.** The fingerprint page renders a
    forensics header over fields that were already being written to
    `admin_events.metadata` and never surfaced: Postgres error code and hint,
    request id, runtime, handled/unhandled, resolved source-file path, sport,
    feature, source, action, and — when present — a link to the round's flight
    trace. Each field copies individually. A 7-day occurrence strip and an
    elevated suspect-deploy line sit alongside it.
  - **Root cause moved into the product.** `analyzeErrorFingerprint` sends the
    incident report, stacks, classification, and deploy brackets to the model
    provider and stores a structured verdict as an `admin_events` row with
    `event_type='rca_analysis'`. Every incident query excludes that event type,
    so an analysis can never be counted as an occurrence of the thing it
    analyzes. Sentry-origin rows can now be resolved from inside the Bridge.
  - **The Overview answers "is anything on fire" first.** Status banner,
    briefing, a new severity-mix strip, and the triage queue sit above the
    fold; the KPI/posture boards moved into a remembered disclosure; the
    metric-truth panel dissolved into per-tile source notes so the provenance
    survived without a fourth full-width section. Feature health renders
    through one component in all three places that show it.
- Why: the Bridge captured far more than it displayed, resolved state through
  three code paths that could disagree, and buried the triage queue under
  three screens of posture. Operators could not see the detail needed to fix
  an error without leaving the tool.

## 2026-08-26 — client error context is redacted before it is stored

- SHA: recorded in the follow-up ledger commit on `feat/bridge-refit`.
- Change: `/api/log-error` now strips query strings and fragments from every
  URL-shaped value in the client-supplied context tree, and masks emails,
  before any write to `error_logs` / `admin_events`. `AdminErrorBoundary`
  reports through `logError` by default rather than only `console.error`.
- Why: the existing redaction ran on the Sentry path only. Browser diagnostics
  collect `location.href` and `referrer`, which can carry a magic-link token,
  OTP, or OAuth code — those were landing unredacted in tables any Bridge
  operator can read. Separately, an admin-surface crash caught by the boundary
  never reached the triage queue at all.

## 2026-08-26 — the qualifier read's truncation flag could never fire

- SHA: recorded in this commit on `feat/bridge-shot-tracing` (PR #1631).
- Change: `fetchQualifierLogic` no longer asks PostgREST for
  `.limit(2_000)` / `.limit(20_000)`. It pages at PostgREST's real 1,000-row
  cap up to an explicit ceiling, and reports whether the ceiling — rather
  than a drained source — is what stopped it.
- Why: PostgREST caps any single request at 1,000 rows, so `.limit(20_000)`
  returned 1,000. Beyond the missing rows, it disabled the honesty check
  built on top: the fallback `fetched.length >= 20_000` could never be true,
  so a read that WAS clipped reported `truncated: false` whenever the
  exact-count probe was unavailable to contradict it. That is the
  `unknown -> healthy` shape the OS forbids, inside the panel whose whole
  job is saying how much it actually checked.
- Found by `scripts/check-row-cap-limits.mjs` (the gate added earlier in this
  same PR), not by review — the adversarial review pass caught the identical
  defect in a sibling surface and missed this one.

## 2026-08-26 — a new unchecked Supabase read, caught by its own ratchet

- SHA: recorded in this commit on `feat/bridge-shot-tracing` (PR #1631).
- Change: `loadCoverageAndRawEvents` checks `rowsRes.error` inline instead of
  through `assertQueryOk`. Same throw, same message shape.
- Why: `helm/no-unchecked-supabase-error` matches a literal `.error` read and
  cannot see through a helper call, so the check was real but unverifiable —
  and the count went 1044 -> 1045 against a baseline that may only go DOWN.
  The baseline was NOT raised. Of the five results only this one has its
  `.data` read, which is exactly the shape the rule exists to catch.

## 2026-08-26 — migration reformatted to satisfy sqlfluff, proven inert

- SHA: recorded in this commit on `feat/bridge-shot-tracing` (PR #1631).
- Change: `20260827031754_admin_error_resolutions.sql` reformatted (LT01/
  LT02/LT05 only). No statement, identifier, grant, or policy changed.
- Why: it added 69 violations against a ratchet whose counts may only go
  DOWN. The file is ALREADY APPLIED to production, so "cosmetic" had to be
  proven, not asserted: the reformatted file was re-applied to the local
  Docker stack and `pg_get_functiondef` plus the table comment came back
  byte-identical to the pre-reformat catalog (`diff` exit 0). The RPC
  behaviour suite was re-run against that database afterwards and still
  holds — auto never overwrites manual, regression counts once per
  transition, re-resolve keeps `reopened_count`, malformed SHA rejected.

## 2026-08-27 — the resolution ledger wires into the EXISTING resolver

- SHA: recorded in this commit on `feat/bridge-shot-tracing` (PR #1631).
- Change: `autoResolveFixedIncidents` now records fingerprint-level
  resolutions (Rule A with the production SHA, Rule B with none) and marks
  regressions, via `src/lib/admin/resolution-ledger.ts`.
  `src/lib/reliability/resolution.ts` lost its archive branch entirely and is
  now reopen-detection plus `shipStatus`.
- Why, and this is the important part: the removed branch was a SECOND archive
  rule, and it was missing an exclusion the existing one has. Rule A skips
  every operator-gated fault (`provider_*_credit_exhausted`,
  `_invalid_credential`, `_missing_credential`, `_plan_gated_model`) because
  those fire only when something exercises the path — a quiet weekend is
  indistinguishable from a fix, and no deploy ever topped up a billing
  account. Measured 2026-08-06: EVERY provider fault in the table had been
  flagged resolved while still broken, one closed for ten days with a dead
  credential. Shipping a parallel rule without that exclusion would have
  re-earned that bug at full price. One decision, made once, in the place that
  already carries the exclusion.
- What the ledger adds that the row-level `resolved` flip cannot: which commit
  is credited, whether that shipped, and that a fault has come BACK. Rules C
  (no fingerprint) and D (classifier says non-actionable) write nothing —
  neither claims anything was fixed.
- Ordering is load-bearing: regressions are detected BEFORE any resolution is
  recorded, because recording overwrites `last_seen_at_resolution`, the exact
  baseline a regression is measured against. A fingerprint that regressed in a
  pass is excluded from re-archiving in that same pass.
- A failed resolutions read SKIPS regression detection and says so
  (`regressionSkippedReason`) rather than reporting a clean zero it never
  established.

## 2026-08-27 — migration file renamed to match the version production recorded

- SHA: recorded in this commit on `feat/bridge-shot-tracing` (PR #1631).
- Change: `20260827031100_admin_error_resolutions.sql` →
  `20260827031754_admin_error_resolutions.sql`. Content untouched.
- Why: production stamped the applied migration `20260827031754` — same name,
  ~11 minutes later than the local filename. Verified against
  `supabase_migrations.schema_migrations`: version `20260827031100` returns
  ZERO rows; `20260827031754 / admin_error_resolutions` is present and is the
  newest row in the ledger. A local file with no ledger row counts as
  `unaccounted_local` by the migration ledger-drift gate (authored in a
  concurrent session and not yet on this branch, so its path is deliberately
  not cited here), whose baseline of 38 may only go DOWN — so this would have gone red on `main`
  AFTER merge, reading as an unapplied migration when it is applied and merely
  stamped differently. Caught by the security-scan session before it landed.
- Note for anyone auditing later: `schema_migrations.statements` retains the
  SQL production actually executed, and the on-disk file has since been
  reformatted for sqlfluff. Those texts therefore differ. Nothing in the repo
  compares them today; the reformat was proven inert structurally (two fresh
  scratch databases, full catalog fingerprint, diff exit 0) rather than by
  text equality.

## 2026-08-27 — allSettled rejections become visible to the Bridge

Follow-up 2 of INC-2026-08-27 (a failing cron reported healthy for two days).

Added `src/lib/settled-failures.ts`: `summarizeSettledFailures`,
`reportSettledFailures`, `allSettledReported`. Counts every rejection, keeps
distinct reasons bounded at `MAX_FAILURE_REASONS`, and writes each distinct
cause through `logServerError` so it reaches `admin_events` and the Bridge.
Control flow is unchanged by design.

Wired into the two call sites that matched the incident shape exactly — the
settled array was not even bound, so a rejection was invisible everywhere:
`src/lib/notifications/golf-message-fanout.ts` (email + push) and
`src/lib/coachhelm/v3/qualifying/player-notify.ts` (per-candidate email + push).

Shared helper rather than a copied idiom: this repo's SSRF guard was hand-copied
into two files and stayed broken in both.

Verified: typecheck exit 0, lint exit 0, 64 test files / 896 tests exit 0
(`src/test/lib/settled-failures.test.ts src/lib/admin src/test/hooks`),
including 7 new tests for the helper.

NOT done: ~21 other `allSettled` sites flagged by the scan are not individually
cleared, and the incident's R3 follow-up (the client used by the
`coachhelm-safety-net` path) is untouched — owner action, and do not grant anon.

## 2026-08-27 — W16 Task 6 verification sweep (partial) + execution-log correction

Helm Bridge architecture status established by reading code, not the plan doc.
W16 Tasks 1-5 were already built and merged while `EXECUTION_LOG.md` still said
"in progress (Sonnet)" — corrected in place, with the file:line evidence for
each task.

Task 6 step 1 (full gate) verified GREEN at the post-merge tip of
`fix/repo-local-cli-guard-bypass`:
  npm run typecheck   exit 0
  npm run lint        exit 0
  npm test            exit 0 — 1229 files, 11527 passed, 6 skipped, 0 failed

The 6 failures excused as "pre-existing" in every prior W15 entry (baseball
nav-variant drift, Next-16 revalidatePath-outside-request-scope) no longer fail.

Task 6 step 3 static half verified: colour-independence (status rendered as
words, dots aria-hidden), motion-reduce/motion-safe honoured, 44px touch
targets.

Also verified `get_feature_health`'s newest recreate re-REVOKEs anon after
CREATE OR REPLACE — the re-grant trap in .claude/rules/shipping.md is not
tripped.

NOT DONE and left explicitly: Task 6 step 2 (seeded-event dev walkthrough) and
the Lighthouse/screenshot halves. Step 2 must NOT be run against production —
one shared live database, and seeding synthetic admin_events would pollute the
data the Feature Health board reads. Needs the local Supabase stack.

Stale-warning correction: the W7 "★ CI NOTE" said a final polish sweep still
owed ~10 lint-ratchet warnings under src/app/admin. Measured: 0 bg-white,
0 arbitrary text-[Npx], lint exit 0. Debt already paid; warning removed.

## 2026-09-01 — self-heal flow, and the Errors page reorganised around five questions

- SHA: branch `agent/bridge-selfheal-flow`, PR pending.
- **What**: `src/lib/admin/selfheal-flow.ts` — the loop's third axis
  (throughput): every incident placed at the stage whose turn it is, stalled
  once that stage has had two of its registry cadences to act. Surfaced as
  the `stalled` lens, the `stage-stalled` attention reason, the Truth Strip
  self-heal cell escalation, and a per-stage backlog strip on the Overview
  and the Self-heal page (`SelfHealFlow.tsx`), with the stalled rows listed on
  the Self-heal page only.
- **Errors tab**: lens counts measured over the `?kind=` facet
  (`countLensesForKind`); `awaiting-proof` no longer admits blind-only gaps;
  window-over-window row counts (`appErrorRows`, `describeWindowDelta`); the
  hourly chart falls back to the app's own buckets when Sentry's series is
  unavailable (`sumHourlyBuckets`, `appHourlyComputedAt`); deploy markers
  outside the plotted hours no longer paint off-axis. The page itself is
  reorganised (queue → trends → coverage → Sentry → archive), the flat
  parameter-name chip row is replaced by a grouped, worded, collapsible
  filter bar (`ErrorsFilterBar`; `ErrorsFilterChips.tsx` deleted), and a
  closed legend (`HowToReadIncidents`) sits under the header. Each row gains a
  feature tag in registry words, the lifecycle headline, and a Details
  disclosure (`error-code-hint.ts` supplies the code gloss).
- **Overview**: the legacy `TriageQueue` and the Regressed panel stop
  rendering an unconditional all-clear when Sentry is unreadable.
- **Why**: measured on this branch's own fixtures and the explorer's map of
  the read model — the loop reported "Healthy" with a proven history while a
  `new` incident sat unanalysed for eight days and had no attention row at
  all; the rail said one count while the faceted list showed another; the
  Errors page opened with `kind: integrity_ok` as a label. Owner asked for
  more detail per error, a feature tag, better language and better
  organisation on the Errors page.
- **Not done, deliberately**: `attention.ts` still has no per-incident row for
  `lifecycle.state === 'unknown'` (a blind source is named once, per the
  module's rule 3); `AttentionQueue` still renders ages off `Date.now()`;
  `TriageQueue` remains the Overview's queue rather than the unified one.
- **Verified**: see the tests ledger entry of the same date. `npm run build`
  NOT run — the volume reported 0 GiB free at the time and a cold `.next`
  costs up to 5.7 GiB; no `'use server'` surface changed.

## 2026-09-02 — Diagnose cron final gate: `collectRelAnalyses` binds its read error

- SHA: branch `agent/selfheal-diagnose-cron`, PR pending (final-gate pass on
  the "move Diagnose onto a Vercel cron" work already committed on this
  branch — the cron route, the `triage-collect.ts`/`triage-apply.ts`
  extraction, and the RCA-analysis extraction into `rca-run.ts` were already
  shipped in prior commits; this entry covers only the fix made during the
  gate run).
- **What**: `src/lib/admin/triage-collect.ts`'s `collectRelAnalyses` now
  destructures `error` from its `fetchAllRowsResult` call (it previously took
  only `data`) and logs a failure instead of silently returning an empty
  `Map` indistinguishable from "no prior analyses exist".
- **Why**: `npm run audit:paginated-reads` regressed 12 -> 13 on this branch
  — the ratchet's `helm/no-unchecked-paginated-read` rule flagged the
  unbound `error`. Fixed rather than baseline-raised, per the no-ratchet-
  raise rule. This read is best-effort enrichment (an "already analysed"
  annotation merged onto reliability candidates), not a health-critical read
  — a failure here does not flip `runSelfHealTriage`'s heartbeat to
  `failed`/`degraded`; the two health-critical reads it sits beside
  (`collectAdminEvents`, `collectReliabilitySignals`) already bound and
  reported their own errors into `SourceHealth` before this fix.
- **Verified**: `npm run typecheck`, `npm run lint` (0 warnings),
  `npm run lint:ratchet` (68 warnings, no regression),
  `npx vitest run src/lib/admin src/app/admin src/app/api/cron/selfheal-triage`
  (146 files / 1671 tests, all pass, before and after the fix),
  `npm run audit:paginated-reads` (12, baseline 12, confirmed fixed),
  `npm run audit:supabase-errors` / `audit:fail-open` (1039 / 51, no
  regression), `node scripts/markdown-lint-ratchet.mjs`,
  `npm run lint:duplicate-exports`,
  `node scripts/knowledge/document-inventory.mjs --check`,
  `npm run docs:path-drift`, `npm run docs:schema-drift`. `npm run build`
  NOT run locally — CI builds it.
## 2026-09-02 — Flight Recorder: one observed-step-count definition, undeclared steps, point-in-time durations, downgrade badge, audit script

- SHA: branch `agent/tracer-gaps`, PR pending. Scoped deliberately to stay
  outside the two in-flight Flight Recorder branches
  (`agent/flight-recorder-real-timings`, `agent/flight-recorder-db-checkpoints`)
  — no edit to `src/app/golf/actions/golf.ts`,
  `src/lib/observability/golf-round-flight-workflow.ts`,
  `src/lib/observability/helm-flight-recorder.ts`, or any
  `supabase/migrations/*flight*`/`*trace_steps*` file.
- **What**: `trace-tree.ts`'s `TraceTree` gains `observedStepCount` as the one
  named definition of "steps actually observed" (`observed.length`, before
  synthesised missing nodes) — the KPI strip in `TraceTree.tsx` now reads this
  field instead of re-deriving `tree.flat.filter(!isMissing).length` inline,
  so the fleet-list count and the tree's own count can no longer silently
  read as two different numbers for an OPENED trace.
  `bridgeGetFlightTrace` (`golf-tracer.ts`) reconciles a trace's
  `observed_step_count` against its own fetched steps array on open via the
  new `reconcileObservedStepCount` helper — this only fixes the count once a
  trace is opened; unopened fleet-list rows still show the DB's own
  (possibly-stale-pre-2026-09-01-migration) stored counter, a documented scope
  boundary rather than a full fix (closing it needs a `helm_debug_list_traces`
  migration change, out of scope here).
  `TraceStepNode` gains `isUndeclared` (an OBSERVED step whose key is not in
  the workflow's own declared-key set — verified against
  `golf-round-flight-workflow.ts` that `golf.round.submit` declares only the
  top-level `db.submit_round_atomic` key, never its in-transaction children,
  so every postgres-layer checkpoint child the db-checkpoints migration will
  start writing hits this by construction) and `isPointInTime` (a row with
  `finished_at` but no `started_at` — a single-moment checkpoint, rendered as
  "point-in-time" rather than reading identically to "no data at all").
  `errorCode` now falls back to `metadata.sqlstate` then `metadata.failure_code`
  when the `error_code` column is empty, matching the shape
  `helm_private.trace_exception_checkpoint` actually writes.
  `trace-view-helpers.ts` gains `resolveTotalDurationMs` (named wrapper around
  `run.duration_ms`, replacing an inline expression, explicitly documented
  against ever becoming a sum of step durations — which would double-count
  time inside nested postgres checkpoint children) and
  `extractStatusDowngrade` (reads `status_downgraded_from`/
  `status_downgraded_reason` from a run's `metadata`, matching the exact keys
  `20260901140000_trace_cannot_claim_success_while_blind.sql` writes).
  `TracesClient.tsx` renders that downgrade as a warning `InlineNotice` — only
  ever on the opened trace's detail panel, never the fleet-list row, since
  `helm_debug_list_traces`'s fixed column list omits `metadata` entirely
  (a real scope boundary, not an oversight).
  `missing_required_step_count` was checked against the task's "expose it"
  wording and found already fully exposed (required field on
  `FlightTraceRun`, already rendered in `TracesClient.tsx` and
  `trace-fleet.ts`) — no gap, no change made.
  New: `scripts/flight-recorder-audit.mjs` +
  `scripts/lib/flight-recorder-audit-lib.mjs` (`npm run flight-recorder:audit`)
  — a read-only script over the two `helm_debug_*` RPCs (the only reachable
  path for a service-role key; `helm_debug` is outside PostgREST's exposed
  schema list) reporting runs/steps/distinct-step-keys/steps-with-identity/
  zero-step-runs/downgraded-runs for the last 24h, with an explicit warning
  when `helm_debug_list_traces`'s 200-row cap may have truncated the window.
- **Why**: the list RPC's DB-stored `observed_step_count` and the tree's own
  live count over the fetched steps array are two independently-maintained
  numbers over the same fact, and can disagree for a trace finalized before
  the 2026-09-01 finalize-function migration or one still in progress — a
  debugging tool showing two different counts for the same trace undermines
  trust in both. The db-checkpoints branch is about to start writing observed
  postgres-layer rows nested under RPCs whose workflow definitions were never
  updated to declare them; without `isUndeclared` those rows read as
  regular declared children with no signal that the workflow model hasn't
  caught up. The audit script is what proves, after both in-flight branches
  deploy, that real timings and postgres checkpoints actually started
  landing — before this track there was no way to check that without reading
  the database by hand.
- **Not done, deliberately**: the fleet-list row's `observed_step_count` and
  the downgrade badge are both scoped to the OPENED trace's detail panel only
  — fixing either for unopened list rows needs a `helm_debug_list_traces`
  migration change, which is out of scope for this track (the migration files
  it would touch are the two in-flight branches' territory).
- **Verified**: `npm run typecheck`, targeted `eslint --max-warnings 0` on
  every touched file, `npm run lint:ratchet` (no regression against the
  tracked baseline), `npm run audit:supabase-errors` (no regression against
  the tracked baseline), the admin_platform registry's required checks
  (`src/test/lib/cron/auth.test.ts`, `src/test/api/cron/shared-auth.test.ts`),
  and the full `unit` vitest project (every file, no regressions). New tests
  written first and confirmed failing before each implementation
  (`src/app/admin/traces/__tests__/trace-tree.test.ts`,
  `src/app/admin/traces/__tests__/trace-view-helpers.test.ts`,
  `scripts/lib/__tests__/flight-recorder-audit-lib.test.ts`) — the last one
  registered by exact name in `vitest.config.ts`'s unit project include array,
  the repo's documented convention for `scripts/lib/__tests__` files, without
  which it would run under nothing. `npm run build` NOT yet run as of this
  entry — see the commit history for whether it was run before merge; a
  `'use server'` surface (`golf-tracer.ts`) changed, so it is required before
  merge per CLAUDE.md.

## 2026-09-02 — Flight Recorder: a genuine parent_step_key cycle no longer silently vanishes from the rendered tree

- SHA: branch `agent/tracer-gaps`, PR pending. Follow-up to the same day's
  "one observed-step-count definition" entry above.
- **What**: `buildTraceTree`'s containment loop pushes every node into either
  `roots` or its resolved parent's `children` array; a genuine mutual cycle
  (A's parent is B, B's parent is A, or a longer ring) left every member
  attached as some OTHER member's child and none ever reached `roots`, so
  the depth-first walk never visited any of them — the whole cycle vanished
  from `tree.flat` with no error. Fixed with a rescue sweep: after the
  normal walk, any node still unvisited is promoted to an additional root
  and walked from there too. A no-op on every acyclic trace this repo has
  ever recorded.
- **Why**: this module's own header comment states the guarantee directly —
  "the tree would be quietly, plausibly wrong" is exactly what a debugging
  tool must never be — and `observedStepCount` being correct (fixed earlier
  today) does not by itself guarantee the *rendered tree* still shows every
  node; this closes the same gap on the render side. `parent_step_key` is
  free text written by three separate producers (server, collector, RPC), so
  a cycle, while never observed in production, is not impossible.
- **Verified**: two new tests (2-node and 3-node mutual cycles asserting the
  exact surviving node set) written first and confirmed red (`flat: []` on
  both) before the fix; full touched-directory suite green after (6 files,
  111 tests, up from 109). `npm run typecheck` / `lint` / `lint:ratchet` (68
  warnings, no regression) / `audit:supabase-errors` (baseline 1039, no
  regression) all clean.
## 2026-09-02 — Repair stage's launchd config tracked in the repo, runner captures a failure tail

- SHA: branch `agent/selfheal-repair-hardening`, PR pending.
- **What**: `config/launchd/com.helm.bridge-rca-repair.plist` added (copied
  byte-identical from the live agent, `cmp` verified) so the launchd config
  driving the Repair stage is diffable in git instead of living only on the
  owner's Mac. `scripts/selfheal-repair-install.sh` installs/reloads it
  (`plutil -lint`, `launchctl bootout`/`bootstrap`, `launchctl print`).
  `scripts/selfheal-repair-doctor.mjs` verifies the whole chain read-only:
  plist installed and byte-identical, job loaded, `~/.config/helm/selfheal.env`
  carries both required variable names (never reads/prints a value), the
  `claude` binary and prompt `SKILL.md` resolve, the `-p` argument does not
  start with `-`/`$(`, and the newest production `selfheal-repair` heartbeat
  is <26h old and not a runner failure. New npm scripts
  `selfheal:repair:install` / `selfheal:repair:doctor`.
  `scripts/run-selfheal-repair.mjs` now pipes the child's stdout/stderr
  (`stdio: ['inherit', 'pipe', 'pipe']`, still forwarding every byte live so
  the plist's `>> log 2>&1` sees the same output as before) and reconciles on
  `'close'` rather than `'exit'` (bounded by a 5s grace timer against a
  detached grandchild holding a pipe open), so the last ~4KB the child wrote
  is available when the runner writes a fallback heartbeat. Two new pure
  exports in `scripts/lib/selfheal-repair-runner.mjs` — `redactSecrets`
  (JWT-shaped and key/token/secret/password assignment-like patterns) and
  `truncateTail` (keep the last N bytes) — are applied to that captured text
  before it is written to `metadata.child_output_tail` on a runner-failure
  row; `reconcileRepairRun`'s existing result shape is unchanged (new field
  only on the inserted row, never on the returned result).
- **Why**: the 06:40 2026-09-02 scheduled Repair fire failed in 0.6s because
  the live plist passed `SKILL.md`'s raw text — opening with YAML `---`
  frontmatter — as the `claude -p` argument, and the CLI parsed `---` as an
  unknown option before writing anything. The fallback heartbeat carried no
  stderr, so `/admin/selfheal` could only say "child exited 1", not why. The
  commander hand-patched and reloaded the live plist (prompt now prefixed
  with a sentence); this change makes the repo the source of truth for that
  fix and makes a future occurrence of the same failure self-explaining.
- **Tests**: `src/test/scripts/selfheal-repair-launchd.test.ts` (new) parses
  every plist under `config/launchd/**` and fails if the `-p` frontmatter
  trap, a missing `--strict-mcp-config`, or a wrong `--mcp-config` target ever
  regresses (the `--mcp-config` file's actual JSON content is checked only
  when that machine-local path exists, since it lives outside the repo and
  outside any CI runner — `it.skipIf`, same pattern as
  `check-helm-bridge-env.test.ts`'s "CI without secrets" skip). Extended
  `src/test/scripts/run-selfheal-repair.test.ts`: `redactSecrets`/
  `truncateTail` unit cases, a `childOutputTail` case using `toMatchObject`
  (existing `toEqual` result-shape assertions untouched), and an end-to-end
  case that spawns the real runner script against a fixture child that writes
  a marker to stderr and exits immediately, asserting the marker is still
  forwarded live to this process's stderr and that reconcile completes after
  `close` without hanging.
- **knowledge:map gap closed**: these paths (`scripts/run-selfheal-repair.mjs`,
  `scripts/lib/selfheal-repair-runner.mjs`, `scripts/selfheal-repair-install.sh`,
  `scripts/selfheal-repair-doctor.mjs`, `config/launchd/**`,
  `docs/ai-system/selfheal/**`) resolved to `impactedFeatures: []` before this
  change — added to `admin_platform` in `memory/registry.yml`
  (`services`/`docs`) alongside `src/lib/admin/**` and `src/lib/reliability/**`,
  the same feature's existing Bridge/self-heal code.
- **Not done**: the SKILL.md prompt text itself was not changed — the
  commander's live fix (a leading sentence before `$(cat ...)`) is what the
  repo copy now carries, verbatim.
- **Verified**: `npm run typecheck`, `npm run lint`, `npm run lint:ratchet`,
  targeted vitest (`run-selfheal-repair.test.ts`,
  `selfheal-repair-launchd.test.ts`, `scripts-no-committed-secrets.test.mjs`),
  `shellcheck` on the new `.sh`, `npm run audit:supabase-errors`,
  `npm run knowledge:map`/`knowledge:globs`, `plutil -lint` on the committed
  plist, `cmp` against the live installed plist. `npm run build` NOT run —
  no `'use server'` surface changed.

## 2026-09-02 — Repair-stage hardening review: redactSecrets mis-bound String.replace's offset argument as a capture group

- SHA: local commit on `agent/selfheal-repair-hardening`, not yet merged.
- **`redactSecrets` in `scripts/lib/selfheal-repair-runner.mjs` leaked a
  numeric match offset into the fallback heartbeat instead of redacting
  cleanly** (HIGH). `SECRET_PATTERNS[0]`, the JWT-shaped regex, has zero
  capturing groups. `String.replace`'s callback signature for a
  zero-capture-group pattern is `(match, offset, wholeString)` — so
  `out.replace(pattern, (match, group1) => group1 ? \`${group1}=[REDACTED]\`
  : '[REDACTED]')` bound the match's numeric OFFSET to `group1`, which is
  truthy for any match not at index 0. A JWT appearing mid-line (the realistic
  shape — claude's `stream-json --verbose` output rarely starts a line with
  the secret) was replaced with a mangled `"18=[REDACTED]"` instead of a
  clean `"[REDACTED]"`. The full match text was still replaced either way —
  no actual secret bytes reached `background_job_logs.metadata.child_output_tail`
  — but the redaction contract ("a captured tail never leaks a credential,
  cleanly") was violated, and the corrupted text (a stray numeric offset with
  no operational meaning) is what a future on-call would have read.
- **Why the existing tests missed it**: the direct unit test asserted
  `not.toContain(jwt)` / `toContain('[REDACTED]')` — both still true of the
  mangled `"18=[REDACTED]"` string, since it contains neither the JWT nor
  breaks the substring `[REDACTED]`. The integration-style
  `reconcileRepairRun` test placed its JWT immediately after
  `SUPABASE_SERVICE_ROLE_KEY=`, so the second (key/value) pattern's own
  correct second pass overwrote the first pass's garbage — pattern-ordering
  coincidence, not a passing proof.
- **Fix**: `SECRET_PATTERNS` entries now carry an explicit `keyGroup: boolean`
  telling `redactSecrets` which replacement shape to use, instead of the
  callback inferring it from whether its second argument is truthy. This
  makes the offset-as-group-1 class of bug structurally impossible regardless
  of how many capturing groups a future pattern adds.
- **Tests**: added to `src/test/scripts/run-selfheal-repair.test.ts` — an
  exact-string assertion for a JWT mid-line (fails on the old code with
  `18=[REDACTED]`, the discriminating case `toContain` could not catch), a
  JWT at offset 0 (the one input that accidentally worked before the fix, to
  guard against a regression in the other direction), a JWT with no
  `KEY=`-shaped prefix (so the second pattern's pass cannot mask a
  regression in the first), and a quoted `KEY="value"` assignment (proves the
  key-group branch still redacts cleanly with no dangling quote).
- **A separate finding from the same review** — that a prior report's
  `commit_shas[0]` cited a fabricated 40-char SHA
  (`791fb7105ee0c1e5e0dc1a8c1b0e8a5a4c9c4c1a`) instead of the real commit
  (`git rev-parse 791fb7105` → `791fb7105b22dad1cfd87341ac9f611f91ddbaa9`,
  confirmed present; the fabricated one 404s via `git cat-file -t`) — is a
  defect in that report's text, not in any tracked file. No code, doc, or
  test change was made for it.
- **Verified**: `npx vitest run src/test/scripts/run-selfheal-repair.test.ts
  src/test/scripts/selfheal-repair-launchd.test.ts --project unit` — 28/28
  pass (2 new failing pre-fix, both pass post-fix). `npm run typecheck` and
  `npm run lint` exit 0. `npm run lint:ratchet` run separately (long-running
  full-repo scan); see commit message for its result. `npm run build` NOT
  run — no `'use server'` surface changed.

## 2026-09-03 — Phase K.4.5 Janitor generator; Phase K.4.1 Stryker mutation gate (adjacent, unmapped)

- **What**: Two Phase K (Engineering OS Intelligence) deliverables from the
  Helm Bridge control-plane implementation plan, §7/K.4 (that plan document
  is scaffolding in a separate, not-yet-committed worktree as of this
  change, so it is described here rather than cited by a path that would
  not resolve — `npm run docs:path-drift` catches exactly this class of
  drift, and caught it against an earlier draft of this entry).
  (1) `scripts/janitor/**` — a read-only entropy-report generator (see the
  new "Actions And Services" entry in `memory/features/admin-platform.md`
  for the full description; mapped to this feature in `memory/registry.yml`
  after `knowledge:map` resolved it to `impactedFeatures: []`, same
  precedent as the self-heal REPAIR-stage runner entry above this one).
  (2) `.circleci/config.yml`'s `stryker-coachhelm` job ran
  `npx stryker run || true`, masking every exit code including a crash —
  fixed with `scripts/mutation-gate.mjs`, which reads Stryker's own JSON
  report, computes the mutation score from mutant status counts, and fails
  the job below a committed floor (`config/mutation-gate.json`, marked
  PROVISIONAL — no real weekly score is recorded anywhere in this repo).
- **Why (2) is NOT added to this feature's `memory/registry.yml` glob**:
  the mutation gate governs `src/lib/coachhelm/v2/` test quality, not the
  Bridge/admin surface — `knowledge:map --files .circleci/config.yml
  scripts/mutation-gate.mjs` returns `impactedFeatures: []` and stays that
  way after this change; forcing it under `admin_platform` would be a wrong
  mapping, not a closed gap, so it is recorded here only for the adjacent
  provenance (same PR, same Phase K plan section) — it has no feature-doc
  entry anywhere in this repo, by design, and the next session that touches
  Stryker/mutation testing should read `scripts/mutation-gate.mjs`'s own
  header comment, not a feature doc, for its contract.
- **Why the ratchet-baseline pattern this repo uses everywhere else
  (`.lint-baseline.json` etc.) does NOT apply to the mutation floor**: those
  work because a human runs `--update` locally and commits the result; the
  weekly Stryker job runs on an ephemeral CircleCI container that cannot
  commit back to the repo, so a "write the baseline on first run" design
  would silently treat every week as week one, forever green — the same
  failure class this ledger entry's fix closes, in a new shape. The floor
  is a committed number instead, explicitly provisional in its own file.
- **Why the Janitor writes a SEPARATE file, never `config/control-plane-gaps.json`
  itself**, even though it reuses that file's `id`/`owner`/`opened`/`scope`/
  `reason`/`closes_when` field shape: that file's own `$comment` says
  "Nothing may be listed here to make a red verifier green... Adding one is
  a decision, not a repair" — an automated finding is a PROPOSAL, not a
  decision a human has made. `docs/generated/janitor-findings.json` and
  `docs/generated/JANITOR_REPORT.md` say this explicitly in their own
  headers.
- **Verified**: `npm run test:janitor` (`node --test
  scripts/janitor/__tests__/*.test.mjs`) — 52/52 pass, covering every
  classifier's `FINDINGS`/`ZERO_FINDINGS_VERIFIED`/`NO_SIGNAL` paths against
  real disposable git-repo fixtures (not mocks — several classifiers shell
  out to real `git ls-files`/`git grep`/`git log`). `npm run test:mutation-gate`
  (`node --test scripts/mutation-gate.test.mjs`) — 13/13 pass, covering the
  score formula, the floor boundary, and every UNKNOWN path (missing
  report, unparseable JSON, missing floor, zero valid mutants). `npm run
  janitor` run for real against this worktree: 12/12 classes returned a
  valid verdict, 0 classifier crashes, found a real, previously-invisible
  entropy signal in the process — `abandoned-experiments.mjs`'s first draft
  used `\d` inside a `git grep -E` pattern, which is POSIX ERE (no Perl
  shorthand support) and silently matched nothing; fixed to `[0-9]` and
  caught by this run producing 0 findings pre-fix vs. real findings
  post-fix, plus a regression test. `circleci config validate
  .circleci/config.yml` passes. Stryker was **not** run locally (explicit
  instruction) — the mutation gate's real report path
  (`reports/mutation/mutation.json`, Stryker's JSON-reporter default) and
  computed score are therefore unverified against a live Stryker run; check
  both against the first real weekly job log. `npm run typecheck` / `npm
  run lint` / `npm run build` were **not** run from this worktree — no
  `node_modules` installed (shared-disk policy across concurrent agent
  worktrees); every new script here is dependency-free (`node:fs`,
  `node:path`, `node:child_process`, `node:url` only) and was verified to
  run correctly with no `node_modules` present at all, which is direct
  evidence typecheck/lint have no missing-import surface to fail on, but is
  not a substitute for actually running them — CI does.
