// =============================================================================
// changePasswordAction — reauthentication guard (#371)
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getUser, signInWithPassword, updateUser, checkRateLimit, resetRateLimit, validatePassword } =
  vi.hoisted(() => ({
    getUser: vi.fn(),
    signInWithPassword: vi.fn(),
    updateUser: vi.fn(),
    checkRateLimit: vi.fn(),
    resetRateLimit: vi.fn(),
    validatePassword: vi.fn(),
  }));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser, signInWithPassword, updateUser },
  })),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth/supabase-rate-limit', () => ({
  checkRateLimit,
  resetRateLimit,
  RATE_LIMITS: { PASSWORD_CHANGE: { maxAttempts: 5, windowMs: 900000 } },
  formatTimeRemaining: vi.fn(() => '5m'),
}));
vi.mock('@/lib/auth/password-validation', () => ({ validatePassword }));

import { changePasswordAction } from '@/app/baseball/actions/auth';

describe('changePasswordAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'coach@example.com' } },
    });
    checkRateLimit.mockResolvedValue({ allowed: true, resetAt: Date.now() + 60000 });
    validatePassword.mockReturnValue({ valid: true, feedback: [] });
    signInWithPassword.mockResolvedValue({ error: null });
    updateUser.mockResolvedValue({ error: null });
    resetRateLimit.mockResolvedValue(undefined);
  });

  it('updates password after current-password verification succeeds', async () => {
    const result = await changePasswordAction('OldPass1!', 'NewPass2!');

    expect(result.success).toBe(true);
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: 'coach@example.com',
      password: 'OldPass1!',
    });
    expect(updateUser).toHaveBeenCalledWith({ password: 'NewPass2!' });
    expect(resetRateLimit).toHaveBeenCalledWith('password-change:user:user-1');
  });

  it('rejects wrong current password with a sanitized message', async () => {
    signInWithPassword.mockResolvedValue({
      error: { message: 'Invalid login credentials' },
    });

    const result = await changePasswordAction('wrong', 'NewPass2!');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Current password is incorrect.');
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('rejects when session is missing', async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const result = await changePasswordAction('OldPass1!', 'NewPass2!');

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/session has expired/i);
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it('rejects weak new passwords before reauth', async () => {
    validatePassword.mockReturnValue({
      valid: false,
      feedback: ['Password must include an uppercase letter'],
    });

    const result = await changePasswordAction('OldPass1!', 'weak');

    expect(result.success).toBe(false);
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it('rate limits repeated attempts', async () => {
    checkRateLimit.mockResolvedValue({ allowed: false, resetAt: Date.now() + 300000 });

    const result = await changePasswordAction('OldPass1!', 'NewPass2!');

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/too many password change attempts/i);
    expect(signInWithPassword).not.toHaveBeenCalled();
  });
});
