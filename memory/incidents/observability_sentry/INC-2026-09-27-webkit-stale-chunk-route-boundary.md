# INC-2026-09-27: WebKit's stale-chunk error skipped the route boundary's reload

- Feature: `observability_sentry` (client error reporting; `src/lib/error-logging.ts` and `src/components/errors/RouteErrorBoundary.tsx` are not mapped in `memory/registry.yml`)
- Surface: any route under a `RouteErrorBoundary`; observed on `/golf/dashboard/rounds/new` in the iOS app (WKWebView), `back_forward` navigation
- Status: FIX IN PR (agent/health-20260927-1926); production a21ccf2ba (deployed 2026-09-27 22:57Z)
- Risk: R1. Client-side error classification only. No schema, RLS, grant or server change.
- Signal: Bridge fingerprint `3756e441`, message `undefined is not an object (evaluating 'n[e].call')`, 2026-09-27 23:18Z, 21 minutes after the deploy; top frame `webpack-*.js`; row context `isChunkLoadError: false`, `errorKind: unknown-route-error`, `chunkErrorReloaded: "0"`.

## What was wrong

WebKit words a missing webpack module factory `undefined is not an object
(evaluating 'n[e].call')`; Chrome words it `Cannot read properties of
undefined (reading 'call')`. `boot-recovery-source.ts` matched both, but
`RouteErrorBoundary.isChunkLoadError` and `error-logging.isChunkLoadErrorMessage`
matched only Chrome's. React's boundary catches the render error, so the boot
script never sees it; the boundary did not ask the recovery coordinator for a
reload, showed the generic error screen, and logged the row at `high`
(Bridge `severity:error`) instead of the self-recovering `medium` ceiling.

## Fix

`isChunkLoadErrorMessage` matches the WebKit pair (`undefined is not an object`
and `.call`, the boot script's predicate) and is exported; the boundary
delegates to it rather than keeping its own copy.

## Proof

- `src/test/lib/error-logging.test.ts`: the WebKit severity-cap case and the
  `isChunkLoadErrorMessage` case fail on a21ccf2ba and pass with the fix; a
  negative control (`evaluating 'a.b'`) stays `high`.
- Replay: `replay/manifests/webkit-stale-chunk-route-boundary-2026-09-27.yml`.

## Not changed

The Bridge incident classifiers (`src/lib/admin/incident-classification.ts`
`STALE_DEPLOYMENT_PHRASES`, `admin-data.ts`) match neither engine's `.call`
wording; the source-side severity cap now keeps these rows at warning.

## Verify in production

After the next deploy: a WebKit `n[e].call` row carries `errorKind: chunk-load`
and severity warning, and `chunkErrorReloaded` is at least 1.
