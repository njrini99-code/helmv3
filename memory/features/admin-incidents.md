<!-- markdownlint-disable MD004 MD007 MD012 MD013 MD022 MD032 MD034 MD036 MD037 MD038 MD040 MD041 MD050 MD060 -->
# Feature: Admin Incidents

> Carved out of `memory/features/admin-platform.md` 2026-09-02 as part of the
> `admin_platform` registry granularity split (ADR-2026-09-03-control-plane-
> owner-decisions, memory/decisions/ — on the parallel Bridge control-plane
> session's branch, not yet on this branch — closing OWNER DECISION
> `ADMIN_PLATFORM_REGISTRY_GRANULARITY`). `admin_platform` remains the shared
> Bridge shell; this doc owns the unified incident read model, the Incidents
> page, and incident lifecycle/proof/resolution. See also
> `memory/features/admin-reliability-collector.md` (the collector one of this
> feature's evidence sources reads from) and `memory/features/admin-selfheal.md`
> (Diagnose/Repair/Close, which act on the incidents this feature surfaces).

## Status

- active

## Current State

Admin Incidents is the Bridge's unified fault surface: `/admin/errors` and its
`/admin/errors/[fingerprint]` detail page, backed by a read model
(`src/lib/admin/incidents/**`) that folds the app's own `admin_events`
fingerprint buckets, Sentry issues, the reliability collector's correlated
signals, and RCA analyses into one `UnifiedIncident` per fault — never stored,
always derived at read time.

## Primary Entry Points

### Routes

- `src/app/admin/errors/**` — the Incidents page and per-fingerprint detail
  page. This is the incidents-facing UI; there is no `src/app/admin/incidents/**`
  route.

### Services

- `src/lib/admin/incidents/**` — the unified incident read model. `types.ts` is
  the contract; `correlate.ts`, `lifecycle.ts`, `proof.ts`, `sources.ts`,
  `lens.ts`, `attention.ts` and `truth-strip.ts` are pure; `fetch.ts` is the
  only module in it that performs I/O.
- `src/lib/admin/incident-classification.ts`, `incident-grouping.ts`,
  `incident-report.ts`, `incident-resolver.ts` — write-time classification and
  grouping for `admin_events` rows, and the resolution write path.

### Actions

- `src/app/admin/actions/analyze-error.ts` — gates on `requireSuperAdmin()`,
  then delegates to `src/lib/admin/rca-run.ts` (owned by `admin_selfheal`; the
  analyzer core is shared with the Diagnose cron).
- `src/app/admin/actions/resolve-error.ts`, `src/app/admin/actions/
  sentry-resolve.ts` — the resolution write paths.

## Core Data

- `admin_events` — the app's own fingerprinted fault log; incidents fold its
  buckets in, excluding `event_type='rca_analysis'` rows.
- `public.admin_error_resolutions` — what fixed a fault: PR, merge SHA, who
  decided (`auto` cron vs `manual` operator), and whether it has regressed.
- Sentry issues (via the collector's Sentry arm) and the reliability
  collector's `CorrelatedSignal`s (via `src/lib/reliability/**`, owned by
  `admin_reliability_collector`) are evidence sources folded into the same
  `UnifiedIncident`, not owned data.

## Business Rules

- One incident-grouping algorithm for `admin_events`, not two. As of
  2026-08-26, the Golf Tracer (`admin-tracer-data.ts`'s `buildTracerIncidents`)
  groups error rows by the same write-time `admin_events.fingerprint` column
  the Errors tab's triage queue groups by (`mergeTriage` in
  `src/lib/admin/data/triage.ts`; `fingerprint` is set once at insert by
  `buildIncidentSignature()` in `src/lib/admin/incident-grouping.ts`). A NULL
  fingerprint (rows written before that column existed) falls back to a
  synthetic `row:<id>` key — the pure helper is
  `tracerIncidentGroupKey` in `src/app/admin/golf/tracer/tracer-shared.ts`,
  and its fallback deliberately mirrors `mergeTriage`'s own
  `row.fingerprint ?? \`row:${row.id}\`` string-for-string. The Tracer's
  shot-tracking LENS (`isShotTrackingTracerEvent` — featureArea/action-prefix/
  route filtering) is a FILTER applied to the raw event list before this
  grouping runs, not a second grouping algorithm. Before this date the Tracer
  recomputed its own read-time key from normalized message + route + action +
  errorCode, which could disagree with the Errors tab's grouping for the same
  underlying rows.
- **Incident resolution has exactly one write path.** Every resolve — a single
  row, a whole fingerprint, or a bulk selection — goes through the user-scoped
  `resolve_admin_event` RPC and busts `BRIDGE_INCIDENT_CACHE_TAG`. The RPC
  gates on `is_super_admin()` reading `auth.uid()`, so it must be called with
  the user-scoped client; a service-role client makes `auth.uid()` NULL and the
  RPC Forbids. Service-role access is read-only on this path.
- **An in-app RCA analysis is not an incident.** `analyzeErrorFingerprint`
  stores its verdict as an `admin_events` row with `event_type='rca_analysis'`
  under the analyzed fingerprint, written BORN RESOLVED (`resolved: true`,
  `resolved_at`) like every other non-incident record this table holds —
  pinned by `src/app/admin/actions/__tests__/analyze-error.test.ts`. Every
  incident query must still exclude that event type, or an analysis is counted
  as an occurrence of the thing it analyzes (inflating occurrence counts and
  moving last-seen). The analyzer itself (`rca-run.ts`) and the cron that
  drives it daily are owned by `admin_selfheal`; this rule is about how the
  incidents read model must treat the row it writes.
- **Error resolution belongs to the FINGERPRINT, not the row.**
  `public.admin_error_resolutions` (applied 2026-08-27) records what fixed a
  fault: PR, merge SHA, who decided (`auto` cron vs `manual` operator), and
  whether it has regressed. `admin_events.resolved` stays per-row and is not a
  substitute — with it alone, a fixed fault's next occurrence is a new
  unresolved row, indistinguishable from a regression.
- **An archived fault must come back if it recurs.** "Never show it again" is
  correct only until the fault returns after its fix shipped; that is a
  REGRESSION and the most valuable signal this system produces. Nothing is
  deleted and archiving is a read-time join, so dropping the table makes every
  incident reappear — the correct failure direction for a feature whose job is
  hiding things. `reopened_count` survives a re-resolve, so "fixed three times
  already" cannot be laundered.
- **A regression whose analysis already says NOT A DEFECT is expected
  recurrence, not a regression.** `deriveLifecycle` rule 1
  (`src/lib/admin/incidents/lifecycle.ts`) checks `analysis?.category ===
  'not-a-defect'` before returning `'regressed'` — the analysis already
  explained why this fingerprint fires (e.g. an access denial that is
  SUPPOSED to keep happening), so its recurrence is not new information and
  must not re-alarm an operator with the single loudest signal this system
  produces. Lands in the dedicated `'expected-recurrence'` lifecycle state
  (`INCIDENT_LIFECYCLE_STATES`) instead — distinct from the pre-existing
  `'not-a-defect'` state, which is the classifier's verdict (`!actionable`)
  and never had a resolution to regress from in the first place; keeping
  them separate lets a lens count "this specifically recurred after being
  fixed" apart from "this was never a defect". Neutral tone, not danger; not
  in `NEEDS_ATTENTION_STATES` (so the REGRESSION-specific alarm is gone);
  treated as `offLoop('done', …)` by `selfheal-flow.ts` (owned by
  `admin_selfheal`), same as `not-a-defect`; excluded from the `actionable`
  lens and the Truth Strip's `actionable` count, same as `not-a-defect`. The
  `regressions` lens (`incident.lifecycle.state === 'regressed'`) needed no
  change — the state itself no longer produces `'regressed'` for these, so
  the exclusion is automatic — and a new `expected-recurrence` lens counts
  them apart. **It IS still in `attention.ts`'s `UNRESOLVED_STATES`**,
  deliberately unlike `not-a-defect` — an LLM-authored "NOT A DEFECT"
  `suggestedFix` string must never be able to silence a CRITICAL,
  still-unresolved fault outright; only the specific "this is a regression"
  alarm it was wrong about is what goes quiet. Rule 2 (critical) still fires
  for one, same as any other open state.
- **`shipStatus` has three outcomes, not two.** `unknown` exists because Vercel
  can be unreachable; rendering that as `pending` tells an operator their fix
  has not shipped when the truth is that we could not find out.
  (`src/lib/admin/incidents/deploy-proof.ts`.)
- **One incident model, derived at read time, never stored.**
  `src/lib/admin/incidents/` folds the app fingerprint bucket, the Sentry
  issue, the reliability `CorrelatedSignal` and the `rca_analysis` row into a
  single `UnifiedIncident`. It is a READ MODEL: there is no `admin_incidents`
  table and no persisted `lifecycleState`, because lifecycle and proof are
  functions of evidence that changes underneath them (a PR merges, production
  rolls forward, a fault recurs) and a stored string would outrank live
  evidence. The layering is `existing readers -> correlate -> lifecycle+proof
  -> UnifiedIncident[]`; every derivation is a pure function unit-tested with
  no I/O. If persistence is ever added, persist durable EVENTS, never the
  derived state.
- **An incident's id is the key that was already stored under it.** In
  priority order: an `admin_events` fingerprint, then `rel:<signature>`, then
  `sentry:<issueId>`. That order is not cosmetic — `rca_analysis` rows,
  `/admin/errors/<id>` links and repair PR bodies all address exactly these
  strings, so a synthetic key would break every artefact the self-healing loop
  has already written. `fetchIncidentById` also matches on any fingerprint an
  incident folded, so links written before correlation still resolve.
- **No all-clear anywhere while a required source is blind.**
  `canClaimAllClear` in `src/lib/admin/incidents/sources.ts` is the single
  guard. "No incidents found" under an unreadable Sentry converts a broken
  read into a green screen, which is the most damaging empty state a
  monitoring surface can show. The incident queue, the proof-debt panel and
  the Truth Strip's incident cell all consult it; a new panel that renders an
  empty state must too.
- **A SHA match may only ever prove a fix shipped — never disprove it.**
  `deriveServesFix` (`src/lib/admin/incidents/deploy-proof.ts`) answers "does
  production serve this fix" as `true` / `false` / `null`. Production almost
  never sits on the fix commit, because any later deploy moves it past, so
  equality is evidence of shipping and inequality is evidence of nothing. The
  merge timestamp is the general test: a deploy cut after the merge carries the
  merge. An implementation that returned `false` on SHA mismatch reported every
  fix older than one deploy as permanently unshipped, and made the timestamp
  branch unreachable whenever both SHAs were known. `deployAt === null` (Vercel
  unreadable) is `null`, never `false` — the same three-outcome rule
  `shipStatus` follows.
- **One attention list on the Overview, and the platform checks are in it.**
  `selectAttention` (`src/lib/admin/incidents/attention.ts`) ranks incidents,
  dead self-heal stages (a fact it reads from `admin_selfheal`'s
  `selfheal-flow.ts`), `fetchBriefing`'s platform checks and the standing
  blind-source caveat on ONE scale. The Overview briefly carried two panels
  both titled "Needs your eyes" — one for the briefing, one for incidents and
  the loop — which left the operator ranking two lists against each other by
  eye. A second attention list is no more defensible than a second incident
  list. A briefing check that could not RUN withdraws the all-clear and is
  stated on the list, because a check that failed to execute is not a check
  that passed.
- **Every filter control on the incident queue must narrow the canonical
  queue.** Lens (lifecycle/attention) and `?kind=` (incident class) are
  orthogonal facets over the SAME list, both applied in
  `src/lib/admin/incidents/lens.ts`. `?kind=` was once parsed, rendered as
  chips and linked from the suppressed notice while nothing downstream
  consulted it — the canonical queue is built from `IncidentFeedFilters`, which
  has no `kind` field — so every one of those controls was inert and the
  notice's "N held back" described a list the operator was no longer looking
  at. A control that does nothing is worse than a missing one: it teaches the
  operator the queue is curated when it is not. Counts shown beside a filter
  are measured over the list that filter actually narrows.
- **A QA fixture round is labelled, visibly, and excluded only from the
  actionable COUNT — never hidden.** `supabase/migrations/
  20260901120000_integrity_completed_round_zero_scored_holes.sql` names four
  `golf_rounds` ids as seeded fixtures (owner decision 2026-09-02: KEPT, not
  removed) — `src/lib/admin/qa-fixture-rounds.ts` carries a literal copy of
  that exact array (nothing at runtime can read a `.sql` file), and
  `qa-fixture-rounds.test.ts` reads the migration itself and asserts the two
  match, so they cannot drift silently. `mergeTriage` (`triage.ts`) matches
  each app-origin bucket's rows against it via `extractRoundId(row.metadata)`
  — `metadata.roundId` is a top-level key, same shape as `route`/`action`,
  written by `normalizeContext` from `ObservedActionContext.roundId` — and
  when ANY row in the bucket names a fixture round, sets `TriageItem.
  isFixture: true`. **`actionable` is deliberately LEFT UNTOUCHED** —
  whatever `classifyIncident` decided from the text stands. An earlier
  version of this forced `actionable: false` at the source, which silently
  dropped the row out of `matchesKind`'s default view (`kind === undefined ->
  incident.actionable`) — the row vanished into "N held back" and the FIXTURE
  badge that exists to explain it became undiscoverable. The two asks —
  "label it in the feed" and "exclude it from the actionable count" — are
  answered separately: the row renders, badged, in the default feed; the
  EXCLUSION happens explicitly at every count site instead, keyed on
  `isFixture`: `lens.ts`'s `actionable` lens, `truth-strip.ts`'s `actionable`
  cell, `errors/page.tsx`'s `shownActionable`, and `incident-feed.ts`'s
  `summarizeIncidentFeed`/`actionableGroups` (the last one because
  `overview.ts` and `errors/page.tsx` both render that exact field and must
  agree). `correlate.ts` carries `isFixture` through onto `UnifiedIncident`
  (`bucket.appItems.some(i => i.isFixture)`); `UnifiedIncidentCard` renders a
  neutral-tone FIXTURE chip, second priority right after the lifecycle chip
  (a fact about the DATA outranks everything derived from it, including
  outranking the blind-source chip under the 5-chip cap) — not a `StateChip`
  on lifecycle itself, because the lifecycle machinery still describes this
  incident honestly; the fixture flag is an orthogonal fact layered on top,
  not a reclassification. Sentry-origin items are always `isFixture: false`
  — a Sentry issue carries no round-id metadata to match against.
- The overnight digest (`/api/cron/admin-digest` → `build-digest.ts`) NAMES
  only actionable, non-degradation incident groups — the Errors tab's default
  view — and COUNTS the rest as "Not listed: N handled degradations · N quiet
  (client connectivity, expected access)". Before 2026-09-02 every group was
  listed, so the email led with three "Client error: Load failed" rows above
  "0 critical".
- `classifyIncident` rule 3c: a CLIENT-sourced transport-layer TypeError
  (`isTransientNetworkErrorMessage` — "Load failed", "Failed to fetch", …)
  is `integration` / not actionable, the same verdict rule 4 gives the generic
  "network error" wording. Server-side "fetch failed" (undici, a Vercel
  function) is not matched and stays actionable. The phrase list is shared
  with `error-logging` and the message-send retry so the three cannot drift.
- **The incident badge has THREE states.** `fetchBridgeErrorBadge` returns
  `null` — never 0 — when the feed read fails (it used to `catch { return 0 }`,
  converting the throw `bridge-honest-failure.test.ts` pins into the
  reassuring zero that throw exists to prevent, and `unstable_cache` held it
  for 60s). `AdminShell` renders `null` as no numeric badge PLUS a distinct
  "Incidents unreadable" chip in the top bar at every breakpoint. Same rule
  the shell (`admin_platform`) already applies to the Health badge.
- **An un-scoped Sentry issue still gets an ADVISORY feature tag, not `null`.**
  `mergeTriage` (`src/lib/admin/data/triage.ts`) only ever had a per-BATCH
  feature (`sentryTagHint`, set only when the caller actually scoped the fetch
  by a Sentry tag) — every other Sentry issue landed `feature: null` and the
  feature lens on `/admin/errors` grouped them all as "unknown". It now falls
  back, per issue, to `resolveFeatureId(issue.culprit)` — the same advisory
  route/feature map `src/lib/reliability/normalize.ts` (owned by
  `admin_reliability_collector`) exports for the Reliability tab's own
  correlation pass. The batch-level hint still wins when present — it is
  honest, Sentry-tag-scoped attribution; the per-issue fallback is a GUESS
  from a route string, which is why it only fires in the hint's absence.
  `culprit` is the only per-issue location `SentryIssue` carries — there is
  no transaction/url field on it. Not every value `resolveFeatureId` returns
  is a `FEATURE_REGISTRY` key; an unregistered tag still renders, unlinked,
  in `UnifiedIncidentCard` — strictly better than the "unknown" bucket this
  fixes issues out of.
- **Lens counts are measured over the faceted list.** `countLensesForKind`
  counts through the same `matchesKind` predicate `applyIncidentFacets`
  narrows with, so the number beside a lens equals what clicking it shows
  while `?kind=` is active. `board.lensCounts` stays the board-level fact.
  Separately, the `awaiting-proof` lens no longer admits an incident whose
  ONLY proof gap is `source-blind`: a failed read is not a fix awaiting proof.
- **The legacy `TriageQueue` takes `canClaimAllClear` too.** Defaults to true
  for existing call sites; the Overview passes the Sentry pull's status,
  because that feed's only external witness is Sentry and an empty queue
  under a failed or unconfigured pull is a partial count.
- **The Errors tab has one "compared to what".** `fetchErrorsTab` counts
  error-or-worse rows written in the current window and the equal window
  before it (sport filter applies, the others do not, so the pair stays
  comparable); `describeWindowDelta` refuses a percentage against a zero prior
  window and reports an unreadable count as `unknown`, never a flat 0%. When
  Sentry's hourly series is unavailable, `sumHourlyBuckets` folds the app's
  own per-fingerprint 24h histograms into one series against the exact clock
  they were built on (`appHourlyComputedAt`) and the chart says "app events
  only" — one witness, labelled as one, rather than a blank chart over data
  the Bridge already held.

## UI Contract

- The Incidents page (`/admin/errors`) is organised as five questions, top to
  bottom, each under a heading that says which one it answers: what needs
  attention (the canonical queue), is it getting worse (window-over-window,
  hourly, by source and by feature), is the Bridge seeing everything (source
  reconciliation, wiring, traceability), what Sentry still holds open, and what
  was fixed. Filters are grouped and labelled in words with an explicit "All"
  per group (`ErrorsFilterBar`), collapsed until one is active; the legend
  (`HowToReadIncidents`) is a closed `<details>` under the header. Every
  incident row carries a feature TAG in registry words ("untagged" said out
  loud, an unregistered key rendered as itself, dashed), the lifecycle
  headline sentence, and a Details disclosure with only what the row does not
  already say: first/last seen, the error code with a plain-language hint
  (`error-code-hint.ts`, null for codes it does not know), the kind and its
  reason, every source with its health, the analysis, the repair, and the
  ordered checks behind the lifecycle state.
- An error's detail page shows what was actually captured — Postgres error code
  and hint, request id, runtime, handled/unhandled, source file, and the flight
  trace link when one exists — each copyable on its own. A field with no value
  renders an em-dash; nothing is invented to fill the grid.
- A count that could not be read is rendered as UNREADABLE, never as zero and
  never as nothing. The incident badge's `null` state is a visible chip
  ("Incidents unreadable", `role="status"`) in the shell's top bar, shown at
  every breakpoint because on the phone the bottom-nav badge is the only other
  signal.

## Known Risk Areas

- **An incident detail page costs a whole board.** `fetchIncidentById`
  (`src/lib/admin/incidents/fetch.ts`) builds the full 168h board — a Sentry
  pull, a paginated `admin_events` sweep, the GitHub work log and per-PR check
  runs — to answer for ONE incident, on top of the page's own
  `fetchFingerprintDetail` and `fetchResolutionArchive`. The wide window is
  deliberate (a detail page is reached from bookmarks, RCA rows and PR bodies,
  so a 72h board would 404 half of them), and correctness beat cost while the
  read model was being established. Twenty incidents opened in a row is twenty
  boards. If that starts to bite, the fix is a narrowed by-id query, not a
  shorter window.

## Tests To Prefer

- `src/lib/admin/incidents/__tests__/**` — lifecycle, proof, correlate, lens,
  attention, sources, fetch, reconciliation, repair-link, truth-strip.
- `src/test/lib/admin/incident-classification.test.ts`,
  `incident-classification-privilege.test.ts`,
  `incident-grouping-inngest-skew.test.ts`, `incident-grouping-opaque-ids.test.ts`
- `src/app/admin/actions/__tests__/analyze-error.test.ts`,
  `resolve-error.test.ts`, `sentry-resolve.test.ts`
- `src/test/lib/admin/bridge-honest-failure.test.ts` — the Bridge never fails
  toward reassurance (feed throw, badge `null`).
- Typecheck/build for admin UI changes.

## Related Docs

- `docs/SECURITY_AUDIT.md`
- `docs/OBSERVABILITY.md`
- `memory/features/admin-platform.md` — the shared shell this entry was
  carved from.
- `memory/features/admin-reliability-collector.md` — one of this feature's
  evidence sources.
- `memory/features/admin-selfheal.md` — Diagnose/Repair/Close, which act on
  the incidents this feature surfaces.
