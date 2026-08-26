import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

// Real implementation by default (so the redaction-success tests exercise the
// actual scrubber) — some tests below override redactPiiDeep or maskEmails
// with mockImplementationOnce to prove the route's redaction steps are
// fail-open.
vi.mock('@/lib/observability/redact-pii', async () => {
  const actual = await vi.importActual<typeof import('@/lib/observability/redact-pii')>(
    '@/lib/observability/redact-pii',
  );
  return { ...actual, redactPiiDeep: vi.fn(actual.redactPiiDeep), maskEmails: vi.fn(actual.maskEmails) };
});

import { POST } from '@/app/api/log-error/route';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { buildIncidentSignature } from '@/lib/admin/incident-grouping';
// `redactFreeTextForStorage` now lives in redact-pii.ts and calls
// `maskEmails` internally, so mocking that export cannot reach inside it.
// `redactSensitiveUrl` is the one dependency it crosses a module boundary
// for, which makes it the honest seam for forcing the fail-open path.
const mockRealRedactUrlHolder = vi.hoisted<{ fn?: (u: string) => string }>(() => ({}));
vi.mock('@/lib/security/redact-url', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/security/redact-url')>('@/lib/security/redact-url');
  mockRealRedactUrlHolder.fn = actual.redactSensitiveUrl as (u: string) => string;
  return { ...actual, redactSensitiveUrl: vi.fn(actual.redactSensitiveUrl) };
});

import { redactPiiDeep } from '@/lib/observability/redact-pii';

const createClientMock = vi.mocked(createClient);
const createAdminMock = vi.mocked(createAdminClient);
const redactPiiDeepMock = vi.mocked(redactPiiDeep);
import { redactSensitiveUrl } from '@/lib/security/redact-url';
const redactSensitiveUrlMock = vi.mocked(redactSensitiveUrl);

function request(body: string) {
  return new Request('http://x/api/log-error', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  }) as never;
}

function mockAnonymousUser() {
  createClientMock.mockResolvedValueOnce({
    auth: {
      getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
    },
  } as never);
}

