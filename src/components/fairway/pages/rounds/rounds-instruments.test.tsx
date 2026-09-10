/**
 * ============================================================================
 * rounds-instruments — the player rounds v2 stage and instruments
 * (player-rounds.v2.md)
 * ----------------------------------------------------------------------------
 * Pure helpers: band assignment, type counts and averages (unscored rounds
 * never move an average; "Other" only when untyped rounds exist), the
 * month-vs-season deviation rows, the same-split shift behind the verdict.
 * Components: the stage names and links the newest scored round; the
 * histogram and the type bar hide below their honesty gates.
 * ========================================================================== */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import {
  scoreBandIndex,
  scoreBands,
  roundTypeSummary,
  typeAveragesLine,
  monthDeviations,
  recentShift,
  scoringVerdict,
  RoundsStage,
  ScoreBandHistogram,
  RoundTypeSegment,
} from './rounds-instruments';
import type { RoundLibraryRound, RoundStats } from './FairwayRoundsLibrary';

function makeRound(overrides: Partial<RoundLibraryRound> = {}): RoundLibraryRound {
  return {
    id: 'round-1',
    course_name: 'QA Test Course',
    course_city: 'Pebble Beach',
    course_state: 'CA',
    round_date: '2026-08-31',
    round_type: 'practice',
    total_score: 73,
    score_to_par: 1,
    total_putts: 30,
    total_fairways: 14,
    total_fairways_hit: 9,
    total_gir: 11,
    total_gir_possible: 18,
    holes_played: 18,
    status: 'completed',
    player: { first_name: 'Nick', last_name: 'Rini', avatar_url: null },
    ...overrides,
  };
}

const stats: RoundStats = {
  totalRounds: 8,
  avg: 74.4,
  best: 70,
  avgToPar: 2.4,
  underParPct: 25,
  trend: 'improving',
};

describe('scoreBandIndex / scoreBands', () => {
  it('lands +3 in "+1 to +3", -1 under par, 0 even, 8 in "+8 or more"', () => {
    expect(scoreBandIndex(3)).toBe(2);
    expect(scoreBandIndex(-1)).toBe(0);
    expect(scoreBandIndex(0)).toBe(1);
    expect(scoreBandIndex(4)).toBe(3);
    expect(scoreBandIndex(8)).toBe(4);
  });

  it('counts only rounds with a to-par and reports an honest zero for an empty band', () => {
    const bands = scoreBands([
      makeRound({ id: 'a', score_to_par: -2 }),
      makeRound({ id: 'b', score_to_par: 3 }),
      makeRound({ id: 'c', score_to_par: 3 }),
      makeRound({ id: 'd', score_to_par: null }),
    ]);
    expect(bands.map((b) => b.n)).toEqual([1, 0, 2, 0, 0]);
    expect(bands.map((b) => b.pct)).toEqual([33, 0, 67, 0, 0]);
    expect(scoreBands([makeRound({ score_to_par: null })])).toEqual([]);
  });
});

describe('roundTypeSummary / typeAveragesLine', () => {
  it('averages normalized scores per type, ignores unscored rounds, folds null types into Other only when present', () => {
    const summary = roundTypeSummary([
      makeRound({ id: 'a', round_type: 'tournament', total_score: 76 }),
      makeRound({ id: 'b', round_type: 'tournament', total_score: 78 }),
      makeRound({ id: 'c', round_type: 'tournament', total_score: null }),
      makeRound({ id: 'd', round_type: 'practice', total_score: 37, holes_played: 9 }),
      makeRound({ id: 'e', round_type: null, total_score: 80 }),
    ]);
    expect(summary.map((s) => [s.key, s.count])).toEqual([
      ['practice', 1],
      ['tournament', 3],
      ['other', 1],
    ]);
    expect(summary.find((s) => s.key === 'tournament')!.avgScore).toBe(77);
    expect(summary.find((s) => s.key === 'practice')!.avgScore).toBe(74);
    expect(typeAveragesLine(summary)).toBe('Tournament avg 77.0 · Practice avg 74.0 · Other avg 80.0');

    const typed = roundTypeSummary([makeRound({ round_type: 'qualifying' })]);
    expect(typed.map((s) => s.key)).toEqual(['qualifier']);
  });
});

