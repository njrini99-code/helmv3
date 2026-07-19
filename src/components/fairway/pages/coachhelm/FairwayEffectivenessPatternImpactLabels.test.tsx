// @vitest-environment jsdom
/**
 * ============================================================================
 * patternImpactLabels — differentiated tornado bars for the SAME player (#61)
 * ----------------------------------------------------------------------------
 * Bug: the Pattern-impact tornado (both `PatternImpactDeck` and
 * `TopPatternsCard`) labeled every bar with the bare `playerName`. A player
 * with MULTIPLE distinct patterns in the top-N produced multiple bars with
 * an IDENTICAL label and no way to tell which bar was which pattern.
 *
 * Fix: `patternImpactLabels` only appends a differentiator (a short
 * description snippet, or a numbered fallback) when a name actually collides
 * within the plotted set — a player with just one pattern still gets the
 * clean bare name.
 * ========================================================================== */
import { describe, expect, it } from 'vitest';
import type { ImpactfulPattern } from '@/app/golf/actions/coachhelm-analytics';
import { patternImpactLabels } from './FairwayEffectiveness';

function pattern(overrides: Partial<ImpactfulPattern> = {}): ImpactfulPattern {
  return {
    id: 'p1',
    description: 'Struggles from the rough',
    playerName: 'Alex Rivera',
    strokesImpact: -1.2,
    lifecycleState: 'confirmed',
    confidence: 0.8,
    detectedAt: '2026-06-01T00:00:00.000Z',
    resolvedAt: null,
    ...overrides,
  };
}

describe('patternImpactLabels', () => {
  it('keeps the bare player name when no other bar shares it', () => {
    const patterns = [
      pattern({ id: 'p1', playerName: 'Alex Rivera' }),
      pattern({ id: 'p2', playerName: 'Sam Lee' }),
    ];
    expect(patternImpactLabels(patterns)).toEqual(['Alex Rivera', 'Sam Lee']);
  });

  it('differentiates two distinct patterns attributed to the SAME player', () => {
    const patterns = [
      pattern({ id: 'p1', playerName: 'Alex Rivera', description: 'Struggles from the rough' }),
      pattern({ id: 'p2', playerName: 'Alex Rivera', description: 'Three-putts under pressure' }),
    ];
    const labels = patternImpactLabels(patterns);
    // Neither label is the bare, undifferentiated name...
    expect(labels).not.toContain('Alex Rivera');
    // ...and the two bars are no longer identical.
    expect(labels[0]).not.toBe(labels[1]);
    // Each still carries the player's name as a recognizable prefix.
    expect(labels[0]).toContain('Alex Rivera');
    expect(labels[1]).toContain('Alex Rivera');
  });

  it('falls back to a numbered differentiator when a description is missing', () => {
    const patterns = [
      pattern({ id: 'p1', playerName: 'Sam Lee', description: '' }),
      pattern({ id: 'p2', playerName: 'Sam Lee', description: '' }),
    ];
    const labels = patternImpactLabels(patterns);
    expect(labels[0]).not.toBe(labels[1]);
    expect(labels.every((l) => l.startsWith('Sam Lee'))).toBe(true);
  });
});
