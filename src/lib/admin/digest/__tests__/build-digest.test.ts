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
  shippedYesterday: [],
};

describe('buildDigestEmail — Cup of Helm', () => {
  it('a quiet day says so in the subject, not just the body', () => {
    const email = buildDigestEmail(base);
    expect(email.subject).toContain('Cup of Helm');
    expect(email.subject).toContain('nothing needs you');
    expect(email.html).toContain('All systems nominal');
  });

  it('puts what needs a decision above everything else', () => {
    const email = buildDigestEmail({
      ...base,
      errors24h: {
        total: 12,
        critical: 2,
        topIncidents: [{ title: 'savePartialRound failed', occurrences: 8, affectedUsers: 3 }],
      },
      reds: ['integrity FAIL: anon_grant_drift', 'cron overdue: event-reminders'],
    });
    expect(email.subject).toContain('2 things need you');
    // Inverted pyramid: the red item must precede the activity numbers.
    expect(email.text.indexOf('anon_grant_drift')).toBeLessThan(email.text.indexOf('golf rounds'));
    expect(email.html).toContain('savePartialRound failed');
  });

  it('singularises so the subject never reads "1 things need you"', () => {
    const email = buildDigestEmail({ ...base, reds: ['one problem'] });
    expect(email.subject).toContain('1 thing need');
    expect(email.subject).not.toContain('1 things');
  });

  // The honesty rules. Each of these is a case where a plausible-looking
  // template would state a fact we did not actually establish.
  describe('does not present a failed read as a measured zero', () => {
    it('unreachable Sentry is "not reachable", never 0 unresolved', () => {
      const email = buildDigestEmail({ ...base, sentry: { unresolved: null, regressed: null } });
      expect(email.text).toContain('Sentry: not reachable');
      expect(email.text).not.toContain('Sentry: 0 unresolved');
    });

    it('an unreachable GitHub is "unknown", not "nothing merged"', () => {
      const email = buildDigestEmail({ ...base, shippedYesterday: undefined });
      expect(email.text).toContain('unknown');
      expect(email.text).not.toContain('Nothing merged');
      expect(email.html).toContain('unknown rather than empty');
    });

    it('an answered-but-empty GitHub is "nothing merged"', () => {
      const email = buildDigestEmail({ ...base, shippedYesterday: [] });
      expect(email.text).toContain('Nothing merged');
      expect(email.text).not.toContain('unknown');
    });
  });

  it('lists what shipped with PR numbers', () => {
    const email = buildDigestEmail({
      ...base,
      shippedYesterday: [{ number: 1137, title: 'CoachHelm triage pass' }],
    });
    expect(email.text).toContain('#1137 CoachHelm triage pass');
    expect(email.html).toContain('#1137');
  });

  it('calls out a completely idle product instead of showing three empty bars', () => {
    const email = buildDigestEmail({
      ...base,
      activity24h: { golfRounds: 0, baseballGames: 0, liftSessions: 0 },
    });
    expect(email.text).toContain('Nobody used the product');
    expect(email.html).toContain('Nobody used the product');
  });

  it('surfaces coaches waiting on a reply, and stays calm at zero', () => {
    const busy = buildDigestEmail({ ...base, demoRequests: { new24h: 1, pendingTotal: 2 } });
    expect(busy.text).toContain('2 awaiting your reply');
    const quiet = buildDigestEmail(base);
    expect(quiet.text).toContain('Nothing awaiting reply');
  });

  it('names new signups by email and role', () => {
    const email = buildDigestEmail({ ...base, signups24h: [{ email: 'new@coach.com', role: 'coach' }] });
    expect(email.text).toContain('new@coach.com (coach)');
    expect(email.html).toContain('new@coach.com');
  });

  it('escapes HTML so a hostile error title cannot inject markup', () => {
    const email = buildDigestEmail({ ...base, reds: ['<script>alert(1)</script>'] });
    expect(email.html).not.toContain('<script>');
    expect(email.html).toContain('&lt;script&gt;');
  });

  /**
   * Regression guard for a real bug: Gmail's renderer strips `background`
   * from an <a> but keeps `color`, so a "green button with white text" ships
   * as invisible white-on-white. The call to action must therefore carry its
   * own visible colour and never depend on a background to be legible.
   */
  it('the call to action does not depend on a background colour to be readable', () => {
    const html = buildDigestEmail(base).html;
    const anchor = html.slice(html.indexOf('<a href="https://helmsportslabs.com/admin"'));
    const tag = anchor.slice(0, anchor.indexOf('>') + 1);
    expect(tag).toContain('text-decoration:underline');
    expect(tag).not.toContain('#ffffff');
    expect(tag).toMatch(/color:#0f5132/);
  });
});
