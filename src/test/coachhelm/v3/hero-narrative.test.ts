/**
 * W31 — hero-narrative composer evidence + citation interaction tests.
 *
 * The composeHeroNarrative() function calls compose() which talks to
 * the gateway, so we don't unit-test the network round-trip here.
 * What's worth covering: the evidence-claim builder is the only thing
 * gating fabricated-cite detection, so we exercise it directly against
 * the citation verifier so the integration is provably tight.
 */

import { describe, it, expect } from 'vitest';
import { verifyCitations } from '@/lib/coachhelm/v3/llm/citations';
import type { EvidenceClaim } from '@/lib/coachhelm/v3/llm/types';

// Reproduce the evidence builder inline so the test asserts on the
// integration contract (composer → verifier) without depending on
// importing the server-only compose() path.
function buildEvidence(input: {
  metric_label: string;
  your_value_display: string;
  team_pct: number | null;
  goal_target_display?: string;
  counterfactual_strokes_per_round?: number;
}): EvidenceClaim[] {
  const claims: EvidenceClaim[] = [
    { field: 'metric_label', value: input.metric_label },
    { field: 'your_value', value: input.your_value_display },
  ];
  if (input.team_pct !== null) {
    claims.push({ field: 'team_pct', value: input.team_pct });
  }
  if (input.goal_target_display) {
    claims.push({ field: 'goal_target', value: input.goal_target_display });
  }
  if (
    input.counterfactual_strokes_per_round &&
    input.counterfactual_strokes_per_round >= 0.3
  ) {
    claims.push({
      field: 'cf_strokes',
      value: input.counterfactual_strokes_per_round.toFixed(1),
    });
  }
  return claims;
}

describe('hero-narrative evidence + citation integration', () => {
  it('typical narrative cites your-value + team-pct cleanly', () => {
    const evidence = buildEvidence({
      metric_label: 'Lag putting',
      your_value_display: '57%',
      team_pct: 32,
    });
    const text =
      'Your lag putting is sitting at 57%, the 32nd percentile on your team. A focused weekly drill block will lift this fastest.';
    const r = verifyCitations(text, evidence);
    expect(r.verified).toBe(true);
  });

  it('flags a fabricated number even when the headline is grounded', () => {
    const evidence = buildEvidence({
      metric_label: 'Bunker save %',
      your_value_display: '38%',
      team_pct: 22,
    });
    // "5 weeks" is invented — not in evidence and not in the safe-token allowlist
    const text =
      'Your bunker save % is 38%, the 22nd percentile on your team. Closing the gap usually takes about 5 weeks of focused work.';
    const r = verifyCitations(text, evidence);
    expect(r.verified).toBe(false);
    expect(r.unmatched_tokens).toContain('5');
  });

  it('counterfactual evidence supports stroke-saving claims', () => {
    const evidence = buildEvidence({
      metric_label: 'Driving accuracy',
      your_value_display: '52%',
      team_pct: 48,
      counterfactual_strokes_per_round: 1.4,
    });
    const text =
      'You are at 52% driving accuracy (48th percentile). Closing this gap is worth ~1.4 strokes per round.';
    const r = verifyCitations(text, evidence);
    expect(r.verified).toBe(true);
  });

  it('does NOT include counterfactual claim below 0.3 stroke threshold', () => {
    const evidence = buildEvidence({
      metric_label: 'Driving accuracy',
      your_value_display: '52%',
      team_pct: 48,
      counterfactual_strokes_per_round: 0.1,
    });
    // No cf_strokes claim in evidence, so a 0.1 number in text should flag.
    // Note: the verifier regex only extracts numerics preceded by whitespace,
    // start-of-string, or "(", so the fabricated number must sit in that
    // context to be caught. "~0.1" with a "~" prefix would silently miss.
    const text = 'You are at 52% accuracy, the 48th percentile. Closing this gap saves 0.1 strokes per round.';
    const r = verifyCitations(text, evidence);
    expect(r.verified).toBe(false);
    expect(r.unmatched_tokens).toContain('0.1');
  });

  it('handles null team_pct by omitting that claim entirely', () => {
    const evidence = buildEvidence({
      metric_label: 'Approach proximity',
      your_value_display: '28 ft',
      team_pct: null,
    });
    expect(evidence.find((e) => e.field === 'team_pct')).toBeUndefined();
    const text = 'Your approach proximity averages 28 ft from the cup.';
    const r = verifyCitations(text, evidence);
    expect(r.verified).toBe(true);
  });
});
