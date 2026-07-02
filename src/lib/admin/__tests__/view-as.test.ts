import { describe, it, expect } from 'vitest';
import { signViewAsToken, verifyViewAsToken } from '@/lib/admin/view-as';

const SECRET = 'test-secret-at-least-32-chars-long!!';
const now = new Date('2026-07-01T12:00:00Z');
const future = now.getTime() + 10 * 60_000;

describe('view-as token', () => {
  it('round-trips a valid token', () => {
    const token = signViewAsToken('user-1', future, SECRET);
    expect(verifyViewAsToken(token, SECRET, now)).toEqual({
      valid: true, targetUserId: 'user-1', expiresAtMs: future,
    });
  });
  it('rejects expiry (time-boxed session is a hard constraint)', () => {
    const token = signViewAsToken('user-1', now.getTime() - 1, SECRET);
    expect(verifyViewAsToken(token, SECRET, now)).toEqual({ valid: false });
  });
  it('rejects tampering with the target user id', () => {
    const token = signViewAsToken('user-1', future, SECRET);
    const forged = token.replace('user-1', 'victim');
    expect(verifyViewAsToken(forged, SECRET, now)).toEqual({ valid: false });
  });
  it('rejects a wrong or missing secret (feature off = fail closed)', () => {
    const token = signViewAsToken('user-1', future, SECRET);
    expect(verifyViewAsToken(token, 'other-secret-also-32-chars-long!!!', now)).toEqual({ valid: false });
    expect(verifyViewAsToken(token, undefined, now)).toEqual({ valid: false });
    expect(verifyViewAsToken(undefined, SECRET, now)).toEqual({ valid: false });
  });
});
