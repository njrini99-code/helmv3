// scripts/lib/sentry-cron-checkin.mjs — a minimal, dependency-injectable
// Sentry Cron Monitor check-in pair for standalone Node scripts (launchd
// jobs) that cannot reach src/lib/observability/cron-monitors.ts: that
// module is TypeScript resolved through the `@/` path alias and Next's
// bundler, neither of which exists for a bare `node scripts/*.mjs` process.
//
// FAIL-OPEN, ALWAYS. Every exported behavior here is wrapped so a missing
// DSN, an unresolved @sentry/node import, a hung network call, or any other
// internal failure can never affect the caller's own job outcome, timing, or
// exit code — same discipline as cron-monitors.ts, restated here because
// this file cannot import that one.
//
// DEPENDENCY-INJECTABLE ON PURPOSE. `loadSentry` defaults to a real
// `import('@sentry/node')` but can be swapped for a fake in tests — the same
// shape reconcileRepairRun's `store` parameter uses, so this file can be unit
// tested without a live Sentry DSN or a real network call, matching
// run-selfheal-repair.test.ts's existing "unit tests never touch production"
// discipline.

const DEFAULT_TIMEOUT_MS = 2000;

function withTimeout(promise, ms, fallback) {
  return Promise.race([
    promise,
    new Promise((resolve) => {
      setTimeout(() => resolve(fallback), ms);
    }),
  ]);
}

/**
 * @param {object} opts
 * @param {string | undefined} opts.dsn
 * @param {string} opts.environment
 * @param {() => Promise<any>} [opts.loadSentry] Injectable for tests; defaults to a real `import('@sentry/node')`.
 * @param {number} [opts.timeoutMs] Bounds every Sentry network interaction (init resolution + flush). Never lets a stalled endpoint delay the caller beyond this.
 * @returns {{
 *   enabled: boolean,
 *   start: (monitorSlug: string, monitorConfig?: object) => Promise<string | null>,
 *   finish: (monitorSlug: string, checkInId: string | null, status: 'ok' | 'error', durationMs?: number) => Promise<void>,
 * }}
 */
export function createCronCheckIn({
  dsn,
  environment,
  loadSentry = () => import('@sentry/node'),
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  // A manual kill-switch (HELM_SENTRY_CRON_CHECKINS=false) always wins. Absent
  // that, a configured DSN is both necessary and sufficient — this script only
  // ever runs standalone under launchd on the owner's own machine, never in
  // CI or a test runner, so there is no VERCEL_ENV/CI signal to key off the
  // way cron-monitors.ts does for Vercel-hosted crons. The existing
  // spawnSync fixtures in run-selfheal-repair.test.ts pass a bare
  // PATH-only env with no DSN, so they no-op for free without any extra flag.
  const enabled = process.env.HELM_SENTRY_CRON_CHECKINS !== 'false' && Boolean(dsn && dsn.trim());
  let clientPromise = null;

  async function getClient() {
    if (!enabled) return null;
    if (!clientPromise) {
      clientPromise = withTimeout(
        Promise.resolve()
          .then(loadSentry)
          .then((Sentry) => {
            Sentry.init({
              dsn,
              environment,
              tracesSampleRate: 0,
              autoSessionTracking: false,
            });
            return Sentry;
          })
          .catch(() => null),
        timeoutMs,
        null,
      );
    }
    return clientPromise;
  }

  return {
    enabled,
    async start(monitorSlug, monitorConfig) {
      try {
        const Sentry = await getClient();
        if (!Sentry) return null;
        return Sentry.captureCheckIn({ monitorSlug, status: 'in_progress' }, monitorConfig) ?? null;
      } catch {
        return null;
      }
    },
    async finish(monitorSlug, checkInId, status, durationMs) {
      if (!checkInId) return;
      try {
        const Sentry = await getClient();
        if (!Sentry) return;
        Sentry.captureCheckIn({
          monitorSlug,
          status,
          checkInId,
          ...(durationMs !== undefined ? { duration: durationMs / 1000 } : {}),
        });
        // A short-lived CLI process has no background flush loop the way a
        // long-running server does — without this, the process can exit
        // before the check-in's HTTP request is ever sent.
        await withTimeout(Sentry.flush(timeoutMs), timeoutMs, undefined);
      } catch {
        // Diagnostic infrastructure about the job must never affect the job.
      }
    },
  };
}
