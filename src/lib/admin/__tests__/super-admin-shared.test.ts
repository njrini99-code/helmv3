import { describe, it, expect } from 'vitest';
import {
  parseSuperAdminUserIds,
  isAdminPath,
  isSuperAdminUserId,
  evaluateAdminGate,
} from '@/lib/admin/super-admin-shared';

const NICK = '11111111-1111-1111-1111-111111111111';

describe('parseSuperAdminUserIds', () => {
  it('parses a comma list, trimming whitespace and empties', () => {
    expect([...parseSuperAdminUserIds(` ${NICK} , , abc `)]).toEqual([NICK, 'abc']);
  });
  it('returns an empty set for undefined/null/empty', () => {
    expect(parseSuperAdminUserIds(undefined).size).toBe(0);
    expect(parseSuperAdminUserIds(null).size).toBe(0);
    expect(parseSuperAdminUserIds('').size).toBe(0);
  });
});

describe('isAdminPath', () => {
  it('matches /admin and /admin/*', () => {
    expect(isAdminPath('/admin')).toBe(true);
    expect(isAdminPath('/admin/errors')).toBe(true);
  });
  it('does NOT match lookalikes', () => {
    expect(isAdminPath('/administrator')).toBe(false);
    expect(isAdminPath('/golf/admin')).toBe(false);
    expect(isAdminPath('/')).toBe(false);
  });
});

describe('isSuperAdminUserId', () => {
  it('is true for a user id in the allowlist', () => {
    expect(isSuperAdminUserId(NICK, NICK)).toBe(true);
    expect(isSuperAdminUserId(NICK, `abc, ${NICK} ,def`)).toBe(true);
  });
  it('is false for a user id NOT in the allowlist — the golf login success', () => {
    // path (src/app/golf/actions/auth.ts) relies on this: an ordinary
    // player/coach must fall straight through to the existing
    // onboarding/team redirect logic with zero behavior change.
    expect(isSuperAdminUserId('someone-else', NICK)).toBe(false);
  });
  it('fails CLOSED when the allowlist env is missing/empty', () => {
    expect(isSuperAdminUserId(NICK, undefined)).toBe(false);
    expect(isSuperAdminUserId(NICK, null)).toBe(false);
    expect(isSuperAdminUserId(NICK, '')).toBe(false);
  });
});

describe('evaluateAdminGate', () => {
  const base = { pathname: '/admin/errors', isNative: false, userId: NICK, allowlistRaw: NICK };
  it('passes the allowlisted admin', () => {
    expect(evaluateAdminGate(base)).toBe('pass');
  });
  it('ignores non-admin paths', () => {
    expect(evaluateAdminGate({ ...base, pathname: '/golf/dashboard' })).toBe('not-admin-path');
  });
  it('blocks native user agents BEFORE any auth logic', () => {
    expect(evaluateAdminGate({ ...base, isNative: true, userId: null })).toBe('block-native');
  });
  it('redirects unauthenticated to login', () => {
    expect(evaluateAdminGate({ ...base, userId: null })).toBe('redirect-login');
  });
  it('redirects authenticated non-admins to dashboard', () => {
    expect(evaluateAdminGate({ ...base, userId: 'someone-else' })).toBe('redirect-dashboard');
  });
  it('fails CLOSED when the allowlist env is unset', () => {
    expect(evaluateAdminGate({ ...base, allowlistRaw: undefined })).toBe('redirect-dashboard');
  });
});
