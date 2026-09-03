# Change ledger — observability_sentry

## 2026-09-02 — client "maximum observability" build: profiling, replay privacy, third-party filter, feedback, breadcrumbs, feature tags

- Branch: `agent/sentry-max-client` (Phase D of a multi-phase Sentry build;
  server-side spans/metrics/structured-log are a sibling phase on another
  branch and were not touched here).
- Change: rebuilt `src/instrumentation-client.ts`'s `Sentry.init()` on a new
  pure options builder, `src/lib/sentry-client-options.ts`
  (`buildClientSentryOptions`); added browser UI profiling
  (`browserProfilingIntegration`, `profileSessionSampleRate` +
  `profileLifecycle: 'trace'` — NOT the deprecated `profilesSampleRate`),
  `thirdPartyErrorFilterIntegration` (gated `!isDev`, keyed on
  `applicationKey: 'helm-web'` added to `next.config.mjs`), a programmatic
  feedback form (`feedbackIntegration({autoInject:false})` +
  `ReportProblemButton` in golf Settings), `browserSessionIntegration`,
  `httpClientIntegration`, `reportingObserverIntegration`; hardened Replay
  (`maskAllInputs: true` explicit, `mask: ['[data-sentry-mask]']` wired and
  applied to `FairwayPlayerCard`/`FairwayRecruitCard`); added
  `recordHelmBreadcrumb` (`src/lib/observability/client-breadcrumbs.ts`) at
  3 round-entry outcome sites; added a `feature` Sentry tag in `beforeSend`
  reusing `error-trace-classification.ts`'s existing classifier.
- Why: this repo had error tracking but no browser profiling, no
  first-party/third-party error separation, no in-app way for a user to
  report a problem, and events that bypassed `logError()` carried a
  `sport` tag but never a `feature` tag.
- Correction: the code comment `Sentry.feedbackIntegration` had carried
  since an earlier `@sentry/nextjs` v10.x minor — "moved out... crashes the
  entire client SDK init" — was re-verified at runtime against the
  currently-installed 10.71.0 and found FALSE for this version:
  `feedbackIntegration`/`getFeedback`/`browserProfilingIntegration`/
  `thirdPartyErrorFilterIntegration` all resolve as real functions through
  the actual client export chain (`@sentry/nextjs` -> `@sentry/react` ->
  `@sentry/browser`). Verified with `node -e "import('@sentry/browser')..."`
  reading `typeof` on each export, not just the `.d.ts` files that missed
  it the first time. `profilesSampleRate` was also found to be
  functionally dead in this SDK version (never read by the shipped
  `UIProfiler`/`shouldProfileSession`) despite still typing as valid —
  `profileSessionSampleRate` + `profileLifecycle` is what actually gates
  the profiler.
- Docs: `docs/observability/SENTRY_CLIENT_EXPERIENCE.md`,
  `docs/observability/SENTRY_IGNORE_ERRORS.md`,
  `memory/features/observability-sentry.md`.
