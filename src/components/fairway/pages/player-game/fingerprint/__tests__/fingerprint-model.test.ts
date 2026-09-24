import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PlayerFingerprint, SectionData, FingerprintSectionKey } from '@/app/golf/actions/player-fingerprint-types';
import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import {
  buildClaim,
  buildVerdict,
  buildWaterfall,
  confidenceWord,
  formatSignedValue,
  parseSigned,
  FORM_EARLY_ROUNDS,
  presentForm,
  puttingBands,
  toPlayerVoice,
  buildScopeWaterfall,
  sgScopeOptions,
} from '../fingerprint-model';
import {
  computeFormFromCountableRounds,
  describeFormFormula,
  FORM_EARLY_READ_BELOW,
  FORM_EARLY_READ_LABEL,
} from '@/lib/golf/form-score';

function section(key: FingerprintSectionKey, metrics: SectionData['metrics'] = [], extra: Partial<SectionData> = {}): SectionData {
  return { key, category: key, sparse: false, metrics, insights: [], chart_data: null, ...extra };
}

function sections(sg: Partial<Record<'tee' | 'approach' | 'short_game' | 'putting', string>>): PlayerFingerprint['sections'] {
  const m = (label: string, v?: string) => (v == null ? [] : [{ label, value: v, tone: 'neutral' as const }]);
  return {
    tee: section('tee', m('SG: Tee', sg.tee)),
    approach: section('approach', m('SG: Approach', sg.approach)),
    short_game: section('short_game', m('SG: Around green', sg.short_game)),
    putting: section('putting', m('SG: Putting', sg.putting)),
    scoring: section('scoring'),
    pressure: section('pressure'),
  };
}

describe('parseSigned', () => {
  it('reads ASCII and U+2212 minus signs, plus signs, and units', () => {
    expect(parseSigned('-3.8')).toBe(-3.8);
    expect(parseSigned('−3.8')).toBe(-3.8);
    expect(parseSigned('+0.4')).toBe(0.4);
    expect(parseSigned('62%')).toBe(62);
    expect(parseSigned('274 yd')).toBe(274);
  });
  it('returns null, never 0, for missing values', () => {
    expect(parseSigned('--')).toBeNull();
    expect(parseSigned('')).toBeNull();
    expect(parseSigned(undefined)).toBeNull();
  });
});

describe('formatSignedValue', () => {
  it('uses a true minus sign and no sign on zero', () => {
    expect(formatSignedValue(-2.93)).toBe('−2.9');
    expect(formatSignedValue(1.98)).toBe('+2.0');
    expect(formatSignedValue(-0.01)).toBe('0.0');
  });
});

describe('buildWaterfall', () => {
  it('steps from the running total and nets only the measured areas', () => {
    const w = buildWaterfall(sections({ tee: '+1.0', approach: '-3.8', putting: '-0.4' }));
    expect(w.measuredCount).toBe(3);
    expect(w.net).toBeCloseTo(-3.2);
    const approach = w.steps.find((s) => s.key === 'approach')!;
    expect(approach.start).toBe(1);
    expect(approach.end).toBeCloseTo(-2.8);
    const shortGame = w.steps.find((s) => s.key === 'short_game')!;
    expect(shortGame.value).toBeNull();
    expect(shortGame.start).toBe(shortGame.end);
    expect(w.domain[0]).toBeLessThanOrEqual(-3.2);
    expect(w.domain[1]).toBeGreaterThanOrEqual(1);
  });
  it('has a null net when nothing is measured', () => {
    expect(buildWaterfall(sections({})).net).toBeNull();
  });
});

describe('buildVerdict', () => {
  it('leads with the worst loss and names the best gain', () => {
    const v = buildVerdict(buildWaterfall(sections({ tee: '+0.8', approach: '-0.3', putting: '-2.9' })));
    expect(v).toBe('Losing 2.9 strokes a round on the greens; driving is a strength (+0.8).');
  });
  it('handles every area losing', () => {
    expect(buildVerdict(buildWaterfall(sections({ tee: '-0.2', putting: '-1.4' })))).toBe(
      'Losing strokes in every measured area, most on the greens (1.4 strokes a round).',
    );
  });
  it('handles every area gaining', () => {
    expect(buildVerdict(buildWaterfall(sections({ tee: '+0.2', approach: '+1.1' })))).toBe(
      'Gaining strokes in every measured area, most on approach (+1.1 a round).',
    );
  });
  it('returns null with no SG at all', () => {
    expect(buildVerdict(buildWaterfall(sections({})))).toBeNull();
  });
});

