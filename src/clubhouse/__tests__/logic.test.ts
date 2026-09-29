import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn() }));
vi.mock('@/lib/error-logging', () => ({ logError: vi.fn() }));

import { formatSigned, formatToPar, formatFixed, initials, MINUS, NO_DATA } from '../lib/format';
import { classYearLabel, formStatus } from '../data/home';
import { friendlyReason } from '../lib/use-action';
import { activeNavItem, isRebuilt, rebuiltHref } from '../shell/nav';

describe('format', () => {
  it('writes to-par with E, a true minus and a dash for no data', () => {
    expect(formatToPar(0)).toBe('E');
    expect(formatToPar(3)).toBe('+3');
    expect(formatToPar(-2)).toBe(`${MINUS}2`);
    expect(formatToPar(-0.44, 1)).toBe(`${MINUS}0.4`);
    expect(formatToPar(0.04, 1)).toBe('E');
    expect(formatToPar(null)).toBe(NO_DATA);
  });
  it('keeps null, zero and signed values distinct', () => {
    expect(formatSigned(null)).toBe(NO_DATA);
    expect(formatSigned(0)).toBe('0.0');
    expect(formatSigned(1.84)).toBe('+1.8');
    expect(formatSigned(-0.9)).toBe(`${MINUS}0.9`);
    expect(formatFixed(undefined)).toBe(NO_DATA);
  });
  it('makes monograms', () => {
    expect(initials('Theo Marchetti')).toBe('TM');
    expect(initials('Priya van der Natarajan')).toBe('PN');
    expect(initials('Cher')).toBe('C');
  });
});

describe('home logic', () => {
  const oct = new Date('2026-10-14T12:00:00Z');
  it('labels class years against the academic year in progress', () => {
    expect(classYearLabel(2027, oct)).toBe('Senior');
    expect(classYearLabel(2030, oct)).toBe('Freshman');
    expect(classYearLabel(2032, oct)).toBe('Class of 2032');
    expect(classYearLabel(null, oct)).toBeNull();
  });
  it('reads form from the newer half against the older half', () => {
    expect(formStatus([72, 73])).toBe('early');
    expect(formStatus([75, 75, 74, 73, 72, 72])).toBe('improving');
    expect(formStatus([72, 72, 73, 74, 75, 74, 75])).toBe('slipping');
    expect(formStatus([72, 72, 71, 72, 71, 71, 72])).toBe('steady');
  });
});

describe('user-facing errors', () => {
  it('passes short readable reasons and hides technical ones', () => {
    expect(friendlyReason('That player already left the team')).toBe('That player already left the team.');
    expect(friendlyReason('duplicate key value violates unique constraint "x"')).toBeNull();
    expect(friendlyReason('PGRST116: JSON object requested')).toBeNull();
    expect(friendlyReason('Not authenticated')).toMatch(/Sign in again/);
    expect(friendlyReason(undefined)).toBeNull();
  });
});

describe('nav', () => {
  it('picks the most specific item and gates unbuilt links', () => {
    expect(activeNavItem('/golf/dashboard')?.id).toBe('home');
    expect(activeNavItem('/golf/dashboard/roster/abc')?.id).toBe('roster');
    expect(isRebuilt('/golf/dashboard/')).toBe(true);
    expect(rebuiltHref('/golf/dashboard/stats?player=1')).toBe('/golf/dashboard/stats?player=1');
    expect(rebuiltHref('/golf/dashboard/rounds')).toBeNull();
    // Players share Stats but not the coach Home or Roster.
    expect(isRebuilt('/golf/dashboard', 'player')).toBe(false);
    expect(isRebuilt('/golf/dashboard/roster', 'player')).toBe(false);
    expect(isRebuilt('/golf/dashboard/stats', 'player')).toBe(true);
    expect(activeNavItem('/golf/dashboard/stats', 'player')?.label).toBe('My stats');
  });
});

import { attentionFor } from '../data/roster';
import { summarizePlayer, type ChRound } from '../data/season';

