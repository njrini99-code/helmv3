import { filterFor } from '../data/stats-filter';
import type { ChPlayerProfile } from '../data/stats-player';
import type { ChPlayerHome } from '../data/player-home';
import { PREVIEW_PLAYER_HOME } from './fixtures-player-home';
import { PREVIEW_PLAYER, PREVIEW_PLAYER_SUGGESTED } from './fixtures-stats';

/**
 * Preview states for the phone Stats redesign (stats-home 05 "add" rows, 08 Part 3). These are derived from the existing fixtures rather
 * than edited into them, so `&flag=off` and every test that reads PREVIEW_PLAYER keep main's values. `correctedPlayer` holds the
 * corrections of 03-DATA-CHECKS problem 13 (drive counts and shares, sand, strokes gained against the rounds' own mean).
 */
export function correctedPlayer(p: ChPlayerProfile): ChPlayerProfile {
  if (!p.stats) return p;
  const opp = p.stats.fairwayOpportunities ?? 0;
  const hit = p.stats.fairwaysHit ?? 0;
  const misses = Math.max(0, opp - hit);
  const left = Math.round(misses * 0.54);
  return {
    ...p,
    stats: {
      ...p.stats,
      missLeftCount: left,
      missRightCount: misses - left,
      // Shares of misses, summing to 100, as the calculator's do.
      missLeftPct: misses ? (left / misses) * 100 : 0,
      missRightPct: misses ? ((misses - left) / misses) * 100 : 0,
      // Sand: one figure from one count, as the calculator keeps it (problem 13: 4 of 11 read 37 while the rate said 33).
      scrambleSandMade: 4,
      scrambleSandAttempts: 12,
      scramblingPctSand: (4 / 12) * 100,
      sandSavesMade: 4,
      sandSaveAttempts: 12,
      sandSavePercentage: (4 / 12) * 100,
    },
  };
}

const BASE = correctedPlayer(PREVIEW_PLAYER_SUGGESTED);
const LONG_COURSE = 'The Country Club of North Carolina, Dogwood';

function zeroWindow(p: ChPlayerProfile): ChPlayerProfile['win'] {
  return { ...p.win, rounds: 0, sgRounds: 0, effRounds: 0, effSgRounds: 0, avg: null, toPar: null, sgPerRound: null, formChange: null, trend: [] };
}

function withOneRound(p: ChPlayerProfile): ChPlayerProfile {
  const only = p.rounds[0]!;
  return {
    ...p,
    rounds: [only],
    win: { ...p.win, rounds: 1, sgRounds: 1, effRounds: 1, effSgRounds: 1, avg: only.score, toPar: only.toPar, sgPerRound: null, formChange: null, trend: [only.score] },
    sgChange: { delta: null, context: '' },
    // One round is one point on every per-round line too, so the drill says "A line needs two rounds" and draws no trend.
    extra: { ...p.extra, compare: null, series: Object.fromEntries(Object.entries(p.extra.series).map(([k, v]) => [k, Array.isArray(v) ? v.slice(-1) : v])) as typeof p.extra.series },
  };
}

function withLots(p: ChPlayerProfile, n: number): ChPlayerProfile {
  const rounds = Array.from({ length: n }, (_, i) => {
    const r = p.rounds[i % p.rounds.length]!;
    return { ...r, id: `${r.id}-${i}` };
  });
  return { ...p, rounds, win: { ...p.win, rounds: n, sgRounds: n, effRounds: n, effSgRounds: n } };
}

/** The player screen's redesign-only states, or null when the state is one the preview already has. */
export function previewShsPlayer(state: string | undefined): ChPlayerProfile | null {
  switch (state) {
    case 'empty':
      return { ...BASE, filter: filterFor('last10'), filterOptions: { ...BASE.filterOptions, rounds: [], total: 0, courses: [] }, win: zeroWindow(BASE), rounds: [], stats: null, puttBands: null, sgChange: { delta: null, context: '' }, season: { ...BASE.season, rounds: 0 } };
    case 'filterempty':
      return { ...BASE, window: 'season', filter: filterFor('season'), win: zeroWindow(BASE), rounds: [], stats: null, puttBands: null, sgChange: { delta: null, context: '' } };
    case 'long':
      return {
        ...BASE,
        name: 'Christopher Vanderhoeven-Castellanos',
        firstName: 'Christopher',
        rounds: BASE.rounds.map((r) => ({ ...r, course: LONG_COURSE })),
      };
    case 'lots':
      return withLots(BASE, 40);
    case 'one':
      return withOneRound(BASE);
    // The loader has already cut practice rounds for this one, so the figures read as a window with none (CP-125).
    case 'practice':
      return BASE;
    default:
      return null;
  }
}

/** The corrected default for the redesign's preview. */
export const PREVIEW_PLAYER_SHS = correctedPlayer(PREVIEW_PLAYER);
export const PREVIEW_PLAYER_SHS_SELF = BASE;

/** Player Home's Your game states (stats-home 08 PR 6), derived so the plain fixture keeps main's values. */
export function previewShsHome(state: string | undefined): ChPlayerHome | null {
  const legs = PREVIEW_PLAYER_HOME.legs;
  if (!legs) return null;
  const rows = legs.rows;
  switch (state) {
    case 'early':
      return {
        ...PREVIEW_PLAYER_HOME,
        legs: {
          ...legs,
          rows: rows.map((r) => ({ ...r, sg: null, bench: r.key === 'approach' ? r.bench : null, early: 'early read', trend: r.trend.slice(-2), value: r.key === 'short' ? null : r.value, needs: r.key === 'short' ? 'Needs 10 chances to get up and down' : undefined, note: r.key === 'short' ? null : r.note })),
        },
      };
    case 'one':
      return { ...PREVIEW_PLAYER_HOME, legs: { ...legs, rows: rows.map((r) => ({ ...r, sg: null, trend: r.trend.slice(-1), early: 'early read' })) } };
    case 'newseason':
      return { ...PREVIEW_PLAYER_HOME, legs: { ...legs, rows: rows.map((r) => ({ ...r, sg: null })) } };
    case 'partial':
      return { ...PREVIEW_PLAYER_HOME, legs: { ...legs, cacheError: true, rows: rows.map((r) => (r.key === 'short' ? { ...r, value: null, trend: [], note: null, sg: null } : r)) } };
    case 'long':
      return { ...PREVIEW_PLAYER_HOME, greeting: 'Good afternoon, Christopher' };
    default:
      return null;
  }
}
