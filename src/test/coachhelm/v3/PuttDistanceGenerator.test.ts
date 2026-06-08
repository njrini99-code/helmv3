/**
 * v3 PuttDistanceGenerator (W21) — content composition + signature tests.
 *
 * Doesn't exercise the full BaseGenerator.run() lifecycle (that would
 * need Supabase mocks for cache + standing + counterfactual). Instead
 * we instantiate the generator, hand it a synthetic aggregate, and
 * verify the title / content / signature / evidence shape are correct.
 *
 * The end-to-end orchestrator integration test belongs to W25 (cutover).
 */

import { describe, it, expect } from 'vitest';
import { PuttDistanceGenerator } from '@/lib/coachhelm/v3/generators/putt-distance';

const PLAYER_ID = 'player-test-1';

function makeAgg(overrides: Partial<{
  bucket: '3_5ft' | '5_10ft' | '10_15ft' | '15_25ft' | '25_plus_ft';
  playerValue: number;
  rounds_played: number;
  cohort_gender: 'mens' | 'womens';
}> = {}) {
  return {
    sampleN: overrides.rounds_played ?? 20,
    playerValue: overrides.playerValue ?? 35,
    bucket: overrides.bucket ?? '10_15ft',
    rawValue: (overrides.playerValue ?? 35) / 100,
    rounds_played: overrides.rounds_played ?? 20,
    cohort_gender: overrides.cohort_gender ?? 'mens',
  };
}

