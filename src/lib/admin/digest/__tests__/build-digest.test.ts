import { describe, it, expect } from 'vitest';
import { buildDigestEmail, type DigestData } from '@/lib/admin/digest/build-digest';

const base: DigestData = {
  generatedAt: '2026-07-01T10:00:00Z',
  errors24h: { total: 0, critical: 0, topIncidents: [] },
  sentry: { unresolved: 0, regressed: 0 },
  signups24h: [],
  demoRequests: { new24h: 0, pendingTotal: 0 },
  coachMail: { unread: 0, recent: [] },
  activity24h: { golfRounds: 3, baseballGames: 1, liftSessions: 2 },
  reds: [],
  shippedYesterday: [],
};

describe('buildDigestEmail — Cup of Helm', () => {
  it('a quiet day says so in the subject, not just the body', () => {
    const email = buildDigestEmail(base);
    expect(email.subject).toContain('Cup of Helm');
    expect(email.subject).toContain('nothing needs you');
    expect(email.html).toContain('Nothing needs you this morning');
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

    it('an unreadable CRM inbox is "could not check", never "no replies"', () => {
      const email = buildDigestEmail({ ...base, coachMail: null });
      expect(email.text).toContain('could not check');
      expect(email.text).not.toContain('No unread coach replies');
      expect(email.html).toContain("couldn't check");
    });

    /**
     * The readout strip is the most glanceable thing in the email, so it is
     * also the easiest place to tell a confident lie. An unreachable GitHub
     * must not render as a shipped-count of zero.
     */
    it('the shipped readout shows a dash, not 0, when GitHub was unreachable', () => {
      const html = buildDigestEmail({ ...base, shippedYesterday: undefined }).html;
      const strip = html.slice(html.indexOf('Error groups'), html.indexOf('Needs you today'));
      expect(strip).toContain('—');
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

  it('names the specific leads waiting, not just how many', () => {
    const email = buildDigestEmail({
      ...base,
      demoRequests: {
        new24h: 0,
        pendingTotal: 1,
        waiting: [{ name: 'Kiki Lorann', organization: 'USC Aiken', email: 'k@uscaiken.edu', waitingDays: 3 }],
      },
    });
    expect(email.text).toContain('Kiki Lorann (USC Aiken) — waiting 3d');
    expect(email.html).toContain('Kiki Lorann');
    expect(email.html).toContain('USC Aiken');
  });

  it('shows unread coach email with sender, subject and how long it has sat', () => {
    const email = buildDigestEmail({
      ...base,
      coachMail: {
        unread: 2,
        recent: [{ from: 'coach@guilford.edu', subject: 'Re: demo next week', ageHours: 30 }],
      },
    });
    expect(email.text).toContain('2 unread coach replies');
    expect(email.text).toContain('coach@guilford.edu: Re: demo next week (1d ago)');
    expect(email.html).toContain('coach@guilford.edu');
    expect(email.html).toContain('Re: demo next week');
  });

  it('pluralises a single unread reply correctly', () => {
    const email = buildDigestEmail({
      ...base,
      coachMail: { unread: 1, recent: [{ from: 'a@b.com', subject: 'hi', ageHours: 2 }] },
    });
    expect(email.text).toContain('1 unread coach reply');
    expect(email.text).not.toContain('1 unread coach replies');
  });

  it('lists CRM follow-ups on deck and flags the overdue ones', () => {
    const email = buildDigestEmail({
      ...base,
      openTasks: [
        { title: 'Call back St. Marys', dueLabel: '2026-06-29', overdue: true },
        { title: 'Send pricing to Carlisle', dueLabel: '2026-07-01', overdue: false },
      ],
    });
    expect(email.text).toContain('ON DECK');
    expect(email.text).toContain('Call back St. Marys (OVERDUE 2026-06-29)');
    expect(email.html).toContain('Send pricing to Carlisle');
  });

  it('omits the On deck section entirely when there is nothing due', () => {
    const email = buildDigestEmail(base);
    expect(email.html).not.toContain('On deck');
    expect(email.text).not.toContain('ON DECK');
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
   * Escaping has to survive every path a string can take into the HTML, not
   * just the one the original test happened to cover. Coach mail is the
   * riskiest: the subject line is attacker-controlled by anyone who can email
   * the CRM address.
   */
  it('escapes attacker-controlled coach mail subjects', () => {
    const email = buildDigestEmail({
      ...base,
      coachMail: { unread: 1, recent: [{ from: '<b>evil</b>', subject: '<img src=x onerror=1>', ageHours: 1 }] },
    });
    expect(email.html).not.toContain('<img src=x');
    expect(email.html).not.toContain('<b>evil</b>');
    expect(email.html).toContain('&lt;img src=x');
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

  /**
   * Outlook's Word renderer drops an entire declaration it cannot parse, so a
   * single `font:` shorthand silently unstyles whatever it was on. Longhand
   * only — this catches a shorthand creeping back in during a later edit.
   */
  it('uses no font shorthand anywhere in the markup', () => {
    const html = buildDigestEmail(base).html;
    expect(html).not.toMatch(/[^-]font:\s/);
  });
});
