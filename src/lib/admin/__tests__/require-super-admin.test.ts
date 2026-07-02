import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUser },
  })),
}));

import { requireSuperAdmin, checkSuperAdminAccess } from '@/lib/admin/require-super-admin';

const NICK = '11111111-1111-1111-1111-111111111111';

describe('requireSuperAdmin / checkSuperAdminAccess', () => {
  beforeEach(() => {
    vi.stubEnv('SUPER_ADMIN_USER_IDS', NICK);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    mocks.getUser.mockReset();
  });

  it('returns context for the allowlisted admin', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: NICK, email: 'admin@helmsportslabs.com' } } });
    await expect(requireSuperAdmin()).resolves.toEqual({
      userId: NICK,
      email: 'admin@helmsportslabs.com',
    });
  });

  it('throws Unauthorized when no session', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    await expect(requireSuperAdmin()).rejects.toThrow('Unauthorized');
  });

  it('throws Forbidden for an authenticated non-admin', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'intruder', email: 'x@y.z' } } });
    await expect(requireSuperAdmin()).rejects.toThrow('Forbidden');
  });

  it('fails CLOSED when the env allowlist is unset', async () => {
    vi.stubEnv('SUPER_ADMIN_USER_IDS', '');
    mocks.getUser.mockResolvedValue({ data: { user: { id: NICK, email: 'admin@helmsportslabs.com' } } });
    await expect(requireSuperAdmin()).rejects.toThrow('Forbidden');
  });

  it('probe variant never throws (the checkAdminAccess polling-flood lesson)', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'intruder', email: 'x@y.z' } } });
    await expect(checkSuperAdminAccess()).resolves.toEqual({ allowed: false, reason: 'forbidden' });
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    await expect(checkSuperAdminAccess()).resolves.toEqual({ allowed: false, reason: 'unauthenticated' });
  });
});
