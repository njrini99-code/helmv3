import { describe, expect, it } from 'vitest';
import { overdueLabel, relativeCompact } from '../signals-format';

const NOW = new Date('2026-07-20T12:00:00.000Z');

describe('relativeCompact', () => {
  it('returns "" for null/undefined/empty input', () => {
    expect(relativeCompact(null, NOW)).toBe('');
    expect(relativeCompact(undefined, NOW)).toBe('');
    expect(relativeCompact('', NOW)).toBe('');
  });

  it('returns "" for an unparseable date string', () => {
    expect(relativeCompact('not-a-date', NOW)).toBe('');
  });

  it('returns "just now" for timestamps under a minute old', () => {
    const iso = new Date(NOW.getTime() - 30 * 1000).toISOString();
    expect(relativeCompact(iso, NOW)).toBe('just now');
  });

  it('treats a future timestamp (clock skew) as "just now"', () => {
    const iso = new Date(NOW.getTime() + 5 * 1000).toISOString();
    expect(relativeCompact(iso, NOW)).toBe('just now');
  });

  it('formats minutes', () => {
    const iso = new Date(NOW.getTime() - 12 * 60 * 1000).toISOString();
    expect(relativeCompact(iso, NOW)).toBe('12m ago');
  });

  it('formats hours', () => {
    const iso = new Date(NOW.getTime() - 3 * 60 * 60 * 1000).toISOString();
    expect(relativeCompact(iso, NOW)).toBe('3h ago');
  });

  it('formats days', () => {
    const iso = new Date(NOW.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();
    expect(relativeCompact(iso, NOW)).toBe('3d ago');
  });

  it('formats months once past 30 days', () => {
    const iso = new Date(NOW.getTime() - 65 * 24 * 60 * 60 * 1000).toISOString();
    expect(relativeCompact(iso, NOW)).toBe('2mo ago');
  });

  it('formats years once past 12 months', () => {
    const iso = new Date(NOW.getTime() - 400 * 24 * 60 * 60 * 1000).toISOString();
    expect(relativeCompact(iso, NOW)).toBe('1y ago');
  });
});

describe('overdueLabel', () => {
  it('returns "" for null/undefined/empty input', () => {
    expect(overdueLabel(null, NOW)).toBe('');
    expect(overdueLabel(undefined, NOW)).toBe('');
    expect(overdueLabel('', NOW)).toBe('');
  });

  it('returns "" for an unparseable date string', () => {
    expect(overdueLabel('not-a-date', NOW)).toBe('');
  });

  it('returns "today" for a follow-up due earlier today (< 24h ago)', () => {
    const iso = new Date(NOW.getTime() - 3 * 60 * 60 * 1000).toISOString();
    expect(overdueLabel(iso, NOW)).toBe('today');
  });

  it('returns "today" for a follow-up due in the future (not actually overdue yet)', () => {
    const iso = new Date(NOW.getTime() + 60 * 60 * 1000).toISOString();
    expect(overdueLabel(iso, NOW)).toBe('today');
  });

  it('formats single-day overdue', () => {
    const iso = new Date(NOW.getTime() - 25 * 60 * 60 * 1000).toISOString();
    expect(overdueLabel(iso, NOW)).toBe('1d overdue');
  });

  it('formats multi-day overdue', () => {
    const iso = new Date(NOW.getTime() - 9 * 24 * 60 * 60 * 1000).toISOString();
    expect(overdueLabel(iso, NOW)).toBe('9d overdue');
  });
});
