import { describe, it, expect } from 'vitest';
import { attentionOrder, buildVerdict, fieldDomain, rollupPlayers, shortDay, sortByStanding, titleCase } from './coach-home-logic';
import type { CoachDashboardData } from '@/app/golf/(dashboard)/dashboard/components/coach-dashboard-types';

function round(id: string, playerId: string, date: string, score: number, toPar: number): CoachDashboardData['recentRounds'][number] {
  return {
    id, player_id: playerId, player_name: `Player ${playerId}`, player_avatar_url: null, course_name: 'QA test course',
    total_score: score, total_to_par: toPar, round_date: date, round_type: null, total_putts: null,
    total_fairways_hit: null, total_fairways: null, total_gir: null, total_gir_possible: null,
  };
}

const ROSTER = [
  { id: 'a', name: 'Ada', avatar_url: null },
  { id: 'b', name: 'Ben', avatar_url: null },
  { id: 'c', name: 'Cy', avatar_url: null },
];

// Ada: ten rounds, newest five average 72, older five average 78: improving.
// Ben: ten rounds, newest five average 80, older five average 74: sliding.
const ROUNDS = [
  ...[78, 77, 79, 78, 78].map((s, i) => round(`a-old-${i}`, 'a', `2026-07-0${i + 1}`, s, s - 72)),
  ...[72, 71, 73, 72, 72].map((s, i) => round(`a-new-${i}`, 'a', `2026-08-0${i + 1}`, s, s - 72)),
  ...[74, 73, 75, 74, 74].map((s, i) => round(`b-old-${i}`, 'b', `2026-07-0${i + 1}`, s, s - 72)),
  ...[80, 79, 81, 80, 80].map((s, i) => round(`b-new-${i}`, 'b', `2026-08-0${i + 1}`, s, s - 72)),
];

describe('rollupPlayers', () => {
  it('builds one row per roster player, rounds oldest first, with the canonical trend', () => {
    const rows = rollupPlayers(ROUNDS, ROSTER, [{ id: 'a', name: 'Ada', avg_score: 75, rounds: 10 }]);
    expect(rows.map((r) => r.id)).toEqual(['a', 'b', 'c']);
    const ada = rows[0]!;
    expect(ada.rounds.map((r) => r.date)[0]).toBe('2026-07-01');
    expect(ada.rounds[ada.rounds.length - 1]!.date).toBe('2026-08-05');
    expect(ada.avg).toBe(75);
    expect(ada.trend?.direction).toBe('improving');
    expect(ada.trend!.delta).toBeLessThan(0);
    expect(ada.rounds[0]!.label).toBe('Jul 1, QA Test Course, 78 (+6)');
    expect(ada.rounds[0]!.href).toBe('/golf/dashboard/rounds/a-old-0');
    const ben = rows[1]!;
    expect(ben.avg).toBeCloseTo(77, 5);
    expect(ben.trend?.direction).toBe('declining');
    const cy = rows[2]!;
    expect(cy.rounds).toEqual([]);
    expect(cy.avg).toBeNull();
    expect(cy.trend).toBeNull();
  });

  it('falls back to the players present in the rounds when there is no roster', () => {
    const rows = rollupPlayers(ROUNDS, undefined, []);
    expect(rows.map((r) => r.id).sort()).toEqual(['a', 'b']);
    expect(rows.find((r) => r.id === 'a')!.name).toBe('Player a');
  });
});

describe('ordering', () => {
  const rows = rollupPlayers(ROUNDS, ROSTER, []);
  it('sorts by standing with round-less players last', () => {
    expect(sortByStanding(rows).map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });
  it('lists sliders first, then improvers, and skips players with no read', () => {
    expect(attentionOrder(rows).map((r) => r.id)).toEqual(['b', 'a']);
  });
});

describe('fieldDomain', () => {
  const rows = rollupPlayers(ROUNDS, ROSTER, []);
  it('uses the window start when there is one', () => {
    expect(fieldDomain(rows, '2026-08-11', '2026-09-10')).toEqual({ start: '2026-08-11', end: '2026-09-10' });
  });
  it('starts at the oldest round for all time', () => {
    expect(fieldDomain(rows, null, '2026-09-10')).toEqual({ start: '2026-07-01', end: '2026-09-10' });
  });
  it('collapses to today when nothing is plotted', () => {
    expect(fieldDomain([], null, '2026-09-10')).toEqual({ start: '2026-09-10', end: '2026-09-10' });
  });
});

describe('buildVerdict', () => {
  it('names the day, the leader, the slide and the signals, each as a link where there is a page', () => {
    const parts = buildVerdict({
      todayEventCount: 2,
      pulse: { improving: 3, stable: 1, declining: 4 },
      leader: { id: 'a', name: 'Ada', avg: 73.4 },
      worstSlide: { id: 'b', name: 'Ben', delta: 2.6 },
      signals: 1,
      roundsInWindow: 20,
      rangeIsAll: true,
    });
    expect(parts.map((p) => p.text).join('')).toBe('2 events today. Ada leads at 73.4. 3 improving, 4 sliding, Ben the most at 2.6 strokes. 1 signal waiting.');
    expect(parts.find((p) => p.text === 'Ada')?.href).toBe('/golf/dashboard/roster/a');
    expect(parts.find((p) => p.text === '1 signal waiting.')?.href).toBe('/golf/dashboard/intelligence');
  });
  it('is honest about an empty window', () => {
    const text = buildVerdict({ todayEventCount: 0, pulse: null, leader: null, worstSlide: null, signals: 0, roundsInWindow: 0, rangeIsAll: false })
      .map((p) => p.text).join('');
    expect(text).toBe('Quiet day. No rounds in this window.');
  });
});

describe('formatting', () => {
  it('shortDay and titleCase', () => {
    expect(shortDay('2026-08-31')).toBe('Aug 31');
    expect(titleCase('pebble beach golf links')).toBe('Pebble Beach Golf Links');
    expect(titleCase('QA Test Course')).toBe('QA Test Course');
  });
});
