import { describe, expect, it } from 'vitest';
import { playerInsight, statsInsight, teamInsight, type ChInsightChange } from '../stats-insight';

const ch = (over: Partial<ChInsightChange>): ChInsightChange => ({ subject: 'Scoring avg', delta: -1.2, se: 0.4, lowerIsBetter: true, digits: 1, against: 'vs previous 10', ...over });

describe('row 70: the insight-first card states only the changes that pass the one change rule', () => {
  it('says the clearest one or two changes, each signed, with the word that says which way', () => {
    const out = statsInsight([
      ch({}),
      ch({ subject: 'Greens in regulation', delta: 6, se: 2.5, lowerIsBetter: false }),
      ch({ subject: 'Putts per round', delta: 1.5, se: 0.3 }),
    ]);
    // Putts (5 errors) first, then scoring (3), then greens (2.4) left out at two lines.
    expect(out).toEqual({
      state: 'changes',
      lines: [
        { subject: 'Putts per round', figure: '+1.5', tone: 'is-loss', words: 'Putts per round, worse vs previous 10' },
        { subject: 'Scoring avg', figure: '−1.2', tone: 'is-gain', words: 'Scoring avg, better vs previous 10' },
      ],
    });
  });

  it('a change inside its standard error, one that prints as zero, or one with no error is never stated: "No clear change"', () => {
    expect(statsInsight([ch({ delta: -0.3, se: 0.4 }), ch({ delta: 0.04, se: 0.001 }), ch({ delta: 3, se: null })])).toEqual({ state: 'none', against: 'vs previous 10' });
  });

  it('nothing to compare draws no card', () => {
    expect(statsInsight([null, null])).toBeNull();
    expect(statsInsight([])).toBeNull();
  });

  it('team: from the figures the page draws with a change; a figure with no previous window is left out', () => {
    const fig = (label: string, delta: number | null, se: number | null, lowerIsBetter: boolean) => ({ label, delta, se, lowerIsBetter, digits: 1 });
    expect(teamInsight([fig('Scoring avg', -1.5, 0.5, true), fig('Putts per round', null, null, true)], 'vs previous 20')).toMatchObject({ state: 'changes', lines: [{ subject: 'Scoring avg', tone: 'is-gain', words: 'Scoring avg, better vs previous 20' }] });
    expect(teamInsight([fig('Scoring avg', null, null, true)], 'vs previous 10')).toBeNull();
  });

  it('player: strokes gained against the previous window and Game detail’s comparison rows', () => {
    const out = playerInsight({
      sgChange: { delta: 1.6, context: 'vs previous 10', se: 0.5 },
      extra: { compare: { lastRounds: 10, previousRounds: 10, lastHoleRounds: 10, previousHoleRounds: 10, rows: [{ label: 'Scoring avg', last: 74, previous: 74.2, unit: '', digits: 1, lowerIsBetter: true, se: 1.1 }] } },
      filter: { last: 10 },
    });
    expect(out).toEqual({ state: 'changes', lines: [{ subject: 'Strokes gained a round', figure: '+1.6', tone: 'is-gain', words: 'Strokes gained a round, better vs previous 10' }] });
    expect(playerInsight({ sgChange: { delta: null, context: '' }, extra: { compare: null }, filter: { last: 10 } })).toBeNull();
  });
});
