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

  it('includes the logo img tag pointing to the absolute URL', () => {
    const html = renderBrandedEmail({
      preheader: 'x',
      heading: 'h',
      bodyHtml: 'b',
    });
    expect(html).toContain('helm-golf-logo-transparent.png');
    expect(html).toContain('alt="Helm"');
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
    const html = renderBrandedEmail({
      preheader: 'x',
      heading: 'h',
      bodyHtml: 'b',
    });
    // No uppercase chip other than in footer
    expect(html.match(/text-transform:uppercase/g)?.length ?? 0).toBeLessThan(2);
  });

  it('renders CTA button when cta is provided', () => {
    const html = renderBrandedEmail({
      preheader: 'x',
      heading: 'h',
      bodyHtml: 'b',
      cta: { label: 'RSVP Now', url: 'https://example.com/rsvp' },
    });
    expect(html).toContain('RSVP Now');
    expect(html).toContain('https://example.com/rsvp');
  });

  it('omits CTA when not provided', () => {
    const html = renderBrandedEmail({
      preheader: 'x',
      heading: 'No CTA',
      bodyHtml: '<p>content</p>',
    });
    // No button table
    expect(html).not.toContain('border-radius:8px;background-color:#16A34A');
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
    // details table not present
    expect(withoutDetails).not.toMatch(/border-radius:8px;overflow:hidden;margin:20px 0/);
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

  it('includes green accent bar', () => {
    const html = renderBrandedEmail({
      preheader: 'x',
      heading: 'h',
      bodyHtml: 'b',
    });
    expect(html).toContain('#16A34A');
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
