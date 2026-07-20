import { describe, expect, it } from 'vitest';
import { nextStepLabel } from '../next-step-label';

describe('nextStepLabel', () => {
  it('returns the "none" tone + em dash for null', () => {
    expect(nextStepLabel(null)).toEqual({ text: '—', tone: 'none' });
  });

  it('returns the "none" tone + em dash for undefined', () => {
    expect(nextStepLabel(undefined)).toEqual({ text: '—', tone: 'none' });
  });

  it('returns the "none" tone + em dash for an unparseable date string', () => {
    expect(nextStepLabel('not-a-date')).toEqual({ text: '—', tone: 'none' });
  });

  it('labels a future date as "in Nd"', () => {
    const now = new Date('2026-07-16T12:00:00');
    const iso = '2026-07-19T08:00:00';
    expect(nextStepLabel(iso, now)).toEqual({ text: 'in 3d', tone: 'future' });
  });

  it('labels a date later the same calendar day as "today", even though raw ms puts it >12h out', () => {
    const now = new Date('2026-07-16T06:00:00');
    const iso = '2026-07-16T23:30:00';
    expect(nextStepLabel(iso, now)).toEqual({ text: 'today', tone: 'today' });
  });

  it('labels a date earlier the same calendar day as "today", not overdue', () => {
    const now = new Date('2026-07-16T23:00:00');
    const iso = '2026-07-16T00:30:00';
    expect(nextStepLabel(iso, now)).toEqual({ text: 'today', tone: 'today' });
  });

  it('labels a past date as "Nd overdue"', () => {
    const now = new Date('2026-07-16T08:00:00');
    const iso = '2026-07-13T08:00:00';
    expect(nextStepLabel(iso, now)).toEqual({ text: '3d overdue', tone: 'overdue' });
  });

  it('labels yesterday as "1d overdue" even when less than 24h have elapsed', () => {
    // now is 00:30 today; target was 23:30 yesterday — only 1h apart in raw ms,
    // but a different calendar day, so it must read as overdue, not "today".
    const now = new Date('2026-07-16T00:30:00');
    const iso = '2026-07-15T23:30:00';
    expect(nextStepLabel(iso, now)).toEqual({ text: '1d overdue', tone: 'overdue' });
  });

  it('labels tomorrow as "in 1d" even when less than 24h remain', () => {
    // now is 23:00 today; target is 01:00 tomorrow — only 2h apart in raw ms,
    // but a different calendar day, so it must read as "in 1d", not "today".
    const now = new Date('2026-07-16T23:00:00');
    const iso = '2026-07-17T01:00:00';
    expect(nextStepLabel(iso, now)).toEqual({ text: 'in 1d', tone: 'future' });
  });

  it('handles a month boundary correctly (future)', () => {
    const now = new Date('2026-07-31T23:00:00');
    const iso = '2026-08-01T01:00:00';
    expect(nextStepLabel(iso, now)).toEqual({ text: 'in 1d', tone: 'future' });
  });

  it('handles a month boundary correctly (overdue)', () => {
    const now = new Date('2026-08-01T00:30:00');
    const iso = '2026-07-31T23:30:00';
    expect(nextStepLabel(iso, now)).toEqual({ text: '1d overdue', tone: 'overdue' });
  });

  it('handles a year boundary correctly', () => {
    const now = new Date('2026-12-31T10:00:00');
    const iso = '2027-01-02T10:00:00';
    expect(nextStepLabel(iso, now)).toEqual({ text: 'in 2d', tone: 'future' });
  });
});
