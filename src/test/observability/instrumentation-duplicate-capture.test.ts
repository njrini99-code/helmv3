import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Two duplicate-capture fixes from
 * docs/observability/SENTRY_PHASE_A_FINDINGS.md §(b)/(c):
 *
 * Bug 3 — Lift Lab reproduced the Baseball/Golf "typed control-flow class
 * escapes to onRequestError and mints a second Sentry issue" bug, because
 * `sharedIgnoreErrors` was never updated when withLiftingAction shipped its
 * own three typed classes. This suite asserts all three now match the SDK's
 * `ignoreErrors` list Sentry.init receives, and that a GENUINE Lifting
 * failure (any other error name) does NOT.
 *
 * Bug 4 (structural) — `Sentry.captureRequestError` used to run
 * UNCONDITIONALLY in onRequestError, regardless of whether the throw site
 * already sent the exact same error to Sentry itself via
 * logServerException/logError (which set the `__helmBridgeLogged` marker).
 * This suite asserts captureRequestError is skipped for an already-marked
 * error and still fires for one that was never logged.
 */
const mocks = vi.hoisted(() => ({
  init: vi.fn(),
  captureRequestError: vi.fn(),
  logServerException: vi.fn(async () => {}),
  vercelAIIntegration: vi.fn((opts: unknown) => ({ name: 'VercelAI', opts })),
}));
vi.mock('@sentry/nextjs', () => ({
  init: mocks.init,
  vercelAIIntegration: mocks.vercelAIIntegration,
  consoleLoggingIntegration: () => ({ name: 'ConsoleLogging' }),
  captureConsoleIntegration: () => ({ name: 'CaptureConsole' }),
  captureRequestError: mocks.captureRequestError,
}));
vi.mock('@supabase/supabase-js/tracing', () => ({}));
vi.mock('@/lib/observability/register-process-error-handlers', () => ({
  registerProcessErrorHandlers: vi.fn(),
}));
vi.mock('@/lib/admin/deploy-marker', () => ({ recordDeployMarker: vi.fn(async () => {}) }));
vi.mock('@/lib/inngest/credentials', () => ({
  reportInngestCredentialFault: vi.fn(async () => true),
}));
vi.mock('@/lib/server-error-logger', () => ({
  logServerException: mocks.logServerException,
}));

import { register, onRequestError } from '@/instrumentation';
import { markBridgeLogged } from '@/lib/bridge-logged-marker';
import { enforceMetricAttributeAllowlist } from '@/lib/observability/metrics';

const baseRequest = { path: '/golf/dashboard', method: 'GET', headers: {} };
const baseErrorContext = {
  routerKind: 'App Router' as const,
  routePath: '/golf/dashboard',
  routeType: 'render',
};

describe('sharedIgnoreErrors — Lift Lab control-flow classes', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    mocks.init.mockClear();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('ignores all three withLiftingAction typed control-flow classes', async () => {
    await register();
    const ignoreErrors = mocks.init.mock.calls[0]![0].ignoreErrors as unknown[];
    expect(ignoreErrors).toContain('LiftingUnauthorizedError');
    expect(ignoreErrors).toContain('LiftingNoOrgError');
    expect(ignoreErrors).toContain('LiftingForbiddenError');
  });

  it('does NOT ignore a genuine Lifting failure', async () => {
    await register();
    const ignoreErrors = mocks.init.mock.calls[0]![0].ignoreErrors as unknown[];
    expect(ignoreErrors).not.toContain('LiftingDatabaseWriteFailedError');
    expect(ignoreErrors).not.toContain('TypeError');
  });

  it('applies the same ignoreErrors list on both the node and edge Sentry.init calls', async () => {
    await register();
    vi.stubEnv('NEXT_RUNTIME', 'edge');
    mocks.init.mockClear();
    await register();
    const ignoreErrors = mocks.init.mock.calls[0]![0].ignoreErrors as unknown[];
    expect(ignoreErrors).toContain('LiftingUnauthorizedError');
  });
});

