/**
 * P0-06 — composite over-confidence calibration.
 *
 * Composites bypass BaseGenerator.run(), so they used to ship a static
 * { sample_adequacy: 0.8, recency: 1.0, variance: 0.5 } that calcConfidence
 * blended into a fabricated ~0.77 — over-confident for what is usually a
 * HYPOTHESIS combined from two independent standings.
 *
 * These tests pin the invariants the fix establishes:
 *   1. A composite with static factors is flagged factors_measured=false.
 *   2. An inferred chain's confidence is calibrated DOWN below the old 0.77 and
 *      under the inferred ceiling — and survives the upsert recompute (which
 *      only reads confidence_factors, not the confidence field).
 *   3. The estimated 3-putt rate is labeled "estimated" in evidence + prose.
 *   4. Source insight windows are copied into the composite's empty windows.
 */

import { describe, it, expect } from 'vitest';
import lag from '@/lib/coachhelm/v3/composite/rules/lag-distance-3putt';
import pdc from '@/lib/coachhelm/v3/composite/rules/pressure-decel-chain';
import {
  normalizeCompositeEvidence,
  sourceWindowSpan,
} from '@/lib/coachhelm/v3/composite/synthesis';
import { calcConfidence } from '@/lib/coachhelm/v2/insights/types';
import type { EvidenceInsight } from '@/lib/coachhelm/v3/composite/types';

function puttInsight(over: {
  id: string;
  sig: string;
  makePct: number;
  teamPct: number;
  sampleN: number;
  windowStart?: string;
  windowEnd?: string;
}): EvidenceInsight {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const evidence: any = {
    metric: 'putt_distance',
    your_value: over.makePct,
    sample_n: over.sampleN,
    window_days: 30,
    window_start: over.windowStart ?? '',
    window_end: over.windowEnd ?? '',
    standing: {
      metric_id: 'putt_distance',
      player_value: over.makePct,
      team_avg: 0,
      team_n: 5,
      team_pct: over.teamPct,
      pga_value: 0,
      pga_delta: null,
      computed_at: '2026-05-25T00:00:00Z',
    },
  };
  return {
    id: over.id,
    insight_type: 'putt_distance',
    category: 'putt_distance',
    signature: over.sig,
    player_id: 'p',
    evidence,
    engine_version: 'v3',
    created_at: '2026-05-25T00:00:00Z',
  };
}

describe('P0-06 — composite rules declare inferred + estimated honesty', () => {
  const lagSources = [
    puttInsight({ id: 'lag', sig: 'v3:putt_distance:25_plus_ft', makePct: 8, teamPct: 30, sampleN: 12 }),
    puttInsight({ id: 'short', sig: 'v3:putt_distance:3_5ft', makePct: 75, teamPct: 30, sampleN: 12 }),
  ];

  it('lag_distance_3putt marks the projected 3-putt rate estimated + inferred', () => {
    const composed = lag.compose(lag.detect(lagSources)!);
    expect(composed.evidence.estimated).toBe(true);
    expect(composed.evidence.causality_level).toBe('inferred_hypothesis');
    // factors are static placeholders → must be flagged unmeasured.
    expect(composed.evidence.confidence_factors.factors_measured).toBe(false);
    // the projected rate is surfaced as "estimated" in prose + label.
    expect(composed.content.toLowerCase()).toContain('estimated');
    expect(composed.evidence.metric_label.toLowerCase()).toContain('estimated');
    expect(composed.evidence.your_value_display.toLowerCase()).toMatch(/est|~/);
  });

  it('pressure_decel_chain is an inferred chain with unmeasured factors', () => {
    const m = pdc.detect([
      puttInsight({ id: 'sp', sig: 'v3:putt_distance:3_5ft', makePct: 70, teamPct: 30, sampleN: 12 }),
      // a pressure_gap insight
      {
        id: 'pg',
        insight_type: 'pressure_gap',
        category: 'pressure',
        signature: 'v3:pressure_gap:practice_vs_tournament',
        player_id: 'p',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        evidence: { metric: 'pressure_gap', your_value: 1.4, sample_n: 9, window_days: 30 } as any,
        engine_version: 'v3',
        created_at: '2026-05-25T00:00:00Z',
      },
    ])!;
    const composed = pdc.compose(m);
    expect(composed.evidence.causality_level).toBe('inferred_hypothesis');
    expect(composed.evidence.confidence_factors.factors_measured).toBe(false);
  });
});

