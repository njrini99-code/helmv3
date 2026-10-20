import { describe, it, expect } from 'vitest';
import {
  TOUR_PUTT_BANDS,
  TOUR_STANDARDS,
  resolveStageTour,
  tourFor,
  tourLabel,
} from '@/lib/golf/benchmarks/tour';
import { cohortAnchor } from '@/lib/coachhelm/v3/counterfactual/cohort-baselines';

/**
 * The Tour mirror is a static copy of `golf_pga_standards` (season 2024,
 * `pga_tour_value`, read-only verified 2026-09-30). Owner decision Q-93: the
 * stats screens compare against the Tour only (PGA for men's teams, LPGA for
 * women's teams). If a value here changes, the table changed: update both.
 */
describe('Tour standards mirror (golf_pga_standards, season 2024)', () => {
  it('pins the PGA Tour values', () => {
    const pga = TOUR_STANDARDS.pga;
    expect(pga.putts).toEqual({ '3_5': 90.5, '5_10': 62.2, '10_15': 35.7, '15_25': 15.4, '25_plus': 5.5 });
    expect(pga.girPct).toBe(66);
    expect(pga.penaltiesPerRound).toBe(0.3);
    expect(pga.scramblingPct).toEqual({ fairway: 65, rough: 58, sand: 50 });
    expect(pga.bigNumbersPer100Holes).toBe(2.0);
    expect(pga.parScoring).toEqual({ par3: 3.0, par4: 3.97, par5: 4.55 });
    expect(pga.practiceTournamentDelta).toBe(0.5);
    expect(pga.openingHoleDelta).toBe(0.1);
    expect(pga.approachProximityFt).toEqual({ '50_125': 18, '125_175': 30, '175_plus': 45 });
    expect(pga.strokesGained).toEqual({ total: 0, ott: 0, approach: 0, aroundGreen: 0, putting: 0 });
  });

  it('pins the LPGA Tour values', () => {
    const lpga = TOUR_STANDARDS.lpga;
    expect(lpga.putts).toEqual({ '3_5': 86.0, '5_10': 55.0, '10_15': 30.0, '15_25': 12.0, '25_plus': 5.0 });
    expect(lpga.girPct).toBe(70);
    expect(lpga.penaltiesPerRound).toBe(0.4);
    expect(lpga.scramblingPct).toEqual({ fairway: 62, rough: 55, sand: 45 });
    expect(lpga.bigNumbersPer100Holes).toBe(3.0);
    expect(lpga.parScoring).toEqual({ par3: 3.1, par4: 4.05, par5: 4.7 });
    expect(lpga.practiceTournamentDelta).toBe(0.5);
    expect(lpga.openingHoleDelta).toBe(0.1);
    expect(lpga.approachProximityFt).toEqual({ '50_125': 26, '125_175': 38, '175_plus': 55 });
    expect(lpga.strokesGained).toEqual({ total: 0, ott: 0, approach: 0, aroundGreen: 0, putting: 0 });
  });

  it('agrees with the cohort-baselines putt anchors for both tours', () => {
    const metricByBand = {
      '3_5': 'putts_made_3_5ft_pct',
      '5_10': 'putts_made_5_10ft_pct',
      '10_15': 'putts_made_10_15ft_pct',
      '15_25': 'putts_made_15_25ft_pct',
      '25_plus': 'putts_made_25_plus_ft_pct',
    } as const;
    for (const band of TOUR_PUTT_BANDS) {
      expect(TOUR_STANDARDS.pga.putts[band]).toBe(cohortAnchor(metricByBand[band], 'mens'));
      expect(TOUR_STANDARDS.lpga.putts[band]).toBe(cohortAnchor(metricByBand[band], 'womens'));
    }
  });

  it('cites a golf_pga_standards source for each tour', () => {
    expect(TOUR_STANDARDS.pga.source).toMatch(/golf_pga_standards/);
    expect(TOUR_STANDARDS.lpga.source).toMatch(/golf_pga_standards/);
  });
});

describe('tourFor / tourLabel', () => {
  it('routes women to the LPGA set and everyone else to the PGA set', () => {
    expect(tourFor('womens')).toBe('lpga');
    expect(tourFor('mens')).toBe('pga');
    expect(tourFor(null)).toBe('pga');
    expect(tourFor(undefined)).toBe('pga');
  });

  it('labels the tour by name, and stays neutral when unknown', () => {
    expect(tourLabel('pga')).toBe('PGA Tour');
    expect(tourLabel('lpga')).toBe('LPGA Tour');
    expect(tourLabel(null)).toBe('the Tour');
    expect(tourLabel(undefined)).toBe('the Tour');
  });
});

describe('resolveStageTour', () => {
  it('prefers the leak map tour', () => {
    expect(resolveStageTour('lpga', [{ is_womens: false }])).toBe('lpga');
    expect(resolveStageTour('pga', [{ is_womens: true }])).toBe('pga');
  });

  it('falls back to the standing rows when the leak map is missing', () => {
    expect(resolveStageTour(null, [{ is_womens: true }, {}])).toBe('lpga');
    expect(resolveStageTour(undefined, [{ is_womens: false }, {}])).toBe('pga');
  });

  it('is unknown (null), never a guessed PGA, when there is no signal at all', () => {
    expect(resolveStageTour(null, null)).toBeNull();
    expect(resolveStageTour(undefined, [])).toBeNull();
  });
});