describe('POST /api/log-error', () => {
  beforeEach(() => {
    createClientMock.mockReset();
    createAdminMock.mockReset();
    // The route is prod-gated by shouldPersistAdminTables(); the force-capture
    // hatch keeps these tests exercising the real persistence path.
    vi.stubEnv('ADMIN_EVENTS_FORCE_CAPTURE', '1');
  });
  afterEach(() => { vi.unstubAllEnvs(); });

  it('accepts anonymous requests, flags them, and caps severity below critical', async () => {
    // W7: unauthenticated client errors (login/signup flow failures) were
    // previously 401'd here — invisible to error_logs/admin_events even
    // though Sentry saw them. Anonymous writes are now accepted, flagged
    // `anonymous: true`, and severity-capped so a spoofed "critical" claim
    // from a logged-out client can never page the on-call team.
    createClientMock.mockResolvedValueOnce({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
      },
    } as never);

    const inserts: Array<{ table: string; payload: Record<string, unknown> }> = [];
    createAdminMock.mockReturnValueOnce({
      from: vi.fn((table: string) => ({
        insert: vi.fn(async (payload: Record<string, unknown>) => {
          inserts.push({ table, payload });
          return { error: null };
        }),
      })),
    } as never);

    const res = await POST(request(JSON.stringify({
      message: 'anonymous client crash',
      severity: 'critical',
    })));

    expect(res.status).toBe(200);
    const errorLog = inserts.find((i) => i.table === 'error_logs');
    const adminEvent = inserts.find((i) => i.table === 'admin_events');
    expect(errorLog?.payload.user_id).toBeNull();
    expect(adminEvent?.payload.user_id).toBeNull();
    expect(adminEvent?.payload.user_email).toBeNull();
    expect(adminEvent?.payload.severity).toBe('error');
    expect((errorLog?.payload.context as Record<string, unknown> | null)?.anonymous).toBe(true);
  });

  it('computes an incident-grouping fingerprint on the admin_events row so repeats collapse', async () => {
    createClientMock.mockResolvedValueOnce({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
      },
    } as never);

    const inserts: Array<{ table: string; payload: Record<string, unknown> }> = [];
    createAdminMock.mockReturnValueOnce({
      from: vi.fn((table: string) => ({
        insert: vi.fn(async (payload: Record<string, unknown>) => {
          inserts.push({ table, payload });
          return { error: null };
        }),
      })),
    } as never);

    const res = await POST(request(JSON.stringify({
      message: 'network error',
      severity: 'medium',
      url: '/golf/dashboard',
    })));

    expect(res.status).toBe(200);
    const adminEvent = inserts.find((i) => i.table === 'admin_events');
    const expectedFingerprint = buildIncidentSignature({
      severity: 'warning',
      errorCode: null,
      route: '/golf/dashboard',
      message: 'network error',
    });
    expect(adminEvent?.payload.fingerprint).toBe(expectedFingerprint);
    expect(adminEvent?.payload.source).toBe('client');
  });

  it('gives repeated client errors for the same route+message the same fingerprint', async () => {
    createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
      },
    } as never);

    const inserts: Array<{ table: string; payload: Record<string, unknown> }> = [];
    createAdminMock.mockReturnValue({
      from: vi.fn((table: string) => ({
        insert: vi.fn(async (payload: Record<string, unknown>) => {
          inserts.push({ table, payload });
          return { error: null };
        }),
      })),
    } as never);

    const body = JSON.stringify({
      message: 'network error',
      severity: 'medium',
      url: '/golf/dashboard',
    });
    await POST(request(body));
    await POST(request(body));

    const fingerprints = inserts
      .filter((i) => i.table === 'admin_events')
      .map((i) => i.payload.fingerprint);
    expect(fingerprints).toHaveLength(2);
    expect(fingerprints[0]).toBe(fingerprints[1]);
    expect(fingerprints[0]).toBeTruthy();
  });

  it('binds telemetry rows to the authenticated user rather than trusting the body', async () => {
    createClientMock.mockResolvedValueOnce({
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: { id: 'real-user', email: 'real@example.com' } },
          error: null,
        })),
      },
    } as never);

    const inserts: Array<{ table: string; payload: Record<string, unknown> }> = [];
    createAdminMock.mockReturnValueOnce({
      from: vi.fn((table: string) => ({
        insert: vi.fn(async (payload: Record<string, unknown>) => {
          inserts.push({ table, payload });
          return { error: null };
        }),
      })),
    } as never);

    const res = await POST(request(JSON.stringify({
      message: 'poison attempt',
      severity: 'critical',
      user_id: 'attacker-controlled',
    })));

    expect(res.status).toBe(200);
    expect(inserts).toHaveLength(2);
    expect(inserts.find((i) => i.table === 'error_logs')?.payload.user_id).toBe('real-user');
    expect(inserts.find((i) => i.table === 'admin_events')?.payload.user_id).toBe('real-user');
    expect(inserts.find((i) => i.table === 'admin_events')?.payload.user_email).toBe('real@example.com');
  });

  it('returns 204 for an empty/aborted-beacon body instead of a 500', async () => {
    // Aborted sendBeacon flushes (tab close, navigation) can arrive with an
    // empty body. request.json() throws "Unexpected end of JSON input" on
    // that, which used to fall through to the bare catch and return a
    // generic 500 for what is really a client-side no-op.
    mockAnonymousUser();
    createAdminMock.mockReset();

    const res = await POST(request(''));

    expect(res.status).toBe(204);
    expect(createAdminMock).not.toHaveBeenCalled();
  });

  it('returns 400 for malformed JSON without a 500', async () => {
    mockAnonymousUser();
    createAdminMock.mockReset();

    const res = await POST(request('{not valid json'));

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Invalid JSON');
    expect(createAdminMock).not.toHaveBeenCalled();
  });

  it('returns 400 for well-formed JSON that is not an object', async () => {
    mockAnonymousUser();
    createAdminMock.mockReset();

    const res = await POST(request(JSON.stringify(['not', 'an', 'object'])));

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Invalid payload');
    expect(createAdminMock).not.toHaveBeenCalled();
  });

  it('redacts magic-link tokens from the URL/referrer/location and masks emails in context before persisting', async () => {
    // The URL/referrer/location a client reports can carry a Supabase
    // magic-link token, an OTP, or an OAuth code (?token_hash=...,
    // #access_token=...) — none of that belongs in error_logs/admin_events.
    // Browser diagnostics can also carry an email address in free text.
    mockAnonymousUser();

    const inserts: Array<{ table: string; payload: Record<string, unknown> }> = [];
    createAdminMock.mockReturnValueOnce({
      from: vi.fn((table: string) => ({
        insert: vi.fn(async (payload: Record<string, unknown>) => {
          inserts.push({ table, payload });
          return { error: null };
        }),
      })),
    } as never);

    const res = await POST(request(JSON.stringify({
      message: 'signed in but crashed, reported by coach@school.edu',
      severity: 'medium',
      url: '/golf/auth/confirm?token_hash=super-secret-token&type=magiclink',
      context: {
        location: {
          href: 'https://app.golfhelm.com/golf/auth/confirm?token_hash=super-secret-token&type=magiclink#access_token=abc123',
          referrer: 'https://mail.google.com/mail/u/0/?token=reset-token-xyz',
          // getBrowserDiagnostics() sends these as their own standalone
          // fields too, not just embedded in href — a walker that only
          // recognized a full URL shape would let a bare query/fragment
          // straight through.
          search: '?token_hash=super-secret-token&type=magiclink',
          hash: '#access_token=abc123',
        },
        note: 'reported by coach@school.edu',
      },
    })));

    expect(res.status).toBe(200);
    const errorLog = inserts.find((i) => i.table === 'error_logs');
    const adminEvent = inserts.find((i) => i.table === 'admin_events');

    // The write still happens — redaction is not a reason to drop the log.
    expect(errorLog).toBeTruthy();
    expect(adminEvent).toBeTruthy();

    expect(errorLog?.payload.url).toBe('/golf/auth/confirm');
    expect(adminEvent?.payload.url).toBe('/golf/auth/confirm');

    const context = errorLog?.payload.context as Record<string, unknown>;
    const location = context.location as Record<string, unknown>;
    expect(location.href).toBe('https://app.golfhelm.com/golf/auth/confirm');
    expect(location.referrer).toBe('https://mail.google.com/mail/u/0/');
    expect(location.search).toBe('');
    expect(location.hash).toBe('');
    expect(context.note).toBe('reported by c***@school.edu');

    // The top-level message column is masked too — the same string also
    // lands in admin_events.title, which is built from `message` directly.
    expect(errorLog?.payload.message).toBe('signed in but crashed, reported by c***@school.edu');
    expect(adminEvent?.payload.title).toContain('c***@school.edu');
    expect(adminEvent?.payload.title).not.toContain('coach@school.edu');

    const serialized = JSON.stringify({ ...errorLog?.payload, context: undefined });
    const contextSerialized = JSON.stringify(errorLog?.payload.context);
    for (const secret of ['super-secret-token', 'access_token', 'reset-token-xyz', 'coach@school.edu']) {
      expect(serialized).not.toContain(secret);
      expect(contextSerialized).not.toContain(secret);
    }
  });

  it('redacts URL-shaped secrets embedded in the stack trace and message before persisting', async () => {
    // Previously `stack` bypassed ALL redaction (unlike `url`/`context`
    // above) and `message` got only maskEmails, never stripUrlSecrets — so a
    // magic-link/OAuth token riding in a client-supplied stack or message
    // reached error_logs/admin_events verbatim. Since the admin RCA action
    // started reading stack_trace verbatim into an Anthropic prompt, that
    // gap stopped being purely internal.
    mockAnonymousUser();

    const inserts: Array<{ table: string; payload: Record<string, unknown> }> = [];
    createAdminMock.mockReturnValueOnce({
      from: vi.fn((table: string) => ({
        insert: vi.fn(async (payload: Record<string, unknown>) => {
          inserts.push({ table, payload });
          return { error: null };
        }),
      })),
    } as never);

    const stack = [
      'Error: https://app.golfhelm.com/auth/confirm?token_hash=stack-secret-token',
      '    at Object.<anonymous> (/app/src/foo.ts:10:5)',
      '    reported by coach@school.edu',
    ].join('\n');

    const res = await POST(request(JSON.stringify({
      message: 'redirect failed for /confirm?access_token=message-secret-token',
      stack,
      severity: 'medium',
    })));

    expect(res.status).toBe(200);
    const errorLog = inserts.find((i) => i.table === 'error_logs');
    const adminEvent = inserts.find((i) => i.table === 'admin_events');

    // The write still happens — redaction is not a reason to drop the log.
    expect(errorLog).toBeTruthy();
    expect(adminEvent).toBeTruthy();

    expect(errorLog?.payload.stack).toContain('https://app.golfhelm.com/auth/confirm');
    expect(errorLog?.payload.stack).not.toContain('token_hash');
    expect(errorLog?.payload.stack).toContain('c***@school.edu');
    expect(errorLog?.payload.stack).not.toContain('coach@school.edu');
    expect(adminEvent?.payload.stack_trace).toBe(errorLog?.payload.stack);

    expect(errorLog?.payload.message).not.toContain('access_token');
    expect(adminEvent?.payload.title).not.toContain('access_token');

    for (const secret of ['stack-secret-token', 'message-secret-token', 'coach@school.edu']) {
      expect(JSON.stringify(errorLog?.payload)).not.toContain(secret);
      expect(JSON.stringify(adminEvent?.payload)).not.toContain(secret);
    }
  });

  it('redacts a path-segment credential (no query string) embedded in the stack trace', async () => {
    // stripUrlSecrets alone only truncates at the first `?`/`#` — a live
    // PATH-segment credential has neither. redact-url.ts's own doc comment:
    // "path-segment tokens: /api/calendar/(coach|feeds)/<bearer>... both
    // are live credentials". `url` already gets this treatment via
    // redactSensitiveUrl; the embedded-in-stack scan must too.
    mockAnonymousUser();

    const inserts: Array<{ table: string; payload: Record<string, unknown> }> = [];
    createAdminMock.mockReturnValueOnce({
      from: vi.fn((table: string) => ({
        insert: vi.fn(async (payload: Record<string, unknown>) => {
          inserts.push({ table, payload });
          return { error: null };
        }),
      })),
    } as never);

    const stack = [
      'Error: calendar feed fetch failed',
      '    at f (https://app.golfhelm.com/api/calendar/coach/LIVE_BEARER_TOKEN)',
    ].join('\n');

    const res = await POST(request(JSON.stringify({
      message: 'calendar feed fetch failed',
      stack,
      severity: 'medium',
    })));

    expect(res.status).toBe(200);
    const errorLog = inserts.find((i) => i.table === 'error_logs');
    expect(errorLog).toBeTruthy();
    expect(errorLog?.payload.stack).not.toContain('LIVE_BEARER_TOKEN');
    expect(errorLog?.payload.stack).toContain('/api/calendar/coach/[redacted]');
  });

  it('still masks an email inside the storage budget when a client-supplied stack exceeds the email-masker length guard', async () => {
    // maskEmails silently no-ops on input over 20,000 chars (redact-pii.ts's
    // MAX_STRING guard). redactFreeTextForStorage must slice to the storage
    // budget BEFORE masking — masking an oversized string first would skip
    // masking entirely, and slicing afterward would still keep the
    // (still-unmasked) prefix. The client fully controls stack length here.
    mockAnonymousUser();

    const inserts: Array<{ table: string; payload: Record<string, unknown> }> = [];
    createAdminMock.mockReturnValueOnce({
      from: vi.fn((table: string) => ({
        insert: vi.fn(async (payload: Record<string, unknown>) => {
          inserts.push({ table, payload });
          return { error: null };
        }),
      })),
    } as never);

    const padding = 'x'.repeat(25_000);
    const stack = `Error: padded failure\n    reported by someone@example.com\n${padding}`;

    const res = await POST(request(JSON.stringify({
      message: 'padded failure',
      stack,
      severity: 'medium',
    })));

    expect(res.status).toBe(200);
    const errorLog = inserts.find((i) => i.table === 'error_logs');
    expect(errorLog).toBeTruthy();
    const storedStack = errorLog?.payload.stack as string;
    expect(storedStack.length).toBeLessThanOrEqual(8000);
    expect(storedStack).not.toContain('someone@example.com');
    expect(storedStack).toContain('s***@example.com');
  });

  it('never persists the raw stack/message when redaction of that text itself throws (fail-open)', async () => {
    mockAnonymousUser();

    const inserts: Array<{ table: string; payload: Record<string, unknown> }> = [];
    createAdminMock.mockReturnValueOnce({
      from: vi.fn((table: string) => ({
        insert: vi.fn(async (payload: Record<string, unknown>) => {
          inserts.push({ table, payload });
          return { error: null };
        }),
      })),
    } as never);

    // Simulate the email-masking half of redactFreeTextForStorage blowing up
    // on the very first call (the `message` field). A partial fallback like
    // cutting at the first `?`/`#` would not help here since this message
    // has neither — a fixed placeholder is the only fallback that can never
    // leak the raw text.
    redactSensitiveUrlMock.mockImplementation((url) => {
      if (typeof url === 'string' && url.includes('fail-open-probe')) {
        throw new Error('redaction blew up');
      }
      return mockRealRedactUrlHolder.fn!(url as string);
    });

    const res = await POST(request(JSON.stringify({
      message: 'crash reported by someone@example.com https://x.test/?fail-open-probe=1',
      stack: 'Error: https://app.golfhelm.com/reset?token_hash=stack-secret\n    at foo',
      severity: 'medium',
    })));

    expect(res.status).toBe(200);
    const errorLog = inserts.find((i) => i.table === 'error_logs');
    const adminEvent = inserts.find((i) => i.table === 'admin_events');

    // The write still happens even though redaction threw.
    expect(errorLog).toBeTruthy();
    expect(adminEvent).toBeTruthy();
    expect(errorLog?.payload.message).not.toContain('someone@example.com');
    expect(errorLog?.payload.message).toMatch(/redaction failed/);
    expect(adminEvent?.payload.title).not.toContain('someone@example.com');
  });

  it('never drops the log when redaction itself throws (fail-open)', async () => {
    mockAnonymousUser();

    const inserts: Array<{ table: string; payload: Record<string, unknown> }> = [];
    createAdminMock.mockReturnValueOnce({
      from: vi.fn((table: string) => ({
        insert: vi.fn(async (payload: Record<string, unknown>) => {
          inserts.push({ table, payload });
          return { error: null };
        }),
      })),
    } as never);

    redactPiiDeepMock.mockImplementationOnce(() => {
      throw new Error('redaction blew up');
    });

    const res = await POST(request(JSON.stringify({
      message: 'crash during redaction',
      severity: 'medium',
      url: '/golf/dashboard?token=abc',
      context: { note: 'someone@example.com' },
    })));

    expect(res.status).toBe(200);
    const errorLog = inserts.find((i) => i.table === 'error_logs');
    const adminEvent = inserts.find((i) => i.table === 'admin_events');

    // The row is still written even though the redactor threw.
    expect(errorLog).toBeTruthy();
    expect(adminEvent).toBeTruthy();
    // The URL still loses its query string via the cheap fallback split.
    expect(errorLog?.payload.url).toBe('/golf/dashboard');
    // The context is omitted rather than risk unredacted PII escaping — assert
    // the actual invariant (no trace of the raw address anywhere on the row),
    // not just that a `raw` key happens to be absent/null.
    expect((errorLog?.payload.context as Record<string, unknown> | undefined)?.raw ?? null).toBeNull();
    expect(JSON.stringify(errorLog?.payload.context)).not.toContain('someone@example.com');
    expect(JSON.stringify(errorLog?.payload)).not.toContain('someone@example.com');
  });
});
