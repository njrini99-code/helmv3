/**
 * Characterization tests for the shared display formatters in `src/lib/utils.ts`.
 *
 * WHY THIS FILE EXISTS: 7 of the 9 exports here had ZERO test coverage —
 * `formatNumber`, `formatMetricLabel`, `formatDateTime`, `formatRelativeTime`,
 * `formatHeight`, `getFullName`, `getPipelineStageLabel`. They are pure display
 * helpers imported across both products (video cards, journey timeline, college
 * interest, camps, showcase dashboards), so a silent change here is visible
 * everywhere at once and nothing would have caught it.
 *
 * These are CHARACTERIZATION tests: an audit of this file found NO live bug, so
 * they pin current behavior rather than assert a fix. The one genuinely
 * dangerous edge is documented below.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  formatNumber,
  formatMetricLabel,
  pluralize,
  formatDateTime,
  formatRelativeTime,
  formatHeight,
  getFullName,
  getPipelineStageLabel,
} from '../utils';

describe('formatNumber', () => {
  it('renders an em dash for null/undefined rather than "null"', () => {
    expect(formatNumber(null)).toBe('—');
    expect(formatNumber(undefined)).toBe('—');
  });

  it('keeps 0 as a real value, not the empty-state dash', () => {
    // Guards the classic falsy bug: `if (!num) return '—'` would erase a
    // legitimate zero, which for a stat line means "no data" instead of "zero".
    expect(formatNumber(0)).toBe('0');
  });

  it('group-separates thousands', () => {
    expect(formatNumber(1234)).toBe('1,234');
  });
});

describe('formatMetricLabel', () => {
  it('uses the curated label for known metric keys, in both cases', () => {
    expect(formatMetricLabel('score_to_par')).toBe('Score to Par');
    expect(formatMetricLabel('scoreToPar')).toBe('Score to Par');
    expect(formatMetricLabel('greens_in_regulation')).toBe('Greens in Regulation');
  });

  it('falls back to splitting camelCase and snake_case', () => {
    expect(formatMetricLabel('puttsInsideTenFeet')).toBe('Putts Inside Ten Feet');
    expect(formatMetricLabel('sand_save_pct')).toBe('Sand Save Pct');
  });

  it('returns empty string for null/undefined, never "undefined"', () => {
    expect(formatMetricLabel(null)).toBe('');
    expect(formatMetricLabel(undefined)).toBe('');
  });

  it('LOWERCASES the tail of every word, so acronyms are flattened', () => {
    // Documented, not endorsed: an unmapped acronym renders as "Gir"/"Sg".
    // Anything that must keep its casing needs a METRIC_LABELS entry.
    expect(formatMetricLabel('GIR')).toBe('Gir');
    expect(formatMetricLabel('sg_putting')).toBe('Sg Putting');
  });
});

describe('pluralize', () => {
  it('says "No <plural>" at zero', () => {
    expect(pluralize(0, 'round')).toBe('No rounds');
    expect(pluralize(0, 'entry', 'entries')).toBe('No entries');
  });

  it('drops the plural at exactly one', () => {
    expect(pluralize(1, 'round')).toBe('1 round');
  });

  it('group-separates large counts via formatNumber', () => {
    expect(pluralize(1234, 'round')).toBe('1,234 rounds');
  });
});

describe('formatHeight', () => {
  it('renders feet and inches', () => {
    expect(formatHeight(6, 2)).toBe(`6'2"`);
  });

  it('treats a missing inches as 0 rather than dropping the value', () => {
    expect(formatHeight(6, null)).toBe(`6'0"`);
    expect(formatHeight(6, undefined)).toBe(`6'0"`);
  });

  it('renders the dash when feet is missing', () => {
    expect(formatHeight(null, 10)).toBe('—');
    expect(formatHeight(undefined, undefined)).toBe('—');
  });
});

describe('getFullName', () => {
  it('joins the parts present', () => {
    expect(getFullName('Cole', 'Bennett')).toBe('Cole Bennett');
    expect(getFullName('Cole', null)).toBe('Cole');
    expect(getFullName(null, 'Bennett')).toBe('Bennett');
  });

  it('falls back to "Unknown" rather than rendering an empty name', () => {
    expect(getFullName(null, null)).toBe('Unknown');
    expect(getFullName('', '')).toBe('Unknown');
  });
});

describe('getPipelineStageLabel', () => {
  it('returns the raw id when the stage is unrecognized, never blank', () => {
    expect(getPipelineStageLabel('definitely_not_a_stage')).toBe('definitely_not_a_stage');
  });
});

describe('formatDateTime / formatRelativeTime', () => {
  // Both read `new Date()` internally, so time must be frozen.
  const NOW = new Date('2026-08-16T15:00:00.000Z');

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('formatDateTime labels today and yesterday', () => {
    expect(formatDateTime(new Date(NOW.getTime() - 60 * 60_000))).toMatch(/^Today at /);
    expect(formatDateTime(new Date(NOW.getTime() - 26 * 60 * 60_000))).toMatch(/^Yesterday at /);
  });

  it('formatRelativeTime walks the just-now / minutes / hours / days ladder', () => {
    expect(formatRelativeTime(new Date(NOW.getTime() - 30_000))).toBe('Just now');
    expect(formatRelativeTime(new Date(NOW.getTime() - 5 * 60_000))).toBe('5m ago');
    expect(formatRelativeTime(new Date(NOW.getTime() - 3 * 60 * 60_000))).toBe('3h ago');
    expect(formatRelativeTime(new Date(NOW.getTime() - 26 * 60 * 60_000))).toBe('Yesterday');
    expect(formatRelativeTime(new Date(NOW.getTime() - 3 * 24 * 60 * 60_000))).toBe('3d ago');
  });

  /**
   * LANDMINE — READ BEFORE PASSING A FUTURE DATE TO formatRelativeTime.
   *
   * `differenceInMinutes(now, d)` is NEGATIVE when `d` is in the future, and the
   * first branch is `if (mins < 1) return 'Just now'`. So ANY future timestamp —
   * a scheduled event, an RSVP deadline, a task due date — renders as
   * "Just now", not "in 2 hours".
   *
   * This is NOT a live bug today, which is the only reason it is pinned here
   * rather than fixed. Every caller of the shared helper passes an inherently
   * past value: video.created_at, clip.created_at, school.created_at,
   * activity.created_at, reg.attended_at, entry.joined_at, event.timestamp.
   * (SystemTab.tsx and MessagesClient.tsx define their OWN local
   * formatRelativeTime — those are different functions, not this one.)
   *
   * If you wire a future date to this helper, this test will still pass and your
   * UI will silently say "Just now". Add a future-branch first.
   */
  it('LANDMINE: a FUTURE date renders as "Just now" (unreachable today)', () => {
    expect(formatRelativeTime(new Date(NOW.getTime() + 2 * 60 * 60_000))).toBe('Just now');
    expect(formatRelativeTime(new Date(NOW.getTime() + 30 * 24 * 60 * 60_000))).toBe('Just now');
  });
});
