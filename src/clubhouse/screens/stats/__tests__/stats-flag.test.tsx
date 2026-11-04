import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const yml = readFileSync(resolve(process.cwd(), 'config/feature-flags.yml'), 'utf8');

/** W-STATS-1, CP-114. The render half (main's tree, no lane hook, `#sd-*` ignored) grows with each PR that adds a screen behind the flag. */
describe('clubhouse_stats_redesign_v1', () => {
  it('exists, off in every environment', () => {
    const entry = yml.split('- feature_id: clubhouse_stats_redesign_v1')[1]!.split('- feature_id:')[0]!;
    expect(entry).toMatch(/type: release/);
    expect(entry).toMatch(/default: false/);
    expect(entry).toMatch(/production: false/);
    expect(entry).toMatch(/preview: false/);
    expect(entry).toMatch(/development: false/);
  });

  it('is read only on the server: no client module under screens/stats names it', () => {
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
  it('cuts only with the flag on, no type chosen, and no picked rounds', async () => {
    const { practiceCut } = await import('../../../data/stats-common');
    const { filterFor } = await import('../../../data/stats-filter');
    const base = filterFor('last10');
    expect(practiceCut(false, base)).toBe(false);
    expect(practiceCut(undefined, base)).toBe(false);
    expect(practiceCut(true, base)).toBe(true);
    expect(practiceCut(true, { ...base, types: ['practice'] })).toBe(false);
    expect(practiceCut(true, { ...base, pick: { mode: 'only', ids: ['r1'] } })).toBe(false);
  });
});
