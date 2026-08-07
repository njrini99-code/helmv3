import { describe, expect, it, vi, beforeEach } from 'vitest';

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

/** The real handler is typed for Next's (req, ctx) shape; only `req` matters here. */
const call = (handler: unknown, req: Request) =>
  (handler as (r: Request) => Promise<Response>)(req);

vi.mock('@/lib/server-error-logger', () => ({ logServerError }));
vi.mock('@/lib/inngest/client', () => ({ inngest: {} }));
vi.mock('@/lib/inngest/functions', () => ({ functions: [] }));
vi.mock('inngest/next', () => ({
  serve: () => ({ GET: sdkGet, POST: sdkGet, PUT: sdkGet }),
}));

function request(signature?: string) {
  return new Request('https://helm.test/api/inngest', {
    headers: signature ? { 'x-inngest-signature': signature } : {},
  });
}

const signatureAgedSeconds = (seconds: number) =>
  `t=${Math.floor(Date.now() / 1000) - seconds}&s=${'a'.repeat(64)}`;

describe('/api/inngest signature diagnosis', () => {
  beforeEach(() => {
    logServerError.mockClear();
    sdkGet.mockClear();
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
