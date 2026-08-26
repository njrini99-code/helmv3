# Admin Platform change ledger

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
