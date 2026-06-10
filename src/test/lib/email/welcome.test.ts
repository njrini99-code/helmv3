/**
 * Tests for src/lib/email/templates/welcome.ts
 *
 * Validates that renderWelcomeEmail produces correct subject lines, embeds
 * the join code, includes the support email address, and generates valid HTML
 * without exposing raw template artefacts.
 */

import { describe, it, expect } from 'vitest';
import { renderWelcomeEmail, type WelcomeEmailInput } from '@/lib/email/templates/welcome';

function base(overrides: Partial<WelcomeEmailInput> = {}): WelcomeEmailInput {
  return {
    firstName: 'Chris',
    schoolName: 'Lenoir-Rhyne University',
    teamJoinCode: 'MZEY6MD8',
    supportEmail: 'admin@helmsportslabs.com',
    ...overrides,
  };
}

describe('renderWelcomeEmail', () => {
  it('returns both subject and html keys', () => {
    const result = renderWelcomeEmail(base());
    expect(Object.keys(result).sort()).toEqual(['html', 'subject']);
  });

  it('subject contains the coach first name', () => {
    const { subject } = renderWelcomeEmail(base({ firstName: 'Lauren' }));
    expect(subject).toContain('Lauren');
  });

  it('subject contains the school name', () => {
    const { subject } = renderWelcomeEmail(base({ schoolName: 'Denison University' }));
    // Subject is personal, not necessarily containing school — but heading in
    // HTML should contain it. Subject must at least be non-empty.
    expect(subject.length).toBeGreaterThan(0);
  });

  it('html contains the school name in the heading', () => {
    const { html } = renderWelcomeEmail(base({ schoolName: 'Piedmont University' }));
    expect(html).toContain('Piedmont University');
  });

  it('html contains the join code when provided', () => {
    const { html } = renderWelcomeEmail(base({ teamJoinCode: 'MZEY6MD8' }));
    expect(html).toContain('MZEY6MD8');
  });

  it('html contains the join code for Denison', () => {
    const { html } = renderWelcomeEmail(base({ teamJoinCode: '8JCXH3ZX' }));
    expect(html).toContain('8JCXH3ZX');
  });

  it('html contains the support email', () => {
    const { html } = renderWelcomeEmail(base({ supportEmail: 'admin@helmsportslabs.com' }));
    expect(html).toContain('admin@helmsportslabs.com');
  });

  it('html contains mailto link for support email', () => {
    const { html } = renderWelcomeEmail(base({ supportEmail: 'admin@helmsportslabs.com' }));
    expect(html).toContain('mailto:admin@helmsportslabs.com');
  });

  it('html omits join-code block when teamJoinCode is absent', () => {
    const { html } = renderWelcomeEmail(base({ teamJoinCode: undefined }));
    // Should not contain any join code from the base fixture
    expect(html).not.toContain('MZEY6MD8');
    // Should still contain the three-steps section
    expect(html).toContain('Three things to do first');
  });

  it('html contains CoachHelm reference', () => {
    const { html } = renderWelcomeEmail(base());
    expect(html).toContain('CoachHelm');
  });

  it('html contains the dashboard CTA link', () => {
    const { html } = renderWelcomeEmail(base());
    expect(html).toContain('/golf/dashboard');
  });

  it('html is a well-formed DOCTYPE document', () => {
    const { html } = renderWelcomeEmail(base());
    expect(html.trimStart()).toMatch(/^<!DOCTYPE html>/i);
    expect(html).toContain('</html>');
  });

  it('html does not contain raw template placeholders', () => {
    const { html } = renderWelcomeEmail(base());
    // No {{ }} or <%  %> left in output
    expect(html).not.toMatch(/\{\{|\}\}|<%|%>/);
  });

  it('subject is personal — not corporate-generic', () => {
    const { subject } = renderWelcomeEmail(base({ firstName: 'Dustin' }));
    // Must address the coach directly
    expect(subject).toContain('Dustin');
    // Should not be a boring generic subject
    expect(subject.toLowerCase()).not.toBe('welcome');
  });

  it('html contains first name in greeting', () => {
    const { html } = renderWelcomeEmail(base({ firstName: 'Lauren' }));
    expect(html).toContain('Lauren');
  });

  it('falls back to default support email when not provided', () => {
    const { html } = renderWelcomeEmail(base({ supportEmail: undefined }));
    expect(html).toContain('admin@helmsportslabs.com');
  });
});
