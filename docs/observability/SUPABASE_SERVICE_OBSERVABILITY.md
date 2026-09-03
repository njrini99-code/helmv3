<!-- markdownlint-disable MD013 MD022 MD032 MD034 MD037 MD040 MD060 -->
# Supabase service observability — Auth, Storage, Realtime, Edge Functions

Phase 2 Track B of the zero-cost Supabase observability program (brief:
`docs/ai-system/briefs/SUPABASE_ZERO_COST_OBSERVABILITY_BRIEF_2026-09-03.md`,
§10–13, §36–39). Builds on Phase 1's PostgREST/Postgres error envelope,
classifier, and out-of-band recorder (`src/lib/observability/supabase/{envelope,classify,observe-result,record-db-error}.ts`,
documented in `docs/observability/SUPABASE_OBSERVABILITY_MEASURED_TRUTH.md`
and `memory/features/admin-platform.md`). This doc covers ONLY the Track B
additions: Auth (B1), Storage (B2), Realtime (B3), Edge Functions (B4), the
retry/timeout/commit-outcome model (B5), and the extended coverage audit
(B6).

## 1. Source-of-truth ledger — what was fetched, and when

Every code table below was fetched live on **2026-09-03**, not recalled from
training data, per the brief's own instruction. Where a fetch was
incomplete or a name wasn't in the documented table, that is called out
explicitly rather than silently filled in.

| Service | URL | Fetched | Completeness |
| --- | --- | --- | --- |
| Auth error codes | https://supabase.com/docs/guides/auth/debugging/error-codes.md | 2026-09-03 (two passes — the second specifically for `hook_*`/`mfa_*`/`sso_*`, which the first pass's summary omitted) | Full table captured across both passes. No per-code HTTP status column exists on that page — `status` is read from the live `AuthApiError.status` field at runtime instead. |
| Storage error codes | https://supabase.com/docs/guides/storage/debugging/error-codes.md | 2026-09-03 | Full table with `StatusCode` column captured. `TusError` (named in this track's own brief text) is **NOT** in the fetched table — flagged NOT VERIFIED in `classify-storage.ts`, classified generically (`unknown` expectedness) rather than guessed at. |
| Realtime error codes | https://supabase.com/docs/guides/realtime/error_codes.md | 2026-09-03 | Full table captured (81 named codes) — informational; this track's classifier keys on `REALTIME_SUBSCRIBE_STATES` (below), not these operational codes, since brief §12 scopes Realtime observability to the four channel-status values, not the server-internal error taxonomy. |
| Realtime channel `subscribe()` states | https://supabase.com/docs/reference/javascript/subscribe (the `.md` path 404'd; the non-`.md` path resolved) | 2026-09-03 | Confirmed `SUBSCRIBED`/`CHANNEL_ERROR`/`TIMED_OUT`/`CLOSED` and the `(status, err)` callback signature. Cross-checked directly against `node_modules/@supabase/realtime-js/dist/module/RealtimeChannel.d.ts`'s own `REALTIME_SUBSCRIBE_STATES` enum and `subscribe()` signature — both fetch and installed-package source agree. |
| Edge Function error handling (`FunctionsHttpError`/`FunctionsRelayError`/`FunctionsFetchError`) | https://supabase.com/docs/guides/functions/error-handling.md | 2026-09-03 | Full three-class description + example captured. Cross-checked against `node_modules/@supabase/functions-js/dist/module/types.d.ts`'s own source, which is what `classify-edge.ts` actually keys on (`error.name`, set in each subclass's constructor). |
| Sentry Deno SDK | https://supabase.com/docs/guides/functions/examples/sentry-monitoring (the OFFICIAL Supabase guide — a more useful and more current source than `docs.sentry.io`'s generic Deno guide, which 404'd on its `install/` subpage and gave a placeholder `<sdk-package-name>` import) | 2026-09-03 | Import form (`npm:@sentry/deno@^8`), `Sentry.init()` shape (`defaultIntegrations: false`, `tracesSampleRate`, `profilesSampleRate`), the `withScope` recommendation, and the "no `Deno.serve` instrumentation, no scope separation between requests" limitation — all quoted verbatim in `supabase/functions/_shared/observability.ts`'s header. |
| Supabase changelog | https://supabase.com/changelog.md | 2026-09-03 | Scanned for 2026 breaking changes to Auth/Storage/Realtime/Functions error shapes. None found. |

