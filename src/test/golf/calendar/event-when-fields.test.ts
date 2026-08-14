/**
 * The event editor's "when" controls express a SPAN. These are the pure
 * formatters behind that: the end-time list labels every option with its
 * duration from the chosen start, so picking an end IS picking a duration.
 *
 * The midnight cases are the ones worth pinning — duration is measured
 * forward modulo a day, so a 10pm–1am round trip reads as "3 hr" rather than
 * a negative span, matching `shiftStartTime`'s wrap in FairwayEventEditor.
 */

import { describe, it, expect } from 'vitest';
import {
  toMinutes,
  fromMinutes,
  formatClock,
  formatDuration,
  formatDateLabel,
} from '@/components/fairway/pages/calendar/EventWhenFields';

describe('toMinutes / fromMinutes', () => {
  it('round-trips a clock time', () => {
    expect(toMinutes('09:05')).toBe(545);
    expect(fromMinutes(545)).toBe('09:05');
  });

  it('rejects unparseable input rather than coercing it to midnight', () => {
    expect(toMinutes(null)).toBeNull();
    expect(toMinutes('')).toBeNull();
    expect(toMinutes('9am')).toBeNull();
    expect(toMinutes('24:00')).toBeNull();
    expect(toMinutes('09:60')).toBeNull();
  });

  it('wraps out-of-range minutes into a real clock time', () => {
    expect(fromMinutes(1440)).toBe('00:00');
    expect(fromMinutes(1530)).toBe('01:30');
    expect(fromMinutes(-30)).toBe('23:30');
  });
});

describe('formatClock', () => {
  it('renders 12-hour time with a meridiem', () => {
    expect(formatClock('09:05')).toBe('9:05 AM');
    expect(formatClock('13:00')).toBe('1:00 PM');
  });

  /** Both boundaries are 12, not 0 — the classic off-by-one in this conversion. */
  it('renders midnight and noon as 12', () => {
    expect(formatClock('00:00')).toBe('12:00 AM');
    expect(formatClock('12:00')).toBe('12:00 PM');
    expect(formatClock('12:30')).toBe('12:30 PM');
  });

  it('shows a placeholder rather than inventing a time', () => {
    expect(formatClock(null)).toBe('--:--');
    expect(formatClock('nope')).toBe('--:--');
  });
});

describe('formatDuration', () => {
  it('labels hours, minutes, and both', () => {
    expect(formatDuration(45)).toBe('45 min');
    expect(formatDuration(60)).toBe('1 hr');
    expect(formatDuration(150)).toBe('2 hr 30');
  });

  /** A zero-length span gets no label at all — the start row shouldn't claim
   *  "0 min" next to the time the coach just picked. */
  it('renders nothing for a zero or negative span', () => {
    expect(formatDuration(0)).toBe('');
    expect(formatDuration(-30)).toBe('');
  });
});

describe('formatDateLabel', () => {
  /**
   * Parsed from local Y/M/D parts, NOT `new Date(iso)` — a bare calendar date
   * resolves to midnight UTC and renders as the previous day anywhere west of
   * Greenwich, which is every user this product has.
   */
  it('keeps the calendar date the coach picked', () => {
    expect(formatDateLabel('2026-08-14')).toBe('Fri, Aug 14');
    expect(formatDateLabel('2026-01-01')).toBe('Thu, Jan 1');
  });

  it('prompts rather than rendering an empty slot', () => {
    expect(formatDateLabel(null)).toBe('Pick a date');
  });

  it('passes through a value it cannot parse instead of guessing', () => {
    expect(formatDateLabel('not-a-date')).toBe('not-a-date');
  });
});
