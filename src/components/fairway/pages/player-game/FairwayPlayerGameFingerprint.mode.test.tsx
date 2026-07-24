// @vitest-environment jsdom
/**
 * ============================================================================
 * FairwayPlayerGameFingerprint — `mode` branching (coach vs. player-self)
 * ----------------------------------------------------------------------------
 * Covers the player Game Fingerprint port: the header actions and the
 * per-insight write actions must branch correctly on `mode`, while the coach
 * path (the default, every existing call site) stays byte-for-byte unchanged.
 *
 *   coach mode (default) — Print report + Genome + Player page header links;
 *     "Make focus area" → createFocusAreaFromInsight; Acknowledge/Dismiss →
 *     acknowledgeInsight/dismissInsight.
 *   player mode — no coach-only header links (their routes 404/redirect for
 *     a player session); "Make focus area" → createPlayerFocusArea (no coach
 *     attribution, area_type derived from the insight's fingerprint section);
 *     Acknowledge/Dismiss → rateInsightAsPlayer (the same round-trip the
 *     Insights sub-tab already uses).
 * ========================================================================== */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { FairwayPlayerGameFingerprint } from './FairwayPlayerGameFingerprint';
import { GolfUserProvider, type GolfUserData } from '@/contexts/golf-user-context';
import type { PlayerFingerprint, SectionData } from '@/app/golf/actions/player-fingerprint';
import type { FingerprintSectionKey } from '@/app/golf/actions/player-fingerprint-types';

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

const acknowledgeInsightMock = vi.fn(async (..._args: unknown[]) => ({ success: true }));
const dismissInsightMock = vi.fn(async (..._args: unknown[]) => ({ success: true }));
vi.mock('@/app/golf/actions/insights', () => ({
  acknowledgeInsight: (...args: unknown[]) => acknowledgeInsightMock(...args),
  dismissInsight: (...args: unknown[]) => dismissInsightMock(...args),
}));

const createFocusAreaFromInsightMock = vi.fn(async (..._args: unknown[]) => ({
  success: true,
  data: { focusAreaId: 'fa-1' },
}));
const createPlayerFocusAreaMock = vi.fn(async (..._args: unknown[]) => ({ success: true }));
vi.mock('@/app/golf/actions/development', () => ({
  createFocusAreaFromInsight: (...args: unknown[]) => createFocusAreaFromInsightMock(...args),
  createPlayerFocusArea: (...args: unknown[]) => createPlayerFocusAreaMock(...args),
}));

