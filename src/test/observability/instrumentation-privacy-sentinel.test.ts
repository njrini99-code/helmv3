import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Privacy sentinel suite for the SERVER instrumentation entrypoint
 * (src/instrumentation.ts). Pushes the sentinel string
 * `sentry-test-secret-DO-NOT-STORE-123` through every `beforeSend*` hook
 * `register()` wires into `Sentry.init` (Node AND Edge runtime branches) and
 * asserts it never survives:
 *
 *   scrubPii          (beforeSend)        — request headers + query string
 *   beforeSendMetric                      — metric attributes
 *   beforeSendLog                         — log attributes
 *
 * Companion sentinel coverage lives in metrics.test.ts (sanitizeMetricAttributes)
 * and structured-log.test.ts (helmLog + enforceLogAttributeAllowlist) — this
 * file is specifically about the hooks as WIRED into Sentry.init, not the
 * underlying sanitizers in isolation.
 */
const SENTINEL = 'sentry-test-secret-DO-NOT-STORE-123';

const mocks = vi.hoisted(() => ({
  init: vi.fn(),
  reportInngestCredentialFault: vi.fn(async (_trigger: string) => true),
  recordDeployMarker: vi.fn(async () => {}),
  registerProcessErrorHandlers: vi.fn(),
}));
vi.mock('@sentry/nextjs', () => ({
  init: mocks.init,
  vercelAIIntegration: () => ({ name: 'VercelAI' }),
  consoleLoggingIntegration: () => ({ name: 'ConsoleLogging' }),
  captureConsoleIntegration: () => ({ name: 'CaptureConsole' }),
  captureRequestError: vi.fn(),
}));
vi.mock('@supabase/supabase-js/tracing', () => ({}));
vi.mock('@/lib/inngest/credentials', () => ({
  reportInngestCredentialFault: mocks.reportInngestCredentialFault,
}));
vi.mock('@/lib/admin/deploy-marker', () => ({ recordDeployMarker: mocks.recordDeployMarker }));
vi.mock('@/lib/observability/register-process-error-handlers', () => ({
  registerProcessErrorHandlers: mocks.registerProcessErrorHandlers,
}));

import { register } from '@/instrumentation';

type SentryInitOptions = {
  beforeSend?: (event: Record<string, unknown>) => unknown;
  beforeSendMetric?: (metric: Record<string, unknown>) => unknown;
  beforeSendLog?: (log: Record<string, unknown>) => unknown;
};

async function initOptionsForRuntime(runtime: 'nodejs' | 'edge'): Promise<SentryInitOptions> {
  vi.stubEnv('NEXT_RUNTIME', runtime);
  await register();
  const call = mocks.init.mock.calls.at(-1);
  return (call?.[0] ?? {}) as SentryInitOptions;
}

describe('instrumentation privacy sentinel (server) — scrubPii / beforeSendMetric / beforeSendLog', () => {
  let consoleLog: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    mocks.init.mockClear();
    mocks.reportInngestCredentialFault.mockReset();
    mocks.reportInngestCredentialFault.mockImplementation(async () => true);
    mocks.registerProcessErrorHandlers.mockClear();
  });
  afterEach(() => {
    consoleLog.mockRestore();
    vi.unstubAllEnvs();
  });

  for (const runtime of ['nodejs', 'edge'] as const) {
    describe(`${runtime} runtime`, () => {
      it('scrubPii (beforeSend) strips Authorization, Cookie, and Set-Cookie headers', async () => {
        const { beforeSend } = await initOptionsForRuntime(runtime);
        expect(beforeSend).toBeTypeOf('function');
        const event = {
          request: {
            url: 'https://helm.app/golf/dashboard',
            headers: {
              Authorization: `Bearer ${SENTINEL}`,
              Cookie: `sb-access-token=${SENTINEL}`,
              'Set-Cookie': `sb-access-token=${SENTINEL}; HttpOnly`,
            },
          },
        };
        const out = beforeSend!(event) as Record<string, unknown>;
        expect(JSON.stringify(out)).not.toContain(SENTINEL);
      });

      it('scrubPii (beforeSend) strips a token embedded in the request query string', async () => {
        const { beforeSend } = await initOptionsForRuntime(runtime);
        const event = { request: { url: `https://helm.app/reset?token=${SENTINEL}` } };
        const out = beforeSend!(event) as Record<string, unknown>;
        expect(JSON.stringify(out)).not.toContain(SENTINEL);
      });

      it('beforeSendMetric strips a secret-shaped attribute key', async () => {
        const { beforeSendMetric } = await initOptionsForRuntime(runtime);
        expect(beforeSendMetric).toBeTypeOf('function');
        const metric = {
          name: 'helm.workflow.success',
          value: 1,
          type: 'counter',
          attributes: { authorization: SENTINEL, feature: 'round_tracking' },
        };
        const out = beforeSendMetric!(metric) as Record<string, unknown>;
        expect(JSON.stringify(out)).not.toContain(SENTINEL);
        expect((out.attributes as Record<string, unknown>).feature).toBe('round_tracking');
      });

      it('beforeSendLog strips a secret-shaped attribute key', async () => {
        const { beforeSendLog } = await initOptionsForRuntime(runtime);
        expect(beforeSendLog).toBeTypeOf('function');
        const log = {
          level: 'error',
          message: 'auth failed',
          attributes: { cookie: SENTINEL, feature: 'auth' },
        };
        const out = beforeSendLog!(log) as Record<string, unknown>;
        expect(JSON.stringify(out)).not.toContain(SENTINEL);
        expect((out.attributes as Record<string, unknown>).feature).toBe('auth');
      });
    });
  }
});
