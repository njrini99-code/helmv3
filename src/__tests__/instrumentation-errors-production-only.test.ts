import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The server's Sentry setup (src/instrumentation.ts) sends production's errors and no other environment's, on both
 * runtimes. The rule is tested in lib/__tests__/sentry-environment.test.ts; this is the wiring into `beforeSend`.
 */

const mocks = vi.hoisted(() => ({
  init: vi.fn(),
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
vi.mock('@/lib/admin/deploy-marker', () => ({ recordDeployMarker: mocks.recordDeployMarker }));
vi.mock('@/lib/observability/register-process-error-handlers', () => ({
  registerProcessErrorHandlers: mocks.registerProcessErrorHandlers,
}));

import { register } from '@/instrumentation';

type InitOptions = {
  beforeSend: (event: Record<string, unknown>, hint?: Record<string, unknown>) => unknown;
  beforeSendLog: (log: Record<string, unknown>) => unknown;
};

async function initOptionsFor(runtime: 'nodejs' | 'edge'): Promise<InitOptions> {
  vi.stubEnv('NEXT_RUNTIME', runtime);
  await register();
  return mocks.init.mock.calls.at(-1)![0] as InitOptions;
}

function errorEvent(environment: string): Record<string, unknown> {
  return {
    environment,
    exception: { values: [{ type: 'TypeError', value: "Cannot read properties of undefined (reading 'id')" }] },
  };
}

describe('instrumentation (server): only production errors go to Sentry', () => {
  let consoleLog: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    mocks.init.mockClear();
  });
  afterEach(() => {
    consoleLog.mockRestore();
    vi.unstubAllEnvs();
  });

  for (const runtime of ['nodejs', 'edge'] as const) {
    describe(`${runtime} runtime`, () => {
      it('sends a production error', async () => {
        const { beforeSend } = await initOptionsFor(runtime);
        expect(beforeSend(errorEvent('production'), {})).not.toBeNull();
      });

      it.each(['preview', 'development', 'local-production-build'])('drops a %s error', async (environment) => {
        const { beforeSend } = await initOptionsFor(runtime);
        expect(beforeSend(errorEvent(environment), {})).toBeNull();
      });

      it('sends a preview error again when NEXT_PUBLIC_SENTRY_ERRORS_ALL_ENVIRONMENTS is on', async () => {
        vi.stubEnv('NEXT_PUBLIC_SENTRY_ERRORS_ALL_ENVIRONMENTS', '1');
        const { beforeSend } = await initOptionsFor(runtime);
        expect(beforeSend(errorEvent('preview'), {})).not.toBeNull();
      });

      it('leaves logs alone', async () => {
        const { beforeSendLog } = await initOptionsFor(runtime);
        expect(beforeSendLog({ level: 'error', message: 'preview log', attributes: { feature: 'auth' } })).not.toBeNull();
      });
    });
  }
});
