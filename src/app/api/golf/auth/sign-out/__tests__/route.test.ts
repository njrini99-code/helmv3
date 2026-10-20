import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/** POST /api/golf/auth/sign-out: one request ends the session and clears the active team; cross-site callers are refused. */

const auth = vi.hoisted(() => ({ signOut: vi.fn(async () => ({ error: null as unknown })), throws: false }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => {
    if (auth.throws) throw new Error('no client');
    return { auth: { signOut: auth.signOut } };
  },
}));
const logged = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: logged }));

import { POST } from '../route';

const req = (origin?: string, host = 'golfhelm.test') =>
  new NextRequest('https://golfhelm.test/api/golf/auth/sign-out', { method: 'POST', headers: { host, ...(origin ? { origin } : {}) } });
const clearsTeam = (res: Response) => /golf_active_team=;/.test(res.headers.get('set-cookie') ?? '');

afterEach(() => {
  auth.signOut.mockClear();
  auth.signOut.mockResolvedValue({ error: null });
  auth.throws = false;
  logged.mockClear();
});

describe('POST /api/golf/auth/sign-out', () => {
  it('signs out and clears the active team on a same-origin request', async () => {
    const res = await POST(req('https://golfhelm.test'));
    expect(res.status).toBe(200);
    expect(auth.signOut).toHaveBeenCalledTimes(1);
    expect(clearsTeam(res)).toBe(true);
  });

  it('accepts a request without an Origin header (same-origin navigations may omit it)', async () => {
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(auth.signOut).toHaveBeenCalledTimes(1);
  });

  it('refuses a cross-site request and signs no one out', async () => {
    const res = await POST(req('https://evil.example'));
    expect(res.status).toBe(403);
    expect(auth.signOut).not.toHaveBeenCalled();
    expect(clearsTeam(res)).toBe(false);
  });

  it('reports a failed sign out, clears this device with a local sign out, and still clears the active team', async () => {
    auth.signOut.mockResolvedValueOnce({ error: { message: 'auth down', status: 500 } });
    const res = await POST(req('https://golfhelm.test'));
    expect(res.status).toBe(500);
    expect(logged).toHaveBeenCalledTimes(1);
    expect(auth.signOut).toHaveBeenLastCalledWith({ scope: 'local' });
    expect(clearsTeam(res)).toBe(true);
  });

  it('compares the Origin with the host the request was sent to, not the server\'s own name for itself', async () => {
    // A dev server on 127.0.0.1 named itself localhost in nextUrl and refused every same-origin sign out (2026-10-14).
    const res = await POST(req('http://127.0.0.1:3100', '127.0.0.1:3100'));
    expect(res.status).toBe(200);
    expect(auth.signOut).toHaveBeenCalledTimes(1);
  });

  it('refuses an unparseable Origin ("null" from a sandboxed frame) without throwing', async () => {
    const res = await POST(req('null'));
    expect(res.status).toBe(403);
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it('survives the client failing to build', async () => {
    auth.throws = true;
    const res = await POST(req('https://golfhelm.test'));
    expect(res.status).toBe(500);
    expect(clearsTeam(res)).toBe(true);
  });
});