const rateInsightAsPlayerMock = vi.fn(async (..._args: unknown[]) => ({ success: true as const }));
vi.mock('@/app/golf/actions/player-feedback', () => ({
  rateInsightAsPlayer: (...args: unknown[]) => rateInsightAsPlayerMock(...args),
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
    player: {
      id: 'p-1',
      first_name: 'Jake',
      last_name: 'Doe',
      team_name: 'Helmetta CC',
      avatar_url: null,
    },
    composite: { rating: 71, trend: 'up', rounds_in_calculation: 12 },
    sections: {
      ...emptySections,
      putting: {
        key: 'putting',
        category: 'Putting',
        sparse: false,
        metrics: [{ label: 'Putts / round', value: '29.4', tone: 'good' }],
        insights: [
          {
            id: 'insight-1',
            player_id: 'p-1',
            category: 'putting',
            title: 'Putting is costing you strokes',
            content: 'Your 6-10ft make rate trails the team average.',
            signature: 'sig-1',
            evidence: {
              metric: 'putt_make_rate_6_10ft',
              metric_label: '6-10 ft make rate',
              unit: 'percent',
              your_value: 0.38,
              your_value_display: '38%',
              comparison_value: 0.52,
              comparison_label: 'Team avg',
              comparison_source: 'd2_avg',
              sample_n: 40,
              window_days: 30,
              window_start: '2026-01-01T00:00:00.000Z',
              window_end: '2026-01-30T00:00:00.000Z',
              strokes_impact: 1.4,
              strokes_impact_method: 'peer_delta',
              confidence: 0.7,
              confidence_factors: { sample_adequacy: 1, recency: 1, variance: 0.4 },
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any,
            metadata: null,
            lifecycle_state: 'matured',
            status: 'active',
            priority: 'medium',
            acknowledged_at: null,
            resolved_at: null,
            created_at: '2026-01-01T00:00:00.000Z',
            updated_at: '2026-01-01T00:00:00.000Z',
            drills: [],
          },
        ],
        chart_data: null,
      },
    },
    trend: { rolling: [] },
    generated_at: '2026-07-20T12:00:00.000Z',
  };
}

const coachUser: GolfUserData = { role: 'coach', userId: 'u-coach', name: 'Coach X', coachId: 'c-1' };
const playerUser: GolfUserData = { role: 'player', userId: 'u-player', name: 'Jake Doe', playerId: 'p-1' };

function renderFingerprint(mode: 'coach' | 'player', user: GolfUserData) {
  return render(
    <GolfUserProvider userData={user}>
      <FairwayPlayerGameFingerprint fingerprint={makeFingerprint()} mode={mode} />
    </GolfUserProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('FairwayPlayerGameFingerprint — mode branching', () => {
  it('coach mode (default prop) shows the coach-only header actions + avatar initials', () => {
    render(
      <GolfUserProvider userData={coachUser}>
        <FairwayPlayerGameFingerprint fingerprint={makeFingerprint()} />
      </GolfUserProvider>,
    );
    expect(screen.getByRole('link', { name: /print report/i })).toHaveAttribute(
      'href',
      '/golf/dashboard/players/p-1/game/print',
    );
    expect(screen.getByRole('link', { name: /genome/i })).toHaveAttribute(
      'href',
      '/golf/dashboard/players/p-1/genome',
    );
    expect(screen.getByRole('link', { name: /player page/i })).toBeInTheDocument();
    // Avatar identity header — initials fallback (no avatar_url in the fixture).
    expect(screen.getByText('JD')).toBeInTheDocument();
  });

  it('player mode drops the coach-only header actions but keeps the avatar + name', () => {
    renderFingerprint('player', playerUser);
    expect(screen.queryByRole('link', { name: /print report/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^genome$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /player page/i })).not.toBeInTheDocument();
    expect(screen.getByText('JD')).toBeInTheDocument();
    // Avatar renders an sr-only duplicate of the name alongside the visible
    // title text — both are legitimately "Jake Doe", so assert count, not
    // singular presence.
    expect(screen.getAllByText('Jake Doe').length).toBeGreaterThanOrEqual(2);
  });

  it('coach mode "Make focus area" calls createFocusAreaFromInsight, not the player path', async () => {
    const user = userEvent.setup();
    renderFingerprint('coach', coachUser);

    await user.click(screen.getByRole('button', { name: /make focus area/i }));

    await waitFor(() => expect(createFocusAreaFromInsightMock).toHaveBeenCalledTimes(1));
    expect(createFocusAreaFromInsightMock).toHaveBeenCalledWith(
      expect.objectContaining({ insight_id: 'insight-1', player_id: 'p-1', coach_id: 'c-1' }),
    );
    expect(createPlayerFocusAreaMock).not.toHaveBeenCalled();
    expect(pushMock).toHaveBeenCalledWith(
      expect.stringContaining('/golf/dashboard/intelligence?view=players&player=p-1'),
    );
  });

  it('player mode "Make focus area" calls createPlayerFocusArea with a section-derived area_type and no coach attribution', async () => {
    const user = userEvent.setup();
    renderFingerprint('player', playerUser);

    await user.click(screen.getByRole('button', { name: /make focus area/i }));

    await waitFor(() => expect(createPlayerFocusAreaMock).toHaveBeenCalledTimes(1));
    expect(createPlayerFocusAreaMock).toHaveBeenCalledWith(
      expect.objectContaining({
        player_id: 'p-1',
        area_type: 'putting',
        from_insight_id: 'insight-1',
      }),
    );
    const call = createPlayerFocusAreaMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(call).not.toHaveProperty('coach_id');
    expect(createFocusAreaFromInsightMock).not.toHaveBeenCalled();
    expect(pushMock).toHaveBeenCalledWith('/golf/dashboard/coachhelm?view=development');
  });

  it('player mode Acknowledge/Dismiss route through rateInsightAsPlayer, not the coach actions', async () => {
    const user = userEvent.setup();
    renderFingerprint('player', playerUser);

    await user.click(screen.getByRole('button', { name: /^acknowledge$/i }));
    await waitFor(() =>
      expect(rateInsightAsPlayerMock).toHaveBeenCalledWith({ insightId: 'insight-1', rating: 'acknowledged' }),
    );
    expect(acknowledgeInsightMock).not.toHaveBeenCalled();

    // Optimistic UI: the card now shows the "Acknowledged" chip instead of
    // the action row, so "Dismiss" is exercised on a second fixture render.
    rateInsightAsPlayerMock.mockClear();
    renderFingerprint('player', playerUser);
    const dismissButtons = screen.getAllByRole('button', { name: /^dismiss$/i });
    await user.click(dismissButtons[dismissButtons.length - 1]!);
    await waitFor(() =>
      expect(rateInsightAsPlayerMock).toHaveBeenCalledWith({ insightId: 'insight-1', rating: 'dismissed' }),
    );
    expect(dismissInsightMock).not.toHaveBeenCalled();
  });
});
