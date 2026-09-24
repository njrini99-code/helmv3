// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ScoutingReport, type ScoutingReportProps } from '../ScoutingReport';
import { SEEN_STORAGE_KEY } from '../scouting-model';
import { GolfUserProvider, type GolfUserData } from '@/contexts/golf-user-context';
import type { FairwayPlayerInsightProps } from '@/components/fairway/pages/coachhelm/FairwayPlayerInsight';
import { makeInsight, makeRound } from './fixtures';

const getInsightsForCoachWithMeta = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('@/app/golf/actions/insight-delivery', () => ({
  getInsightsForCoachWithMeta: (...args: unknown[]) => getInsightsForCoachWithMeta(...args),
}));
vi.mock('@/app/golf/actions/insights', () => ({
  refreshPlayerAnalysisAsCoach: vi.fn(async () => ({ success: true })),
}));
vi.mock('@/app/golf/actions/development', () => ({
  createFocusAreaFromInsight: vi.fn(async () => ({ success: true, data: { focusAreaId: 'fa-new' } })),
}));

const coach: GolfUserData = { role: 'coach', userId: 'u-coach', name: 'Coach X', coachId: 'c-1' };
const player = { id: 'p-1', first_name: 'Owen', last_name: 'Park', avatar_url: null, graduation_year: 2027, handicap: 4.2 };
const rounds = [2, 3, 1, 2, 6, 7, 5, 6].map((tp, i) => makeRound(i, tp));

function renderReport(props: Partial<ScoutingReportProps> = {}) {
  return render(
    <GolfUserProvider userData={coach}>
      <ScoutingReport player={player} rounds={rounds} focusAreas={[]} themes={[]} {...props} />
    </GolfUserProvider>,
  );
}

beforeEach(() => {
  getInsightsForCoachWithMeta.mockReset();
  window.localStorage.clear();
});

describe('ScoutingReport', () => {
  it('accepts the /game route insight props unchanged (the host swap is a one-liner)', () => {
    const hostProps = {
      player,
      compositeRating: 70,
      categoryBreakdown: { teeGame: 1, approach: 1, shortGame: 1, putting: 1, scoring: 1 },
      trendSummary: { trend: 'stable', recentAvg: 0, previousAvg: 0, streakCount: 0, streakType: 'neutral' },
      playerStatus: 'Stable',
      rounds: [],
      patterns: [],
      insights: [],
      focusAreas: [],
      predictions: [],
      themes: [],
    } satisfies FairwayPlayerInsightProps;
    render(
      <GolfUserProvider userData={coach}>
        <ScoutingReport {...hostProps} />
      </GolfUserProvider>,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Owen Park' })).toBeTruthy();
  });

  it('renders the 0-round empty state without fetching or fabricating a verdict', () => {
    renderReport({ rounds: [] });
    expect(screen.getByText('Nothing to scout yet')).toBeTruthy();
    expect(screen.getByText(/No rounds on file yet/)).toBeTruthy();
    expect(getInsightsForCoachWithMeta).not.toHaveBeenCalled();
    expect(screen.queryByText('What matters')).toBeNull();
  });

  it('shows exactly three numbered claims, one primary action, and words for confidence', () => {
    const insights = [
      makeInsight({ title: 'Short putts leak' }),
      makeInsight({ title: 'Sand saves', evidence: { sample_n: 21, confidence: 1 } }),
      makeInsight({ title: 'Approach 125-175' }),
      makeInsight({ title: 'Early thing', evidence: { sample_n: 4 } }),
    ];
    const { container } = renderReport({ evidenceInsights: insights });

    const claims = container.querySelectorAll('[data-slot="scouting-claim"]');
    expect(claims).toHaveLength(3);
    expect(within(claims[0] as HTMLElement).getByText('1')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'Short putts leak' })).toBeTruthy();

    expect(container.querySelectorAll('[data-slot="scouting-primary"]')).toHaveLength(1);
    expect(screen.getAllByText('Assign focus')).toHaveLength(1);

    const reads = [...container.querySelectorAll('[data-slot="claim-read"]')].map((n) => n.textContent ?? '');
    expect(reads[0]).toMatch(/^Solid read/);
    expect(reads[1]).toMatch(/^Fair read · n=21/);
    for (const r of reads) expect(r).not.toMatch(/\d%/);

    const ghost = container.querySelector('[data-ghosted="true"]');
    expect(ghost?.textContent).toMatch(/Early read · n=4/);
    expect(getInsightsForCoachWithMeta).not.toHaveBeenCalled();
  });

  it('uses no ALL-CAPS eyebrows and no monospace numerals', () => {
    const { container } = renderReport({ evidenceInsights: [makeInsight()] });
    expect(container.querySelector('.uppercase')).toBeNull();
    expect(container.querySelector('.font-fw-mono')).toBeNull();
  });

  it('shows an honest failed-read state, not "no claims", when the fetch fails', async () => {
    getInsightsForCoachWithMeta.mockResolvedValue({ ok: false, error: 'nope' });
    const { container } = renderReport();
    await waitFor(() => expect(container.querySelector('[data-slot="scouting-load-error"]')).toBeTruthy());
    expect(screen.getByText(/Couldn.t load the evidence/)).toBeTruthy();
    expect(screen.queryByText(/No finding is strong enough/)).toBeNull();
    // The verdict still stands on the rounds alone.
    expect(screen.getByText(/^Averaging \+4\.0 across 8 full rounds/)).toBeTruthy();
  });

  it('fetches client-side when no insights are passed', async () => {
    getInsightsForCoachWithMeta.mockResolvedValue({ ok: true, data: [makeInsight({ title: 'Fetched' })], total: 1, capped: false });
    renderReport();
    expect(await screen.findByText('Fetched')).toBeTruthy();
    expect(getInsightsForCoachWithMeta).toHaveBeenCalledWith('c-1', { player_id: 'p-1', limit: 6 });
  });

  it('badges a claim whose evidence moved since this device last viewed it', async () => {
    const ins = makeInsight({ title: 'Moved' });
    window.localStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify({ [ins.id]: 'stale-signature' }));
    const { container } = renderReport({ evidenceInsights: [ins] });
    await waitFor(() => expect(container.querySelector('[data-slot="evidence-changed"]')).toBeTruthy());
  });

  it('renders the plan ledger with baseline → now and a target', () => {
    renderReport({
      evidenceInsights: [],
      focusAreas: [
        {
          id: 'fa-1',
          title: 'Make more 5-10 footers',
          status: 'active',
          baseline_value: 30,
          current_value: 40,
          target_value: 50,
          target_metric: 'putts_made_5_10ft_pct',
          created_at: '2026-09-01T00:00:00Z',
        },
      ],
    });
    expect(screen.getByText('Make more 5-10 footers')).toBeTruthy();
    expect(screen.getByText('30% → 40%')).toBeTruthy();
    expect(screen.getByText(/Target 50% · 50% of the way/)).toBeTruthy();
  });
});
