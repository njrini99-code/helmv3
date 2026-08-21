import { describe, it, expect } from 'vitest';
import { classifyInProgressActivity } from '../tracer-round-activity';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe('classifyInProgressActivity', () => {
  const now = new Date('2026-08-20T12:00:00.000Z').getTime();

  it('classifies a round idle less than an hour as in_progress', () => {
    const updatedAt = new Date(now - 30 * 60 * 1000).toISOString();
    const createdAt = new Date(now - 30 * 60 * 1000).toISOString();
    expect(classifyInProgressActivity(createdAt, updatedAt, now)).toBe('round_in_progress');
  });

  it('classifies a recently-started round idle 1h+ as stuck', () => {
    const createdAt = new Date(now - 2 * DAY).toISOString(); // started 2 days ago
    const updatedAt = new Date(now - 2 * HOUR).toISOString(); // halted 2h ago
    expect(classifyInProgressActivity(createdAt, updatedAt, now)).toBe('round_stuck');
  });

  it('classifies an old round idle 1h+ as abandoned, not stuck', () => {
    // The reported scenario: a round created in May, touched once, never
    // resumed. Recently updated enough to still be in the 30-day window,
    // but started long before the 7-day "recently active" cutoff.
    const createdAt = new Date(now - 90 * DAY).toISOString();
    const updatedAt = new Date(now - 10 * DAY).toISOString();
    expect(classifyInProgressActivity(createdAt, updatedAt, now)).toBe('round_abandoned');
  });

  it('treats a round with no created_at as not-recently-created (abandoned, not stuck)', () => {
    const updatedAt = new Date(now - 3 * HOUR).toISOString();
    expect(classifyInProgressActivity(null, updatedAt, now)).toBe('round_abandoned');
  });

  it('returns null outside the 30-day recency window regardless of tier', () => {
    const createdAt = new Date(now - 120 * DAY).toISOString();
    const updatedAt = new Date(now - 31 * DAY).toISOString();
    expect(classifyInProgressActivity(createdAt, updatedAt, now)).toBeNull();
  });

  it('is inclusive at exactly the 1h stuck boundary', () => {
    const createdAt = new Date(now - DAY).toISOString();
    const updatedAt = new Date(now - HOUR).toISOString();
    expect(classifyInProgressActivity(createdAt, updatedAt, now)).toBe('round_stuck');
  });
});
