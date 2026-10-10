import { beforeEach, describe, expect, it, vi } from 'vitest';

// The forgot-password layout under golf_clubhouse_front_door: a signed-out
// visitor resets inside the sign-in panel (/golf/login?view=forgot); a
// signed-in one keeps today's page, which the proxy deliberately lets them
// reach. Flag off, the page is untouched and no session is read.

const mocks = vi.hoisted(() => ({
  frontDoor: vi.fn(() => false),
  getUser: vi.fn(),
  getSession: vi.fn(),
  createClient: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('@/clubhouse/gate', () => ({ isClubhouseFrontDoor: mocks.frontDoor }));
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }));

import ForgotPasswordLayout from './layout';

const page = <p>today&apos;s page</p>;
const signedIn = { data: { user: { id: 'user-1' } }, error: null };
const signedOut = {
  data: { user: null },
  error: { name: 'AuthSessionMissingError', message: 'Auth session missing!', status: 400 },
};
// The auth server is down (5xx), so getUserResilient falls back to the cookie's session.
const authDown = { data: { user: null }, error: { name: 'AuthApiError', message: 'Service Unavailable', status: 503 } };
const b64url = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
const cookieSession = {
  user: { id: 'user-1' },
  access_token: `${b64url({ alg: 'HS256' })}.${b64url({ sub: 'user-1', exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createClient.mockImplementation(async () => ({
    auth: { getUser: mocks.getUser, getSession: mocks.getSession },
  }));
  mocks.getSession.mockResolvedValue({ data: { session: null }, error: null });
});

describe('golf forgot-password layout', () => {
  it('flag on, signed out: redirects into the sign-in panel reset', async () => {
    mocks.frontDoor.mockReturnValue(true);
    mocks.getUser.mockResolvedValue(signedOut);

    await expect(ForgotPasswordLayout({ children: page })).rejects.toThrow('REDIRECT:/golf/login?view=forgot');
    expect(mocks.redirect).toHaveBeenCalledWith('/golf/login?view=forgot');
  });

  it('flag on, signed in: keeps today’s page', async () => {
    mocks.frontDoor.mockReturnValue(true);
    mocks.getUser.mockResolvedValue(signedIn);

    await expect(ForgotPasswordLayout({ children: page })).resolves.toBe(page);
    expect(mocks.getUser).toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it('flag on, auth server down with a session in the cookie: degraded counts as signed in, no redirect', async () => {
    mocks.frontDoor.mockReturnValue(true);
    mocks.getUser.mockResolvedValue(authDown);
    mocks.getSession.mockResolvedValue({ data: { session: cookieSession }, error: null });

    await expect(ForgotPasswordLayout({ children: page })).resolves.toBe(page);
    expect(mocks.getSession).toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it('flag on, auth server down with no session in the cookie: still signed out, redirects', async () => {
    mocks.frontDoor.mockReturnValue(true);
    mocks.getUser.mockResolvedValue(authDown);

    await expect(ForgotPasswordLayout({ children: page })).rejects.toThrow('REDIRECT:/golf/login?view=forgot');
  });

  it('flag off, signed out: keeps today’s page without reading the session', async () => {
    mocks.frontDoor.mockReturnValue(false);
    mocks.getUser.mockResolvedValue(signedOut);

    await expect(ForgotPasswordLayout({ children: page })).resolves.toBe(page);
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it('flag off, signed in: keeps today’s page without reading the session', async () => {
    mocks.frontDoor.mockReturnValue(false);
    mocks.getUser.mockResolvedValue(signedIn);

    await expect(ForgotPasswordLayout({ children: page })).resolves.toBe(page);
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
