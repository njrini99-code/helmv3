import { describe, expect, it } from 'vitest';
import { evaluateSchedule, suggestScheduleTimes } from './evaluate';
import type { ScheduleSnapshot } from '../scheduling-contracts';

const snapshot: ScheduleSnapshot = {
  teamId: 'team', timeZone: 'America/New_York', checkedAt: '2026-09-08T12:00:00Z',
  window: { start: '2026-09-08T04:00:00Z', end: '2026-09-09T04:00:00Z' },
  participants: [{ id: 'coach', kind: 'coach', name: 'You', avatarUrl: null, isViewer: true, required: true, verification: 'complete', intervals: [] },
    { id: 'player', kind: 'player', name: 'Player', avatarUrl: null, isViewer: false, required: true, verification: 'complete', intervals: [{ id: 'class', type: 'class', title: 'Class', start: '2026-09-08T18:00:00Z', end: '2026-09-08T19:00:00Z' }] }],
};

describe('scheduling evaluation', () => {
  it('checks the full duration, with half-open adjacency', () => {
    expect(evaluateSchedule(snapshot, { start: '2026-09-08T17:30:00Z', end: '2026-09-08T18:30:00Z' }).overlaps).toHaveLength(1);
    expect(evaluateSchedule(snapshot, { start: '2026-09-08T19:00:00Z', end: '2026-09-08T20:00:00Z' }).allAvailable).toBe(true);
  });
  it('does not label missing, invalid or out-of-window data available', () => {
    const partial = { ...snapshot, participants: snapshot.participants.map((person) => ({ ...person, verification: 'partial' as const })) };
    expect(evaluateSchedule(partial, { start: '2026-09-08T19:00:00Z', end: '2026-09-08T20:00:00Z' })).toMatchObject({ unknown: 2, allAvailable: false });
    expect(suggestScheduleTimes(partial, 60)).toEqual([]);
    expect(evaluateSchedule(snapshot, { start: 'bad', end: 'bad' }).allAvailable).toBe(false);
    expect(evaluateSchedule(snapshot, { start: '2026-09-09T10:00:00Z', end: '2026-09-09T11:00:00Z' }).allAvailable).toBe(false);
    expect(evaluateSchedule({ ...snapshot, participants: [] }, snapshot.window).allAvailable).toBe(false);
  });
  it('suggests only full verified windows in local working hours', () => {
    const suggestions = suggestScheduleTimes(snapshot, 60, '2026-09-08T18:00:00Z');
    expect(suggestions[0]?.start).toBe('2026-09-08T19:00:00.000Z');
    expect(suggestions.every((slot) => evaluateSchedule(snapshot, slot).allAvailable)).toBe(true);
    expect(suggestScheduleTimes(snapshot, Number.NaN)).toEqual([]);
  });
});