describe('P0-06 — normalizeCompositeEvidence calibrates confidence down', () => {
  // Reconstruct the pre-fix static evidence to prove the OLD blend was 0.77.
  const staticEvidence = {
    metric: 'three_putt_chain',
    metric_label: 'Estimated 3-putt rate (15+ ft)',
    unit: 'percent' as const,
    your_value: 23,
    your_value_display: '~23% est. 3-putts',
    comparison_value: 3,
    comparison_label: 'Tour ~3% 3-putt rate',
    comparison_source: 'pga_baseline' as const,
    sample_n: 30,
    window_days: 30,
    window_start: '',
    window_end: '',
    strokes_impact: 1.0,
    strokes_impact_method: 'peer_delta' as const,
    confidence: 0.7,
    confidence_factors: { sample_adequacy: 0.8, recency: 1.0, variance: 0.5 },
    estimated: true,
    causality_level: 'inferred_hypothesis' as const,
  };

  it('the OLD static blend was the over-confident ~0.77 the audit flagged', () => {
    expect(calcConfidence(staticEvidence)).toBeCloseTo(0.77, 2);
  });

  it('an inferred composite is calibrated DOWN below 0.77 and under the ceiling', () => {
    const out = normalizeCompositeEvidence(staticEvidence, null);
    expect(out.confidence).toBeLessThan(0.77);
    expect(out.confidence).toBeLessThanOrEqual(0.6);
    expect(out.confidence_factors.factors_measured).toBe(false);
  });

  it('the calibrated confidence SURVIVES the upsert recompute (durable cap)', () => {
    // upsertInsight recomputes from confidence_factors alone, ignoring the
    // `confidence` field — the cap must be baked into the factors.
    const out = normalizeCompositeEvidence(staticEvidence, null);
    const recomputed = calcConfidence({ confidence_factors: out.confidence_factors });
    expect(recomputed).toBeCloseTo(out.confidence, 6);
    expect(recomputed).toBeLessThanOrEqual(0.6);
  });

  it('a thin-sample inferred composite gets an even lower honest confidence', () => {
    const thin = { ...staticEvidence, sample_n: 9 };
    const out = normalizeCompositeEvidence(thin, null);
    // sample_adequacy = 9/30 = 0.3 → honest confidence 0.3, well below the cap.
    expect(out.confidence).toBeCloseTo(0.3, 2);
  });

  it('defaults missing causality_level to inferred_hypothesis (conservative)', () => {
    const noLevel = { ...staticEvidence };
    delete (noLevel as { causality_level?: unknown }).causality_level;
    const out = normalizeCompositeEvidence(noLevel, null);
    expect(out.causality_level).toBe('inferred_hypothesis');
  });

  it('an observed_sequence chain is NOT capped — it keeps honest sample-adequacy', () => {
    const observed = { ...staticEvidence, causality_level: 'observed_sequence' as const };
    const out = normalizeCompositeEvidence(observed, null);
    // sample_adequacy = 30/30 = 1.0 → confidence ~1.0, above the inferred ceiling.
    expect(out.confidence).toBeGreaterThan(0.6);
  });
});

describe('P0-06 — source windows are copied into the composite', () => {
  const sources: EvidenceInsight[] = [
    puttInsight({
      id: 'lag', sig: 'v3:putt_distance:25_plus_ft', makePct: 8, teamPct: 30, sampleN: 12,
      windowStart: '2026-05-01', windowEnd: '2026-05-20',
    }),
    puttInsight({
      id: 'short', sig: 'v3:putt_distance:3_5ft', makePct: 75, teamPct: 30, sampleN: 12,
      windowStart: '2026-05-10', windowEnd: '2026-05-31',
    }),
  ];

  it('sourceWindowSpan returns the widest (earliest start, latest end)', () => {
    const span = sourceWindowSpan(['lag', 'short'], sources);
    expect(span).toEqual({ window_start: '2026-05-01', window_end: '2026-05-31' });
  });

  it('normalize copies the source span into a composite with empty windows', () => {
    const composed = lag.compose(lag.detect(sources)!);
    expect(composed.evidence.window_start).toBe('');
    const span = sourceWindowSpan(['lag', 'short'], sources);
    const out = normalizeCompositeEvidence(composed.evidence, span);
    expect(out.window_start).toBe('2026-05-01');
    expect(out.window_end).toBe('2026-05-31');
  });

  it('never clobbers a window the rule already set', () => {
    const withWindow = {
      ...lag.compose(lag.detect(sources)!).evidence,
      window_start: '2026-06-01',
      window_end: '2026-06-15',
    };
    const span = sourceWindowSpan(['lag', 'short'], sources);
    const out = normalizeCompositeEvidence(withWindow, span);
    expect(out.window_start).toBe('2026-06-01');
    expect(out.window_end).toBe('2026-06-15');
  });
});
