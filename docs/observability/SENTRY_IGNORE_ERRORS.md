<!-- markdownlint-disable MD013 MD022 MD032 MD034 MD037 MD040 MD060 -->
# Sentry client `ignoreErrors` — what's filtered and why it's still safe

`ignoreErrors` (`src/lib/sentry-client-options.ts`, `CLIENT_IGNORE_ERRORS`,
consumed by `src/instrumentation-client.ts`'s `Sentry.init()`) tells Sentry's
**automatic** capture (uncaught exceptions, `captureConsoleIntegration`,
unhandled rejections it sees itself) to never open an issue for a matching
message. It does **not** touch:

- `logError()` in `src/lib/error-logging.ts` — the Bridge pipeline
  (`error_logs` / `admin_events` table) is a separate write path with its own
  filtering (`isResizeObserverLoopNoise`, `isEmbeddedBrowserBridgeNoise`,
  `capSeverityForSelfRecovering`), documented per-row below.
- Anything explicitly passed to `Sentry.captureException()` outside the
  automatic-capture path.

So "filtered here" never means "invisible everywhere" unless the row below
says so explicitly.

Every entry must be argued the same way a CSP host addition is
(`src/lib/security/__tests__/analytics-csp-hosts.test.ts`): what it is, why
it's safe to drop, and how a genuine outage still gets noticed despite the
filter. Do not delete a network-error row in this phase — Phase C is adding a
client network-failure metric that is what makes those rows safe to keep
filtered from Sentry issues; until that lands, treat those rows' "equivalent
health signal" as unverified from this branch, not as proven absent.

| Pattern | What it is | Equivalent health signal today | How a real outage still surfaces |
| --- | --- | --- | --- |
| `/^chrome-extension:\/\//` | Error whose script origin is a Chrome extension, not app code. | None needed — Helm's own bundle never runs from this origin. | An app-code bug can never match this pattern; only genuinely third-party extension code can. |
| `/^moz-extension:\/\//` | Same, Firefox extension origin. | None needed, same reasoning. | Same. |
| `'Network request failed'` | Generic browser/network-layer failure message (message wording varies by browser/runtime). | **NONE — Phase C metric** (a client-side network-failure signal is being added on a sibling branch not yet merged/visible here). | `logError()` in `error-logging.ts` still writes to `error_logs`/`admin_events` for this class via `isTransientNetworkErrorMessage` (`src/lib/transient-network-error.ts`) — it is only Sentry's *automatic* capture that ignores it; explicit `logError()` calls are unaffected by this array. |
| `'Failed to fetch'` | Chrome/Firefox `fetch()` rejection message for a network-layer failure (offline, DNS, CORS-preflight failure, connection reset). | **NONE — Phase C metric.** | Same as above — `logError()`'s transient-network path, and any explicit `Sentry.captureException` call site, are untouched by this list. |
| `'Load failed'` | Safari/WebKit's equivalent of `'Failed to fetch'`. | **NONE — Phase C metric.** | Same. |
| `/network\s*error/i` | Case/spacing-insensitive catch for "network error" phrasing across browsers. | **NONE — Phase C metric.** | Same. |
| `/NetworkError/i` | `NetworkError` DOMException name (fetch/XHR abort variants). | **NONE — Phase C metric.** | Same. |
| `'TypeError: cancelled'` | Safari's phrasing when a request is cancelled mid-flight (navigation, tab backgrounding). | **NONE — Phase C metric.** | Same — and `capSeverityForSelfRecovering` in `error-logging.ts` already caps this class to `severity: 'medium'` rather than `'high'` when it does reach the Bridge, since it sits on the auto-save retry ladder documented there. |
| `'AbortError'` | The `DOMException` name when a `fetch`/request is deliberately aborted (`AbortController.abort()`, or the browser aborting on navigation). | None needed by design — this is *intentional* cancellation, not a failure. | A genuine backend/network outage surfaces as a timeout, a 5xx, or one of the `Failed to fetch`/`NetworkError` rows above — those carry different exception names/messages and are not caught by this pattern. Residual risk: a real bug that *incorrectly* aborts a request it shouldn't would also be masked here; nothing currently distinguishes "user navigated away" from "app-code abort bug" at this layer. |
| `/ResizeObserver loop/` | Chrome/Firefox's benign "ResizeObserver loop completed with undelivered notifications" / "loop limit exceeded" — fires when an observed element's own resize callback triggers another resize in the same frame; the browser defers delivery to the next frame. Not a bug, never has a useful stack. | None anywhere — `error-logging.ts`'s `isResizeObserverLoopNoise()` drops it from the Bridge pipeline too (`return;` before any write), so this is fully suppressed by design, not just from Sentry. | The regex is scoped to the browser's own fixed diagnostic wording; no real Helm bug would coincidentally produce this exact browser-generated string. |
| `/Object Not Found Matching Id:\d+, MethodName:\w+, ParamCount:\d+/` | CefSharp's embedded-browser JS bridge message when the host tears down a bound object before a queued callback runs — originates outside the app bundle. | None anywhere — `error-logging.ts`'s `isEmbeddedBrowserBridgeNoise()` also drops it from the Bridge pipeline. | Same reasoning as the ResizeObserver row: the pattern matches CefSharp's own fixed message shape, which no Helm application code path can produce. |
| `/ChunkLoadError/i` | Webpack/Turbopack's error when a lazily-loaded chunk 404s — the tab is holding asset URLs from a deployment that no longer exists. | `error-logging.ts`'s `capSeverityForSelfRecovering` (via `isChunkLoadErrorMessage`) caps this to `severity: 'medium'` in the Bridge pipeline (`error_logs`/`admin_events`) rather than dropping it — it is only Sentry's automatic-capture *issue* that is suppressed. The global one-shot recovery script mounted in `app/layout.tsx` reloads the tab once per session to pick up the new build. | A *spike* in this class (bad deploy, purged CDN, asset host down) still produces a spike of `severity:medium` Bridge rows — the signal to alert on is rate, not the individual event becoming a Sentry issue. |
| `/Loading (?:CSS )?chunk \d+ failed/i` | Webpack's specific chunk-404 wording (as opposed to Turbopack's `ChunkLoadError` name above). | Same as the `ChunkLoadError` row — `isChunkLoadErrorMessage` recognizes this phrasing too. | Same. |
| `'UnrecognizedActionError'` | Next.js dev-only: a Server Action ID baked into the client bundle no longer resolves after an HMR rebuild changed the action file. | None needed — dev-only artifact; production action hashes are baked at build time and never drift, per the code comment this row is copied from. | Not applicable in production — this string is not producible outside a local `next dev` session. `error-logging.ts`'s `isStaleServerActionError()` also downgrades this to a single per-session `console.warn`, never an `error_logs` row, independent of this list. |
| `/Server Action ".*" was not found on the server/` | Same dev-only stale-action-ID failure, alternate message wording. | Same as above. | Same. |
| `/Failed to find Server Action/` | Same failure class, a third message variant. | Same as above. | Same. |
| `/module factory is not available/` | Dev-only Turbopack HMR: a dependency module was replaced mid-flight and the next render held a stale closure; resolves on the following render. | None needed — dev-only, self-resolving within one render cycle. | Not producible in a production build (no HMR runtime is shipped). |
| `/It might have been deleted in an HMR update/` | Companion message to the row above, same Turbopack HMR class. | Same as above. | Same. |

## Rollback

Removing a pattern from `CLIENT_IGNORE_ERRORS` in
`src/lib/sentry-client-options.ts` re-enables Sentry issue creation for that
class immediately on the next deploy — no env var gates this list. See
`src/lib/__tests__/sentry-client-options.test.ts` for the pinning test that
must be updated in the same change.
