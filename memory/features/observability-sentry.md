# Feature: Client-side Sentry Observability

## Status

- active (platform infrastructure, not a product feature — see
  `memory/registry.yml`'s `integrations.sentry` entry; `npm run
  knowledge:map` only walks the `features:` map, so these files
  legitimately show zero product-feature impact)

## Current State

`src/instrumentation-client.ts` builds its `Sentry.init()` options from a
pure function, `src/lib/sentry-client-options.ts`'s
`buildClientSentryOptions(env, hostname)`, so sample rates,
`ignoreErrors`, and `tracePropagationTargets` are unit-testable without
booting the SDK.

Browser UI profiling reads `NEXT_PUBLIC_SENTRY_PROFILES_SAMPLE_RATE` but
maps it into `profileSessionSampleRate` + `profileLifecycle: 'trace'` —
the installed SDK's `profilesSampleRate` field is deprecated and, verified
by reading the shipped profiler source, never consulted at runtime.
Requires the `Document-Policy: js-profiling` response header, already set
for every route in `next.config.mjs`. Chromium-only — Safari/iOS never
profiles.

Session Replay masks all text and all input values by default
(`maskAllText`/`maskAllInputs: true`), never sets
`networkDetailAllowUrls` (no request/response bodies or headers are ever
captured), and additionally masks two identifying components by a shared
`data-sentry-mask` attribute as defense in depth: `FairwayPlayerCard`
(roster) and `FairwayRecruitCard` (recruiting — name, email, phone).
`blockAllMedia: false` is a deliberate, kept choice.

Third-party error filtering (`thirdPartyErrorFilterIntegration`) drops
events whose stack is entirely third-party script, keyed on
`applicationKey: 'helm-web'` in `next.config.mjs`'s `withSentryConfig`
options — that key only tags first-party modules on PRODUCTION builds
(`withSentryConfig` itself is skipped in dev), so the filter is gated
`!isDev` the same way Replay is, or every dev-mode client error would be
silently dropped.

In-app feedback: `feedbackIntegration({autoInject: false, ...})` — no
floating widget. `ReportProblemButton`
(`src/components/fairway/feedback/ReportProblemButton.tsx`, mounted in
golf Settings) is the only entry point, calling
`Sentry.getFeedback()?.createForm()` and falling back to a plain
`mailto:` + a toast (never a crash) when the SDK/integration is
unavailable.

Breadcrumbs: `recordHelmBreadcrumb(category, message, data?)`
(`src/lib/observability/client-breadcrumbs.ts`) enforces an allow-listed
`data` shape (feature/action/result/count/round_ordinal — never an id,
name, or email) both at the type level and again at runtime, and never
throws. Wired at three round-entry outcome sites: autosave
(`use-shot-state-machine.ts`), per-shot edit save
(`use-edit-shot-modal.ts`), and round submit (`continue-round-client.tsx`).

Tags: `beforeSend` sets the existing coarse `sport` bucket
(admin/lifting/baseball/golf/marketing — untouched, Sentry alert rules key
on these exact values) AND now also sets `feature` via
`error-trace-classification.ts`'s `classifyTraceSurface` — the SAME
classifier `error-logging.ts`'s `logError()` already used to tag its own
events — closing the gap for events that reach Sentry without going
through `logError` (raw exceptions, non-bridge-logged console errors).

Full reference: `docs/observability/SENTRY_CLIENT_EXPERIENCE.md`. Every
`ignoreErrors` pattern is individually justified in
`docs/observability/SENTRY_IGNORE_ERRORS.md`.

## Primary Entry Points

### Code

- `src/instrumentation-client.ts`
- `src/lib/sentry-client-options.ts`
- `src/lib/observability/client-breadcrumbs.ts`
- `src/components/fairway/feedback/ReportProblemButton.tsx`
- `next.config.mjs` (`withSentryConfig` options block + `headers()`)

## Business Rules

- Never capture request/response bodies or auth headers in Replay —
  `networkDetailAllowUrls` stays unset.
- Breadcrumb `data` is allow-listed; never an id, name, or email.
- `tracesSampleRate` is out of scope for this surface — do not change it
  here; it is owned by the broader Sentry rollout decision, not this file.
- `src/instrumentation.ts` (server) and `src/lib/observability/spans.ts`
  / `metrics.ts` / `structured-log.ts` belong to the server-side
  observability build on a sibling branch — do not edit them from here.

## Rollback

Every env override degrades independently to 0/off (see
`SENTRY_CLIENT_EXPERIENCE.md`); reverting the integration wiring itself is
a normal revert of the commits that added it.
