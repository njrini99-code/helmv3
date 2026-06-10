/**
 * Unit tests for src/lib/email/layout.ts
 *
 * Covers:
 *  - renderBrandedEmail: HTML structure, logo, CTA conditional, details escape
 *  - formatEventDateTime: human-readable output, ISO detection
 *  - safeFormatDate: passes through pre-formatted strings, formats ISO
 *  - isRawIsoDatetime: detects ISO, rejects formatted strings
 */

import { describe, it, expect } from 'vitest';
import {
  renderBrandedEmail,
  formatEventDateTime,
  formatShortDate,
  safeFormatDate,
  isRawIsoDatetime,
  escapeHtml,
} from '@/lib/email/layout';

// ─── renderBrandedEmail ────────────────────────────────────────────────────────

describe('renderBrandedEmail', () => {
  it('returns a string starting with <!DOCTYPE html>', () => {
    const html = renderBrandedEmail({
      preheader: 'Test preheader',
      heading: 'Test Heading',
      bodyHtml: '<p>Hello world</p>',
    });
    expect(html).toMatch(/^<!DOCTYPE html>/);
  });

  it('includes the hosted logo img with explicit sizing and alt text', () => {
    const html = renderBrandedEmail({
      preheader: 'x',
      heading: 'h',
      bodyHtml: 'b',
    });
    // Hosted HTTPS logo — never a data: URI (Gmail/Outlook strip those)
    expect(html).toContain('https://helmsportslabs.com/helm-golf-logo-transparent.png');
    expect(html).not.toContain('data:image');
    expect(html).toContain('alt="Helm"');
    expect(html).toMatch(/width="32" height="26"/);
    expect(html).toMatch(/<img[^>]*style="[^"]*display:block/);
  });

  it('renders the logo on a solid light brand-tile (dark-mode guard)', () => {
    const html = renderBrandedEmail({
      preheader: 'x',
      heading: 'h',
      bodyHtml: 'b',
    });
    // Solid bgcolor attribute on the tile cell so the mark never vanishes
    expect(html).toContain('bgcolor="#F0FDF4"');
    // No CSS filter tricks — unsupported in Gmail/Outlook/Yahoo
    expect(html).not.toContain('filter:');
  });

  it('includes the tracked small-caps wordmark in the masthead', () => {
    const html = renderBrandedEmail({
      preheader: 'x',
      heading: 'h',
      bodyHtml: 'b',
    });
    expect(html).toContain('Helm Sports Labs');
    expect(html).toContain('letter-spacing:2.5px');
  });

  it('renders eyebrow when provided', () => {
    const html = renderBrandedEmail({
      preheader: 'x',
      eyebrow: 'RSVP Reminder',
      heading: 'h',
      bodyHtml: 'b',
    });
    expect(html).toContain('RSVP Reminder');
    expect(html).toContain('text-transform:uppercase');
  });

  it('omits eyebrow when not provided', () => {
    const withEyebrow = renderBrandedEmail({
      preheader: 'x',
      eyebrow: 'Zebra Chip',
      heading: 'h',
      bodyHtml: 'b',
    });
    const withoutEyebrow = renderBrandedEmail({
      preheader: 'x',
      heading: 'h',
      bodyHtml: 'b',
    });
    expect(withoutEyebrow).not.toContain('Zebra Chip');
    // Exactly one fewer uppercase element (the wordmark always remains)
    const count = (s: string) => s.match(/text-transform:uppercase/g)?.length ?? 0;
    expect(count(withoutEyebrow)).toBe(count(withEyebrow) - 1);
  });

  it('renders the heading as a Georgia serif display heading', () => {
    const html = renderBrandedEmail({
      preheader: 'x',
      heading: 'Editorial Heading',
      bodyHtml: 'b',
    });
    expect(html).toMatch(/<h1[^>]*Georgia[^>]*>Editorial Heading<\/h1>/);
    expect(html).toMatch(/<h1[^>]*font-weight:normal/);
  });

  it('renders CTA as a full pill button when cta is provided', () => {
    const html = renderBrandedEmail({
      preheader: 'x',
      heading: 'h',
      bodyHtml: 'b',
      cta: { label: 'RSVP Now', url: 'https://example.com/rsvp' },
    });
    expect(html).toContain('RSVP Now');
    expect(html).toContain('https://example.com/rsvp');
    expect(html).toContain('border-radius:100px');
    // MSO conditional close is the normalized single-line form
    expect(html).toContain('<![endif]-->');
    expect(html).not.toMatch(/<!\s*\n\s*\[endif\]/);
  });

  it('omits CTA when not provided', () => {
    const html = renderBrandedEmail({
      preheader: 'x',
      heading: 'No CTA',
      bodyHtml: '<p>content</p>',
    });
    // No pill button table (.cta-a in the <style> block is fine)
    expect(html).not.toContain('border-radius:100px');
    expect(html).not.toContain('class="cta-a"');
  });

  it('escapes HTML special characters in details values', () => {
    const html = renderBrandedEmail({
      preheader: 'x',
      heading: 'h',
      bodyHtml: 'b',
      details: [
        { label: 'Name', value: '<script>alert("xss")</script>' },
        { label: 'Note', value: 'A & B > C' },
      ],
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('A &amp; B &gt; C');
  });

  it('escapes HTML special characters in details labels', () => {
    const html = renderBrandedEmail({
      preheader: 'x',
      heading: 'h',
      bodyHtml: 'b',
      details: [{ label: '<Label>', value: 'val' }],
    });
    expect(html).not.toContain('<Label>');
    expect(html).toContain('&lt;Label&gt;');
  });

  it('renders details table only when details are provided', () => {
    const withDetails = renderBrandedEmail({
      preheader: 'x',
      heading: 'h',
      bodyHtml: 'b',
      details: [{ label: 'Date', value: 'Tuesday' }],
    });
    const withoutDetails = renderBrandedEmail({
      preheader: 'x',
      heading: 'h',
      bodyHtml: 'b',
    });
    expect(withDetails).toContain('Tuesday');
    expect(withDetails).toContain('class="details"');
    // details table not present
    expect(withoutDetails).not.toContain('class="details"');
  });

  it('includes footer note when provided', () => {
    const html = renderBrandedEmail({
      preheader: 'x',
      heading: 'h',
      bodyHtml: 'b',
      footerNote: 'Custom footer note here.',
    });
    expect(html).toContain('Custom footer note here.');
  });

  it('uses default footer note when footerNote is omitted', () => {
    const html = renderBrandedEmail({
      preheader: 'x',
      heading: 'h',
      bodyHtml: 'b',
    });
    expect(html).toContain("You're receiving this because you're part of a Helm Sports team.");
  });

  it('always carries helm green and the hairline-rule structure', () => {
    const html = renderBrandedEmail({
      preheader: 'x',
      heading: 'h',
      bodyHtml: 'b',
    });
    expect(html).toContain('#16A34A');
    // Two hairline rules separate masthead / content / footer
    const rules = html.match(/class="rule-cell"/g) ?? [];
    expect(rules.length).toBe(2);
  });

  it('includes preheader hidden div', () => {
    const html = renderBrandedEmail({
      preheader: 'Preview text here',
      heading: 'h',
      bodyHtml: 'b',
    });
    expect(html).toContain('Preview text here');
    expect(html).toContain('display:none');
  });

  it('escapes special chars in heading', () => {
    const html = renderBrandedEmail({
      preheader: 'x',
      heading: 'You\'re invited <b>today</b> & tomorrow',
      bodyHtml: 'b',
    });
    expect(html).toContain('You&#39;re invited &lt;b&gt;today&lt;/b&gt; &amp; tomorrow');
  });
});

// ─── escapeHtml ────────────────────────────────────────────────────────────────

describe('escapeHtml', () => {
  it('escapes & < > " \'', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b');
    expect(escapeHtml('<div>')).toBe('&lt;div&gt;');
    expect(escapeHtml('"quoted"')).toBe('&quot;quoted&quot;');
    expect(escapeHtml("it's")).toBe('it&#39;s');
  });

  it('passes through clean strings unchanged', () => {
    expect(escapeHtml('Hello World')).toBe('Hello World');
  });
});

