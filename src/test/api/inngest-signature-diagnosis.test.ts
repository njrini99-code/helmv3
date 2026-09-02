import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

/**
 * /api/inngest answers three different callers and must tell them apart.
 *
 * A robot with no signature is not an incident. A signed request whose
 * signature is simply STALE is a clock problem. A signed request inside the
 * time window that still fails is a key problem. The first version of this
 * route reported all three the same way, and the second reported the stale
 * case as "reissue your signing key" — which would send an operator to rotate
 * a credential that was never wrong. These tests pin the distinction.
 */

const logServerError = vi.fn(async (_message: string, _context?: unknown) => {});
const sdkGet = vi.fn(async () => new Response(JSON.stringify({ message: 'Unauthorized' }), { status: 401 }));
const serve = vi.fn(() => ({ GET: sdkGet, POST: sdkGet, PUT: sdkGet }));

/** The real handler is typed for Next's (req, ctx) shape; only `req` matters here. */
const call = (handler: unknown, req: Request) =>
  (handler as (r: Request) => Promise<Response>)(req);

vi.mock('@/lib/server-error-logger', () => ({ logServerError }));
vi.mock('@/lib/inngest/client', () => ({ inngest: {} }));
vi.mock('@/lib/inngest/functions', () => ({ functions: [] }));
vi.mock('inngest/next', () => ({
  serve,
}));

function request(signature?: string) {
  return new Request('https://helm.test/api/inngest', {
    headers: signature ? { 'x-inngest-signature': signature } : {},
  });
}

const signatureAgedSeconds = (seconds: number) =>
  `t=${Math.floor(Date.now() / 1000) - seconds}&s=${'a'.repeat(64)}`;

// A well-formed signing key on OUR side, so the tests below exercise the
// mismatch/skew diagnosis and not the missing-credential branch.
const GOOD_SIGNING_KEY = `signkey-prod-${'0a'.repeat(32)}`;

describe('/api/inngest signature diagnosis', () => {
  beforeEach(() => {
    logServerError.mockClear();
    sdkGet.mockClear();
    serve.mockClear();
    vi.stubEnv('INNGEST_SIGNING_KEY', GOOD_SIGNING_KEY);
    vi.stubEnv('INNGEST_EVENT_KEY', 'E'.repeat(86));
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('pins production discovery to the canonical domain, never a stale deployment URL', async () => {
    vi.resetModules();
    vi.stubEnv('VERCEL_ENV', 'production');

    await import('@/app/api/inngest/route');

    expect(serve).toHaveBeenCalledWith(
      expect.objectContaining({ serveOrigin: 'https://helmsportslabs.com' }),
    );
  });

  // The third caller. With NO signing key on our side the SDK cannot attempt
  // validation — it logs "In cloud mode but no signing key found" and answers
  // 500 — so the 401 diagnosis never fires and, before 2026-09-01, nothing
  // reached admin_events at all (4 Sentry console events after that day's
  // deploy, 0 Bridge rows). It must be named as MISSING, never as a mismatch.
  it('reports a MISSING signing key as provider_inngest_missing_credential in production, not as a mismatch', async () => {
    vi.resetModules();
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('INNGEST_SIGNING_KEY', '');
    sdkGet.mockResolvedValueOnce(new Response('{}', { status: 500 }));
    const { GET } = await import('@/app/api/inngest/route');

    const response = await call(GET, request(signatureAgedSeconds(2)));

    expect(response.status).toBe(500); // the SDK's own answer, untouched
    expect(sdkGet).toHaveBeenCalledTimes(1); // still delegated
    expect(logServerError).toHaveBeenCalledTimes(1);
    const [message, context] = logServerError.mock.calls[0] as [string, Record<string, unknown>];
    expect(message).toMatch(/INNGEST_SIGNING_KEY is missing/);
    expect(message).not.toMatch(/does not match the Inngest app/);
    expect(context).toMatchObject({
      errorCode: 'provider_inngest_missing_credential',
      feature: 'integrations',
      action: 'inngest.credentials.inbound',
    });
  });

  it('says nothing about credentials off production when the key is absent — a preview opts out legitimately', async () => {
    vi.resetModules();
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('INNGEST_SIGNING_KEY', '');
    sdkGet.mockResolvedValueOnce(new Response('{}', { status: 500 }));
    const { GET } = await import('@/app/api/inngest/route');

    await call(GET, request(signatureAgedSeconds(2)));

    expect(logServerError).not.toHaveBeenCalled();
  });

  it('answers an unsigned probe 401 without reporting it, and without waking the SDK', async () => {
    const { GET } = await import('@/app/api/inngest/route');

    const response = await call(GET, request());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ message: 'Unauthorized' });
    expect(sdkGet).not.toHaveBeenCalled();
    expect(logServerError).not.toHaveBeenCalled();
  });

  it('blames the clock, not the key, when a signature arrives past the 5-minute window', async () => {
    const { GET } = await import('@/app/api/inngest/route');

    await call(GET, request(signatureAgedSeconds(600)));

    expect(logServerError).toHaveBeenCalledTimes(1);
    const [message] = logServerError.mock.calls[0] as [string];
    expect(message).toMatch(/clock/i);
    expect(message).toMatch(/do not reissue/i);
    expect(message).not.toMatch(/does not match the Inngest app/);
  });

  it('blames the key when a fresh signature is rejected', async () => {
    const { GET } = await import('@/app/api/inngest/route');

    await call(GET, request(signatureAgedSeconds(2)));

    expect(logServerError).toHaveBeenCalledTimes(1);
    const [message] = logServerError.mock.calls[0] as [string];
    expect(message).toMatch(/does not match the Inngest app/);
    expect(message).toMatch(/copy its CURRENT event \+ signing keys/);
    expect(message).not.toMatch(/clock\/latency/);
  });

  it('says nothing when the SDK accepts a signed request', async () => {
    sdkGet.mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const { GET } = await import('@/app/api/inngest/route');

    const response = await call(GET, request(signatureAgedSeconds(2)));

    expect(response.status).toBe(200);
    expect(logServerError).not.toHaveBeenCalled();
  });
});
