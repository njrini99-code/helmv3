<!-- markdownlint-disable MD013 MD022 MD032 MD040 MD060 -->
# Sentry client experience

What the client-side "maximum observability" build added, how each piece is
configured, the env vars an operator can use to raise or lower it for a
reproduction window, and how to roll each piece back. Covers
`src/instrumentation-client.ts`, `src/lib/sentry-client-options.ts`,
`src/lib/observability/client-breadcrumbs.ts`, and
`src/components/fairway/feedback/ReportProblemButton.tsx`.

This is the CLIENT half only. Server-side spans, metrics, and structured
logging (`src/instrumentation.ts`, `src/lib/observability/spans.ts` /
`metrics.ts` / `structured-log.ts`) are a separate build on a sibling
branch — this doc does not cover them.

SDK: `@sentry/nextjs` `10.71.0`. Every export named below was verified two
ways before use, not just against `.d.ts` files: statically, by tracing the
package's `exports` map (`@sentry/nextjs`'s `browser` condition ->
`build/esm/index.client.js` -> `export * from '@sentry/react'` ->
`export * from '@sentry/browser'`), and then at runtime — `node -e
"import('@sentry/browser').then(m => console.log(typeof m.feedbackIntegration
/* etc */))"` — because a `.d.ts` re-export is not proof the runtime module
has it, which is exactly what caused the stale "this crashes the SDK"
comment this build corrected (see below).

---

## Browser UI profiling

`Sentry.browserProfilingIntegration()`, added unconditionally (dev and
prod) to the `integrations` array.

