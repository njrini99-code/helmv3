// @vitest-environment jsdom
/**
 * ============================================================================
 * FairwayPlayerGameFingerprint — SectionChart's `bars` no longer share a
 * SegmentBar "100%-segmented" total (Package 11 follow-up)
 * ----------------------------------------------------------------------------
 * `SegmentBar` renders each part's width as value / SUM(all parts) — honest
 * only when the parts are counts of one whole. None of this component's three
 * `bars` producers are that: `buildPuttingBars`/`buildShortGameBars` are
 * INDEPENDENT make-rate percentages (each `max: 100`, not summing to 100 among
 * themselves), and `buildScoringSection`'s par-type averages are raw STROKES
 * on three different maxes (par 3 ≤5, par 4 ≤6, par 5 ≤7). Feeding both into
 * one sum-normalized SegmentBar silently rendered a strokes average as a slice
 * of a strokes-vs-strokes-vs-strokes bar and a make-% as a slice shared with
 * the OTHER distance buckets' make-%s. Both now render as independent chips
 * (the same treatment `pills`-kind charts already used), each on its own
 * terms — this test pins the one invariant that must hold either way: a
 * strokes value must never render with a "%".
 * ========================================================================== */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { FairwayPlayerGameFingerprint } from './FairwayPlayerGameFingerprint';
import { GolfUserProvider, type GolfUserData } from '@/contexts/golf-user-context';
import type { PlayerFingerprint, SectionData } from '@/app/golf/actions/player-fingerprint';
import type { FingerprintSectionKey } from '@/app/golf/actions/player-fingerprint-types';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/app/golf/actions/insights', () => ({
  acknowledgeInsight: vi.fn(async () => ({ success: true })),
  dismissInsight: vi.fn(async () => ({ success: true })),
}));
vi.mock('@/app/golf/actions/development', () => ({
  createFocusAreaFromInsight: vi.fn(async () => ({ success: true, data: { focusAreaId: 'fa-1' } })),
  createPlayerFocusArea: vi.fn(async () => ({ success: true })),
}));
vi.mock('@/app/golf/actions/player-feedback', () => ({
  rateInsightAsPlayer: vi.fn(async () => ({ success: true as const })),
}));

function emptySection(key: FingerprintSectionKey): SectionData {
  return { key, category: key, sparse: true, metrics: [], insights: [], chart_data: null };
}

function makeFingerprint(): PlayerFingerprint {
  const emptySections: Record<FingerprintSectionKey, SectionData> = {
    tee: emptySection('tee'),
    approach: emptySection('approach'),
    short_game: emptySection('short_game'),
    putting: emptySection('putting'),
    scoring: emptySection('scoring'),
    pressure: emptySection('pressure'),
  };

  return {
    player: { id: 'p-1', first_name: 'Jake', last_name: 'Doe', team_name: 'Helmetta CC', avatar_url: null },
    composite: { rating: 71, trend: 'up', rounds_in_calculation: 12 },
    metrics_rounds: 18,
    sections: {
      ...emptySections,
      putting: {
        key: 'putting',
        category: 'Putting',
        sparse: false,
        metrics: [],
        insights: [],
        // Independent make-rate percentages — NOT counts of one whole.
        chart_data: {
          kind: 'bars',
          bars: [
            { label: '0-3 ft', value: 92, max: 100 },
            { label: '3-5 ft', value: 68, max: 100 },
          ],
        },
      },
      scoring: {
        key: 'scoring',
        category: 'Scoring',
        sparse: false,
        metrics: [],
        insights: [],
        // Raw strokes on three different maxes — never a percentage.
        chart_data: {
          kind: 'bars',
          bars: [
            { label: 'Par 3', value: 3.8, max: 5 },
            { label: 'Par 4', value: 4.9, max: 6 },
            { label: 'Par 5', value: 6.1, max: 7 },
          ],
        },
      },
    },
    trend: { rolling: [] },
    generated_at: '2026-07-20T12:00:00.000Z',
  };
}

const coachUser: GolfUserData = { role: 'coach', userId: 'u-coach', name: 'Coach X', coachId: 'c-1' };

beforeEach(() => vi.clearAllMocks());

describe('FairwayPlayerGameFingerprint — SectionChart bars scale honesty', () => {
  it('renders par-type strokes averages as plain numbers, never as a percentage', () => {
    render(
      <GolfUserProvider userData={coachUser}>
        <FairwayPlayerGameFingerprint fingerprint={makeFingerprint()} mode="coach" />
      </GolfUserProvider>,
    );

    expect(screen.getByText('3.8')).toBeInTheDocument();
    expect(screen.getByText('4.9')).toBeInTheDocument();
    expect(screen.getByText('6.1')).toBeInTheDocument();
    expect(screen.queryByText('3.8%')).not.toBeInTheDocument();
    expect(screen.queryByText('4.9%')).not.toBeInTheDocument();
    expect(screen.queryByText('6.1%')).not.toBeInTheDocument();
  });

  it('still renders independent make-rate bars as their own percentage', () => {
    render(
      <GolfUserProvider userData={coachUser}>
        <FairwayPlayerGameFingerprint fingerprint={makeFingerprint()} mode="coach" />
      </GolfUserProvider>,
    );

    expect(screen.getByText('92%')).toBeInTheDocument();
    expect(screen.getByText('68%')).toBeInTheDocument();
  });
});
