import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

/** W-STATS-1, CP-114. The phone Stats redesign is the only Stats (the flag is retired): no client module under screens/stats reads a flag. */
describe('the Stats screens', () => {
  it('read no flag: the server decides, and the clients get props', () => {
    const files = ['StatsPlayer.tsx', 'StatsTeam.tsx', 'StatsDetailScreen.tsx', 'use-stats-detail.ts'];
    for (const f of files) {
      expect(readFileSync(resolve(process.cwd(), 'src/clubhouse/screens/stats', f), 'utf8')).not.toMatch(/isFlagEnabled|statsRedesignEnabled/);
    }
  });
});

describe('countsForScoring', () => {
  it('is true for no type and every type but practice', async () => {
    const { countsForScoring } = await import('../../../data/season');
    expect(countsForScoring({ round_type: null })).toBe(true);
    expect(countsForScoring({ round_type: 'tournament' })).toBe(true);
    expect(countsForScoring({ round_type: 'qualifying' })).toBe(true);
    expect(countsForScoring({ round_type: 'practice' })).toBe(false);
  });
});

describe('practiceCut', () => {
  it('cuts with no type chosen and no picked rounds', async () => {
    const { practiceCut } = await import('../../../data/stats-common');
    const { filterFor } = await import('../../../data/stats-filter');
    const base = filterFor('last10');
    expect(practiceCut(base)).toBe(true);
    expect(practiceCut({ ...base, types: ['practice'] })).toBe(false);
    expect(practiceCut({ ...base, pick: { mode: 'only', ids: ['r1'] } })).toBe(false);
  });
});
