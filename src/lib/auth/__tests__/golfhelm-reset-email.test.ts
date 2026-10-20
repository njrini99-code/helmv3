import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { renderGolfHelmResetEmail } from '@/lib/auth/golfhelm-reset-email';

const LINK = 'https://helmsportslabs.com/golf/reset-password?token_hash=abc123&type=recovery';

describe('renderGolfHelmResetEmail', () => {
  it('greets by first name and names the account', () => {
    const { subject, html, text } = renderGolfHelmResetEmail({ link: LINK, email: 'coach@example.edu', firstName: 'Sam' });

    expect(subject).toBe('Reset your GolfHelm password');
    expect(html).toContain('Hi Sam,');
    expect(html).toContain('coach@example.edu');
    expect(html).toContain('Reset your password');
    expect(text).toContain('Hi Sam,');
    expect(text).toContain(LINK);
  });

  it('falls back to "Hi," without a usable first name', () => {
    for (const firstName of [null, undefined, '', '   ', 'x'.repeat(41)]) {
      const { html, text } = renderGolfHelmResetEmail({ link: LINK, email: 'a@b.co', firstName });
      expect(html).toContain('>Hi,</p>');
      expect(text.startsWith('Hi,\n')).toBe(true);
    }
  });

  it('escapes the user-controlled first name and the link', () => {
    const { html } = renderGolfHelmResetEmail({
      link: LINK,
      email: 'a@b.co',
      firstName: '<img src=x onerror=alert(1)>',
    });

    expect(html).not.toContain('<img src=x');
    expect(html).toContain('Hi &lt;img src=x onerror=alert(1)&gt;,');
    // The & in the query string is entity-encoded inside attributes.
    expect(html).toContain('href="https://helmsportslabs.com/golf/reset-password?token_hash=abc123&amp;type=recovery"');
  });

  it('matches the Supabase recovery template, so both reset paths send the same design', () => {
    const template = readFileSync(path.resolve(process.cwd(), 'supabase/templates/recovery.html'), 'utf8')
      .replace('{{ if .Data.first_name }}Hi {{ .Data.first_name }},{{ else }}Hi,{{ end }}', 'Hi Sam,')
      .replaceAll('{{ .Email }}', 'coach@example.edu')
      .replaceAll('{{ .ConfirmationURL }}', 'https://example.com/r');

    const { html } = renderGolfHelmResetEmail({
      link: 'https://example.com/r',
      email: 'coach@example.edu',
      firstName: 'Sam',
    });

    expect(html.trim()).toBe(template.trim());
  });
});