describe('presentForm', () => {
  // OD-02 (2026-09-24): the number is Form (src/lib/golf/form-score.ts). The
  // old tests pinned a clamped 100 "top cap"; Form's curve cannot reach 100,
  // so that branch is gone on purpose and these tests pin the new contract.
  const composite = (
    rounds: { score_to_par: number; holes_played: number }[],
    patterns: { severity: string }[] = [],
    trend: 'up' | 'flat' | 'down' = 'flat',
  ): PlayerFingerprint['composite'] => {
    const form = computeFormFromCountableRounds(rounds, patterns);
    return { rating: form.score, trend, rounds_in_calculation: rounds.length, form };
  };
  const even = (n: number) => Array.from({ length: n }, () => ({ score_to_par: 0, holes_played: 18 }));

  it('prints the Form score with the formula from form-score, never the old linear text', () => {
    const f = presentForm(composite(even(6), [], 'up'));
    expect(f).toMatchObject({ kind: 'value', value: 80, rounds: 5, early: false, qualityLabel: null, capped: null, trendWord: 'improving' });
    if (f.kind !== 'value') throw new Error('expected a value');
    expect(f.formula).toEqual(describeFormFormula(computeFormFromCountableRounds(even(6))));
    expect(f.formula.join(' ')).not.toMatch(/80 − 3|80 - 3|kept between 0 and 100/);
  });
  it('never presents 100, even on a far-under-par window', () => {
    const f = presentForm(composite(Array.from({ length: 5 }, () => ({ score_to_par: -12, holes_played: 18 }))));
    expect(f.kind).toBe('value');
    if (f.kind === 'value') {
      expect(f.value).toBeLessThan(100);
      expect(f.capped).toBeNull();
    }
  });
  it('labels fewer than 5 countable rounds "Early read"', () => {
    const f = presentForm(composite(even(3)));
    expect(f).toMatchObject({ kind: 'value', early: true, qualityLabel: FORM_EARLY_READ_LABEL, rounds: 3 });
  });
  it('shares the early-read threshold with form-score', () => {
    expect(FORM_EARLY_ROUNDS).toBe(FORM_EARLY_READ_BELOW);
  });
  it('has no value when there are no countable rounds', () => {
    expect(presentForm(composite([])).kind).toBe('none');
  });
});

describe('confidenceWord', () => {
  it('takes the weaker of confidence and sample size', () => {
    expect(confidenceWord(1, 8)).toBe('Early read');
    expect(confidenceWord(0.3, 100)).toBe('Early read');
    expect(confidenceWord(0.9, 44)).toBe('Solid read');
    expect(confidenceWord(0.7, 40)).toBe('Fair read');
  });
});

describe('buildClaim', () => {
  const base = {
    id: 'i1', player_id: 'p', category: 'putting', title: 'T', content: 'C', signature: null,
    metadata: null, lifecycle_state: 'matured', status: 'active', priority: 'medium',
    acknowledged_at: null, resolved_at: null, created_at: '', updated_at: '',
  } as unknown as EvidenceInsight;
  it('does not add the unit twice and derives tone from polarity', () => {
    const c = buildClaim({
      ...base,
      evidence: {
        unit: 'percent', your_value: 38, your_value_display: '38%', comparison_value: 52, comparison_label: 'team avg',
        polarity: 'higher_better', sample_n: 44, window_days: 123, strokes_impact: -0.6, confidence: 1,
      } as unknown as EvidenceInsight['evidence'],
    });
    expect(c.value).toBe('38%');
    expect(c.comparison).toBe('team avg 52%');
    expect(c.tone).toBe('bad');
    expect(c.window).toBe('last 123 days');
    expect(c.sample).toBe('44 samples');
    expect(c.confidence).toBe('Solid read');
    expect(c.impact).toBe('Worth about 0.6 strokes a round');
  });
  it('reads a tentative insight as an early read regardless of confidence', () => {
    const c = buildClaim({ ...base, lifecycle_state: 'tentative', evidence: { sample_n: 100, confidence: 1 } as unknown as EvidenceInsight['evidence'] });
    expect(c.confidence).toBe('Early read');
  });
});

