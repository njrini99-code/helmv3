import { describe, it, expect } from 'vitest';
import { affectedUsersLabel } from '@/app/admin/_components/TriageQueue';

describe('affectedUsersLabel', () => {
  it('renders "unknown user" for an app incident with events but zero known identities', () => {
    // affectedUsers=0 for an `app` incident means no event carried a
    // user_id/user_email (anonymous/system failure, or identity wasn't
    // wired into the observed-action call) — NOT that zero people were
    // affected. "0 users" would misleadingly imply the latter.
    expect(affectedUsersLabel({ origin: 'app', affectedUsers: 0, occurrences: 12 })).toBe('unknown user');
  });

  it('renders a real count for an app incident with known identities', () => {
    expect(affectedUsersLabel({ origin: 'app', affectedUsers: 3, occurrences: 12 })).toBe('3 users');
    expect(affectedUsersLabel({ origin: 'app', affectedUsers: 1, occurrences: 1 })).toBe('1 user');
  });

  it('a Sentry-origin incident with 0 userCount is a real zero, not "unknown"', () => {
    // Sentry tracks userCount itself as a genuine metric — 0 there really
    // does mean zero affected users, so it keeps the plain "0 users" copy.
    expect(affectedUsersLabel({ origin: 'sentry', affectedUsers: 0, occurrences: 5 })).toBe('0 users');
  });

  it('an app incident with zero occurrences (should not happen, but stays safe) still shows a count', () => {
    expect(affectedUsersLabel({ origin: 'app', affectedUsers: 0, occurrences: 0 })).toBe('0 users');
  });
});