// ─── isRawIsoDatetime ──────────────────────────────────────────────────────────

describe('isRawIsoDatetime', () => {
  it('returns true for ISO datetimes', () => {
    expect(isRawIsoDatetime('2026-06-10T18:00:00+00:00')).toBe(true);
    expect(isRawIsoDatetime('2026-06-10T18:00:00Z')).toBe(true);
    expect(isRawIsoDatetime('2026-06-10T00:00:00.000Z')).toBe(true);
  });

  it('returns false for pre-formatted strings', () => {
    expect(isRawIsoDatetime('Tuesday, June 10 · 2:00 PM')).toBe(false);
    expect(isRawIsoDatetime('June 10, 2026')).toBe(false);
    expect(isRawIsoDatetime('')).toBe(false);
    expect(isRawIsoDatetime('soon')).toBe(false);
  });
});

// ─── safeFormatDate ────────────────────────────────────────────────────────────

describe('safeFormatDate', () => {
  it('passes through non-ISO strings unchanged', () => {
    expect(safeFormatDate('Tuesday, June 10')).toBe('Tuesday, June 10');
    expect(safeFormatDate('soon')).toBe('soon');
    expect(safeFormatDate('')).toBe('');
  });

  it('formats ISO datetime strings in datetime mode', () => {
    const result = safeFormatDate('2026-06-10T18:00:00Z', 'UTC', 'datetime');
    expect(result).toMatch(/June 10/);
    expect(result).not.toMatch(/2026-06-10T/);
  });

  it('formats ISO datetime strings in date mode', () => {
    const result = safeFormatDate('2026-06-10T18:00:00Z', 'UTC', 'date');
    expect(result).toMatch(/June 10/);
    expect(result).not.toContain('T');
  });

  it('returns original string for invalid ISO', () => {
    const bad = 'not-a-date-T00:00';
    // isRawIsoDatetime fails — passes through
    expect(safeFormatDate(bad)).toBe(bad);
  });
});

// ─── formatShortDate ──────────────────────────────────────────────────────────

describe('formatShortDate', () => {
  it('formats an ISO date to Month Day, Year', () => {
    const result = formatShortDate('2026-08-25T00:00:00Z', 'UTC');
    expect(result).toContain('August');
    expect(result).toContain('25');
    expect(result).toContain('2026');
  });

  it('returns original string for invalid input', () => {
    expect(formatShortDate('not-a-date')).toBe('not-a-date');
  });
});

// ─── formatEventDateTime ──────────────────────────────────────────────────────

describe('formatEventDateTime', () => {
  it('formats a UTC ISO datetime to readable string', () => {
    const result = formatEventDateTime('2026-06-10T14:00:00Z', 'UTC');
    expect(result).toMatch(/June 10/);
    expect(result).toMatch(/2:00/);
    expect(result).toContain('·');
  });

  it('returns original string for invalid ISO input', () => {
    expect(formatEventDateTime('invalid')).toBe('invalid');
  });

  it('falls back gracefully when timezone is unknown', () => {
    // Should not throw, should return a formatted string
    const result = formatEventDateTime('2026-06-10T14:00:00Z', 'Not/ATimezone');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});