describe('puttingBands', () => {
  // FP-05: the data layer now passes a missing band through as null, so a
  // real 0% make rate is a reading (drawn as 0) and only null is a gap.
  it('draws a missing band (null) as a gap and a real 0% as 0', () => {
    const s = section('putting', [], {
      chart_data: {
        kind: 'bars',
        bars: [
          { label: '3-5 ft', value: 68, max: 100 },
          { label: '15-25 ft', value: 0, max: 100 },
          { label: '25+ ft', value: null, max: 100 },
        ],
      },
    });
    expect(puttingBands(s)).toEqual([
      { label: '3–5 ft', pct: 68 },
      { label: '15–25 ft', pct: 0 },
      { label: '25+ ft', pct: null },
    ]);
  });
});

describe('class scan: the Fingerprint never regresses to the old tells', () => {
  const root = path.resolve(__dirname, '..', '..');
  const files = [
    path.join(root, 'FairwayPlayerGameFingerprint.tsx'),
    ...readdirSync(path.join(root, 'fingerprint'))
      .filter((f) => f.endsWith('.tsx'))
      .map((f) => path.join(root, 'fingerprint', f)),
  ];
  it.each(files.map((f) => [path.basename(f), f]))('%s has no mono, danger, glass, InstrumentPanel, hover-lift or raw meta', (_n, file) => {
    const src = readFileSync(file as string, 'utf8');
    expect(src).not.toMatch(/font-fw-mono/);
    expect(src).not.toMatch(/bg-fw-danger|text-fw-danger/);
    expect(src).not.toMatch(/backdrop-blur/);
    expect(src).not.toMatch(/<InstrumentPanel/);
    expect(src).not.toMatch(/hover:-translate-y/);
    expect(src).not.toMatch(/`n=\$\{|conf \$\{/);
  });
});

describe('toPlayerVoice (FP-03)', () => {
  it('turns the engine\'s coach-voiced recommendation into second person', () => {
    const coach =
      'Recommended: have the player call the carry number that covers the flag from this range and log the club, then review the next ten approaches from here together.';
    expect(toPlayerVoice(coach)).toBe(
      'Recommended: Call the carry number that covers the flag from this range and log the club, then review the next ten approaches from here with your coach.',
    );
  });
  it('rewrites "the player" references and leaves other text alone', () => {
    expect(toPlayerVoice("Have the player state the start line. The player's misses go left.")).toBe(
      'State the start line. Your misses go left.',
    );
    expect(toPlayerVoice('Aim e.g. at the fat side.')).toBe('Aim e.g. at the fat side.');
    expect(toPlayerVoice(null)).toBeNull();
  });
});

describe('SG scope switch (FP-09)', () => {
  const scope = (key: 'last5' | 'last10' | 'all', rounds: number, v: number) => ({
    key,
    rounds,
    sgRounds: rounds,
    total: v * 4,
    tee: v,
    approach: v,
    short_game: null,
    putting: v,
  });

  it('offers a "last N" window only when it differs from all rounds', () => {
    expect(sgScopeOptions([scope('last5', 5, 0.1), scope('last10', 10, 0.2), scope('all', 12, 0.3)]).map((o) => o.key)).toEqual([
      'last5',
      'last10',
      'all',
    ]);
    expect(sgScopeOptions([scope('last5', 5, 0.1), scope('last10', 8, 0.2), scope('all', 8, 0.2)]).map((o) => o.key)).toEqual([
      'last5',
      'all',
    ]);
    // Five or fewer rounds: every window is "all", so no switch.
    expect(sgScopeOptions([scope('last5', 4, 0.1), scope('last10', 4, 0.1), scope('all', 4, 0.1)])).toEqual([]);
    expect(sgScopeOptions(undefined)).toEqual([]);
  });

  it('builds the scope waterfall from that window, leaving unmeasured areas out of the net', () => {
    const w = buildScopeWaterfall(scope('last5', 5, -0.5));
    expect(w.measuredCount).toBe(3);
    expect(w.net).toBeCloseTo(-1.5);
    expect(w.steps.find((st) => st.key === 'short_game')?.value).toBeNull();
  });
});
