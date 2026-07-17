/**
 * patternToInsightVocabulary — coach-voice + valence coverage (bug #915)
 * and player-name resolution regression guard (bug #907).
 *
 * Coach voice / valence:
 * `/dashboard/patterns` is coach-only (guarded in page.tsx), but the mined
 * pattern text (`PatternMiner.generateDescription`/`generateRecommendation`
 * in pattern-miner.ts) is written in the PLAYER's first-person voice ("you
 * tend to score…", "discuss with your coach"). This file covers:
 *
 *   1. `toCoachVoice` — the player-voice → coach-voice rewrite, and that it
 *      is a no-op for already-third-person text (team-pattern-generator.ts
 *      rows carry no "you"/generic-fallback substring to match).
 *   2. `patternToSignalRow` — wires `toCoachVoice` into the title/body AND
 *      derives `valence` from the SIGNED stroke_impact (independent of the
 *      severity-tiered `priority`) so a plays-better pattern never renders
 *      with the same tone as a plays-worse one just because their magnitudes
 *      land in the same tier.
 *
 * Player-name resolution:
 * Bug: every insight-sourced `SignalRow` hard-coded `playerName: undefined`,
 * so the Signals "By player" grouping (`FairwayCoachHelmSignals`'s
 * `r.playerName?.trim() || 'Unknown player'` fallback) collapsed EVERY alert
 * and insight into a single "Unknown player" bucket — patterns were fine
 * (they resolve `playerName` inline via `getTeamPatterns`' own `golf_players`
 * join), but insights never carried a name at all.
 *
 * Fix: `insightToSignalRow` / `insightsToSignalRows` now accept an optional
 * `player_id -> display name` map (the SSR-resolved team roster) and resolve
 * `playerName` from it. This locks that contract.
 */
import { describe, it, expect } from 'vitest';
import {
  toCoachVoice,
  patternToSignalRow,
  insightToSignalRow,
  insightsToSignalRows,
} from './patternToInsightVocabulary';
import type { ExtendedPattern } from '@/app/golf/actions/pattern-management';
import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import type { InsightEvidence } from '@/lib/coachhelm/v2/insights/types';

// ---------------------------------------------------------------------------
// toCoachVoice — the voice switch
// ---------------------------------------------------------------------------

