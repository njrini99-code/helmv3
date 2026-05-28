/**
 * W30 — pure-logic tests for the LLM layer.
 *
 * compose() + budget + the server action hit Supabase + the AI Gateway,
 * so they get exercised at the integration layer (prod deploy + manual
 * smoke). The pure helpers below are the parts most worth unit-covering.
 */

import { describe, it, expect } from 'vitest';
import {
  MODEL_FOR_TASK,
  FALLBACK_PRIORITY,
  estimateCostUsd,
} from '@/lib/coachhelm/v3/llm/types';
import { verifyCitations } from '@/lib/coachhelm/v3/llm/citations';
import {
  __testables as roundReviewInternals,
  type RoundReviewInput,
} from '@/lib/coachhelm/v3/llm/round-review';

// ---------------------------------------------------------------------------
// Model + priority maps
// ---------------------------------------------------------------------------

describe('MODEL_FOR_TASK', () => {
  it('uses Haiku for round_review (Part XI.5 amendment 2026-05-25)', () => {
    expect(MODEL_FOR_TASK.round_review).toBe('anthropic/claude-haiku-4-5');
  });
  it('uses Haiku for hero_narrative', () => {
    expect(MODEL_FOR_TASK.hero_narrative).toBe('anthropic/claude-haiku-4-5');
  });
  it('keeps Sonnet for coach_chat (multi-step tool calls)', () => {
    expect(MODEL_FOR_TASK.coach_chat).toBe('anthropic/claude-sonnet-4-6');
  });
});

describe('FALLBACK_PRIORITY', () => {
  it('encodes round_review > coach_chat > hero_narrative', () => {
    expect(FALLBACK_PRIORITY.round_review).toBeLessThan(FALLBACK_PRIORITY.coach_chat);
    expect(FALLBACK_PRIORITY.coach_chat).toBeLessThan(FALLBACK_PRIORITY.hero_narrative);
  });
});

// ---------------------------------------------------------------------------
// estimateCostUsd
// ---------------------------------------------------------------------------

describe('estimateCostUsd', () => {
  it('haiku: $1/MTok in, $5/MTok out', () => {
    // 1,000,000 in + 1,000,000 out → $1 + $5 = $6
    expect(estimateCostUsd('anthropic/claude-haiku-4-5', 1_000_000, 1_000_000)).toBe(6);
  });
  it('sonnet: $3/MTok in, $15/MTok out', () => {
    expect(estimateCostUsd('anthropic/claude-sonnet-4-6', 1_000_000, 1_000_000)).toBe(18);
  });
  it('returns 0 for unknown model', () => {
    expect(estimateCostUsd('made-up/model', 1_000, 1_000)).toBe(0);
  });
  it('typical round_review call (~7k in + 250 out) ≈ $0.0083', () => {
    const cost = estimateCostUsd('anthropic/claude-haiku-4-5', 7000, 250);
    expect(cost).toBeCloseTo(0.00825, 4);
  });
});

// ---------------------------------------------------------------------------
// verifyCitations
// ---------------------------------------------------------------------------