describe('PuttDistanceGenerator', () => {
  it('has the right name, insightType, category, minSampleN', () => {
    const g = new PuttDistanceGenerator(PLAYER_ID, '10_15ft');
    expect(g.name).toBe('PuttDistanceGenerator');
    expect(g.insightType).toBe('putt_distance');
    expect(g.category).toBe('putting');
    expect(g.minSampleN).toBe(5);
  });

  it('maps bucket → metricId correctly (incl. lag buckets)', () => {
    expect(new PuttDistanceGenerator(PLAYER_ID, '3_5ft').metricId).toBe('putts_made_3_5ft_pct');
    expect(new PuttDistanceGenerator(PLAYER_ID, '5_10ft').metricId).toBe('putts_made_5_10ft_pct');
    expect(new PuttDistanceGenerator(PLAYER_ID, '10_15ft').metricId).toBe('putts_made_10_15ft_pct');
    expect(new PuttDistanceGenerator(PLAYER_ID, '15_25ft').metricId).toBe('putts_made_15_25ft_pct');
    expect(new PuttDistanceGenerator(PLAYER_ID, '25_plus_ft').metricId).toBe('putts_made_25_plus_ft_pct');
  });

  it('composeContent renders the lag buckets (15-25 / 25+ ft)', () => {
    const lag = new PuttDistanceGenerator(PLAYER_ID, '15_25ft')
      .composeContent(makeAgg({ bucket: '15_25ft', playerValue: 18, rounds_played: 20 }));
    expect(lag.title).toContain('15-25 ft');
    expect(lag.signature).toBe('putt_distance:15_25ft');
    expect(lag.evidence.metric).toBe('putts_made_15_25ft_pct');

    const long = new PuttDistanceGenerator(PLAYER_ID, '25_plus_ft')
      .composeContent(makeAgg({ bucket: '25_plus_ft', playerValue: 6, rounds_played: 20 }));
    expect(long.title).toContain('25+ ft');
    expect(long.signature).toBe('putt_distance:25_plus_ft');
    expect(long.evidence.metric).toBe('putts_made_25_plus_ft_pct');
    // no authoring artifact in content
    expect(long.content).not.toContain('standing card below');
  });

  it('composeContent renders a sensible title + content + signature for 10-15 ft', () => {
    const g = new PuttDistanceGenerator(PLAYER_ID, '10_15ft');
    const composed = g.composeContent(makeAgg({ bucket: '10_15ft', playerValue: 32, rounds_played: 18 }));
    expect(composed.title).toContain('10-15 ft');
    expect(composed.title).toContain('32%');
    expect(composed.content).toContain('18 rounds');
    expect(composed.content).toContain('32%');
    expect(composed.signature).toBe('putt_distance:10_15ft');
  });

  it('composeContent produces evidence with the canonical metric_id + display label', () => {
    const g = new PuttDistanceGenerator(PLAYER_ID, '5_10ft');
    const composed = g.composeContent(makeAgg({ bucket: '5_10ft', playerValue: 55 }));
    expect(composed.evidence.metric).toBe('putts_made_5_10ft_pct');
    expect(composed.evidence.metric_label).toBe('Putts Made 5-10 ft');
    expect(composed.evidence.unit).toBe('percent');
    expect(composed.evidence.your_value).toBe(55);
    expect(composed.evidence.your_value_display).toBe('55%');
    expect(composed.evidence.comparison_source).toBe('pga_baseline');
  });

  it('composeContent confidence_factors.sample_adequacy scales with rounds_played and caps at 1', () => {
    const g = new PuttDistanceGenerator(PLAYER_ID, '10_15ft');
    const small = g.composeContent(makeAgg({ rounds_played: 6 }));
    expect(small.evidence.confidence_factors.sample_adequacy).toBeCloseTo(0.2, 1);
    const large = g.composeContent(makeAgg({ rounds_played: 60 }));
    expect(large.evidence.confidence_factors.sample_adequacy).toBe(1);
  });

describe('PuttDistanceGenerator — synthesized priority + action (PLAY: driver+action)', () => {
  it('short-makeable band well below PGA → highest-leverage verdict + gate drill (Nick 3-5ft 46.5%)', () => {
    const c = new PuttDistanceGenerator(PLAYER_ID, '3_5ft')
      .composeContent(makeAgg({ bucket: '3_5ft', playerValue: 46.5, rounds_played: 15 }));
    // Quality contract: names the gap, the WHY (makeable distance), a SPECIFIC drill.
    expect(c.content.toLowerCase()).toContain('highest-leverage');
    expect(c.content.toLowerCase()).toMatch(/gate drill|short-putt/);
    expect(c.content).toContain('91'); // cites the PGA 90.5% -> "91%" anchor (90.5.toFixed(0) === "91")
  });

  it('lag band below PGA → lag-speed / approach-proximity verdict, NOT a stroke fix', () => {
    const c = new PuttDistanceGenerator(PLAYER_ID, '25_plus_ft')
      .composeContent(makeAgg({ bucket: '25_plus_ft', playerValue: 0, rounds_played: 15 }));
    expect(c.content.toLowerCase()).toContain('lag');
    expect(c.content.toLowerCase()).toContain('speed');
    expect(c.content.toLowerCase()).not.toContain('gate drill');
  });

  it('at/above the PGA anchor → strength verdict, no drill prescribed', () => {
    const c = new PuttDistanceGenerator(PLAYER_ID, '5_10ft')
      .composeContent(makeAgg({ bucket: '5_10ft', playerValue: 70, rounds_played: 15 }));
    expect(c.content.toLowerCase()).toContain('above the tour');
    expect(c.content.toLowerCase()).not.toContain('drill');
  });
});

  // gen-putt-distance-1: comparison_value was hard-coded 0 → "95% vs 0% PGA"
  // inverted anchor in the WhyPopover. It now carries the real PGA Tour make %
  // per bucket (golf_pga_standards), so the flat comparison agrees with the bar.
  describe('gen-putt-distance-1 real PGA comparison_value', () => {
    it('each bucket carries its real PGA Tour make % (never 0)', () => {
      const expectations: Array<[ '3_5ft' | '5_10ft' | '10_15ft' | '15_25ft' | '25_plus_ft', number ]> = [
        ['3_5ft', 90.5],
        ['5_10ft', 62.2],
        ['10_15ft', 35.7],
        ['15_25ft', 15.4],
        ['25_plus_ft', 5.5],
      ];
      for (const [bucket, pga] of expectations) {
        const c = new PuttDistanceGenerator(PLAYER_ID, bucket)
          .composeContent(makeAgg({ bucket, playerValue: 50 }));
        expect(c.evidence.comparison_value).toBe(pga);
        expect(c.evidence.comparison_value).not.toBe(0);
        expect(c.evidence.comparison_source).toBe('pga_baseline');
      }
    });

    it('content cites the PGA Tour anchor (not a bare make %)', () => {
      // 90.5.toFixed(0) → "91" (PGA 3-5 ft Tour make %).
      const c = new PuttDistanceGenerator(PLAYER_ID, '3_5ft')
        .composeContent(makeAgg({ bucket: '3_5ft', playerValue: 95 }));
      expect(c.content).toContain('PGA Tour ~91%');
    });
  });

  describe('PuttDistanceGenerator — per-gender anchor', () => {
    function aggG(overrides: Partial<{ playerValue: number; rounds: number; bucket: '3_5ft'; gender: 'mens'|'womens' }> = {}) {
      return {
        sampleN: overrides.rounds ?? 12,
        playerValue: overrides.playerValue ?? 78,
        bucket: (overrides.bucket ?? '3_5ft') as '3_5ft',
        rawValue: (overrides.playerValue ?? 78) / 100,
        rounds_played: overrides.rounds ?? 12,
        cohort_gender: overrides.gender ?? 'mens',
      };
    }

    it("women's 3-5ft anchor is ~84%, not the men's 90.5%", () => {
      const c = new PuttDistanceGenerator(PLAYER_ID, '3_5ft').composeContent(aggG({ gender: 'womens' }));
      expect(c.evidence.comparison_value).toBe(84);
      expect(c.content).toContain('84%');
    });
    it("men's 3-5ft anchor stays 90.5% (rounds to 90% in copy, unchanged)", () => {
      const c = new PuttDistanceGenerator(PLAYER_ID, '3_5ft').composeContent(aggG({ gender: 'mens' }));
      expect(c.evidence.comparison_value).toBe(90.5);
    });
  });
});
