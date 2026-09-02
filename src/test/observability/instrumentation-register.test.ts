import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * register() used to `void` the start-up Inngest credential report. It runs
 * before the first request, with no request scope, so the write took the
 * awaited fallback — and nothing awaited THAT. On a function frozen after
 * start-up the row never landed, while the throttle window the report had
 * already opened silenced the next `send`/`inbound` report for 60s. These pin
 * the fix: register() awaits the report (bounded inside scheduleBridgeWrite),
 * never rejects because of it, and does not hold the process-level handlers
 * back while it waits.
 */
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

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('instrumentation register() — start-up Inngest credential report', () => {
  let consoleLog: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    mocks.reportInngestCredentialFault.mockReset();
    mocks.reportInngestCredentialFault.mockImplementation(async () => true);
    mocks.registerProcessErrorHandlers.mockClear();
  });
  afterEach(() => {
    consoleLog.mockRestore();
    vi.unstubAllEnvs();
  });

  it('AWAITS the start-up report — register() resolves only after it has', async () => {
    let finishReport!: (v: boolean) => void;
    mocks.reportInngestCredentialFault.mockImplementation(
      () => new Promise<boolean>((resolve) => { finishReport = resolve; }),
    );
    let registered = false;
    const pending = register().then(() => { registered = true; });

    await vi.waitFor(() => expect(mocks.reportInngestCredentialFault).toHaveBeenCalledWith('startup'));
    // The process-level handlers are not held back behind the report.
    await vi.waitFor(() => expect(mocks.registerProcessErrorHandlers).toHaveBeenCalledTimes(1));
    await tick();
    expect(registered).toBe(false);

    finishReport(true);
    await pending;
    expect(registered).toBe(true);
  });

  it('never rejects because of the report', async () => {
    mocks.reportInngestCredentialFault.mockRejectedValue(new Error('bridge down'));
    await expect(register()).resolves.toBeUndefined();
  });

  it('does not run the report on the edge runtime', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'edge');
    await register();
    expect(mocks.reportInngestCredentialFault).not.toHaveBeenCalled();
  });
});
