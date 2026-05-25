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