describe('monthDeviations', () => {
  it('keeps months with two or more scored rounds, oldest first, signed against the season average', () => {
    const rows = monthDeviations(
      [
        makeRound({ id: 'a', round_date: '2026-08-02', total_score: 76 }),
        makeRound({ id: 'b', round_date: '2026-08-20', total_score: 74 }),
        makeRound({ id: 'c', round_date: '2026-07-01', total_score: 73 }),
        makeRound({ id: 'd', round_date: '2026-07-15', total_score: 71 }),
        makeRound({ id: 'e', round_date: '2026-06-01', total_score: 90 }),
      ],
      74,
    );
    expect(rows.map((r) => r.label)).toEqual(['Jul', 'Aug']);
    expect(rows.map((r) => r.display)).toEqual(['-2.0', '+1.0']);
  });
});

describe('recentShift / scoringVerdict', () => {
  it('is null under six points, otherwise newest five minus the five before', () => {
    expect(recentShift([70, 71, 72, 73, 74])).toBeNull();
    // prior: 80 · recent: 74,74,74,74,74 → -6
    expect(recentShift([80, 74, 74, 74, 74, 74])).toBe(-6);
  });

  it('words the verdict from the server trend, the number from the same split', () => {
    expect(scoringVerdict('improving', -1.4, 74.4, 8)).toBe(
      'Trending down 1.4 over your last five rounds.',
    );
    expect(scoringVerdict('declining', 2, 74.4, 8)).toBe('Trending up 2.0 over your last five rounds.');
    expect(scoringVerdict('stable', 0.1, 74.4, 8)).toBe('Holding around 74.4.');
    expect(scoringVerdict(null, null, 74.4, 2)).toBe('One more round and the line draws.');
    expect(scoringVerdict(null, null, 74.4, 1)).toBe('Two more rounds and the line draws.');
    expect(scoringVerdict(null, null, 74.4, 4)).toBe('Six scored rounds unlock the trend.');
  });
});

describe('RoundsStage', () => {
  it('shows the readouts, the verdict, and links the newest scored round from the ribbon readout', () => {
    const last = makeRound({ id: 'newest', round_date: '2026-08-31', total_score: 73, score_to_par: 1 });
    render(
      <RoundsStage
        stats={stats}
        points={[
          { x: 'May 3', y: 78 },
          { x: 'Jun 1', y: 75 },
          { x: 'Aug 31', y: 73 },
        ]}
        lastRound={last}
        shift={-1.4}
      />,
    );
    expect(screen.getByRole('region', { name: 'Scoring' })).toBeInTheDocument();
    expect(screen.getByText('74.4')).toBeInTheDocument();
    expect(screen.getByText('+2.4')).toBeInTheDocument();
    expect(screen.getByText('Trending down 1.4 over your last five rounds.')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /Last \(\+1\) · QA Test Course · Aug 31/ });
    expect(link).toHaveAttribute('href', '/golf/dashboard/rounds/newest');
    expect(link.className).toMatch(/min-h-\[44px\]/);
  });
});

describe('ScoreBandHistogram / RoundTypeSegment gates', () => {
  it('hides the histogram below three rounds with a to-par and the type bar below two types', () => {
    const { container } = render(
      <>
        <ScoreBandHistogram
          rounds={[makeRound({ id: 'a' }), makeRound({ id: 'b' })]}
          underParPct={0}
        />
        <RoundTypeSegment rounds={[makeRound({ id: 'a' }), makeRound({ id: 'b' })]} />
      </>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders both once the gates clear, with the averages line and the most-played type as the readout', () => {
    const rounds = [
      makeRound({ id: 'a', round_type: 'tournament', total_score: 76, score_to_par: 4 }),
      makeRound({ id: 'b', round_type: 'tournament', total_score: 78, score_to_par: 6 }),
      makeRound({ id: 'c', round_type: 'practice', total_score: 72, score_to_par: 0 }),
    ];
    render(
      <>
        <ScoreBandHistogram rounds={rounds} underParPct={0} />
        <RoundTypeSegment rounds={rounds} />
      </>,
    );
    expect(screen.getByRole('region', { name: 'Where your scores land' })).toBeInTheDocument();
    expect(screen.getByText('Under par in 0% of rounds.')).toBeInTheDocument();
    expect(screen.getByText('Tournament avg 77.0 · Practice avg 72.0')).toBeInTheDocument();
    expect(screen.getByText('(2 of 3)')).toBeInTheDocument();
  });
});
