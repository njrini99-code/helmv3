# Admin Platform change ledger

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
