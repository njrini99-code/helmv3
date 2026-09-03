<!-- markdownlint-disable MD013 MD022 MD032 MD034 MD037 MD040 MD060 -->
# Sentry SDK API verification — Phase A

Measured at commit `44f4ce183` (branch `main`). Source of truth: the
**installed** packages under `/Users/ricknini/Downloads/helmv3/node_modules/@sentry/*`
— both the `.d.ts` type surface and, where noted, a live `node -e "require(...)"`
against the actual runtime export object (the stronger of the two proofs,
since a `.d.ts` can describe an API the build never actually shipped).

```
@sentry/nextjs        10.71.0
@sentry/profiling-node 10.71.0
@sentry/core           10.71.0  (transitive; nextjs re-exports through it)
@sentry/node           10.71.0  (transitive; server runtime)
@sentry/browser         10.71.0  (transitive; client runtime, via @sentry/react)
next                    16.3.4
ai                      7.0.37
inngest                 4.18.1
```

`@sentry/nextjs`'s **server** entry (`require('@sentry/nextjs')`, evaluated
live) re-exports through `@sentry/node` → `@sentry/node-core` / `@sentry/core`.
Its **client** entry (`src/instrumentation-client.ts`'s `import * as Sentry
from '@sentry/nextjs'`, resolved via the package's `"browser"` field to
`build/types/index.client.d.ts`) re-exports through `@sentry/react` →
`@sentry/browser` → `@sentry/core/browser`. The two entries are **not the
same export set** — several APIs below (Replay, Feedback, browser profiling)
exist only on the client entry, and one (`vercelAIIntegration`) exists only
on the server entry. "Method" in the table records which resolved which.

---

## How each row was proven

- **Runtime** — `node -e "console.log(Object.keys(require('@sentry/nextjs')))"`
  from the canonical checkout, plus `typeof s.<name>` spot-checks. Strongest
  proof for the server surface; cannot reach client-only exports because
  `require('@sentry/nextjs')` resolves the package's Node (server) entry, not
  the browser one.
- **Types (server)** — grep of `node_modules/@sentry/{nextjs,node,core}/build/types/**/*.d.ts`.
- **Types (client)** — grep of `node_modules/@sentry/nextjs/build/types/index.client.d.ts`
  and the chain it re-exports (`@sentry/react` → `@sentry/browser` →
  `@sentry/core/browser`), specifically `node_modules/@sentry/browser/build/npm/types/index.d.ts`.
- **NOT EXPORTED** — grepped for across every `@sentry/*` package's `.d.ts`
  (not just nextjs) with zero matches, or matched only in the unrelated legacy
  `@sentry/integrations` package (deprecated, not a dependency of this app —
  see the `hideSourceMaps` / `httpClient` note below).

---

## Runtime instrumentation exports

| API | Package it's actually declared in | Present in 10.71.0? | Method | Gotcha |
|---|---|---|---|---|
| `browserProfilingIntegration` | `@sentry/browser` (`build/npm/types/index.d.ts:28`) | YES — client only | Types (client) | Not on the server entry; server profiling is `nodeProfilingIntegration` from the separate `@sentry/profiling-node` package (below), not this name. |
| `profilesSampleRate` (Node client option) | `@sentry/node-core` `build/types/types.d.ts:69`, `@sentry/node` `build/types/types.d.ts:15` | YES | Types (server) | Legacy/simple sampling knob. Coexists with `profileSessionSampleRate` — see next row for which one actually governs when profiling is enabled. |
| `profileSessionSampleRate` | `@sentry/node-core` `types.d.ts:88`, `@sentry/node` `types.d.ts:35` | YES | Types (server) | "Profiling is enabled if either this or `profilesSampleRate` is defined. If both are defined, `profilesSampleRate` is [used]" (doc comment, `node-core/build/types/types.d.ts:73`). `src/instrumentation.ts:260` sets `profileSessionSampleRate` only — `profilesSampleRate` is never set, so this is the value that governs. |
| `profileLifecycle` | `@sentry/node-core` `types.d.ts:97`, `@sentry/node` `types.d.ts:46` | YES — `'manual' \| 'trace'` | Types (server) | `src/instrumentation.ts:261` sets `'trace'`. |
| `Sentry.metrics` (`count`/`gauge`/`distribution`) | `@sentry/core` `build/types/metrics/public-api.d.ts` | YES | Runtime (`Object.keys(s.metrics)` → `['count','distribution','gauge']`) | **No `metrics.set`** in this version — only three functions, not four. Any plan referencing a `set`/counter-with-reset shape is wrong for 10.71.0. |
| `enableMetrics` (init option) | `@sentry/core` `build/types/types/options.d.ts:549` (top-level), `:399` (deprecated nested under `_experiments`) | YES | Types (server+client, `@sentry/core` shared); **runtime behavior corrected by Phase C** — see the note below the table. | Wired in `src/instrumentation.ts` as of Phase C (both Node and Edge `Sentry.init` calls); `src/instrumentation-client.ts` (Phase D) still needs the matching line. |
| `beforeSendMetric` | `@sentry/core` `options.d.ts:573` (top-level), `:412` (deprecated `_experiments` form) | YES | Types (server) | Wired in `src/instrumentation.ts` as of Phase C to `metrics.ts`'s `enforceMetricAttributeAllowlist` — the function existed since Phase B but was unreachable from `Sentry.init` until now. |

**Correction to this row, Phase C (2026-09-02):** this table originally
claimed "`Sentry.metrics.*` calls would currently be dropped client-side
unless this is turned on" — that claim was never independently confirmed
against the installed runtime, only inferred from the option existing and
being unset. Read live,
`node_modules/@sentry/core/build/cjs/metrics/internal.js`'s
`_INTERNAL_captureMetric`:

```js
const metricsEnabled = enableMetrics ?? _experiments?.enableMetrics ?? true;
```

Metrics **default to enabled** when `enableMetrics` is unset — confirmed with
a live `node -e` run against the installed `@sentry/nextjs` (10.71.0) that
intercepted the transport's `send()` call: `Sentry.metrics.count(...)` sent a
real `trace_metric` envelope item with no `enableMetrics` option set at all.
The option is now set explicitly anyway (belt-and-suspenders against a
future SDK default change), but Phase C's metric call sites were NOT blocked
on this the way the original claim implied they would be.
| `Sentry.logger` (`.trace/.debug/.info/.warn/.error/.fatal/.fmt`) | `@sentry/core`, re-exported nextjs server (`index.d.ts:120`) and client (`browser/build/npm/types/index.d.ts:25`, via `@sentry/core/browser`) | YES | Runtime (`Object.keys(s.logger)` → `['fmt','debug','error','fatal','info','trace','warn']`) | Requires `enableLogs: true` on `Sentry.init` to actually ship — **and that IS set**, `src/instrumentation.ts:256` and `src/instrumentation-client.ts:66` both set `enableLogs: true`. `Sentry.logger.*` calls would work today if any existed (grep found none in `src/`). |
| `beforeSendLog` | `@sentry/core` `options.d.ts:543` (top-level) | YES | Types (server+client) | Not configured. |
| `feedbackIntegration` / `feedbackAsyncIntegration` | `@sentry/browser`, via `@sentry/feedback` (`build/npm/types/index.d.ts:1,13`) | YES — client only, but see gotcha | Types (client) | **`instrumentation-client.ts:87-92`'s own comment is stale for 10.71.0.** It says "`feedbackIntegration` was moved out of @sentry/nextjs v10.x — it now lives in `@sentry-internal/feedback`". The *actual* installed package is `@sentry/feedback` (public, not `@sentry-internal/feedback`), and `@sentry/browser`'s own index **re-exports it directly** (`feedbackSyncIntegration as feedbackIntegration`, line 13) — so `Sentry.feedbackIntegration(...)` is callable from the existing `import * as Sentry from '@sentry/nextjs'` with no extra import needed. Whoever wrote that comment was right that calling it used to crash init; they were not right about why or about the current fix. |
| `captureFeedback` | `@sentry/browser`, via `@sentry/feedback` (`index.d.ts:14`) | YES | Runtime AND Types (server: `typeof s.captureFeedback === 'function'`; also appears in the server export list) | Present on **both** entries — unusual for a "feedback" API, worth confirming intended use is client-side widget feedback, not a server-side call. |
| `getFeedback` | `@sentry/browser`, via `@sentry/feedback` (`index.d.ts:14`) | YES — client only | Types (client) | |
| `Sentry.captureCheckIn` | `@sentry/core` (`checkin.d.ts`), re-exported server (`Object.keys` confirms `captureCheckIn` present) | YES | Runtime | Zero call sites in `src/` (grepped `captureCheckIn\|withMonitor` across `src/**/*.ts(x)` — no matches). |
| `withMonitor` | `@sentry/core`, re-exported server | YES | Runtime (`typeof s.withMonitor === 'function'`) | Same zero-usage result as above. |
| `MonitorConfig` shape | `@sentry/core/build/types/types/checkin.d.ts` | YES | Types | Fields: `schedule` (`{type:'crontab',value}` or `{type:'interval',value,unit}`), `checkinMargin`, `maxRuntime`, `timezone`, `failureIssueThreshold`, `recoveryThreshold`, `isolateTrace`. All optional except `schedule`. |
| `thirdPartyErrorFilterIntegration` | `@sentry/core` (`integrations/third-party-errors-filter.d.ts`), re-exported via `@sentry/core/browser` in the browser index (`build/npm/types/index.d.ts:25`) | YES — client (browser index); also listed in `shared-exports.d.ts` and `build-time-plugins/buildTimeOptionsBase.d.ts` | Types (client) | Not present in the server (`@sentry/nextjs` Node) runtime export list — it is a **browser-error-attribution** integration (filters errors by which script/bundle produced them), so server absence is expected, not a gap. |
| `reactComponentAnnotation` | `@sentry/nextjs` build-config option, `build/types/config/types.d.ts:140` (webpack-scoped) and `:465` (top-level, `@deprecated Use webpack.reactComponentAnnotation instead`) | YES — but see the withSentryConfig finding in the Findings doc | Types (build config, not a runtime export) | This is a `withSentryConfig(nextConfig, sentryBuildOptions)` **second-argument** option, not something `Sentry.init()` accepts. `next.config.mjs:457` sets it — **but on an argument position the installed `withSentryConfig` never reads.** See `SENTRY_PHASE_A_FINDINGS.md` §(h). |
| `vercelAIIntegration` | `@sentry/node`, `build/types/integrations/tracing/vercelai/index.d.ts` | YES — **server only** | Runtime (`typeof s.vercelAIIntegration === 'function'`); NOT in the client browser export list | `src/instrumentation.ts:243-246` calls it with `{ recordInputs: true, recordOutputs: true }`. **Critical gotcha, verified against the type doc comment (`node/build/types/integrations/tracing/vercelai/index.d.ts:20-33`):** the integration instruments NOTHING for a given `generateText`/`streamText`/`generateObject`/`streamObject` call unless that call itself sets `experimental_telemetry.isEnabled: true` — "You need to opt-in to collecting spans for a specific call". `recordInputs`/`recordOutputs` are a second, independent opt-in on top of that. Grepped every AI SDK call site in `src/` (`generateText`, `streamText`, `generateObject` — 4 production call sites) and `experimental_telemetry` appears in **zero** of them (only in the `ai-shim.d.ts` type declaration, never a real call). **Net effect: today this integration is fully configured but structurally inert — no AI SDK call in this app currently emits a Sentry span, with or without prompt/output bodies.** Full detail in the findings doc. |
| `VercelAiOptions` (`recordInputs`/`recordOutputs`) | `@sentry/node/build/types/integrations/tracing/vercelai/types.d.ts:17,24` | YES | Types (server) | `recordInputs`/`recordOutputs` default to following `dataCollection.genAI.inputs`/`outputs`, or the deprecated `sendDefaultPii`, when NOT explicitly set at the integration level — moot here since they ARE explicitly set to `true`. |
| `sendDefaultPii` | `@sentry/core` `types/options.d.ts` (top-level init option) | YES | Types | Grepped `src/**/*.ts` for `sendDefaultPii` — **zero hits**. Not set in either `Sentry.init()` call. The `recordInputs`/`recordOutputs: true` on `vercelAIIntegration` is the sole, explicit reason prompt/output bodies would be recorded (were the integration not otherwise inert) — it is not a side effect of a PII default. |
| `supabaseIntegration` | `@sentry/core` `integrations/supabase.d.ts` | YES | Runtime (`typeof s.supabaseIntegration === 'function'`) | Options: `{ supabaseClient, sendOperationData? }`. `sendOperationData` "Falls back to `dataCollection.databaseQueryData`" (doc comment, same file) when omitted — i.e. an unrelated global Sentry setting could silently turn payload capture on for every Supabase call if this integration is ever constructed without passing it explicitly. `src/lib/observability/supabase-tracing.ts` does not call `supabaseIntegration` directly — it calls `instrumentSupabaseClient` instead (next row), always passing `{ sendOperationData: false }` explicitly. |
| `instrumentSupabaseClient` | `@sentry/core` `integrations/supabase.d.ts` | YES | Runtime | `(supabaseClient, options?: { sendOperationData?: boolean }) => void`. This is what `src/lib/observability/supabase-tracing.ts:118` actually calls, not `supabaseIntegration`. Same `sendOperationData` fallback-to-global-default gotcha applies; the repo passes `false` explicitly at every call site (single choke point, per that file's own header comment). |
| `consoleLoggingIntegration` | `@sentry/core`, re-exported both entries | YES | Runtime (server) + Types (client, `browser/build/npm/types/index.d.ts:9`) | Forwards `console.*` to Sentry's **Logs** stream (separate from Issues). Configured `{ levels: ['log','warn','error'] }` on both runtimes. |
| `captureConsoleIntegration` | `@sentry/core`, re-exported both entries | YES | Runtime (server) + Types (client) | Configured `{ levels: ['error'] }` on both runtimes — this is the one that turns `console.error` into its own Sentry **Issue**, distinct from the Logs-stream integration above. Central to the duplicate-capture findings — see `SENTRY_PHASE_A_FINDINGS.md` §(b). |
| `contextLinesIntegration` | `@sentry/core`, in both the server runtime export list AND the browser index (`build/npm/types/index.d.ts:6`) | YES | Runtime (server) + Types (client) | Not explicitly added to either `integrations: [...]` array in this repo — relies on whatever `getDefaultIntegrations` includes by default (unverified here whether it's in the default set for 10.71.0; would need a runtime default-integrations dump to confirm, not attempted). |
| `httpClientIntegration` | `@sentry/browser`, `integrations/httpclient.d.ts`, re-exported `build/npm/types/index.d.ts:5` | YES — **client only** | Types (client) | NOT in the server (`@sentry/nextjs`/`@sentry/node`) runtime export list — confirmed via `'httpClientIntegration' in require('@sentry/nextjs')` → `false`. Reports HTTP client errors (4xx/5xx `fetch`/`XHR` responses) from the browser; there is no server-side equivalent under this name (server HTTP instrumentation is `httpIntegration`/`httpServerIntegration`, a different thing — outbound vs. inbound). Not currently added to the client `integrations: [...]` array in `src/instrumentation-client.ts`. |
| `reportingObserverIntegration` | `@sentry/browser`, `integrations/reportingobserver.d.ts`, re-exported `index.d.ts:4` | YES — **client only** | Types (client) | Confirmed absent from server runtime export (`false`). Not currently added to the client integrations array. Also exists, separately, as a much older API in the deprecated standalone `@sentry/integrations` package (`node_modules/@sentry/integrations/*` — NOT a `package.json` dependency of this app, present only as a transitive/leftover install artifact) — that copy is irrelevant; the one that matters is `@sentry/browser`'s. |
| `browserSessionIntegration` | `@sentry/browser`, `integrations/browsersession.d.ts`, re-exported `exports.d.ts:19` | YES — client only | Types (client) | Not added to the client integrations array. Distinct from Release Health "sessions" the SDK tracks automatically for crash-free-rate — this integration is for something else (manual browser session boundaries); did not trace further under Phase A's read-only scope. |
| `replayIntegration` | `@sentry/browser`, via `@sentry/replay` package, re-exported `index.d.ts:10` | YES — client only | Runtime doesn't apply (client-only); Types (client) | `src/instrumentation-client.ts:74-77` calls it with `{ maskAllText: true, blockAllMedia: false }`, gated `!isDev`. `replaysOnErrorSampleRate: 1.0`, `replaysSessionSampleRate: isDev ? 0 : 0.1` set at `instrumentation-client.ts:69-70`. |
| `browserTracingIntegration` | `@sentry/browser`/`@sentry/nextjs` client (`nextjs/build/types/client/browserTracingIntegration.d.ts`, re-exported `client/index.d.ts:7`) | YES — client only | Types (client) | Called bare (no options) at `instrumentation-client.ts:78`. |
| `hideSourceMaps` (`withSentryConfig` build option) | — | **NOT EXPORTED anywhere in `@sentry/nextjs` 10.71.0.** Grepped every `.d.ts` under `node_modules/@sentry/nextjs` for the literal string `hideSourceMaps` — zero matches, in `node_modules/@sentry/nextjs/build/types/config/types.d.ts` or anywhere else. | Types (exhaustive negative grep) | `next.config.mjs:448` sets `hideSourceMaps: true`. This option existed in an older Sentry webpack-plugin generation and was removed; the closest current equivalent is `sourcemaps.deleteSourcemapsAfterUpload` (`node_modules/@sentry/nextjs/build/types/config/types.d.ts:239`, **defaults to `true` already**), so the *practical* effect this line was reaching for is already the default — but the line itself does nothing, doubly so because of the argument-position bug below. |
| `withSentryConfig` signature | `@sentry/nextjs` `build/types/config/withSentryConfig/index.d.ts:12` AND the actual runtime `build/cjs/config/withSentryConfig/index.js:6` | Confirmed via BOTH types and runtime source | Types + runtime source read | `function withSentryConfig(nextConfig, sentryBuildOptions = {})` — **exactly two parameters.** `next.config.mjs:407-459` calls it with **three** positional arguments; JavaScript does not error on an extra argument, it is simply never bound to anything and never read. This is a load-bearing, high-confidence finding — full detail in `SENTRY_PHASE_A_FINDINGS.md` §(h). |
| `disableLogger`, `automaticVercelMonitors`, `widenClientFileUpload`, `tunnelRoute` (`withSentryConfig` build options) | `@sentry/nextjs` `node_modules/@sentry/nextjs/build/types/config/types.d.ts:539,547,493,533` | YES, all four are real, valid `SentryBuildOptions` keys | Types (server, build config) | All four ARE real options in 10.71.0 — the problem is not that they don't exist, it's that `next.config.mjs` passes them in the discarded third argument (see `withSentryConfig` row above), so none of the four currently take effect despite being individually valid. |

---

## Summary table (quick reference)

| API asked about | Exported at 10.71.0? |
|---|---|
| `browserProfilingIntegration` | YES (client) |
| `profilesSampleRate` / `profileSessionSampleRate` / `profileLifecycle` | YES (server) |
| `Sentry.metrics` (count/gauge/distribution) + `enableMetrics`/`beforeSendMetric` | YES |
| `Sentry.logger` (trace/debug/info/warn/error/fatal + `fmt`) + `beforeSendLog` | YES |
| `feedbackIntegration` / `feedbackAsyncIntegration` / `captureFeedback` / `getFeedback` | YES (client; `captureFeedback` also server) |
| `Sentry.captureCheckIn` + `withMonitor` + `MonitorConfig` | YES |
| `thirdPartyErrorFilterIntegration` | YES (client/browser only) |
| `reactComponentAnnotation` (next.config option) | YES as a type — but never actually applied, see `withSentryConfig` finding |
| `Sentry.setConversationId` | YES (`typeof s.setConversationId === 'function'`, confirmed at runtime) |
| `vercelAIIntegration` options (`recordInputs`/`recordOutputs`) | YES — integration itself is currently inert app-wide, see finding |
| `supabaseIntegration` options | YES |
| `consoleLoggingIntegration` | YES |
| `contextLinesIntegration` | YES |
| `httpClientIntegration` | YES (client/browser only — **NOT** server) |
| `reportingObserverIntegration` | YES (client/browser only) |
| `browserSessionIntegration` | YES (client/browser only) |
| `replayIntegration` mask options | YES (client only) |
| `hideSourceMaps` | **NOT EXPORTED** in 10.71.0 |
| Never imported: any `@sentry-internal/*` package | Confirmed not a dependency; not recommended anywhere in this doc. |
