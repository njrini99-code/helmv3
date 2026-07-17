import { describe, it, expect } from 'vitest';
import { buildDigestEmail, type DigestData } from '@/lib/admin/digest/build-digest';

const base: DigestData = {
  generatedAt: '2026-07-01T10:00:00Z',
  errors24h: { total: 0, critical: 0, topIncidents: [] },
  sentry: { unresolved: 0, regressed: 0 },
  signups24h: [],
  demoRequests: { new24h: 0, pendingTotal: 0 },
  activity24h: { golfRounds: 3, baseballGames: 1, liftSessions: 2 },
  reds: [],
};

describe('buildDigestEmail', () => {
  it('all-clear day leads with the green subject', () => {
    const email = buildDigestEmail(base);
    expect(email.subject).toContain('All clear');
    expect(email.text).toContain('3 golf rounds');
    expect(email.html).toContain('All systems nominal');
  });

  it('reds lead the subject and body — exceptions first', () => {
    const email = buildDigestEmail({
      ...base,
      errors24h: { total: 12, critical: 2, topIncidents: [{ title: 'savePartialRound failed', occurrences: 8, affectedUsers: 3 }] },
      reds: ['integrity FAIL: anon_grant_drift', 'cron overdue: event-reminders'],
    });
    expect(email.subject).toContain('2 red');
    expect(email.text.indexOf('anon_grant_drift')).toBeLessThan(email.text.indexOf('golf rounds'));
    expect(email.html).toContain('savePartialRound failed');
  });

  it('renders unconfigured Sentry honestly instead of 0', () => {
    const email = buildDigestEmail({ ...base, sentry: { unresolved: null, regressed: null } });
    expect(email.text).toContain('Sentry: not configured');
  });

  it('signups are listed by email + role', () => {
    const email = buildDigestEmail({ ...base, signups24h: [{ email: 'new@coach.com', role: 'coach' }] });
    expect(email.text).toContain('new@coach.com (coach)');
  });

  it('demo requests render when present and stay silent at zero', () => {
    const quiet = buildDigestEmail(base);
    expect(quiet.text).not.toContain('Demo requests');

    const busy = buildDigestEmail({ ...base, demoRequests: { new24h: 1, pendingTotal: 2 } });
    expect(busy.text).toContain('Demo requests: 1 new · 2 awaiting reply');
    expect(busy.html).toContain('Demo requests');
  });
});
