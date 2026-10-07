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
import type { PlayerFingerprint, SectionData } from '@/app/golf/actions/player-fingerprint-types';
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
    composite: { rating: 71, trend: 'up', rounds_in_calculation: 12, form: { score: 71, quality: 'established', qualityLabel: null, roundsCounted: 12, roundsInWindow: 5, averageToPar18: 3.3, curveScore: 71.2, severePatterns: 0, patternPenalty: 0 } },
    // Deliberately NOT 12. The composite is computed from the fetched rounds
    // and the area metrics come from the stats cache, so these two samples
    // genuinely differ in production — 10 vs 18 for Cole Bennett on 2026-08-17.
    // A fixture that made them equal could not tell the two labels apart.
    metrics_rounds: 18,
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
async function openClaimMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /more actions for putting is costing you strokes/i }));
}

describe('FairwayPlayerGameFingerprint — claim meta honesty', () => {
  // Replaces the old "1 metric · 1 insight" tile-header test: the tile header
  // is gone. The row now prints value + comparison + window + sample and a
  // confidence WORD, never the raw engine meta ("n=40 · conf 70%").
  it('prints the evidence line with a confidence word and no raw n= / conf %', () => {
    renderFingerprint('coach', coachUser);
    const row = document.querySelector('[data-slot="claim-row"]') as HTMLElement;
    expect(row).toBeTruthy();
    expect(row.textContent).toContain('38%');
    expect(row.textContent).toContain('vs Team avg');
    expect(row.textContent).toContain('last 30 days');
    expect(row.textContent).toContain('40 samples');
    expect(row.textContent).toContain('Fair read');
    expect(row.textContent).not.toMatch(/n=\d/);
    expect(row.textContent).not.toMatch(/conf \d+%/);
  });
});

describe('FairwayPlayerGameFingerprint — SG scope switch (FP-09)', () => {
  function withScopes(): PlayerFingerprint {
    const fp = makeFingerprint();
    const sgMetric = (label: string, value: string) => ({ label, value, tone: 'neutral' as const });
    fp.sections.tee = { ...fp.sections.tee, sparse: false, metrics: [sgMetric('SG: Tee', '+0.50')] };
    fp.sections.putting = { ...fp.sections.putting, metrics: [...fp.sections.putting.metrics, sgMetric('SG: Putting', '-0.40')] };
    fp.sg_scopes = [
      { key: 'last5', rounds: 5, sgRounds: 5, total: -2, tee: -1.2, approach: null, short_game: null, putting: -0.8 },
      { key: 'last10', rounds: 10, sgRounds: 10, total: 0, tee: 0.2, approach: null, short_game: null, putting: -0.2 },
      { key: 'all', rounds: 18, sgRounds: 18, total: 0.1, tee: 0.5, approach: null, short_game: null, putting: -0.4 },
    ];
    return fp;
  }

  it('switches the stage to the last 5 rounds and says so in the caption', async () => {
    const user = userEvent.setup();
    render(
      <GolfUserProvider userData={coachUser}>
        <FairwayPlayerGameFingerprint fingerprint={withScopes()} mode="coach" />
      </GolfUserProvider>,
    );
    const stage = document.querySelector('[data-slot="fingerprint-stage"]') as HTMLElement;
    expect(stage.textContent).toContain('across all 18 tracked rounds');
    await user.click(screen.getByRole('radio', { name: 'Last 5' }));
    expect(stage.textContent).toContain('across the last 5 rounds');
    expect(stage.textContent).toContain('Off the tee−1.2');
    expect(stage.textContent).not.toContain('Off the tee+0.5');
  });

  it('shows no switch without scopes', () => {
    renderFingerprint('coach', coachUser);
    expect(document.querySelector('[data-slot="fingerprint-scope"]')).toBeNull();
  });
});

describe('FairwayPlayerGameFingerprint — one empty state (STATE-R1)', () => {
  it('names every area waiting on rounds once, even when a sparse area is shown for its claims', () => {
    const fp = makeFingerprint();
    // Putting is shown (it has a claim) but has no chart yet.
    fp.sections.putting = { ...fp.sections.putting, sparse: true, metrics: [] };
    render(
      <GolfUserProvider userData={coachUser}>
        <FairwayPlayerGameFingerprint fingerprint={fp} mode="coach" />
      </GolfUserProvider>,
    );
    expect(document.getElementById('fingerprint-putting')).not.toBeNull();
    const lines = document.querySelectorAll('[data-slot="fingerprint-empty-areas"]');
    expect(lines).toHaveLength(1);
    expect(lines[0]?.textContent).toContain('Putting');
    expect(lines[0]?.textContent).toContain('Approach');
    expect(screen.queryByText(/Not enough rounds to chart/i)).toBeNull();
    expect(screen.getAllByText(/Waiting on more rounds/)).toHaveLength(1);
  });
});

describe('FairwayPlayerGameFingerprint — sectionAddenda', () => {
  it('renders nothing extra when sectionAddenda is absent', () => {
    renderFingerprint('coach', coachUser);
    expect(screen.queryByTestId('approach-addendum')).toBeNull();
    // A sparse area with no claims collapses into the one summary line.
    expect(document.getElementById('fingerprint-approach')).toBeNull();
    expect(document.querySelector('[data-slot="fingerprint-empty-areas"]')?.textContent).toContain('Approach');
  });

  it('renders the addendum inside its own area section only', () => {
    render(
      <GolfUserProvider userData={coachUser}>
        <FairwayPlayerGameFingerprint
          fingerprint={makeFingerprint()}
          sectionAddenda={{ approach: <div data-testid="approach-addendum">extra</div> }}
        />
      </GolfUserProvider>,
    );
    const approach = document.getElementById('fingerprint-approach');
    expect(approach).toContainElement(screen.getByTestId('approach-addendum'));
    expect(document.getElementById('fingerprint-putting')).not.toContainElement(screen.getByTestId('approach-addendum'));
  });
});