**Not fetched / not independently verified in this pass:** whether
`Sentry.continueTrace` (full distributed-trace continuation from the
incoming `sentry-trace`/`baggage` headers) is supported and behaves as
expected against the pinned `@sentry/deno@^8` release — the Deno guide
fetch did not surface a `continueTrace` example, and no live Edge Function
invocation was made to observe it. `withObservedRequest` tags the incoming
headers (correlation) rather than asserting trace linkage. **NOT VERIFIED —
follow-up for whoever certifies W3C trace propagation end to end** (brief
§14, already flagged as the one live check that pass owes).

## 2. Auth (B1) — `classify-auth.ts` + `observe-auth.ts`

`classifyAuthError(error, ctx)` keys on `AuthApiError.code` first, `.status`
fallback, message match last.

| Bucket | Codes | Notes |
| --- | --- | --- |
| Expected (unconditional) | `invalid_credentials`, `otp_expired`, `email_not_confirmed`, `weak_password`, `validation_failed`, `same_password`, `email_exists`, `email_address_invalid`, `flow_state_expired`, `flow_state_not_found`, `bad_code_verifier` | Routine sign-in/sign-up form validation. |
| Expected (context-dependent) | `user_not_found` (expected on `operation: 'sign_in'`), `session_not_found` (expected on `operation: 'sign_out'` or `expectedSessionAbsence`), `provider_disabled` (expected when `expectedProviderDisabled`) | Default (no context) is UNEXPECTED for all three — same "silence is not evidence of routineness" discipline `classify.ts` uses for `42501`. |
| Actionable | `over_request_rate_limit` (warning; critical on `isRateLimitSpike`), `unexpected_failure`/5xx (critical), `bad_oauth_state`/`bad_oauth_callback` (error), `refresh_token_not_found`/`refresh_token_already_used` (warning, **`terminal: false`** — brief §10's own wording, since a fresh sign-in still recovers the journey), `hook_timeout`/`hook_timeout_after_retry` (error, retryable), `hook_payload_over_size_limit`/`hook_payload_invalid_content_type` (error, not retryable — a config defect), `bad_jwt`/`no_authorization` (error unless `expectedUnauthenticated`) | |
| Unknown | Everything else fetched but not tabled (`mfa_*`, `sso_*`, `anonymous_provider_disabled`, `email_provider_disabled`, `captcha_failed`, `bad_json`, `conflict` — the last three get a light warning/conditional classification; the rest are `expectedness: 'unknown'`) | Never dropped — lands in an actionable bucket per the five-bucket taxonomy `observe-result.ts` already defined in Phase 1. |

`observeAuthResult` mirrors `observeSupabaseResult`'s wiring exactly
(classify → `classifyBucket` (reused, not re-derived) → skip
`expected_control_flow`/`routine_recovery` → `recordAuth` + `helmLog` +
`scheduleDbErrorRecording`). It **never logs `classification.normalizedMessage`**
— only code/feature/action/service/operation reach `helmLog` — because an
Auth error message routinely contains an email address; the message that
DOES reach the envelope (and, downstream, the durable store) is sanitized
once in `buildSupabaseErrorEnvelope`.

**Known limitation, not a bug:** `recordAuth` (`metrics.ts`) is reused
as-is — it emits `helm.auth.attempt` unconditionally and `helm.auth.failure`
on any non-success outcome. Called only from this failure-only observer,
attempt and failure counts here are identical, so brief §10's "Auth success
rate" Bridge card **cannot** be derived from this pair alone.
`metrics.ts` is additive-only per this track's hard rules, so this is
recorded as an open item rather than fixed here — extending `recordAuth`
with a true attempt/success/failure triple is a follow-up for whoever owns
that Bridge card.

**WIRED 2026-09-03 (the Auth wiring pass, W1).** The Track B build left
`observeAuthResult` with zero call sites; this section now records where it
actually runs. 17 call sites across 9 server-side files:

| File | Action | `operation` | Why it is actionable |
| --- | --- | --- | --- |
| `src/app/auth/callback/route.ts` | `exchange_code_for_session` | `oauth` | A bad state/code after the provider already authenticated the user. `flow_state_expired`/`flow_state_not_found`/`bad_code_verifier` classify EXPECTED, so a stale link stays silent. |
| `src/app/golf/actions/auth.ts` | `golf.login` | `sign_in` | Additive to `recordLoginOutcome` (product outcome), not a replacement — this records the Auth failure behind it. |
| | `golf.signup` | `sign_up` | Catches the case the three user-facing branches fall through on: a 429 burst or GoTrue 5xx presented as "Failed to create account". |
| | `golf.signup_with_staff_invite` | `sign_up` | Same. |
| `src/app/golf/actions/demo-access.ts` | `golf.demo_shared_account_sign_in` | `sign_in` | The 429/5xx congestion `signInWithPasswordResilient` exists for, made visible as a rate. |
| | `golf.demo_stamp_is_demo` | `other` | Best-effort `updateUser`, but a mass-send burst throttling it is brief §10's "Auth 429 spike". |
| `src/app/baseball/actions/auth.ts` | `baseball.login` | `sign_in` | |
| | `baseball.signup` | `sign_up` | |
| | `baseball.change_password_reauth` | `sign_in` | A 429/5xx here blocks a password change entirely; a wrong current password is EXPECTED. |
| | `baseball.change_password_update` | `password_reset` | The caller already proved the current password, so anything but `weak_password`/`same_password` is a fault. |
| `src/app/baseball/actions/demo-access.ts` | `baseball.demo_shared_account_sign_in` | `sign_in` | |
| | `baseball.demo_stamp_is_demo` | `other` | |
| `src/app/baseball/actions/onboarding.ts` | `baseball.signup_and_complete_coach_onboarding` | `sign_up` | `user_already_exists` is the resume path (EXPECTED); a 5xx is not. |
| | `baseball.onboarding_ownership_proof` | `sign_in` | A wrong password means "not the owner" (EXPECTED); a 429 silently blocks a legitimate abandoned-onboarding retry. |
| `src/app/lifting/actions/auth.ts` | `lifting.signup` | `sign_up` | The action's only failure signal — it returns the raw GoTrue message and logs nothing. |
| `src/lib/auth/send-password-reset.ts` | `send_password_reset_link` | `password_reset` | See `expectedMissingUser` below. |
| `src/app/api/account/delete/route.ts` | `delete_auth_user` | `other` | Unconditionally actionable: every application row is already deleted, so a failure strands a half-deleted account. |

Every call site's return value is byte-for-byte what it was. Two sites
gained an error binding they did not have (`const { error } = await
…updateUser(…)` on the two demo stamps, `error: signInError` on the
onboarding ownership probe); neither returns anything, so nothing
observable changed. `src/test/observability/supabase-service-wiring.test.ts`
proves this structurally rather than by assertion: it checks every observer
call is its own expression statement, so none can be part of a `return`,
an assignment, a condition or an `await` chain.

**One additive classifier change: `ClassifyAuthContext.expectedMissingUser`.**
Default false, so no pre-existing caller reclassifies. `user_not_found` was
already context-dependent but keyed ONLY on `operation === 'sign_in'`,
which left the password-reset link minter no honest way to say "an
unregistered address is routine here" — it would have had to mislabel its
operation as a sign-in. That call site is the reason the flag exists:
`sendPasswordResetEmail` collapses every `admin.generateLink` failure into
`'no-account'`, so today a GoTrue 429 or 5xx tells the user "if an account
exists we emailed it", sends no email, and records nothing anywhere. The
flag also covers the code-less HTTP 404 fallback, for a GoTrue release that
omits `code`.

**Deliberately NOT wired, and this is the larger half of the decision.**
`supabase.auth.getUser()` at the top of a server action is the single most
common Supabase Auth call in this repo, and a null user there is the
authorization check working — not an incident. Wiring those would produce
exactly the alert noise brief §7 and §82 forbid, so none of them is
observed, and the wiring contract test asserts no observed call site is
getUser-shaped. Also unwired:

- **Every `'use client'` Auth surface** — `observe-auth.ts` is
  `server-only`. This is the same genuine gap `upload-course-image.ts` is
  for Storage (§3), and it is larger: `golf/(auth)/reset-password/page.tsx`
  (`exchangeCodeForSession`, `verifyOtp`, `updateUser`),
  `baseball/(auth)/{login,forgot-password,reset-password}/page.tsx`,
  `lifting/(auth)/{login,forgot-password,reset-password}/page.tsx`,
  `FairwaySettingsGeneral.tsx` (email change, password change reauth +
  update), `FairwayDashboardShell.tsx`, `AdminShell.tsx`, `LabShell.tsx`,
  `use-auth.ts`, `session-activity.ts`. A client-safe Auth observer
  (parallel to `realtime.ts`'s client-safe design) is the right fix and is
  not built in this pass.
- **`src/lib/supabase/middleware.ts`** — its `signOut({ scope: 'local' })`
  is deliberately a cookie clear with no GoTrue round-trip ("middleware
  must stay fast and must not depend on auth-server reachability"), and it
  already reports its own failures to `/api/internal/log-auth-failure`.
  Pulling the observer's admin-client import graph into the Edge middleware
  bundle buys nothing.

**Known false negative, recorded rather than papered over.** The demo gates
sign visitors into a SERVER-OWNED shared account, so an `invalid_credentials`
there would be a config defect, not a routine wrong password — but the code
is unconditionally EXPECTED, so it stays silent. Narrowing that would mean
inverting a default for one call site; the failure mode those paths were
actually written for (429/5xx congestion) does classify actionable.

## 3. Storage (B2) — `classify-storage.ts` + `observe-storage.ts`

Keys on `StorageApiError.code` (read from `node_modules/@supabase/storage-js/src/lib/common/errors.ts`'s
own source: `code`, `status`, `statusCode` — that last one is a STRING
mirror of the HTTP status, never read by this classifier).

| Bucket | Codes | Notes |
| --- | --- | --- |
| Expected (context-dependent) | `NoSuchBucket`/`NoSuchKey`/`NoSuchUpload`/`TenantNotFound` (expected when `expectedMissingObject`; default is warning/unexpected — a required-document-missing case per brief §11), `ResourceAlreadyExists`/`KeyAlreadyExists`/`BucketAlreadyExists` (routine_recovery when `idempotentUpsert`) | |
| **AccessDenied — deliberately inverted default** | expected/info by DEFAULT; error/unexpected only when `accessDeniedOnOwnPath` | This is the one place this track's defaults diverge from `classify.ts`'s `42501` convention (which defaults UNEXPECTED). Storage buckets are overwhelmingly single-owner paths where a denial on someone else's object is the routine, working RLS boundary; the brief's own framing ("AccessDenied on the user's own path likely RLS/auth defect") names the OWN-PATH case as the anomaly, not denial in general. Documented at length in `classify-storage.ts`'s header so this doesn't read as a copy-paste mistake from the Postgres classifier. |
| Always critical | `DatabaseTimeout`, `DatabaseError` | Storage's own metadata-DB infra fault — not context-dependent. |
| Expected (unconditional) | `EntityTooLarge`, `InvalidMimeType` | Routine client-side validation the server also enforces. |
| Actionable | `InvalidJWT` (error), `InvalidSignature`/`SignatureDoesNotMatch`/`InvalidUploadSignature` (error), `InternalError`/`S3Error`/`S3InvalidAccessKeyId`/`S3MaximumCredentialsLimit` (critical — infra), `ResourceLocked`/`LockTimeout` (warning, retryable), `SlowDown` (warning, retryable:yes), `InvalidRequest`/`InvalidBucketName`/`InvalidKey`/`InvalidRange`/`MissingContentLength`/`MissingParameter`/`InvalidUploadId`/`InvalidChecksum`/`MissingPart` (warning — malformed-request bugs in our own code) | |
| Unknown, NOT VERIFIED | `TusError` | Named in this track's brief text; absent from the fetched docs table. Classified generically rather than guessed. |

`bucketClass` is the privacy boundary: a caller-supplied safe label
(`'documents/document_version'`, `'recruit-documents/recruit_document'`,
`'baseball_videos/player_clip'`) — never an object key or storage path.
Nothing in the classifier or the envelope has a field an actual path could
flow through.

**Wired into (existing `if (error)` branches — return values unchanged):**

Track B (2026-09-03, first pass):

- `src/app/golf/actions/documents.ts` — 2 sites (`delete_document`,
  `delete_document_version`)
- `src/app/golf/actions/recruit-documents.ts` — 2 sites (upload rollback,
  delete)
- `src/app/baseball/actions/documents.ts` — 1 site
- `src/app/baseball/actions/video-classes.ts` — 1 site (best-effort clip
  cleanup)

The Storage wiring pass (2026-09-03, W2) — every remaining SERVER-SIDE site:

- `src/app/golf/actions/recruiting.ts` — 1 site
  (`delete_recruit_storage_objects`, `operation: 'delete'`,
  `bucketClass: 'recruit-documents/recruit_document'`). The recruit row and
  its document rows are already deleted by this point, so the purge is
  operating on the caller's own team's objects.
- `src/lib/admin/github-feedback.ts` — 2 sites
  (`upload_feedback_screenshot`, `operation: 'upload'`;
  `sign_feedback_screenshot_url`, `operation: 'download'`), both
  `bucketClass: ${bucket}/feedback_screenshot` — the configured bucket NAME
  plus a static object class. The signed-URL site had **no error binding at
  all**: a failure uploaded the object and then attached an issue with no
  link, a silent half-failure with no other signal anywhere. Destructuring
  `error` alongside the existing `data` changes nothing pushed — the
  attachment is still `data?.signedUrl ?? undefined`. That path's object key
  is `ben-leah/<ts>/<uuid>-<uploader's filename>`, which is exactly what the
  `bucketClass` boundary exists to keep out; the wired-site test asserts
  neither the key nor the filename reaches the observer.

All nine use `accessDeniedOnOwnPath: true` (each is deleting, rolling back
or writing a path the same caller/team/service-role client owns), so an
`AccessDenied` on any of these paths IS treated as actionable, not
routine.

**Deliberately NOT wired:** `src/lib/golf/upload-course-image.ts`. It is
**client-side** — `createClient()` from `@/lib/supabase/client`, called from
the `'use client'` `CourseDetailDrawer.tsx` component. `observeStorageResult`
is `server-only` per spec; importing it there would break the client
bundle. This is a genuine coverage gap for the one Storage upload path this
track's target-file list named, not an oversight — a client-safe Storage
observer (parallel to `realtime.ts`'s client-safe design) would be the
right fix, and is not built in this pass.

**Also NOT wired — every remaining site, and every one of them is a client
module** (`observe-storage.ts` is `server-only`, same constraint as
`upload-course-image.ts` above):
`src/components/features/video-upload.tsx` (4 sites — upload, getPublicUrl,
and two cleanup removes), `src/hooks/golf/use-message-attachments.ts`,
`src/app/baseball/(dashboard)/dashboard/program/ProgramClient.tsx`. Track B
listed `recruiting.ts` and `github-feedback.ts` here too; both are wired as
of W2 above. The one remaining non-client grep hit is a comment in
`src/test/schema/storage-buckets-tracked.test.ts`, not a call site.

Server-side Storage coverage is therefore complete; what is left is
entirely the client-observer gap.

## 4. Realtime (B3) — `realtime.ts`

Client-safe (verified: no `server-only` anywhere in its own import graph —
`client-breadcrumbs.ts`, `structured-log.ts`, `metrics.ts` via `flush.ts`/
`vercel-wait-until.ts`, `@sentry/nextjs`). `observeRealtimeChannel(channel,
options)` wraps `channel.subscribe(...)` and returns the SAME channel
`.subscribe()` itself would — every existing `supabase.removeChannel(channel)`
cleanup keeps working unchanged.

| Status | Treatment |
| --- | --- |
| `SUBSCRIBED` (first) | Breadcrumb with connect latency in `count` (ms). |
| `SUBSCRIBED` (subsequent) | Breadcrumb with reconnect count in `count`. |
| `CHANNEL_ERROR` | Breadcrumb + `helm.realtime.channel_failure` metric + `helmLog.warn` + `Sentry.captureMessage` (level `error`), gated once per `channelClass` per session. |
| `TIMED_OUT` | Same as `CHANNEL_ERROR`, `captureMessage` level `warning`. |
| `CLOSED` | Breadcrumb ONLY — deliberately not treated as a failure. See below. |

**Why `CLOSED` is not a failure signal.** It fires identically on a
server-forced close and on an ordinary component-unmount teardown (the
cleanup path every one of these 11 hooks already calls
`supabase.removeChannel(channel)` from). This file has no reliable way to
tell the two apart without threading an "I'm about to unsubscribe on
purpose" flag through all 11 call sites' cleanup functions — out of scope
for this pass. Documented as a known ambiguity in `realtime.ts`'s own
header, not a silent gap.

**Metric AND Sentry capture, not one instead of the other.** `metrics.ts`
turned out to be browser-safe (confirmed by reading its import graph),
which is the brief's own "only if metrics.ts supports browser use" branch —
so `realtime.ts` uses both: the metric gives Bridge a rate nobody has to
notice to see; the gated `captureMessage` gives a human an actual Sentry
issue when a channel's transport is genuinely failing. The `captureMessage`
tags (`helm.feature`, `supabase.service`, `supabase.operation`,
`realtime.state`) are a Sentry TAG surface, independent of
`ALLOWED_METRIC_DIMENSIONS` (which governs only `metrics.ts` attributes).

**Wired into all 11 target hooks/components**, preserving every existing
callback's own logic (passed through as `onStatus`, invoked first, wrapped
in a try/catch so a throwing caller callback cannot break this file's own
observation — a deliberate, documented small behavior change from a bare
`.subscribe(cb)`):

`use-task-realtime.ts`, `use-qualifier-realtime.ts`, `use-golf-messages.ts`
(2 channels), `use-calendar-range-events.ts`, `useAdminRealtime.ts`,
`useAdminPresence.ts`, `use-messages.ts` (2 channels), `use-unread-count.ts`,
`useRSVP.ts` (2 channels), `LiveActivityFeed.tsx`, `LiveWeightRoomClient.tsx`.

Confirmed via B6's extended audit script: 14/14 `.channel(` call sites in
these files show as OBSERVED (11 hooks, several holding two channels each).

**Silent-propagation detection (brief §12's second failure mode) is exposed,
NOT wired.** `createRealtimeActivityMonitor({ expectedSignalWithinMs })`
returns `{ recordMessage, lastMessageAt, isSilentlyStalled }` — a standalone
opt-in helper a feature pairs with `observeRealtimeChannel` (same
`channelClass`) when it has a real "a message should have arrived by now"
invariant. Not wired into any of the 11 hooks: deciding what counts as "the
expected signal" and how long is too long is a per-feature product
judgment none of today's hooks has an existing invariant for (brief §12
itself: "the product outcome/invariant layer detects the second [failure
mode]"). Intended call sites, once a product invariant exists: round-submit
confirmation channels, task-assignment "did the assignee's client actually
receive this" checks.

## 5. Edge Functions (B4)

**App side** — `classify-edge.ts` keys on `error.name`
(`FunctionsHttpError`/`FunctionsRelayError`/`FunctionsFetchError`, each set
by its own constructor per `node_modules/@supabase/functions-js/src/lib/common/errors.ts`).
`FunctionsHttpError` with a readable 5xx `context.status` is critical; 4xx
(or an unreadable status) is warning. `FunctionsRelayError`/
`FunctionsFetchError` are both error/unexpected/retryable-conditional.
`observe-edge.ts` (server-only) mirrors the B1–B3 wiring, envelope
`service: 'edge_function'` `operation: 'invoke'`, `functionName` set. Wired
into the ONE `functions.invoke(` call site in `src`:
`src/lib/notifications/push.ts`'s `send-apns-push`/`send-fcm-push` dispatch
(existing `shouldDeactivateToken`/error-parsing logic untouched).

**Deno side** — `supabase/functions/_shared/observability.ts`. Fail-open:
no-ops entirely when `SENTRY_DSN` is unset. `withObservedRequest(name,
handler)` wraps a `Deno.serve` handler: captures function name, release
(`SUPABASE_FUNCTION_VERSION` → `GIT_SHA` → `VERCEL_GIT_COMMIT_SHA`),
outcome/status/latency (one JSON line via `console.log` — this is a
separate Deno runtime that cannot import `structured-log.ts`), tags the
incoming `traceparent`/`sentry-trace`/`baggage` headers, and reports any
thrown exception via `Sentry.withScope` + `Sentry.captureException`
(sanitized to name/message/stack only — never the original object's own
properties, never a request body). `defaultIntegrations: false` is
REQUIRED per the official guide, not optional: `Deno.serve` isn't
instrumented by the SDK, so without it, breadcrumbs/context leak across
requests sharing one warm isolate.

Wrapped all three functions
(`personalize-email`, `send-apns-push`, `send-fcm-push`) and added
`sentry-trace, baggage, traceparent` to each one's CORS
`Access-Control-Allow-Headers`.

**Deno type-check NOT VERIFIED (deno disabled on this machine by the
integrator).** `deno check`/`deno lint` were run once during this track's
own build (network-resolved through the sandbox proxy against the real
npm/jsr registries, all four Deno files clean at that time), but the
integrator has since disabled `deno` invocation entirely on this machine —
its cache had reached 4.1 GB twice on a volume that dipped to 7 GiB free
and has been removed. No `deno` command runs again from this session, so
that earlier pass is not a standing guarantee and must not be cited as
current verification. What this change relies on instead: careful reading
against the fetched official Sentry-Deno-for-Supabase guide (quoted
verbatim in `_shared/observability.ts`'s header) and the installed
`@supabase/functions-js`/`@sentry/deno` type shapes read directly from
their source; the CORS/header edits to each function (`sentry-trace,
baggage, traceparent` appended to each `Access-Control-Allow-Headers`) are
mechanical string edits with no type surface to get wrong. A future session
with `deno` available should re-run `deno check --node-modules-dir=none`
against `supabase/functions/_shared/observability.ts` and the three
wrapped `index.ts` files before this is called VERIFIED again.

**DEPLOYMENT IS AN OWNER ACTION.** None of the three functions, nor the new
`_shared/observability.ts`, has been deployed. `supabase functions deploy
<name>` requires the owner's authenticated Supabase CLI session. Until
deployed, none of this Deno-side instrumentation is live — the app-side
`observe-edge.ts` wiring in `push.ts` IS live (it observes the CLIENT's
view of the invocation, independent of whether the function itself is
instrumented).

## 6. Retry / timeout / commit-outcome model (B5)

`commit-outcome.ts` — pure, no Supabase client, no Sentry, no I/O of its
own (`verifyDurableOutcome` takes the caller's own read-back function as a
parameter). `classifyCommitOutcome({ transportError, sqlstate, readBack })`
→ `TRANSPORT_TIMEOUT` / `DURABLE_FAILURE` / `DURABLE_SUCCESS_AFTER_TIMEOUT`
/ `UNKNOWN_COMMIT`, never guessing a commit outcome it did not actually
observe (a clean response with no code and no transport error is
`UNKNOWN_COMMIT`, not an assumed success). `summarizeAttempts(attempts[])`
→ `attemptFailureCount`/`retryCount`/`finalSuccessCount`/`terminalFailureCount`
- a per-fingerprint retry-storm flag (≥5 attempts in any 60s window, brief
§49–55's threshold). `compareDurableChildCounts({ expected, durable, isEdit })`
flags a full-snapshot replacement that shrank durable children, suppressed
by a caller-declared `isEdit`.

**NOT WIRED into any production call site, deliberately** (brief: "Do NOT
wire these into `src/app/golf/actions/golf.ts` — owned by another
session"). Intended call sites once that ownership boundary lifts:

- `save_partial_round_atomic`/`submit_round_atomic` in `golf.ts` — the
  highest-risk persistence paths the brief names by name (§36-39's "safe
  before/after COUNTS (expected vs durable holes/shots)" example) are
  exactly what `compareDurableChildCounts` was built for.
- Any RPC call wrapped in a client-side retry loop (autosave, round submit)
  — `summarizeAttempts` over that loop's own attempt log would surface a
  retry storm before it becomes a production incident.
- A timeout-prone RPC where the caller can cheaply read back its own
  expected row (e.g. "does this round id now exist") — `classifyCommitOutcome`
  - `verifyDurableOutcome` together turn "the request timed out" into a
  real DURABLE_SUCCESS_AFTER_TIMEOUT / TRANSPORT_TIMEOUT / UNKNOWN_COMMIT
  answer instead of an assumed failure.

## 7. Coverage audit (B6)

`scripts/supabase-error-audit.mjs` extended with a report-only section
(zero effect on the existing `helm/no-unchecked-supabase-error` ratchet's
exit code or baseline). Run 2026-09-03 against the tree at the end of this
track:

| Surface | Grep target | Sites | Observed | Notes |
| --- | --- | --- | --- | --- |
| Auth | `.auth.` (the brief's OWN literal grep target — deliberately not narrowed to `supabase.auth.`) | 616 | 1 | **Overwhelmingly noise.** `.auth.` matches any object property named `auth`, not just Supabase Auth calls. This is not a real coverage number — B1 had zero production call sites wired at the time of this run (§2 above). A real Auth coverage audit needs a narrower pattern (`supabase.auth.`, or specific method names) before this count is trustworthy. |
| Storage | `storage.from(` | 16 | 6 | Matches §3's Track B wiring exactly. |
| Realtime | `.channel(` | 14 | 14 | 100% — matches §4's 11 hooks (several with 2 channels). |
| Realtime | `.subscribe(` | 4 | 2 | The 2 "unobserved" are CONFIRMED FALSE POSITIVES: `use-push-subscription.ts` and `FairwaySettingsGeneral.tsx` both call `pushManager.subscribe()` (the browser Web Push API), not Supabase Realtime — verified by reading both files. |
| Edge Functions | `functions.invoke(` | 1 | 1 | 100% — the one site (`push.ts`), matches §5. |

The "observed" heuristic is FILE-level (does the containing file import the
matching `observe*` wrapper anywhere), not a real per-call-site AST check —
documented in the script's own header. A file can have one wired call site
and one bare one and still show fully "observed" by this heuristic; treat
it as a starting point, not a certification.

**Re-run after the wiring pass (W1/W2), same script, 2026-09-03:**

| Surface | Sites | Observed | Notes |
| --- | --- | --- | --- |
| Auth (`.auth.`) | 616 | 19 | Still not a coverage number, for the reason above. It rose from 1 to 19 because the heuristic credits every `.auth.` hit in a file that imports `observeAuthResult` anywhere — those 9 files hold 22 lines containing `.auth.` by a plain `grep -c`, which does not reconcile with 19 and is not worth reconciling: neither number is the answer. The wired count is 17, enumerated in §2 and asserted per call site by `src/test/observability/supabase-service-wiring.test.ts`, which is the certification this heuristic cannot give. |
| Storage (`storage.from(`) | 16 | 9 | Matches §3. The 7 unobserved are the four client modules named there. |
| Realtime (`.channel(`) | 14 | 14 | Unchanged. |
| Realtime (`.subscribe(`) | 4 | 2 | Unchanged — the 2 are the confirmed `pushManager.subscribe()` false positives. |
| Edge Functions (`functions.invoke(`) | 1 | 1 | Unchanged. |

The same run reports `unchecked Supabase reads: 1039 — OK, baseline 1039,
no regression`: the wiring pass added error bindings at three sites that
previously discarded one and removed none.

## 8. What is left open, end to end

- **~~Auth: zero production call sites wired.~~ CLOSED 2026-09-03** by the
  wiring pass — 17 server-side call sites across 9 files, enumerated in §2.
- **Auth: no client-side observer exists.** This is now the largest single
  Auth gap, and it is bigger than the Storage one: every sign-out, every
  password-reset page, the settings email/password change, and the idle
  session-activity hook are `'use client'` and cannot import a
  `server-only` module. `realtime.ts` shows the shape a client-safe
  observer takes; building one is follow-up work.
- **Auth: `session_refresh` has no wired call site.** Not an omission by
  choice — supabase-js refreshes tokens internally, and no `refreshSession()`
  call exists in `src` to wrap. The refresh-failure codes
  (`refresh_token_not_found`/`refresh_token_already_used`, both
  `terminal: false`) are classified and reachable through
  `getUserResilient`'s degraded path, which is not itself observed. Whoever
  owns brief §10's "session refresh failures" Bridge card needs a signal
  that does not exist yet.
- **Auth: one known false negative** — `invalid_credentials` on the
  server-owned demo shared account is a config defect but classifies
  EXPECTED (§2).
- **~~Storage: five out-of-scope files.~~ CLOSED 2026-09-03** — every
  server-side Storage site is wired. **Still open: the client-side gap**,
  now four modules (`upload-course-image.ts`, `video-upload.tsx`,
  `use-message-attachments.ts`, `ProgramClient.tsx`), all blocked on the
  same missing client-safe observer as Auth above.
- **Realtime silent-propagation detection: exposed, unused.** No product
  invariant exists yet to hang `createRealtimeActivityMonitor` off.
- **Edge Functions: not deployed.** Owner action required —
  `supabase functions deploy personalize-email send-apns-push send-fcm-push`.
- **Edge Functions: Deno type-check NOT VERIFIED** (deno disabled on this
  machine by the integrator, mid-track, after an earlier clean pass — see
  §5). Re-run `deno check --node-modules-dir=none` on a machine where deno
  is available before treating this as verified again.
- **Commit-outcome model: not wired anywhere**, by design — `golf.ts` is
  owned by another session this phase.
- **`Sentry.continueTrace` for Edge Functions: NOT VERIFIED.**
- **`recordAuth`'s attempt/success/failure asymmetry** (§2) — a real fix
  needs `metrics.ts` ownership this track doesn't have in this pass.

## 9. Metric names introduced this track

| Constant | Metric name | Emitted by |
| --- | --- | --- |
| `METRIC_STORAGE_FAILURE` | `helm.storage.failure` | `observe-storage.ts` |
| `METRIC_REALTIME_CHANNEL_FAILURE` | `helm.realtime.channel_failure` | `realtime.ts` |
| `METRIC_EDGE_FUNCTION_FAILURE` | `helm.edge_function.failure` | `observe-edge.ts` |

All three are additive-only changes to `metrics.ts` (one constant + one
`record*` function each, in the file's existing style) — that file is owned
by another track's session; nothing above the three new blocks was touched.
`recordAuth` (Auth) and `recordDbFailure` (all four services' shared
out-of-band write path) are REUSED from Phase 1/existing `metrics.ts`, not
duplicated.