describe('verifyCitations', () => {
  it('passes when every numeric token in text appears in evidence', () => {
    const text = 'You shot 76 (+4) with 32 putts and hit 9 of 14 fairways.';
    const evidence = [
      { field: 'total_score', value: 76 },
      { field: 'score_to_par_signed', value: '+4' },
      { field: 'total_putts', value: 32 },
      { field: 'fairways_hit', value: 9 },
      { field: 'fairways_total', value: 14 },
    ];
    const r = verifyCitations(text, evidence);
    expect(r.verified).toBe(true);
    expect(r.unmatched_tokens).toEqual([]);
  });

  it('flags fabricated numbers', () => {
    const text = 'You shot 76 — your best round in 12 weeks!';
    // "12 weeks" is not in evidence; "76" is.
    const evidence = [{ field: 'total_score', value: 76 }];
    const r = verifyCitations(text, evidence);
    expect(r.verified).toBe(false);
    expect(r.unmatched_tokens).toContain('12');
  });

  it('tolerates universally-safe tokens (0, 1, 2, 3, 100)', () => {
    const text = 'A 1-stroke difference can mean 100 spots on a leaderboard.';
    const evidence = [{ field: 'total_score', value: 76 }];
    const r = verifyCitations(text, evidence);
    expect(r.verified).toBe(true);
  });

  it('treats trailing percent as equivalent (75 = 75%)', () => {
    const text = 'You converted 75% of putts inside 10 feet.';
    const evidence = [
      { field: 'putt_pct_inside_10', value: 75 },
      { field: 'inside_distance_ft', value: 10 },
    ];
    const r = verifyCitations(text, evidence);
    expect(r.verified).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// composeRoundReview() prompt enrichment (v3 audit Tier-2 #5)
// ---------------------------------------------------------------------------

const BASE_INPUT: RoundReviewInput = {
  player_id: 'p1',
  coach_id: 'c1',
  player_first_name: 'Maya',
  total_score: 76,
  score_to_par: 4,
  course_name: 'Lakewood CC',
  total_putts: 32,
  fairways_hit: 9,
  fairways_total: 14,
  gir: 10,
  gir_total: 18,
  fallback_summary: 'Solid round overall.',
};

describe('composeRoundReview prompt enrichment', () => {
  it('includes every enrichment section when all data is present', () => {
    const prompt = roundReviewInternals.buildPrompt({
      ...BASE_INPUT,
      strokes_gained: {
        total: 0.4,
        tee: 0.6,
        approach: -0.1,
        around_green: 0.2,
        putting: -0.5,
      },
      composite_insight_titles: [
        'Bogeys clustered after a missed green',
        'Approach proximity dropping inside 125 yds',
        'Strong driver day in light wind',
        'Should-not-appear-fourth-title',
      ],
      persona_label: 'Reliable off-tee · holds steady on par-3s',
      active_goal: {
        metric_label: 'Putts inside 10 ft',
        target_display: '≥ 75% by 2026-06-15',
      },
    });

    // Headline stats still present
    expect(prompt).toContain('76');
    expect(prompt).toContain('Maya');
    expect(prompt).toContain('Lakewood CC');

    // SG block uses directional words only — no raw decimals
    expect(prompt).toContain('Strokes Gained');
    expect(prompt).toContain('Off the tee: strong');
    expect(prompt).toContain('Approach: neutral');
    expect(prompt).toContain('Around the green: neutral');
    expect(prompt).toContain('Putting: weak');
    expect(prompt).toContain('Total: strong');
    expect(prompt).not.toContain('0.4');
    expect(prompt).not.toContain('0.6');
    expect(prompt).not.toContain('-0.5');

    // Composite titles capped at 3
    expect(prompt).toContain('Patterns flagged on this round:');
    expect(prompt).toContain('Bogeys clustered after a missed green');
    expect(prompt).toContain('Approach proximity dropping inside 125 yds');
    expect(prompt).toContain('Strong driver day in light wind');
    expect(prompt).not.toContain('Should-not-appear-fourth-title');

    // Persona + goal
    expect(prompt).toContain('Player persona: Reliable off-tee · holds steady on par-3s');
    expect(prompt).toContain('Active goal: Putts inside 10 ft → ≥ 75% by 2026-06-15');

    // Enrichment-only guidance appears
    expect(prompt).toContain('weave ONE of them in naturally');
  });

  it('gracefully omits genome persona when missing', () => {
    const prompt = roundReviewInternals.buildPrompt({
      ...BASE_INPUT,
      persona_label: null,
      // goal still present so we know the omission is targeted
      active_goal: {
        metric_label: 'Fairways hit',
        target_display: '≥ 65%',
      },
    });
    expect(prompt).not.toContain('Player persona');
    expect(prompt).toContain('Active goal: Fairways hit');
  });

  it('gracefully omits active goal when missing', () => {
    const prompt = roundReviewInternals.buildPrompt({
      ...BASE_INPUT,
      persona_label: 'Bomber off-tee',
      active_goal: null,
    });
    expect(prompt).toContain('Player persona: Bomber off-tee');
    expect(prompt).not.toContain('Active goal');
  });

  it('omits the SG facts block entirely when every component is null', () => {
    const prompt = roundReviewInternals.buildPrompt({
      ...BASE_INPUT,
      strokes_gained: {
        total: null,
        tee: null,
        approach: null,
        around_green: null,
        putting: null,
      },
    });
    // The fact-block header is absent; the always-on anti-fabrication
    // guidance line remains as defense-in-depth.
    expect(prompt).not.toContain('Strokes Gained (directional only');
    expect(prompt).not.toContain('Off the tee:');
    expect(prompt).toContain('do NOT quote raw SG numbers');
  });

  it('omits enrichment-section instruction when nothing optional was supplied', () => {
    // Pure baseline — no SG, no composites, no persona, no goal.
    const prompt = roundReviewInternals.buildPrompt(BASE_INPUT);
    expect(prompt).not.toContain('weave ONE of them in naturally');
    expect(prompt).not.toContain('Strokes Gained (directional only');
    expect(prompt).not.toContain('Patterns flagged');
    expect(prompt).not.toContain('Player persona');
    expect(prompt).not.toContain('Active goal');
    // But the always-on SG anti-fabrication rule should still ship,
    // since the LLM may have memorized SG patterns and we want defense
    // in depth even when no SG was supplied this round.
    expect(prompt).toContain('do NOT quote raw SG numbers');
  });

  it('sgBucket classifies signed thresholds correctly', () => {
    expect(roundReviewInternals.sgBucket(null)).toBeNull();
    expect(roundReviewInternals.sgBucket(0)).toBe('neutral');
    expect(roundReviewInternals.sgBucket(0.29)).toBe('neutral');
    expect(roundReviewInternals.sgBucket(0.3)).toBe('strong');
    expect(roundReviewInternals.sgBucket(-0.29)).toBe('neutral');
    expect(roundReviewInternals.sgBucket(-0.3)).toBe('weak');
    expect(roundReviewInternals.sgBucket(1.5)).toBe('strong');
  });

  it('does NOT register SG numbers as numeric evidence (citation hardening)', () => {
    const evidence = roundReviewInternals.buildEvidence({
      ...BASE_INPUT,
      strokes_gained: {
        total: 0.4,
        tee: 0.6,
        approach: -0.1,
        around_green: 0.2,
        putting: -0.5,
      },
    });
    // No SG-named claims should exist — they're intentionally kept out
    // of the evidence set so any raw SG decimal that leaks into the
    // prose will be flagged by the citation verifier.
    expect(evidence.find((e) => e.field.startsWith('sg_'))).toBeUndefined();
    expect(evidence.find((e) => e.field.startsWith('strokes_gained'))).toBeUndefined();
  });

  it('keeps headline stat claims intact alongside the new optional fields', () => {
    const evidence = roundReviewInternals.buildEvidence({
      ...BASE_INPUT,
      persona_label: 'Reliable',
      active_goal: { metric_label: 'Fairways', target_display: '≥ 65%' },
    });
    // Headline stats remain — that's what the verifier protects.
    expect(evidence).toEqual(
      expect.arrayContaining([
        { field: 'total_score', value: 76 },
        { field: 'total_putts', value: 32 },
        { field: 'fairways_hit', value: 9 },
        { field: 'gir_total', value: 18 },
      ]),
    );
  });
});