describe('FairwayPlayerGameFingerprint — mode branching', () => {
  it('coach mode (default prop) titles the page with the name and keeps print/genome/player page in one menu', async () => {
    const user = userEvent.setup();
    render(
      <GolfUserProvider userData={coachUser}>
        <FairwayPlayerGameFingerprint fingerprint={makeFingerprint()} />
      </GolfUserProvider>,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Jake Doe' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /more for this player/i }));
    expect(await screen.findByRole('link', { name: /print report/i })).toHaveAttribute(
      'href',
      '/golf/dashboard/players/p-1/game/print',
    );
    expect(screen.getByRole('link', { name: /genome/i })).toHaveAttribute('href', '/golf/dashboard/players/p-1/genome');
    expect(screen.getByRole('link', { name: /player page/i })).toBeInTheDocument();
  });

  it('labels the Form sample and the area sample separately', () => {
    // One screen, two windows: the Form number reads the last 5 countable
    // rounds (OD-02: form.roundsInWindow), the area metrics the stats cache
    // (Cole Bennett, 2026-08-17: 10 vs 18).
    renderFingerprint('coach', coachUser);
    const formText = document.querySelector('[data-slot="fingerprint-form"]')?.textContent ?? '';
    expect(formText).toContain('last 5 rounds');
    expect(formText).not.toMatch(/Early read/);
    expect(screen.getAllByText(/18 tracked rounds/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/^Based on 12 rounds$/i)).toBeNull();
  });

  it('the Form formula on tap is form-score\'s, never the old "80 − 3 ×" text (OD-02)', async () => {
    const user = userEvent.setup();
    renderFingerprint('coach', coachUser);
    await user.click(screen.getByRole('button', { name: /how it’s figured/i }));
    const formula = document.getElementById('fp-form-formula')?.textContent ?? '';
    expect(formula).toContain('It never reaches 100');
    expect(formula).not.toMatch(/80 − 3|kept between 0 and 100/);
  });

  it('player mode drops the coach menu and the page title (the drill titles itself)', () => {
    renderFingerprint('player', playerUser);
    expect(screen.queryByRole('button', { name: /more for this player/i })).toBeNull();
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    expect(screen.queryByText('Jake Doe')).toBeNull();
  });

  it('coach mode "Assign as focus area" calls createFocusAreaFromInsight, not the player path', async () => {
    const user = userEvent.setup();
    renderFingerprint('coach', coachUser);

    await openClaimMenu(user);
    await user.click(await screen.findByRole('menuitem', { name: /assign as focus area/i }));

    await waitFor(() => expect(createFocusAreaFromInsightMock).toHaveBeenCalledTimes(1));
    expect(createFocusAreaFromInsightMock).toHaveBeenCalledWith(
      expect.objectContaining({ insight_id: 'insight-1', player_id: 'p-1', coach_id: 'c-1' }),
    );
    expect(createPlayerFocusAreaMock).not.toHaveBeenCalled();
    expect(pushMock).toHaveBeenCalledWith(
      expect.stringContaining('/golf/dashboard/intelligence?view=players&player=p-1'),
    );
  });

  it('player mode "Add to my plan" calls createPlayerFocusArea with a section-derived area_type and no coach attribution', async () => {
    const user = userEvent.setup();
    renderFingerprint('player', playerUser);

    await openClaimMenu(user);
    await user.click(await screen.findByRole('menuitem', { name: /add to my plan/i }));

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

  it('player mode seen / not useful route through rateInsightAsPlayer, not the coach actions', async () => {
    const user = userEvent.setup();
    const first = renderFingerprint('player', playerUser);

    await openClaimMenu(user);
    await user.click(await screen.findByRole('menuitem', { name: /mark as seen/i }));
    await waitFor(() =>
      expect(rateInsightAsPlayerMock).toHaveBeenCalledWith({ insightId: 'insight-1', rating: 'acknowledged' }),
    );
    expect(acknowledgeInsightMock).not.toHaveBeenCalled();

    first.unmount();
    rateInsightAsPlayerMock.mockClear();
    renderFingerprint('player', playerUser);
    await openClaimMenu(user);
    await user.click(await screen.findByRole('menuitem', { name: /not useful/i }));
    await waitFor(() =>
      expect(rateInsightAsPlayerMock).toHaveBeenCalledWith({ insightId: 'insight-1', rating: 'dismissed' }),
    );
    expect(dismissInsightMock).not.toHaveBeenCalled();
  });

  it('coach mode Acknowledge routes through acknowledgeInsight', async () => {
    const user = userEvent.setup();
    renderFingerprint('coach', coachUser);
    await openClaimMenu(user);
    await user.click(await screen.findByRole('menuitem', { name: /^acknowledge$/i }));
    await waitFor(() => expect(acknowledgeInsightMock).toHaveBeenCalledWith('insight-1'));
    expect(rateInsightAsPlayerMock).not.toHaveBeenCalled();
  });
});
