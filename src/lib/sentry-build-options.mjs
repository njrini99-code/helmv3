/**
 * sentry-build-options.mjs — the single `sentryBuildOptions` object
 * `withSentryConfig(nextConfig, sentryBuildOptions)` actually reads.
 *
 * WHY THIS EXISTS. The installed `@sentry/nextjs@10.71.0`'s `withSentryConfig`
 * has exactly two parameters (confirmed against both the `.d.ts` and the
 * runtime source in
 * `node_modules/@sentry/nextjs/build/cjs/config/withSentryConfig/index.js:6`):
 *
 *   function withSentryConfig(nextConfig, sentryBuildOptions = {})
 *
 * `next.config.mjs` used to call it with THREE positional arguments — the
 * webpack-plugin options (org/project/authToken/release/telemetry/silent) as
 * the second, and the SDK build options (widenClientFileUpload, tunnelRoute,
 * hideSourceMaps, disableLogger, automaticVercelMonitors,
 * reactComponentAnnotation) as a discarded third. JavaScript does not error
 * on an extra call-site argument — it is simply never bound to anything and
 * never read. Concretely, that meant: no ad-blocker-safe `/monitoring`
 * tunnel, fewer client source maps uploaded than intended, and no JSX
 * component names in stack traces — despite every one of those lines looking
 * like it was doing something. Full writeup:
 * `docs/observability/SENTRY_PHASE_A_FINDINGS.md` §(h).
 *
 * `automaticVercelMonitors` is the one option from that list this file
 * deliberately does NOT re-enable, despite Phase A naming it among the
 * casualties. Read live from the installed SDK's own source
 * (`node_modules/@sentry/nextjs/build/cjs/server/vercelCronsMonitoring.js`,
 * `.../config/withSentryConfig/getFinalConfigObjectUtils.js`): once this
 * argument-position bug was fixed, turning it on would build-time-inject a
 * SECOND, independent Vercel Cron Monitor mechanism — span-wrapped, gated on
 * a `vercel-cron` user-agent header, keyed by the RAW `vercel.json` path as
 * its monitor slug (`/api/cron/log-retention`), `maxRuntime` hardcoded to 12
 * hours — running alongside the manual, per-job `captureCheckIn` calls
 * `src/lib/observability/cron-monitors.ts` already makes through
 * `recordJobRun` (dashed slug `api-cron-log-retention`, the real per-job
 * cadence/margin/max-runtime, and coverage of the "resolved 4xx/5xx Response
 * without throwing" failure shape this app's crons actually use — unverified
 * either way for the automatic span-based path). Two monitors covering one
 * job is the exact duplicate-capture shape the rest of this deliverable set
 * (Phase A findings #4-#6) spent its own effort eliminating; leaving this
 * `false` keeps `cron-monitors.ts` the single, tested authority instead of
 * quietly recreating that shape one option away. See
 * `docs/observability/SENTRY_CRON_MONITORS.md` §2 for the live decision
 * record.
 *
 * `hideSourceMaps` is additionally NOT A REAL OPTION in 10.71.0 at all, even
 * in the right argument position — grepped every `.d.ts` under
 * `@sentry/nextjs`, zero matches. Its actual current-SDK equivalent is
 * `sourcemaps: { deleteSourcemapsAfterUpload: true }` (which already
 * defaults to `true`, so this line was reaching for a no-op).
 *
 * `applicationKey` is the key `thirdPartyErrorFilterIntegration` (added by
 * Phase D, client-side) uses to attribute an error to THIS app's own bundle
 * vs. a third-party script — see
 * `node_modules/@sentry/nextjs/build/types/config/types.d.ts:410-416`'s doc
 * comment. It has to be set here, at build time, because it is what the
 * bundler plugin stamps into the built assets; the client-side integration
 * only reads it back.
 *
 * Lives in its own module — not inline in `next.config.mjs` — so the merged
 * option object is directly unit-testable (a `.mjs` next.config file runs
 * outside the TS pipeline and cannot itself be imported by a Vitest suite in
 * a way that proves anything about its *runtime* shape; a small function it
 * calls can). Same pattern as `src/lib/security/local-supabase-csp.mjs`.
 *
 * Does NOT touch org/project/authToken handling or the release value — those
 * stay exactly as `next.config.mjs` already resolves them, passed in here as
 * parameters rather than re-derived.
 */

/**
 * @param {object} params
 * @param {string | undefined} params.org
 * @param {string | undefined} params.project
 * @param {string | undefined} params.authToken
 * @param {{
 *   name: string | undefined,
 *   setCommits: { auto: boolean, ignoreMissing: boolean, ignoreEmpty: boolean },
 *   deploy: { env: string },
 * }} params.release
 * @param {string} [params.applicationKey] Defaults to 'helm-web'. Accepted as
 *   a parameter (rather than only hardcoded below) so next.config.mjs can
 *   pass the literal explicitly, keeping the string that
 *   src/lib/security/__tests__/sentry-application-key.test.ts greps for
 *   directly readable out of next.config.mjs's own raw text — see that
 *   file's call site for why.
 * @returns {Record<string, unknown>} the single `sentryBuildOptions` object,
 *   ready to pass as `withSentryConfig(nextConfig, sentryBuildOptions)`'s
 *   second argument.
 */
export function buildSentryBuildOptions({ org, project, authToken, release, applicationKey = 'helm-web' }) {
  return {
    // https://github.com/getsentry/sentry-webpack-plugin#options
    silent: true,
    org,
    project,
    authToken,
    // Release name + commits — falls back to Vercel's git SHA so each
    // deploy is a distinct release. setCommits with auto:true lets Sentry
    // associate the commits in this build with the release, which powers
    // Suspect Commits ("this error was introduced by commit abc123") and
    // the per-release commit list in the UI.
    release,
    // Don't phone home about build telemetry
    telemetry: false,

    // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

    // Upload a larger set of source maps for prettier stack traces (increases build time)
    widenClientFileUpload: true,

    // Routes browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers
    tunnelRoute: '/monitoring',

    // `hideSourceMaps` was removed from the SDK; this is the current
    // equivalent (and already the documented default — kept explicit so the
    // intent survives a future default change).
    sourcemaps: { deleteSourcemapsAfterUpload: true },

    // Tree-shake Sentry logger statements
    disableLogger: true,

    // Deliberately false — src/lib/observability/cron-monitors.ts is the
    // single Cron Monitor authority. See this file's header comment and
    // docs/observability/SENTRY_CRON_MONITORS.md §2 for why.
    automaticVercelMonitors: false,

    // React component annotations make stack traces show JSX component names
    reactComponentAnnotation: { enabled: true },

    // Identifies this app's own bundle to `thirdPartyErrorFilterIntegration`
    // (client-side, instrumentation-client.ts) so it can tell "this repo's
    // code threw" from "a third-party script threw". Defaults to 'helm-web'
    // above; next.config.mjs passes it explicitly.
    applicationKey,
  };
}
