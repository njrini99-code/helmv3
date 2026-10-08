import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * register() runs before the first request. These pin its Node-runtime
 * start-up contract: it wires the process-level error handlers and records the
 * deploy marker, never rejects because of a failing Bridge write, and does
 * neither on the edge runtime.
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

describe('instrumentation register() — start-up wiring', () => {
  let consoleLog: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    mocks.recordDeployMarker.mockReset();
    mocks.recordDeployMarker.mockImplementation(async () => {});
    mocks.registerProcessErrorHandlers.mockClear();
  });
  afterEach(() => {
    consoleLog.mockRestore();
    vi.unstubAllEnvs();
  });

  it('registers the process-level error handlers and the deploy marker on the node runtime', async () => {
    await register();
    await vi.waitFor(() => expect(mocks.registerProcessErrorHandlers).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(mocks.recordDeployMarker).toHaveBeenCalledTimes(1));
  });

  it('never rejects because the deploy marker write failed', async () => {
    mocks.recordDeployMarker.mockRejectedValue(new Error('bridge down'));
    await expect(register()).resolves.toBeUndefined();
  });

  it('does not register process-level handlers on the edge runtime', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'edge');
    await register();
    expect(mocks.registerProcessErrorHandlers).not.toHaveBeenCalled();
  });
});