const round = (id: string, date: string, score: number, extra: Partial<ChRound> = {}): ChRound => ({
  id, player_id: 'p', course_name: 'Finley GC', tees_played: null, round_date: date, round_type: null,
  total_score: score, score_to_par: score - 72, front_nine: null, back_nine: null, holes_played: 18,
  total_putts: 30, total_gir: 10, total_gir_possible: 18, total_fairways_hit: 7, total_fairways: 14,
  strokes_gained_total: null, strokes_gained_tee: null, strokes_gained_approach: null,
  strokes_gained_around_green: null, strokes_gained_putting: null, ...extra,
});

describe('roster attention', () => {
  const now = new Date('2026-10-14T12:00:00Z');
  it('flags a quiet player only while the team is posting', () => {
    const s = summarizePlayer([round('a', '2026-10-01', 74), round('b', '2026-09-28', 75)]);
    expect(attentionFor(s, now, true)).toEqual({ tone: 'warning', text: 'No rounds in 13 days' });
    expect(attentionFor(s, now, false)).toBeNull();
  });
  it('flags scoring up by 1.5 or more', () => {
    const s = summarizePlayer(['76', '76', '75', '73', '72', '72'].map((x, i) => round(`r${i}`, `2026-10-1${3 - Math.min(i, 3)}`, Number(x))));
    expect(attentionFor(s, now, false)?.text).toMatch(/^Scoring up/);
  });
  it('praises four straight rounds under a player’s average', () => {
    const scores = [70, 71, 70, 71, 76, 77, 76, 77];
    const s = summarizePlayer(scores.map((x, i) => round(`r${i}`, `2026-10-${String(13 - i).padStart(2, '0')}`, x)));
    expect(attentionFor(s, now, false)).toEqual({ tone: 'positive', text: '4 rounds under average' });
  });
  it('keeps strokes gained null below three rounds with SG', () => {
    const s = summarizePlayer([round('a', '2026-10-01', 72, { strokes_gained_total: 1 }), round('b', '2026-09-30', 72, { strokes_gained_total: 2 })]);
    expect(s.sgPerRound).toBeNull();
    expect(s.sgRounds).toBe(2);
  });
});

describe('stats windows', async () => {
  const { parseWindow, roundsInWindow, previousWindow, rate, tourForGender, weekOf } = await import('../data/stats-common');
  const round = (i: number, type = 'practice', holes = 18) =>
    ({ id: `r${i}`, player_id: 'p', round_date: '2026-09-01', round_type: type, holes_played: holes, total_score: 73, score_to_par: 1 }) as never;

  it('defaults an unknown window to the last 10', () => {
    expect(parseWindow(undefined)).toBe('last10');
    expect(parseWindow('nonsense')).toBe('last10');
    expect(parseWindow('qualifiers')).toBe('qualifiers');
  });

  it('keeps 18-hole rounds and reads both qualifier spellings', () => {
    const rounds = [round(1, 'Qualifier'), round(2, 'qualifying'), round(3), round(4, 'qualifier', 9)];
    expect(roundsInWindow(rounds, 'qualifiers').map((r: { id: string }) => r.id)).toEqual(['r1', 'r2']);
    expect(roundsInWindow(Array.from({ length: 14 }, (_, i) => round(i)), 'last10')).toHaveLength(10);
  });

  it('has a previous window only for the last 10, and only with 3 or more rounds', () => {
    expect(previousWindow(Array.from({ length: 12 }, (_, i) => round(i)), 'last10')).toBeNull();
    expect(previousWindow(Array.from({ length: 13 }, (_, i) => round(i)), 'last10')).toHaveLength(3);
    expect(previousWindow(Array.from({ length: 30 }, (_, i) => round(i)), 'season')).toBeNull();
  });

  it('weights rates by attempts, never by averaging percentages', () => {
    const rows = [
      { greens_hit: 1, greens_total: 2 },
      { greens_hit: 9, greens_total: 18 },
      { greens_hit: null, greens_total: 18 },
    ] as never[];
    expect(rate(rows, 'greens_hit' as never, 'greens_total' as never)).toBe(50);
    expect(rate([], 'greens_hit' as never, 'greens_total' as never)).toBeNull();
  });

  it('benchmarks a women’s team against the LPGA and weeks start Monday', () => {
    expect(tourForGender('womens')).toBe('lpga');
    expect(tourForGender(null)).toBe('pga');
    expect(weekOf('2026-09-27')).toBe('2026-09-21');
    expect(weekOf('2026-09-21')).toBe('2026-09-21');
  });
});