**The deprecated-field trap.** The installed SDK's
`BrowserClientProfilingOptions`
(`node_modules/@sentry/core/build/types/types/browseroptions.d.ts`) still
types `profilesSampleRate`, marked `@deprecated`. Reading the actual
shipped profiler
(`node_modules/@sentry/browser/build/npm/cjs/prod/profiling/UIProfiler.js`,
`utils.js`'s `shouldProfileSession`) confirms it is never read at runtime —
only `profileSessionSampleRate` (0..1) and `profileLifecycle`
(`'manual' | 'trace'`) gate whether the profiler ever starts. Setting only
the deprecated field would have shipped a profiling "feature" that never
profiles anything. This build never sets it.

- `profileSessionSampleRate` — read from `NEXT_PUBLIC_SENTRY_PROFILES_SAMPLE_RATE`
  via `parseSampleRateEnv` in `sentry-client-options.ts`: blank/undefined/
  non-numeric falls back to the default; out-of-range clamps into `[0, 1]`.
  Default **0.05 in production, 0 in development**.
- `profileLifecycle: 'trace'` — the profiler starts automatically whenever a
  sampled root span (from `tracesSampleRate`) is active and stops when it
  ends. `'manual'` (the SDK default) would profile nothing without an
  explicit `startProfiler()`/`stopProfiler()` call this build does not add.
- Requires the `Document-Policy: js-profiling` response header. **Already
  present** in `next.config.mjs`'s `headers()` for `/:path*` before this
  build — not added by it. Pinned by
  `src/lib/security/__tests__/sentry-profiling-header.test.ts`.
- **Platform limit, not a bug:** the `Profiler` API is Chromium-only. Safari
  and iOS WebKit sessions never produce a profile regardless of sample rate.
  Not verified in a real browser in this build (no browser session
  available) — verify with a manual reproduction in Chrome DevTools ->
  Sentry issue -> Profiles tab.

**Raise profiling for a reproduction window:** set
`NEXT_PUBLIC_SENTRY_PROFILES_SAMPLE_RATE=1` (or any value up to `1`) in the
target environment and redeploy/restart. Revert by unsetting it (falls back
to 0.05 prod / 0 dev) or setting it back to a lower value.

---

## Session Replay privacy

`Sentry.replayIntegration({...})`, gated `!isDev` (skipped in development —
DOM-mutation recording overhead) exactly like `browserTracingIntegration`'s
sibling pattern.

- `maskAllText: true` (unchanged) — every text node is masked by default.
- `maskAllInputs: true` — now **explicit** (it was the SDK's own default
  before; made explicit so a future SDK default change can't silently
  narrow it).
- `blockAllMedia: false` — a **deliberate, kept** choice.
- `mask: ['[data-sentry-mask]']` — defense in depth for the two most
  player-identifying components, in case `maskAllText` is ever narrowed for
  a specific surface later:
  - `src/components/fairway/pages/roster/FairwayPlayerCard.tsx` (name)
  - `src/components/fairway/pages/recruiting/FairwayRecruitCard.tsx` (name,
    email, phone)
- `networkDetailAllowUrls` — **never set**. Replay's network tab therefore
  stays empty rather than risking a captured request/response body or
  header. Pinned by a negative assertion in
  `src/lib/security/__tests__/sentry-replay-privacy.test.ts`.

**Session sample rate override:** `replaysSessionSampleRate` reads
`NEXT_PUBLIC_SENTRY_REPLAY_SESSION_SAMPLE_RATE` (same clamp/fallback rule as
profiling above). Default **0.1 production, 0 development**.
`replaysOnErrorSampleRate` stays pinned at `1.0` — **not** env-configurable,
by design (every session with an error should always be captured).

**Raise replay for a reproduction window:**
`NEXT_PUBLIC_SENTRY_REPLAY_SESSION_SAMPLE_RATE=1`. Revert the same way as
profiling.

---

## Third-party error filtering

`Sentry.thirdPartyErrorFilterIntegration({ filterKeys: ['helm-web'],
behaviour: 'drop-error-if-contains-third-party-frames' })`.

**Must stay gated `!isDev`.** `applicationKey: 'helm-web'` in
`next.config.mjs`'s `withSentryConfig` options tags first-party modules with
`_sentryModuleMetadata` at build time — but `withSentryConfig` itself is
skipped entirely in development (`next.config.mjs`'s `isDev` branch). If
this integration were active in dev, no frame would ever carry the
first-party marker, every frame would read as third-party, and
`drop-error-if-contains-third-party-frames` would silently drop **every**
client error in local development. It is gated the same way `replayIntegration`
is, immediately above it.

The `'helm-web'` string must match between the two files exactly — pinned by
`src/lib/security/__tests__/sentry-application-key.test.ts`.

**Not independently verified in this build:** a real production build was
not run (`npm run build` is CI's job, per this phase's instructions) to
confirm `_sentryModuleMetadata` actually lands in a client chunk. To verify:
after a production build, `grep -r '_sentryModuleMetadata' .next/static/`
should find it, and `grep -r 'helm-web' .next/static/` should too.

**Rollback:** remove `applicationKey: 'helm-web'` from `next.config.mjs` and
the `thirdPartyErrorFilterIntegration` block from `instrumentation-client.ts`
together (they only work as a pair) — or set `filterKeys: []` to keep the
integration registered but match nothing.

---

## User feedback

`Sentry.feedbackIntegration({ autoInject: false, showBranding: false,
colorScheme: 'system', isEmailRequired: false, isNameRequired: false })`.
`autoInject: false` means **no floating widget appears anywhere** — the only
entry point is `ReportProblemButton`.

`src/components/fairway/feedback/ReportProblemButton.tsx`, mounted in the
golf Settings screen (`FairwaySettingsGeneral.tsx`, a new "Support" section
between "Legal" and "Danger zone"). Calls
`Sentry.getFeedback()?.createForm()` — a `FeedbackDialog`
(`node_modules/@sentry/core/build/types/types/feedback/index.d.ts`) that
starts closed and needs both `appendToDom()` and `open()`.

**Fallback, in every one of these cases — never a crash, never a
`console.error`:**
- `Sentry.getFeedback()` returns `undefined` (SDK not initialized, DSN
  unset, ad-blocker).
- `createForm()` resolves to nothing.
- `createForm()` rejects.
- `Sentry.getFeedback` itself throws.

All four fall back to a plain `mailto:admin@helmsportslabs.com` and a toast
("Opening email — the in-app report form is unavailable right now."). Every
path is covered with the SDK mocked out in
`src/components/fairway/feedback/ReportProblemButton.test.tsx`.

**Deliberately not added:** a feedback entry point in `global-error.tsx`.
That surface renders when the app has hard-crashed — possibly the SDK
itself — and still uses the retired `warm-*`/`cream-*` design-token
vocabulary; adding a Fairway-token button there would be both a reliability
risk and visually inconsistent. Settings is the only entry point for now.

**Rollback:** delete the `Sentry.feedbackIntegration({...})` block (the
button's fallback path handles a missing integration gracefully, so removing
just the integration doesn't crash anything — every click just falls
through to mailto), or unmount `<ReportProblemButton />` from Settings.

---

## Breadcrumbs

`recordHelmBreadcrumb(category, message, data?)` in
`src/lib/observability/client-breadcrumbs.ts`.

- Categories: `'golf.round' | 'golf.shot' | 'coachhelm' | 'auth' | 'navigation'`.
- `data` is typed to exactly five keys — `feature`, `action`, `result`,
  `count`, `round_ordinal` — and stripped again at runtime if a caller
  forces a different shape past the type with an `as` cast. Never an id,
  name, or email.
- Never throws — wrapped in `try/catch`; a breadcrumb failure (e.g. the SDK
  not yet initialized) must never break the save/submit outcome handler it
  sits inside.

Wired at exactly three round-entry call sites (chosen by tracing the actual
consumer of the shot state machine — the task's suggested
`src/components/golf` grep target does not exist in this repo; the live
Fairway round-tracking UI and its hooks live in `src/hooks/golf/` and
`src/app/golf/(dashboard)/dashboard/rounds/continue/[id]/`):

| Outcome | File | Site |
| --- | --- | --- |
| autosave | `src/hooks/golf/use-shot-state-machine.ts` | `handleSaveSuccess` |
| shot save | `src/hooks/golf/use-edit-shot-modal.ts` | `handleSaveEditedShot`, after `EDIT_SAVE_COMPLETE` |
| submit | `continue-round-client.tsx` | after `setCompletedRoundId(...)` on the success path |

**Rollback:** delete the one-line call at any site; the helper itself has
no side effect on the surrounding logic (it is not in the success/failure
control flow, only observes it).

---

## Tags

`beforeSend` in `instrumentation-client.ts` sets two tags:

- `sport` (**unchanged**) — a coarse route bucket
  (`admin | lifting | baseball | golf | marketing`), derived inline from
  `window.location.pathname`. Left untouched deliberately: it is a
  *different* axis than the classifier below (no admin/lifting/marketing
  buckets exist there), and Sentry alert rules / saved searches key on
  these exact values — replacing it would silently re-bucket events under
  existing saved searches.
- `feature` (**new**) — via `error-trace-classification.ts`'s
  `classifyTraceSurface(path)`, the SAME classifier `error-logging.ts`'s
  `logError()` already uses (promoted to a real Sentry tag there by its
  `withScope` "remaining keys become tags" loop). This closes the gap for
  events that reach Sentry WITHOUT going through `logError` — a raw
  uncaught exception, or a `console.error` not already bridge-logged and
  picked up by `captureConsoleIntegration`. Only set when
  `classifyTraceSurface` returns a non-null `feature` (golf/baseball paths
  only; everything else gets no `feature` tag, same as before).

---

## Additional integrations

Added alongside the above, standard low-risk SDK integrations with no PII
surface of their own:

- `Sentry.browserSessionIntegration()` — release health / crash-free
  session rate. Default `lifecycle: 'route'` (new session per navigation).
- `Sentry.httpClientIntegration()` — auto-captures failed `fetch`/XHR calls
  (default: `5xx` only) as breadcrumbs/events. No request/response body or
  header capture option exists on this integration at all
  (`node_modules/@sentry/browser/build/npm/types/integrations/
  httpclient.d.ts`), so it cannot leak auth headers or bodies by
  misconfiguration — there is nothing to misconfigure.
- `Sentry.reportingObserverIntegration()` — browser Reporting API
  (crash/deprecation/intervention reports the browser itself generates;
  distinct from CSP violation reports, which this app does not currently
  route through a `report-to`/`report-uri` endpoint).

---

## Env var reference

| Var | Default (dev / prod) | Controls |
| --- | --- | --- |
| `NEXT_PUBLIC_SENTRY_PROFILES_SAMPLE_RATE` | `0` / `0.05` | Browser UI profiling session sample rate. |
| `NEXT_PUBLIC_SENTRY_REPLAY_SESSION_SAMPLE_RATE` | `0` / `0.1` | Session Replay session sample rate (error-triggered replay stays fixed at `1.0`, not overridable). |
| `NEXT_PUBLIC_SENTRY_DSN` / `SENTRY_DSN` | — | DSN, first non-empty wins (unchanged). |
| `NEXT_PUBLIC_SENTRY_RELEASE` / `VERCEL_GIT_COMMIT_SHA` | — | Release name, first non-empty wins (unchanged). |

All four parse through `buildClientSentryOptions` /
`parseSampleRateEnv` — blank, unset, or non-numeric always falls back to the
default; out-of-range values clamp into `[0, 1]`. Never `NaN`, never a value
outside `[0, 1]` reaches the SDK.

## Rollback, overall

Every piece degrades independently:

- Set the relevant sample-rate env var to `0`, or unset it to fall back to
  the default.
- Delete one integration line from `instrumentation-client.ts`'s
  `integrations` array to disable that integration specifically — no other
  integration depends on it except the `applicationKey`/`filterKeys` pair
  noted above.
- `git revert` the commits that added this build (each deliverable landed
  as its own commit on `agent/sentry-max-client`) for a full rollback.

## What could not be verified without a browser or a production build

- Browser UI profiling actually producing a profile in Sentry's UI (needs a
  real Chromium session).
- `_sentryModuleMetadata` / `helm-web` actually landing in a built client
  chunk (needs `npm run build`, which this phase does not run).
- The feedback dialog's actual visual rendering (CSS-in-JS shadow DOM;
  jsdom tests exercise the JS logic, not the paint).
