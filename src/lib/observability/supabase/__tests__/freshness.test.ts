import { describe, it, expect } from 'vitest';
import { classifySourceFreshness, summarizeTelemetryHealth, type TelemetrySource } from '../freshness';

const NOW = new Date('2026-09-03T12:00:00.000Z');
const FIVE_MIN_MS = 5 * 60_000;

describe('classifySourceFreshness', () => {
  it('is blind when the source could not be read, regardless of lastSampleAt', () => {
    const result = classifySourceFreshness({
      lastSampleAt: NOW.toISOString(), // even a "fresh" timestamp
      expectedIntervalMs: FIVE_MIN_MS,
      now: NOW,
      readable: false,
    });
    expect(result).toBe('blind');
  });

  it('is unknown when the source was read successfully but has never sampled', () => {
    const result = classifySourceFreshness({ lastSampleAt: null, expectedIntervalMs: FIVE_MIN_MS, now: NOW, readable: true });
    expect(result).toBe('unknown');
  });

  it('is healthy at or below 1.5x the expected interval', () => {
    const at1x = new Date(NOW.getTime() - FIVE_MIN_MS).toISOString();
    expect(classifySourceFreshness({ lastSampleAt: at1x, expectedIntervalMs: FIVE_MIN_MS, now: NOW, readable: true })).toBe(
      'healthy',
    );

    const atExactly1_5x = new Date(NOW.getTime() - FIVE_MIN_MS * 1.5).toISOString();
    expect(
      classifySourceFreshness({ lastSampleAt: atExactly1_5x, expectedIntervalMs: FIVE_MIN_MS, now: NOW, readable: true }),
    ).toBe('healthy');
  });

  it('is degraded above 1.5x and at or below 3x the expected interval', () => {
    const at2x = new Date(NOW.getTime() - FIVE_MIN_MS * 2).toISOString();
    expect(classifySourceFreshness({ lastSampleAt: at2x, expectedIntervalMs: FIVE_MIN_MS, now: NOW, readable: true })).toBe(
      'degraded',
    );

    const atExactly3x = new Date(NOW.getTime() - FIVE_MIN_MS * 3).toISOString();
    expect(
      classifySourceFreshness({ lastSampleAt: atExactly3x, expectedIntervalMs: FIVE_MIN_MS, now: NOW, readable: true }),
    ).toBe('degraded');
  });

  it('is stale above 3x the expected interval', () => {
    const at4x = new Date(NOW.getTime() - FIVE_MIN_MS * 4).toISOString();
    expect(classifySourceFreshness({ lastSampleAt: at4x, expectedIntervalMs: FIVE_MIN_MS, now: NOW, readable: true })).toBe(
      'stale',
    );
  });

  it('is unknown, not healthy, for a malformed or future timestamp', () => {
    const future = new Date(NOW.getTime() + FIVE_MIN_MS).toISOString();
    expect(classifySourceFreshness({ lastSampleAt: future, expectedIntervalMs: FIVE_MIN_MS, now: NOW, readable: true })).toBe(
      'unknown',
    );
    expect(
      classifySourceFreshness({ lastSampleAt: 'not-a-date', expectedIntervalMs: FIVE_MIN_MS, now: NOW, readable: true }),
    ).toBe('unknown');
  });
});

function source(overrides: Partial<TelemetrySource> = {}): TelemetrySource {
  return { name: 'db_health_samples', state: 'healthy', required: true, ...overrides };
}

describe('summarizeTelemetryHealth', () => {
  it('is unknown when there are no sources at all', () => {
    expect(summarizeTelemetryHealth([])).toBe('unknown');
  });

  it('is green only when every source is healthy', () => {
    expect(summarizeTelemetryHealth([source(), source({ name: 'db_stat_deltas' })])).toBe('green');
  });

  it('is never green when a required source is blind, even if every other source is healthy', () => {
    const result = summarizeTelemetryHealth([source(), source({ name: 'db_error_events', state: 'blind' })]);
    expect(result).not.toBe('green');
    expect(result).toBe('red');
  });

  it('is never green when a required source is stale', () => {
    const result = summarizeTelemetryHealth([source(), source({ name: 'db_table_samples', state: 'stale' })]);
    expect(result).toBe('red');
  });

  it('degrades (not reds) on a required source that is merely degraded, not blind/stale', () => {
    const result = summarizeTelemetryHealth([source(), source({ name: 'db_stat_deltas', state: 'degraded' })]);
    expect(result).toBe('degraded');
  });

  it('degrades on an unknown source rather than reporting green', () => {
    const result = summarizeTelemetryHealth([source(), source({ name: 'db_lock_incidents', state: 'unknown' })]);
    expect(result).toBe('degraded');
  });

  it('an optional (non-required) blind source still degrades the overall state, never silently ignored', () => {
    const result = summarizeTelemetryHealth([source(), source({ name: 'optional_thing', state: 'blind', required: false })]);
    expect(result).not.toBe('green');
  });
});
