import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Fingerprint suite for the SERVER instrumentation entrypoint
 * (src/instrumentation.ts)'s `beforeSend` (`scrubPii`), covering the
 * Supabase-legacy-key grouping rule added alongside the existing
 * `fingerprintByPostgresCode` (see instrumentation.ts around line 195 for
 * that pattern, which this one copies the shape of).
 *
 * On 2026-09-06 21:27-21:43 UTC the owner disabled Supabase legacy API keys
 * while Vercel still held one, and production threw "Legacy API keys are
 * disabled" from at least four unrelated call paths, each landing as its own
 * Sentry issue. This suite asserts the fingerprint rule collapses them into
 * one, without disturbing `fingerprintByPostgresCode` or an already-set
 * deliberate fingerprint.
 *
 * Same mocking pattern as instrumentation-privacy-sentinel.test.ts — that
 * file covers PII scrubbing via this same `beforeSend`; this one covers
 * grouping.
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

type SentryErrorEventLike = {
  fingerprint?: string[];
  tags?: Record<string, unknown>;
  message?: string;
  exception?: { values?: Array<{ value?: string }> };
};
type SentryInitOptions = {
  beforeSend?: (event: SentryErrorEventLike) => SentryErrorEventLike | null;
};

async function initOptionsForRuntime(runtime: 'nodejs' | 'edge'): Promise<SentryInitOptions> {
  vi.stubEnv('NEXT_RUNTIME', runtime);
  await register();
  const call = mocks.init.mock.calls.at(-1);
  return (call?.[0] ?? {}) as SentryInitOptions;
}

describe('instrumentation fingerprinting (server) — Supabase legacy-key grouping', () => {
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
      it('groups a plain "Legacy API keys are disabled" message', async () => {
        const { beforeSend } = await initOptionsForRuntime(runtime);
        const event: SentryErrorEventLike = {
          message: 'Legacy API keys are disabled',
        };
        const out = beforeSend!(event)!;
        expect(out.fingerprint).toEqual(['{{ default }}', 'supabase:legacy-keys-disabled']);
        expect(out.tags?.supabase_key_error).toBe('legacy_disabled');
      });

      it('groups the message when wrapped inside another string (presence heartbeat msg=...)', async () => {
        const { beforeSend } = await initOptionsForRuntime(runtime);
        const event: SentryErrorEventLike = {
          message: 'presence heartbeat failed: msg=Legacy API keys are disabled code=401',
        };
        const out = beforeSend!(event)!;
        expect(out.fingerprint).toEqual(['{{ default }}', 'supabase:legacy-keys-disabled']);
        expect(out.tags?.supabase_key_error).toBe('legacy_disabled');
      });

      it('matches case-insensitively and inside an exception value', async () => {
        const { beforeSend } = await initOptionsForRuntime(runtime);
        const event: SentryErrorEventLike = {
          exception: { values: [{ value: 'LEGACY API KEYS ARE DISABLED for this project' }] },
        };
        const out = beforeSend!(event)!;
        expect(out.fingerprint).toEqual(['{{ default }}', 'supabase:legacy-keys-disabled']);
      });

      it('groups the sibling "Invalid API key" message under its own fingerprint', async () => {
        const { beforeSend } = await initOptionsForRuntime(runtime);
        const event: SentryErrorEventLike = {
          message: 'Invalid API key',
        };
        const out = beforeSend!(event)!;
        expect(out.fingerprint).toEqual(['{{ default }}', 'supabase:invalid-api-key']);
        expect(out.tags?.supabase_key_error).toBe('invalid');
      });

      it('never overrides an existing deliberate fingerprint', async () => {
        const { beforeSend } = await initOptionsForRuntime(runtime);
        const event: SentryErrorEventLike = {
          message: 'Legacy API keys are disabled',
          fingerprint: ['already-set'],
        };
        const out = beforeSend!(event)!;
        expect(out.fingerprint).toEqual(['already-set']);
        expect(out.tags?.supabase_key_error).toBeUndefined();
      });

      it('leaves an unrelated error untouched', async () => {
        const { beforeSend } = await initOptionsForRuntime(runtime);
        const event: SentryErrorEventLike = {
          message: 'TypeError: cannot read property of undefined',
        };
        const out = beforeSend!(event)!;
        expect(out.fingerprint).toBeUndefined();
        expect(out.tags?.supabase_key_error).toBeUndefined();
      });
    });
  }
});
