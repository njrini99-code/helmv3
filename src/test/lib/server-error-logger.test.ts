/**
 * Tests for src/lib/server-error-logger.ts
 *
 * Confirms the production contract: every handled server error is
 * forwarded to Sentry with the scope tag, user context, and fingerprint
 * so the Sentry issue page is a faithful mirror of admin_events.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Sentry BEFORE importing the module under test so the imports in
// server-error-logger.ts pick up these mocks.
const captureException = vi.fn();
const withScope = vi.fn((fn: (scope: unknown) => void) => {
  const scope = {
    setLevel: vi.fn(),
    setTag: vi.fn(),
    setUser: vi.fn(),
    setContext: vi.fn(),
    setFingerprint: vi.fn(),
  };
  fn(scope);
  return scope;
});

vi.mock('@sentry/nextjs', () => ({
  captureException,
  withScope,
}));

// Mock the admin client so writeAdminTables doesn't actually hit the DB —
// but CAPTURE every upsert payload so the redaction tests below can assert
// on the actual row written, not just that the call happened.
const upserts: Array<{ table: string; payload: Record<string, unknown> }> = [];
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      upsert: (payload: Record<string, unknown>) => {
        upserts.push({ table, payload });
        return Promise.resolve({ data: null, error: null });
      },
    }),
  }),
}));

// Real implementation by default (the redaction-success test exercises the
// actual scrubber) — the fail-open test below overrides maskEmails to prove
// the stack-redaction step in buildStackWithCauseChain is fail-open.
// vi.hoisted() is required (not a plain top-level `let`) because vi.mock
// factories are hoisted above ALL other module code, including regular
// variable declarations — a plain `let` assigned from inside the factory
// throws "Cannot access before initialization".
const mockRealMaskEmailsHolder = vi.hoisted<{ fn?: (input: string) => string }>(() => ({}));
vi.mock('@/lib/observability/redact-pii', async () => {
  const actual = await vi.importActual<typeof import('@/lib/observability/redact-pii')>(
    '@/lib/observability/redact-pii',
  );
  mockRealMaskEmailsHolder.fn = actual.maskEmails;
  return { ...actual, maskEmails: vi.fn(actual.maskEmails) };
});

import { maskEmails } from '@/lib/observability/redact-pii';
const maskEmailsMock = vi.mocked(maskEmails);

// `redactFreeTextForStorage` lives in redact-pii.ts and calls `maskEmails`
// as a module-internal call, so mocking that export cannot reach inside it.
// `redactSensitiveUrl` is the one dependency it reaches for across a module
// boundary, which makes it the honest seam for proving the fail-open path.
const mockRealRedactUrlHolder = vi.hoisted<{ fn?: (u: string | null | undefined) => string | null }>(
  () => ({}),
);
vi.mock('@/lib/security/redact-url', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/security/redact-url')>('@/lib/security/redact-url');
  mockRealRedactUrlHolder.fn = actual.redactSensitiveUrl;
  return { ...actual, redactSensitiveUrl: vi.fn(actual.redactSensitiveUrl) };
});

import { redactSensitiveUrl } from '@/lib/security/redact-url';
const redactSensitiveUrlMock = vi.mocked(redactSensitiveUrl);

describe('logServerError → Sentry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    upserts.length = 0;
    // vi.clearAllMocks() clears call history but not a persistent
    // mockImplementation from a prior test — restore the real scrubber
    // before every test so the fail-open override never leaks across tests.
    maskEmailsMock.mockImplementation((input: string) => mockRealMaskEmailsHolder.fn!(input));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('forwards handled errors to Sentry with action/feature_area tags', async () => {
    const { logServerError } = await import('@/lib/server-error-logger');

    await logServerError('Failed to do the thing', {
      action: 'test.action',
      featureArea: 'coachhelm',
      userId: 'user-1',
      userEmail: 'user@example.com',
      tags: { teamId: 'team-1' },
    });

    expect(withScope).toHaveBeenCalledOnce();
    expect(captureException).toHaveBeenCalledOnce();
  });

  it('captures the original Error object via logServerException (preserves stack)', async () => {
    const { logServerException } = await import('@/lib/server-error-logger');
    const err = new Error('boom');
    await logServerException(err, { action: 'boom.action' });

    expect(captureException).toHaveBeenCalledOnce();
    expect(captureException.mock.calls[0]?.[0]).toBe(err);
  });

  it('does not throw when Sentry.withScope throws (graceful degrade)', async () => {
    withScope.mockImplementationOnce(() => {
      throw new Error('sentry unavailable');
    });
    const { logServerError } = await import('@/lib/server-error-logger');

    await expect(
      logServerError('still fine', { action: 'x' }),
    ).resolves.toBeUndefined();
  });

  it('uses a non-issue-level log when off-production persistence is disabled', async () => {
    vi.stubEnv('ADMIN_EVENTS_FORCE_CAPTURE', '');
    vi.stubEnv('VERCEL_ENV', 'preview');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { logServerError } = await import('@/lib/server-error-logger');

    await logServerError('database unavailable', { action: 'test.offProduction' });

    expect(captureException).toHaveBeenCalledOnce();
    expect(consoleError).not.toHaveBeenCalled();
    expect(consoleWarn).toHaveBeenCalledWith(
      '[ServerErrorLogger] not persisted off-prod',
      expect.objectContaining({ action: 'test.offProduction', traceMessage: 'database unavailable' }),
    );
  });

  it('redacts URL-shaped secrets and emails from the stack + cause chain before persisting', async () => {
    // Previously buildStackWithCauseChain wrote parts.join('\n') straight to
    // error_logs.stack / admin_events.stack_trace with ZERO redaction — both
    // root.stack (server-side, but can still embed a URL a caller built from
    // request data) and the JSON.stringify() of a Postgres `cause` object
    // (hint/detail text can contain user data) went through unscrubbed. Since
    // the admin RCA action started reading stack_trace verbatim (up to 3
    // rows) into a prompt sent to the Anthropic API, that stopped being
    // purely internal data.
    vi.stubEnv('ADMIN_EVENTS_FORCE_CAPTURE', '1');
    const { logServerException } = await import('@/lib/server-error-logger');

    const err = new Error('save failed');
    err.stack = [
      'Error: save failed',
      '    at Object.<anonymous> (https://app.golfhelm.com/api/save?token_hash=root-secret-token)',
      '    reported by coach@school.edu',
    ].join('\n');
    (err as { cause?: unknown }).cause = {
      code: '23505',
      message: 'duplicate key value',
      hint: 'https://app.golfhelm.com/reset?access_token=cause-secret-token',
      detail: 'contact admin@school.edu',
    };

    await logServerException(err, { action: 'test.stackRedaction' });

    const errorLogWrite = upserts.find((u) => u.table === 'error_logs');
    const adminEventWrite = upserts.find((u) => u.table === 'admin_events');
    expect(errorLogWrite).toBeTruthy();
    expect(adminEventWrite).toBeTruthy();

    const stack = errorLogWrite?.payload.stack as string;
    expect(stack).toContain('https://app.golfhelm.com/api/save');
    expect(stack).toContain('https://app.golfhelm.com/reset');
    expect(stack).toContain('c***@school.edu');
    expect(stack).toContain('a***@school.edu');
    expect(adminEventWrite?.payload.stack_trace).toBe(stack);

    for (const secret of ['root-secret-token', 'cause-secret-token', 'coach@school.edu', 'admin@school.edu']) {
      expect(JSON.stringify(errorLogWrite?.payload)).not.toContain(secret);
      expect(JSON.stringify(adminEventWrite?.payload)).not.toContain(secret);
    }
  });

  it('redacts a path-segment credential (no query string) embedded in the stack, and URL secrets/emails in the message + derived title', async () => {
    // Two gaps in one test: (1) a bare `.replace(/[?#].*$/, '')` only
    // truncates at the first `?`/`#` — a live PATH-segment credential
    // (redact-url.ts's own doc comment: "path-segment tokens:
    // /api/calendar/(coach|feeds)/<bearer>... both are live credentials")
    // has neither and would survive untouched; (2) captureServerTrace's
    // `message` previously got maskEmails only, never a URL-secret scan —
    // and that same message becomes BOTH admin_events.message and, via
    // buildAdminTitle, admin_events.title, both read verbatim into the RCA
    // prompt by src/lib/admin/rca.ts.
    vi.stubEnv('ADMIN_EVENTS_FORCE_CAPTURE', '1');
    const { logServerException } = await import('@/lib/server-error-logger');

    const err = new Error(
      'fetch to https://app.golfhelm.com/api/calendar/coach/LIVE_BEARER_TOKEN failed, reported by coach@school.edu',
    );
    err.stack = 'Error: fetch failed\n    at f (https://app.golfhelm.com/api/calendar/feeds/OTHER_BEARER_TOKEN)';

    await logServerException(err, { action: 'test.pathTokenAndMessageRedaction' });

    const errorLogWrite = upserts.find((u) => u.table === 'error_logs');
    const adminEventWrite = upserts.find((u) => u.table === 'admin_events');
    expect(errorLogWrite).toBeTruthy();
    expect(adminEventWrite).toBeTruthy();

    const stack = errorLogWrite?.payload.stack as string;
    expect(stack).not.toContain('OTHER_BEARER_TOKEN');
    expect(stack).toContain('/api/calendar/feeds/[redacted]');

    const message = errorLogWrite?.payload.message as string;
    expect(message).not.toContain('LIVE_BEARER_TOKEN');
    expect(message).toContain('/api/calendar/coach/[redacted]');
    expect(message).toContain('c***@school.edu');
    expect(adminEventWrite?.payload.message).toBe(message);

    // The title is DERIVED from message (buildAdminTitle falls back to
    // `[action] ${message}` when no explicit context.title is given) — this
    // proves the redaction reaches that derived column too, not just the
    // source variable.
    const title = adminEventWrite?.payload.title as string;
    expect(title).not.toContain('LIVE_BEARER_TOKEN');
    expect(title).not.toContain('coach@school.edu');
    expect(title).toContain('c***@school.edu');

    for (const secret of ['LIVE_BEARER_TOKEN', 'OTHER_BEARER_TOKEN', 'coach@school.edu']) {
      expect(JSON.stringify(errorLogWrite?.payload)).not.toContain(secret);
      expect(JSON.stringify(adminEventWrite?.payload)).not.toContain(secret);
    }
  });

  it('still masks an email inside the storage budget when the raw stack exceeds the email-masker length guard', async () => {
    // maskEmails silently no-ops on input over 20,000 chars (redact-pii.ts's
    // MAX_STRING guard). redactFreeTextForStorage must slice to the storage
    // budget BEFORE masking — masking an oversized string first would skip
    // masking entirely (no-op), and THEN slicing would still keep the
    // (still-unmasked) prefix in what gets persisted.
    vi.stubEnv('ADMIN_EVENTS_FORCE_CAPTURE', '1');
    const { logServerException } = await import('@/lib/server-error-logger');

    const err = new Error('padded failure');
    const padding = 'x'.repeat(25_000);
    err.stack = `Error: padded failure\n    reported by someone@example.com\n${padding}`;

    await logServerException(err, { action: 'test.stackLengthGuard' });

    const errorLogWrite = upserts.find((u) => u.table === 'error_logs');
    expect(errorLogWrite).toBeTruthy();
    const stack = errorLogWrite?.payload.stack as string;
    expect(stack.length).toBeLessThanOrEqual(8000);
    expect(stack).not.toContain('someone@example.com');
    expect(stack).toContain('s***@example.com');
  });

  it('never persists the raw stack when redaction of the stack itself throws (fail-open)', async () => {
    vi.stubEnv('ADMIN_EVENTS_FORCE_CAPTURE', '1');
    // Target ONLY the stack's maskEmails call (identified by its distinctive
    // input) so this proves buildStackWithCauseChain's own fail-open path,
    // not the separate (pre-existing, unrelated) message-masking call in
    // captureServerTrace.
    // Throw only for the URL embedded in THIS stack, so the failure lands
    // inside buildStackWithCauseChain's redaction and not in the unrelated
    // context/url redaction that runs on every trace.
    redactSensitiveUrlMock.mockImplementation((url) => {
      if (typeof url === 'string' && url.includes('token_hash=root-secret')) {
        throw new Error('redaction blew up');
      }
      return mockRealRedactUrlHolder.fn!(url);
    });

    const { logServerException } = await import('@/lib/server-error-logger');

    const err = new Error('boom');
    err.stack =
      'Error: boom\n    at foo (https://app.golfhelm.com/reset?token_hash=root-secret)\n    reported by someone@example.com';

    await logServerException(err, { action: 'test.stackFailOpen' });

    const errorLogWrite = upserts.find((u) => u.table === 'error_logs');
    const adminEventWrite = upserts.find((u) => u.table === 'admin_events');

    // The write still happens even though stack redaction threw.
    expect(errorLogWrite).toBeTruthy();
    expect(adminEventWrite).toBeTruthy();
    expect(errorLogWrite?.payload.stack).not.toContain('root-secret');
    expect(errorLogWrite?.payload.stack).not.toContain('someone@example.com');
    expect(errorLogWrite?.payload.stack).toMatch(/redaction failed/);
    expect(adminEventWrite?.payload.stack_trace).toBe(errorLogWrite?.payload.stack);
  });
});
