import { describe, expect, it } from 'vitest';
import { competitionRankLabels } from './tie-rank';

describe('competitionRankLabels', () => {
  it('shares a position for values equal at display precision', () => {
    expect(competitionRankLabels([72.04, 73.1, 73.14, 75]).map((r) => r.label)).toEqual(['1', 'T2', 'T2', '4']);
  });

  it('labels a tie for first', () => {
    expect(competitionRankLabels([71.0, 71.0]).map((r) => r.label)).toEqual(['T1', 'T1']);
  });

  it('is plain when nothing ties', () => {
    expect(competitionRankLabels([70, 71, 72]).map((r) => r.label)).toEqual(['1', '2', '3']);
    expect(competitionRankLabels([])).toEqual([]);
  });
});
