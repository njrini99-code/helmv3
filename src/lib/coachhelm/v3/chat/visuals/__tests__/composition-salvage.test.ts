import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import type { ToolEnvelope } from '../../provenance';
import { compileComposition } from '../compile-composition';
import { CompositionSpecV2, ValidatedComposition, salvageComposition } from '../composition';
import stored from './fixtures/preview-team-trends-composition.json';

/**
 * The preview of 12 Nov: "build me a dashboard showcasing my teams trends this season" called show_visual, the server stored a
 * three-block composition, and the coach saw none of it. Its season block carried the team's season TABLE where a band belongs
 * (get_season wrote the table over `this_season`), so the thread's whole-composition parse failed and dropped all three blocks.
 * The fixture is that stored part, with the player and team names replaced.
 */
describe('a stored composition with one bad block (preview, 12 Nov)', () => {
  it('fails the whole parse, as it did on the preview', () => {
    expect(ValidatedComposition.safeParse(stored).success).toBe(false);
  });

  it('is drawn without the bad block: the split and the putt profile stay, the season block is named as not drawn', () => {
    const { composition, dropped } = salvageComposition(stored);
    expect(composition?.blocks.map((b) => b.type)).toEqual(['split', 'putt_profile']);
    expect(composition?.title).toBe('Team trends this season');
    expect(dropped).toHaveLength(1);
    expect(dropped[0]).toMatch(/^block 1 \(season_compare\): this_season/);
  });

  it('a valid composition comes back whole with nothing dropped', () => {
    const fine = { ...stored, blocks: stored.blocks.slice(1) };
    const { composition, dropped } = salvageComposition(fine);
    expect(dropped).toEqual([]);
    expect(composition?.blocks).toHaveLength(2);
  });

  it('nothing is drawn when the frame is not a composition, or only notes survive', () => {
    expect(salvageComposition({ title: 'x' }).composition).toBeNull();
    expect(salvageComposition({ ...stored, blocks: [stored.blocks[0], { type: 'note', kind: 'context', text: 'words' }] }).composition).toBeNull();
  });
});

describe('compileComposition never stores what the thread would drop', () => {
  const env = (detail: unknown): ToolEnvelope => ({ summary: 'x', measurements: [], series: [], detail, coverage: 'complete', coverage_note: null, as_of: '2026-11-12T00:00:00.000Z' });
  const band = { mean: 4.12, lo: -0.12, hi: 8.35, n: 76 };
  const seasonRead = (thisSeason: unknown) => env({ kind: 'season_compare', metric: 'Score to par per 18', method: 'mean ± 1 sd', this_season: thisSeason, last_season: band });
  const puttRead = env({ kind: 'putt_profile', profile: { buckets: [{ id: '0-3', label: '0–3 ft', attempts: 10, made: 9, rate: 0.9 }] } });
  const spec = (blocks: unknown[]) => CompositionSpecV2.parse({ title: 'Team trends this season', blocks });

  it('a season block whose read holds a team table is not drawn, the model is told why, and the rest is kept and valid', () => {
    const reads = new Map([
      ['e1', seasonRead({ season: '2026–27', players: [{ player: 'Player A', rounds: 2 }], team_average: 75.8 })],
      ['e2', puttRead],
    ]);
    const result = compileComposition(spec([{ type: 'season_compare', ref: 'e1' }, { type: 'putt_profile', ref: 'e2' }]), reads);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.composition.blocks.map((b) => b.type)).toEqual(['putt_profile']);
    expect(result.dropped).toEqual([expect.stringMatching(/^block 1 \(season_compare\): not drawn, this_season/)]);
    expect(ValidatedComposition.safeParse(result.composition).success).toBe(true);
  });

  it('a season block with real bands is drawn', () => {
    const reads = new Map([['e1', seasonRead({ mean: 3.92, lo: 1.1, hi: 6.7, n: 25 })]]);
    const result = compileComposition(spec([{ type: 'season_compare', ref: 'e1' }]), reads);
    expect(result.ok && result.composition.blocks[0]).toMatchObject({ type: 'season_compare', this_season: { n: 25 }, last_season: { n: 76 } });
  });

  it('when the only figure block is invalid, nothing is stored and the reason names it', () => {
    const reads = new Map([['e1', seasonRead({ season: '2026–27', players: [], team_average: null })]]);
    const result = compileComposition(spec([{ type: 'season_compare', ref: 'e1' }]), reads);
    expect(result).toMatchObject({ ok: false, reason: 'nothing_to_draw', dropped: [expect.stringContaining('season_compare')] });
  });
});
