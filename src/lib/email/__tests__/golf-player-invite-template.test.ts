import { describe, expect, it } from 'vitest';
import { renderGolfPlayerInviteEmail } from '../golf-player-invite-template';

const base = { coachName: 'Coach Dana', teamName: 'Demo University Golf', joinCode: 'K7MQ2XPA', joinUrl: 'https://helmsportslabs.com/golf/join/K7MQ2XPA' };

describe('renderGolfPlayerInviteEmail', () => {
  it('names the coach and the team, and carries the link and the code in both versions', () => {
    const { subject, html, text } = renderGolfPlayerInviteEmail(base);
    expect(subject).toBe('Coach Dana invited you to join Demo University Golf on GolfHelm');
    for (const body of [html, text]) {
      expect(body).toContain('Coach Dana');
      expect(body).toContain('Demo University Golf');
      expect(body).toContain(base.joinUrl);
      expect(body).toContain('K7MQ2XPA');
    }
    expect(html).toContain(`href="${base.joinUrl}"`);
  });

  it('falls back to "Your coach" with no name', () => {
    expect(renderGolfPlayerInviteEmail({ ...base, coachName: null }).subject).toMatch(/^Your coach invited you/);
    expect(renderGolfPlayerInviteEmail({ ...base, coachName: '  ' }).subject).toMatch(/^Your coach invited you/);
  });

  it('escapes what a coach typed, and keeps the subject on one line', () => {
    const { subject, html } = renderGolfPlayerInviteEmail({ ...base, coachName: 'Dana <script>alert(1)</script>\nBcc: x@y.z', teamName: 'A & B "Golf"' });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('A &amp; B &quot;Golf&quot;');
    expect(subject).not.toMatch(/[\r\n]/);
  });

  it('says what to do if the person does not know the coach', () => {
    expect(renderGolfPlayerInviteEmail(base).text).toMatch(/ignore this email/);
  });
});
