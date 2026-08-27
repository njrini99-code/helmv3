# Admin Platform change ledger

## 2026-08-27 — self-healing: error resolution lifecycle, and a cron that lied

- SHA: recorded on merge of `feat/bridge-shot-tracing`.
- **APPLIED TO PRODUCTION 2026-08-27 (owner-instructed):**
  `supabase/migrations/20260827031100_admin_error_resolutions.sql`. Verified on
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
