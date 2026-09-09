import { describe, it, expect } from 'vitest';
import { deriveSchedulePosition } from '../SelfHealCircuit';

/**
 * The meter and the status pill must share one clock. `classifyCronStatus`
 * calls a stage overdue when `ageMinutes > cadenceMinutes * 1.5`, measured
 * from `started_at` — so the track spans 1.5 cadences from the LAST RUN, and
 * the "next expected" tick lands at two thirds of it. Drawing a full cadence
 * with the threshold half a width past the end puts the two on different
 * clocks and reintroduces the misread this exists to fix.
 */
const DAY = 24 * 60 * 60 * 1000;
const last = Date.parse('2026-08-31T09:18:19.000Z');
const due = new Date(last + DAY).toISOString(); // cadence = daily
const overdue = new Date(last + 1.5 * DAY).toISOString();
const lastIso = new Date(last).toISOString();

describe('deriveSchedulePosition', () => {
  it('puts the expected-run tick at two thirds of the track, not the end', () => {
    const p = deriveSchedulePosition(lastIso, due, overdue, last + DAY / 2);
    expect(p?.duePercent).toBeCloseTo(66.667, 2);
  });

  it('reads on-schedule before the expected time, with the remaining gap', () => {
    const p = deriveSchedulePosition(lastIso, due, overdue, last + 22 * 60 * 60 * 1000);
    expect(p?.phase).toBe('on-schedule');
    expect(p?.label).toBe('due in 2h');
    expect(p?.nowPercent).toBeCloseTo(61.111, 2);
  });

  it('reads LATE — not overdue — between the expected time and the threshold', () => {
    // The exact case the old board rendered as a bare past timestamp with no
    // framing: past due, still classified `ok` by classifyCronStatus.
    const p = deriveSchedulePosition(lastIso, due, overdue, last + 28 * 60 * 60 * 1000);
    expect(p?.phase).toBe('late');
    expect(p?.label).toBe('late by 4h, not yet overdue');
  });

  it('flips to overdue exactly at the 1.5-cadence threshold and measures from it', () => {
    const p = deriveSchedulePosition(lastIso, due, overdue, last + 1.5 * DAY + 3 * 60 * 60 * 1000);
    expect(p?.phase).toBe('overdue');
    expect(p?.label).toBe('overdue by 3h');
  });

  it('clamps the now-marker to the track instead of overflowing it', () => {
    const p = deriveSchedulePosition(lastIso, due, overdue, last + 30 * DAY);
    expect(p?.nowPercent).toBe(100);
    expect(p?.phase).toBe('overdue');
  });

  it('never renders a meter without all three instants', () => {
    expect(deriveSchedulePosition(null, due, overdue, last)).toBeNull();
    expect(deriveSchedulePosition(lastIso, null, overdue, last)).toBeNull();
    expect(deriveSchedulePosition(lastIso, due, null, last)).toBeNull();
  });

  it('returns null rather than dividing by a zero or negative span', () => {
    expect(deriveSchedulePosition(lastIso, due, lastIso, last)).toBeNull();
    expect(deriveSchedulePosition('not-a-date', due, overdue, last)).toBeNull();
  });
});