describe('toCoachVoice', () => {
  it('rewrites "you tend to" to the player\'s name, third person', () => {
    const text =
      'After 5+ days off in tournament rounds, you tend to score 4.7 strokes worse than average.';
    expect(toCoachVoice(text, 'Ethan Rodriguez')).toBe(
      'After 5+ days off in tournament rounds, Ethan Rodriguez tends to score 4.7 strokes worse than average.',
    );
  });

  it('falls back to "the player" when no name is available — never fabricates one', () => {
    const text = 'After 7+ days off, you tend to score 2.1 strokes worse than average.';
    expect(toCoachVoice(text, undefined)).toBe(
      'After 7+ days off, the player tends to score 2.1 strokes worse than average.',
    );
    expect(toCoachVoice(text, null)).toContain('the player tends to');
    expect(toCoachVoice(text, '   ')).toContain('the player tends to');
  });

  it('replaces the generic "discuss with your coach" recommendation with a coach-appropriate handoff', () => {
    expect(toCoachVoice('Monitor this pattern and discuss with your coach.', 'Ethan')).toBe(
      'Worth a conversation with Ethan.',
    );
  });

  it('leaves the OTHER (already-neutral) recommendation branch untouched', () => {
    const text = 'Consider a practice round before important events after extended breaks.';
    expect(toCoachVoice(text, 'Ethan')).toBe(text);
  });

  it('is a no-op for already-third-person text (team-pattern-generator.ts rows)', () => {
    const text = "Ethan's short game (2.1 SG:ARG) is 1.4 strokes below team average (0.7)";
    expect(toCoachVoice(text, 'Ethan')).toBe(text);
  });

  it('passes through empty text unchanged', () => {
    expect(toCoachVoice('', 'Ethan')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// patternToSignalRow — title/body coach-voiced, valence signed
// ---------------------------------------------------------------------------

function makePattern(overrides: Partial<ExtendedPattern> = {}): ExtendedPattern {
  return {
    id: 'pattern-1',
    playerId: 'player-1',
    patternType: 'compound',
    conditions: [
      { field: 'days_since_last', operator: 'gte', value: 5, label: 'After 5+ days off' },
      { field: 'round_type', operator: 'eq', value: 'tournament', label: 'In tournament' },
    ],
    outcome: { metric: 'score_to_par', direction: 'increase', magnitude: 4.7, comparison: 'vs_baseline' },
    support: 0.2,
    confidence: 0.8,
    lift: 2.1,
    conviction: 3,
    strokeImpact: 4.7,
    actionability: 0.6,
    sampleSize: 8,
    firstDetected: '2026-01-01T00:00:00.000Z',
    lastOccurrence: '2026-01-10T00:00:00.000Z',
    occurrenceCount: 8,
    trend: 'stable',
    isActive: true,
    lifecycleState: 'detected',
    severity: 'high',
    description:
      'After 5+ days off in tournament rounds, you tend to score 4.7 strokes worse than average.',
    recommendation: 'Monitor this pattern and discuss with your coach.',
    playerName: 'Ethan Rodriguez',
    ...overrides,
  };
}

function makeInsight(overrides: Partial<EvidenceInsight> = {}): EvidenceInsight {
  return {
    id: 'insight-1',
    player_id: 'player-1',
    category: 'putting',
    insight_type: 'putts_per_round',
    title: 'Three-putt rate is climbing',
    content: 'Three-putts are up over the last 5 rounds.',
    signature: 'v3:x',
    evidence: {
      strokes_impact: 1.2,
      confidence: 0.8,
      sample_n: 12,
    } as unknown as InsightEvidence,
    metadata: null,
    lifecycle_state: 'detected',
    status: 'active',
    priority: 'high',
    acknowledged_at: null,
    resolved_at: null,
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('patternToSignalRow — coach voice', () => {
  it('title is third-person with the player\'s name, no "When X and Y" double-conjunction', () => {
    const row = patternToSignalRow(makePattern());
    expect(row.title).toBe(
      'After 5+ days off in tournament rounds, Ethan Rodriguez tends to score 4.7 strokes worse than average.',
    );
    expect(row.title).not.toMatch(/\byou\b/i);
    expect(row.title).not.toMatch(/^When /);
  });

  it('body drops "discuss with your coach" for the coach-facing handoff', () => {
    const row = patternToSignalRow(makePattern());
    expect(row.body).toBe('Worth a conversation with Ethan Rodriguez.');
    expect(row.body).not.toContain('your coach');
  });
});

describe('patternToSignalRow — valence (bug #915 icon/accent inversion)', () => {
  it('a plays-BETTER pattern (positive stroke_impact) gets positive valence, even in a "high" priority tier', () => {
    // magnitude 2.6 -> priority 'critical' by the |impact| tiers, but the
    // SIGN is positive (the player plays better) — valence must say so.
    const row = patternToSignalRow(makePattern({ strokeImpact: 2.6 }));
    expect(row.valence).toBe('positive');
    expect(row.priority).toBe('critical');
  });

  it('a plays-WORSE pattern (negative stroke_impact) gets negative valence, even in a "medium" priority tier', () => {
    // magnitude 0.9 -> priority 'medium' by the |impact| tiers; sign is
    // negative (a leak) — the OLD bug rendered this with the SAME green
    // tone as a positive pattern in the same magnitude tier.
    const row = patternToSignalRow(makePattern({ strokeImpact: -0.9 }));
    expect(row.valence).toBe('negative');
    expect(row.priority).toBe('medium');
  });

  it('zero / missing stroke_impact is neutral, never fabricated', () => {
    expect(patternToSignalRow(makePattern({ strokeImpact: 0 })).valence).toBe('neutral');
    expect(
      patternToSignalRow(makePattern({ strokeImpact: null as unknown as number })).valence,
    ).toBe('neutral');
  });

  it('valence and priority disagree exactly in the reported scenario (small positive vs small negative)', () => {
    // Regression lock for the reported bug: a small-magnitude positive
    // pattern and a small-magnitude negative pattern land in the SAME
    // priority tier ('low') but must carry OPPOSITE valence.
    const better = patternToSignalRow(makePattern({ strokeImpact: 0.4 }));
    const worse = patternToSignalRow(makePattern({ strokeImpact: -0.4 }));
    expect(better.priority).toBe(worse.priority);
    expect(better.valence).toBe('positive');
    expect(worse.valence).toBe('negative');
    expect(better.valence).not.toBe(worse.valence);
  });
});

// ---------------------------------------------------------------------------
// insightToSignalRow / insightsToSignalRows — player-name resolution
// ---------------------------------------------------------------------------

describe('insightToSignalRow — player-name resolution', () => {
  it('resolves playerName from the roster map when the player_id is present', () => {
    const row = insightToSignalRow(
      makeInsight({ player_id: 'player-1' }),
      { 'player-1': 'Nick Rini', 'player-2': 'Jordan Lee' },
    );
    expect(row.playerName).toBe('Nick Rini');
    // The raw id stays available on the row regardless (used for focus-area
    // conversion / deep links) — resolving a name must not erase it.
    expect(row.playerId).toBe('player-1');
  });

  it('falls back to undefined (never a fabricated name) when the map has no entry for the player', () => {
    const row = insightToSignalRow(
      makeInsight({ player_id: 'player-not-on-roster' }),
      { 'player-1': 'Nick Rini' },
    );
    expect(row.playerName).toBeUndefined();
  });

  it('falls back to undefined when no roster map is supplied at all (back-compat)', () => {
    const row = insightToSignalRow(makeInsight());
    expect(row.playerName).toBeUndefined();
  });

  it('treats an empty resolved name (blank first/last name) the same as "not found"', () => {
    const row = insightToSignalRow(
      makeInsight({ player_id: 'player-1' }),
      { 'player-1': '' },
    );
    expect(row.playerName).toBeUndefined();
  });
});

describe('insightsToSignalRows — batch resolution forwards the SAME map to every row', () => {
  it('resolves distinct names for distinct players in one batch', () => {
    const rows = insightsToSignalRows(
      [
        makeInsight({ id: 'a', player_id: 'player-1' }),
        makeInsight({ id: 'b', player_id: 'player-2' }),
        makeInsight({ id: 'c', player_id: 'player-3' }),
      ],
      { 'player-1': 'Nick Rini', 'player-2': 'Jordan Lee' },
    );
    expect(rows.map((r) => r.playerName)).toEqual([
      'Nick Rini',
      'Jordan Lee',
      undefined, // player-3 not on the roster map
    ]);
    // Distinct real names means the "By player" grouping produces distinct
    // buckets instead of collapsing every row into "Unknown player".
    const distinctNames = new Set(rows.map((r) => r.playerName).filter(Boolean));
    expect(distinctNames.size).toBe(2);
  });
});
