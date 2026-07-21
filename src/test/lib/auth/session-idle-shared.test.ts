import { describe, it, expect } from 'vitest';
import {
  DEMO_SESSION_IDLE_TIMEOUT_MS,
  SESSION_IDLE_TIMEOUT_MS,
  SESSION_IDLE_COOKIE_MAX_AGE_S,
  SESSION_VISIBLE_HEARTBEAT_MS,
  parseLastActivity,
  isSessionIdleExpired,
} from '@/lib/auth/session-idle-shared';

describe('session-idle-shared', () => {
  it('staff idle window is 8 hours', () => {
    expect(SESSION_IDLE_TIMEOUT_MS).toBe(8 * 60 * 60 * 1000);
  });

  it('demo idle window is 12 hours and longer than the staff window', () => {
    expect(DEMO_SESSION_IDLE_TIMEOUT_MS).toBe(12 * 60 * 60 * 1000);
    expect(DEMO_SESSION_IDLE_TIMEOUT_MS).toBeGreaterThan(SESSION_IDLE_TIMEOUT_MS);
  });

  it('visible heartbeat is shorter than the idle window', () => {
    expect(SESSION_VISIBLE_HEARTBEAT_MS).toBeLessThan(SESSION_IDLE_TIMEOUT_MS);
  });

  it('cookie lifetime outlives every idle window so a stale marker survives to be detected', () => {
    // The reopen-after-idle case must be "present + stale", never "absent".
    expect(SESSION_IDLE_COOKIE_MAX_AGE_S * 1000).toBeGreaterThan(
      DEMO_SESSION_IDLE_TIMEOUT_MS,
    );
  });

  describe('parseLastActivity', () => {
    it('parses a valid epoch-ms string', () => {
      expect(parseLastActivity('1783000000000')).toBe(1783000000000);
    });

    it('returns null for absent/empty/malformed values', () => {
      expect(parseLastActivity(undefined)).toBeNull();
      expect(parseLastActivity(null)).toBeNull();
      expect(parseLastActivity('')).toBeNull();
      expect(parseLastActivity('not-a-number')).toBeNull();
      expect(parseLastActivity('0')).toBeNull();
      expect(parseLastActivity('-5')).toBeNull();
    });
  });

  describe('isSessionIdleExpired', () => {
    const now = 1_783_000_000_000;

    it('fail-open: an absent marker is NOT expired (a fresh login must never be bounced)', () => {
      expect(isSessionIdleExpired(null, now)).toBe(false);
    });

    it('recent activity is not expired', () => {
      expect(isSessionIdleExpired(now - 60 * 1000, now)).toBe(false); // 1 min ago
      expect(isSessionIdleExpired(now - (SESSION_IDLE_TIMEOUT_MS - 1000), now)).toBe(false); // just under
    });

    it('activity at or beyond the window is expired', () => {
      expect(isSessionIdleExpired(now - SESSION_IDLE_TIMEOUT_MS, now)).toBe(true); // exactly 8 hours
      expect(isSessionIdleExpired(now - (SESSION_IDLE_TIMEOUT_MS + 60 * 1000), now)).toBe(true);
    });

    it('a future timestamp (clock skew) is not expired', () => {
      expect(isSessionIdleExpired(now + 30 * 1000, now)).toBe(false);
    });
  });
});
