/**
 * ============================================================================
 * patternToInsightVocabulary — player-name resolution regression guard
 * ----------------------------------------------------------------------------
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
 * ========================================================================== */
import { describe, it, expect } from 'vitest';
import {
  insightToSignalRow,
  insightsToSignalRows,
} from './patternToInsightVocabulary';
import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import type { InsightEvidence } from '@/lib/coachhelm/v2/insights/types';

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
