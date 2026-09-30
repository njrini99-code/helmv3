import { describe, expect, it } from 'vitest';
import { CREDENTIALS_MESSAGE, getErrorMessage } from '@/lib/auth/golf-sign-in-logic';
import { failureForServer } from '../screens/auth/sign-in-state';

/** Q-98: the sign-in action's own wrong-password text becomes the design's, with both fields marked and the attempts line kept. */
describe('CH-15001 the server’s wrong-password text', () => {
  const run = (raw: string) => failureForServer(raw, getErrorMessage(raw));

  it('reads as the design’s words, with both fields marked', () => {
    const f = run('Invalid email or password');
    expect(f.message).toBe(CREDENTIALS_MESSAGE);
    expect(f.field).toBe('both');
    expect(f.detail).toBeUndefined();
  });

  it('keeps how many attempts are left, under it', () => {
    expect(run('Invalid email or password (2 attempts remaining)').detail).toBe('2 attempts remaining before the account is locked for a while.');
    expect(run('Invalid email or password (1 attempt remaining)').detail).toBe('1 attempt remaining before the account is locked for a while.');
  });

  it('leaves every other server sentence as it was said', () => {
    const lock = 'Too many login attempts. Please try again in 14 minutes.';
    expect(run(lock).message).toBe(lock);
    expect(run(lock).detail).toBeUndefined();
  });

  it('leaves today’s shared mapping untouched, so the current form does not change', () => {
    expect(getErrorMessage('Invalid email or password (2 attempts remaining)')).toBe('Invalid email or password (2 attempts remaining)');
  });
});