describe('onRequestError — captureRequestError respects __helmBridgeLogged', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    mocks.captureRequestError.mockClear();
    mocks.logServerException.mockClear();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('captures an UNMARKED error (never been through the approved pipeline)', async () => {
    const err = new Error('first time seeing this');
    await onRequestError(err, baseRequest, baseErrorContext);
    expect(mocks.captureRequestError).toHaveBeenCalledTimes(1);
    expect(mocks.captureRequestError).toHaveBeenCalledWith(err, baseRequest, baseErrorContext);
  });

  it('does NOT capture a MARKED error — the throw site already sent this exact error to Sentry', async () => {
    const err = new Error('already logged at the throw site');
    markBridgeLogged(err);
    await onRequestError(err, baseRequest, baseErrorContext);
    expect(mocks.captureRequestError).not.toHaveBeenCalled();
  });

  it('a marked error still skips the Bridge write too (unchanged existing behavior)', async () => {
    const err = new Error('already logged');
    markBridgeLogged(err);
    await onRequestError(err, baseRequest, baseErrorContext);
    expect(mocks.logServerException).not.toHaveBeenCalled();
  });

  it('an unmarked error still gets a Bridge write (unchanged existing behavior)', async () => {
    const err = new Error('never logged before');
    await onRequestError(err, baseRequest, baseErrorContext);
    expect(mocks.logServerException).toHaveBeenCalledTimes(1);
  });
});

/**
 * enableMetrics/beforeSendMetric wiring. Read live from the installed SDK's
 * own source (node_modules/@sentry/core/build/cjs/metrics/internal.js):
 * `metricsEnabled = enableMetrics ?? _experiments?.enableMetrics ?? true` —
 * metrics already send with the option unset, contradicting
 * docs/observability/SENTRY_SDK_API_VERIFICATION.md's claim that they
 * "would currently be dropped". Set explicitly anyway (belt-and-suspenders
 * against a future SDK default change) and beforeSendMetric wired to
 * metrics.ts's own dimension-allowlist enforcer — its header says this hook
 * is "the second, independent line of defence against a PII leak" and was
 * built un-wired; this pins that it is actually reachable from Sentry.init,
 * not just exported.
 */
describe('Sentry.init — metrics enabled, second-line PII defence wired', () => {
  beforeEach(() => {
    mocks.init.mockClear();
  });

  it('enables metrics and wires beforeSendMetric on the Node runtime', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    await register();
    const opts = mocks.init.mock.calls[0]![0];
    expect(opts.enableMetrics).toBe(true);
    expect(opts.beforeSendMetric).toBe(enforceMetricAttributeAllowlist);
    vi.unstubAllEnvs();
  });

  it('enables metrics and wires beforeSendMetric on the Edge runtime too', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'edge');
    await register();
    const opts = mocks.init.mock.calls[0]![0];
    expect(opts.enableMetrics).toBe(true);
    expect(opts.beforeSendMetric).toBe(enforceMetricAttributeAllowlist);
    vi.unstubAllEnvs();
  });
});

/**
 * vercelAIIntegration — recordInputs/recordOutputs default flipped to false
 * (Phase A finding, docs/observability/SENTRY_PHASE_A_FINDINGS.md §(a)): this
 * integration was fully configured with recordInputs/recordOutputs:true
 * while being structurally inert (no call site opted in via
 * experimental_telemetry.isEnabled) — one flag away from recording every AI
 * call's prompt/output bodies simultaneously the moment any call site opted
 * in, including a schedule screenshot's raw image bytes and a coach chat
 * prompt carrying a player's first name. Phase C's five real call sites all
 * opt in individually with their own recordInputs/recordOutputs:false; this
 * pins the matching safe default for the global integration, so a FUTURE
 * call site that opts into telemetry without repeating those two flags
 * inherits "do not record" rather than "record everything".
 */
describe('Sentry.init — vercelAIIntegration defaults to NOT recording prompts/outputs', () => {
  beforeEach(() => {
    mocks.init.mockClear();
    mocks.vercelAIIntegration.mockClear();
  });

  it('calls vercelAIIntegration with recordInputs:false, recordOutputs:false', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    await register();
    expect(mocks.vercelAIIntegration).toHaveBeenCalledWith({
      recordInputs: false,
      recordOutputs: false,
    });
    vi.unstubAllEnvs();
  });
});
