/**
 * ============================================================================
 * FairwayRoundDetail — regression coverage for #28 (empty Pulse chart),
 * #133 (Bogey/Double+ color merge), and #134/#149 (least-informative hero stat)
 * ========================================================================== */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { FairwayRoundDetail } from './FairwayRoundDetail';
import type { RoundDetailRound, RoundHoleRow } from './FairwayRoundDetail';

function makeRound(overrides: Partial<RoundDetailRound> = {}): RoundDetailRound {
  return {
    id: 'round-1',
    course_name: 'Pebble Beach Golf Links',
    round_date: '2026-06-15',
    round_type: 'practice',
    total_score: 78,
    score_to_par: 6,
    total_putts: 32,
    total_fairways: 14,
    total_fairways_hit: 10,
    total_gir: 10,
    total_gir_possible: 18,
    front_nine: 39,
    back_nine: 39,
    holes_played: 18,
    ...overrides,
  };
}

/** 18 holes: par 4 all, with 2 birdies, 5 pars, 8 bogeys, 3 double-bogeys, 0 eagles. */
function makeHoles(): RoundHoleRow[] {
  const scoreByHole: Record<number, number> = {
    1: 3, // birdie
    2: 4, // par
    3: 5, // bogey
    4: 5, // bogey
    5: 6, // double
    6: 4, // par
    7: 5, // bogey
    8: 3, // birdie
    9: 4, // par
    10: 5, // bogey
    11: 4, // par
    12: 6, // double
    13: 5, // bogey
    14: 4, // par
    15: 5, // bogey
    16: 5, // bogey
    17: 6, // double
    18: 5, // bogey
  };
  return Array.from({ length: 18 }, (_, i) => {
    const hole_number = i + 1;
    return {
      hole_number,
      par: 4,
      score: scoreByHole[hole_number] ?? 4,
      putts: 2,
      fairway_hit: true,
      gir: false,
      penalty_strokes: 0,
      yardage: null,
    };
  });
}

describe('FairwayRoundDetail — #28 Pulse chart renders real data', () => {
  it('draws a polyline with as many points as scored holes (never an empty chart)', () => {
    const { container } = render(
      <FairwayRoundDetail
        round={makeRound()}
        holes={makeHoles()}
        aiRecap={null}
        reviewStats={null}
        playerName="Nick Rini"
        isCoach={false}
        viewerIsOwner
      />,
    );

    const pulse = container.querySelector('[data-slot="pulse-trace"]');
    expect(pulse).not.toBeNull();
    const polyline = pulse!.querySelector('polyline');
    expect(polyline).not.toBeNull();
    const points = polyline!.getAttribute('points') ?? '';
    // 18 holes of real score/par data → 18 plotted points, not zero/empty.
    expect(points.trim().split(/\s+/).length).toBe(18);
    // A real end-dot is drawn alongside the line (not the ONLY visible mark).
    expect(pulse!.querySelector('circle')).not.toBeNull();
  });

  it('omits the Pulse panel entirely when there is no honest series (< 2 points)', () => {
    render(
      <FairwayRoundDetail
        round={makeRound({ holes_played: 1 })}
        holes={[
          {
            hole_number: 1,
            par: 4,
            score: 4,
            putts: 2,
            fairway_hit: true,
            gir: true,
            penalty_strokes: 0,
            yardage: null,
          },
        ]}
        aiRecap={null}
        reviewStats={null}
        playerName="Nick Rini"
        isCoach={false}
        viewerIsOwner
      />,
    );

    expect(screen.queryByText('Score to par through the round')).not.toBeInTheDocument();
  });
});

describe('FairwayRoundDetail — #133 Bogey vs Double+ segments are visually distinct', () => {
  it('renders Bogeys and Double+ with different background colors', () => {
    const { container } = render(
      <FairwayRoundDetail
        round={makeRound()}
        holes={makeHoles()}
        aiRecap={null}
        reviewStats={null}
        playerName="Nick Rini"
        isCoach={false}
        viewerIsOwner
      />,
    );

    const legendItems = Array.from(container.querySelectorAll('ul li'));
    const bogeyItem = legendItems.find((li) => li.textContent?.includes('Bogeys'));
    const doubleItem = legendItems.find((li) => li.textContent?.includes('Double+'));
    expect(bogeyItem).toBeDefined();
    expect(doubleItem).toBeDefined();

    const bogeySwatch = bogeyItem!.querySelector('span[aria-hidden]') as HTMLElement;
    const doubleSwatch = doubleItem!.querySelector('span[aria-hidden]') as HTMLElement;
    expect(bogeySwatch.style.background).not.toBe('');
    expect(doubleSwatch.style.background).not.toBe('');
    // The whole point of #133: these must NOT resolve to the identical swatch
    // color, or the bar itself merges the two segments visually.
    expect(bogeySwatch.style.background).not.toBe(doubleSwatch.style.background);
  });
});

describe('FairwayRoundDetail — #134/#149 hero stat picks the most informative bucket', () => {
  it('leads with Birdies (not "0% eagles") when the round has birdies but no eagles', () => {
    render(
      <FairwayRoundDetail
        round={makeRound()}
        holes={makeHoles()}
        aiRecap={null}
        reviewStats={null}
        playerName="Nick Rini"
        isCoach={false}
        viewerIsOwner
      />,
    );

    // The big called-out readout's label text sits next to the % figure.
    expect(screen.getByText('birdies')).toBeInTheDocument();
    expect(screen.queryByText('eagles')).not.toBeInTheDocument();
  });

  it('falls back to Pars when the round has neither eagles nor birdies', () => {
    const parOnlyHoles: RoundHoleRow[] = Array.from({ length: 18 }, (_, i) => ({
      hole_number: i + 1,
      par: 4,
      score: 4,
      putts: 2,
      fairway_hit: true,
      gir: true,
      penalty_strokes: 0,
      yardage: null,
    }));

    render(
      <FairwayRoundDetail
        round={makeRound({ total_score: 72, score_to_par: 0 })}
        holes={parOnlyHoles}
        aiRecap={null}
        reviewStats={null}
        playerName="Nick Rini"
        isCoach={false}
        viewerIsOwner
      />,
    );

    expect(screen.getByText('pars')).toBeInTheDocument();
  });
});
