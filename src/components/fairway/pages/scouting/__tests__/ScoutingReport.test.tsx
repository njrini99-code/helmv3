// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ScoutingReport, type ScoutingReportProps } from '../ScoutingReport';
import { SEEN_STORAGE_KEY } from '../scouting-model';
import { GolfUserProvider, type GolfUserData } from '@/contexts/golf-user-context';
import { makeInsight, makeRound } from './fixtures';

const getInsightsForCoachWithMeta = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('@/app/golf/actions/insight-delivery', () => ({
  getInsightsForCoachWithMeta: (...args: unknown[]) => getInsightsForCoachWithMeta(...args),
}));
vi.mock('@/app/golf/actions/insights-coachhelm', () => ({
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
    // The /game route still passes its wider insight payload; the extra keys
    // are ignored, so the host swap stays a one-liner.
    const hostProps: ScoutingReportProps & Record<string, unknown> = {
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
    };
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
    expect(getInsightsForCoachWithMeta).toHaveBeenCalledWith('c-1', { player_id: 'p-1', limit: 6, includeMore: true });
  });

  it('badges a claim whose evidence moved since this device last viewed it', async () => {
    const ins = makeInsight({ title: 'Moved' });
    window.localStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify({ [ins.id]: 'stale-signature' }));
    const { container } = renderReport({ evidenceInsights: [ins] });
    await waitFor(() => expect(container.querySelector('[data-slot="evidence-changed"]')).toBeTruthy());
  });

  // Production 2026-11-10 (7f3eca05 / f91bd0e9): an approach read carries its
  // green-hit PERCENT under an `approach_proximity_*` id, which the registry
  // defines as feet, lower is better. Assign focus sent 18.8 and a target of
  // 20.8 as if they were feet, and the server refused: "better when lower, so
  // a target of 20.8 is above the current 18.8".
  it('assigns an approach read without sending its green-hit percent as feet of proximity', async () => {
    const { createFocusAreaFromInsight } = await import('@/app/golf/actions/development');
    const create = vi.mocked(createFocusAreaFromInsight);
    create.mockClear();
    const user = userEvent.setup();
    renderReport({
      evidenceInsights: [
        makeInsight({
          category: 'approach',
          title: 'Greens from 175+ yd',
          evidence: {
            metric: 'approach_proximity_175_plus_ft',
            metric_label: 'Greens hit from 175+ yd',
            unit: 'percent',
            your_value: 18.8,
            your_value_display: '19%',
            comparison_value: 50,
            comparison_source: 'pga_baseline',
            sample_n: 32,
          },
        }),
      ],
    });

    await user.click(screen.getByRole('button', { name: 'Assign focus' }));
    const popover = await screen.findByLabelText('Assign a focus');
    await user.click(within(popover).getByText('Greens from 175+ yd'));

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    const sent = create.mock.calls[0]![0];
    // The focus still links to the read and its distance band.
    expect(sent.target_metric).toBe('approach_proximity_175_plus_ft');
    // A percent is never stored as the baseline or target of a feet metric.
    expect(sent.current_value).toBeNull();
    expect(sent.target_value).toBeNull();
  });

  it('still sends the reading and a target toward Tour when the units agree', async () => {
    const { createFocusAreaFromInsight } = await import('@/app/golf/actions/development');
    const create = vi.mocked(createFocusAreaFromInsight);
    create.mockClear();
    const user = userEvent.setup();
    renderReport({ evidenceInsights: [makeInsight({ title: 'Short putts leak' })] });

    await user.click(screen.getByRole('button', { name: 'Assign focus' }));
    const popover = await screen.findByLabelText('Assign a focus');
    await user.click(within(popover).getByText('Short putts leak'));

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    const sent = create.mock.calls[0]![0];
    expect(sent.target_metric).toBe('putts_made_5_10ft_pct');
    expect(sent.current_value).toBe(34.5);
    // Halfway from 34.5 to Tour's 62.2.
    expect(sent.target_value).toBeCloseTo(48.35, 4);
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
