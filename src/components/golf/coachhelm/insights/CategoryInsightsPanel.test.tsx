// @vitest-environment jsdom
/**
 * ============================================================================
 * CategoryInsightsPanel.tsx — readability redesign regression coverage
 * ----------------------------------------------------------------------------
 * Founder feedback (2026-07-22): the prior `ThemesPanel` rendering was a
 * monotonous single-category wall of amber `fw-warning` chips. These tests
 * lock the fix's load-bearing behaviors:
 *   - leak magnitude reads via the DANGER token, never fw-warning/amber
 *   - a declining trend reads via the DANGER token too (was fw-warning)
 *   - a strength reads via the success/accent token
 *   - causes collapse to headline + magnitude + one takeaway line by
 *     default; full prose/drivers/drills/CTA are behind a single expand
 *   - the category filter and the "Make it a plan" callback wiring both work
 * ========================================================================== */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CategoryInsightsPanel } from './CategoryInsightsPanel';
import type { CauseNode, ThemeNode } from '@/lib/coachhelm/v3/themes/types';

function makeCause(overrides: Partial<CauseNode> & { insight_id: string }): CauseNode {
  return {
    metric: null,
    title: `Cause ${overrides.insight_id}`,
    content: 'First sentence of the cause. Second sentence with more detail than the headline.',
    strokesSavedPerRound: 0,
    tourGapPerRound: null,
    counterfactualSuppressed: false,
    standingPlayerValue: null,
    standingPgaValue: null,
    standingTeamAvgValue: null,
    drivers: [],
    drills: [],
    canMakePlan: false,
    ...overrides,
  };
}

function makeTheme(overrides: Partial<ThemeNode> & { category: ThemeNode['category'] }): ThemeNode {
  return {
    sgMetricId: null,
    displayLabel: overrides.category,
    isOutcomeTheme: false,
    themeStrokesPerRound: 0,
    tourGapPerRound: 0,
    sgPerRound: null,
    causes: [],
    state: 'thin',
    trend: null,
    ...overrides,
  };
}

describe('CategoryInsightsPanel — empty / insufficient scaffolds', () => {
  it('renders the "No themes yet" empty state when the scaffold is empty', () => {
    render(<CategoryInsightsPanel themes={[]} />);
    expect(screen.getByText('No themes yet')).toBeInTheDocument();
  });

  it('renders the "Not enough rounds yet" state when every theme is thin', () => {
    render(
      <CategoryInsightsPanel
        themes={[makeTheme({ category: 'putting', state: 'thin' }), makeTheme({ category: 'approach', state: 'thin' })]}
      />,
    );
    expect(screen.getByText('Not enough rounds yet')).toBeInTheDocument();
  });
});

describe('CategoryInsightsPanel — magnitude tokens (danger/success, never amber)', () => {
  it('a leak theme header badge uses the DANGER token, not fw-warning', () => {
    const theme = makeTheme({
      category: 'putting',
      displayLabel: 'Putting',
      state: 'leak',
      themeStrokesPerRound: 1.8,
      tourGapPerRound: 2.4,
      causes: [makeCause({ insight_id: 'c1' })],
    });
    render(<CategoryInsightsPanel themes={[theme]} />);

    const badge = screen.getByText('1.8').closest('span[data-slot="fw-badge"]');
    expect(badge).not.toBeNull();
    expect(badge!.className).toContain('bg-fw-danger-bg');
    expect(badge!.className).toContain('text-fw-danger');
    expect(badge!.className).not.toMatch(/fw-warning|amber-|red-/);
  });

  it('a strength theme header badge uses the success/accent token', () => {
    const theme = makeTheme({
      category: 'approach',
      displayLabel: 'Approach',
      state: 'strength',
      themeStrokesPerRound: 0.6,
      causes: [makeCause({ insight_id: 'c2' })],
    });
    render(<CategoryInsightsPanel themes={[theme]} />);

    const badge = screen.getByText('+0.6').closest('span[data-slot="fw-badge"]');
    expect(badge).not.toBeNull();
    expect(badge!.className).toContain('bg-fw-success-bg');
    expect(badge!.className).not.toMatch(/fw-warning|amber-/);
  });

  it('a declining SG trend chip renders via the DANGER token, not fw-warning', () => {
    const theme = makeTheme({
      category: 'putting',
      displayLabel: 'Putting',
      state: 'leak',
      themeStrokesPerRound: 1.2,
      causes: [makeCause({ insight_id: 'c3' })],
      trend: { direction: 'declining', recentAvg: -0.5, priorAvg: -0.1, delta: -0.4, recentN: 6, priorN: 6 },
    });
    render(<CategoryInsightsPanel themes={[theme]} />);

    const trendChip = screen.getByText('Declining');
    expect(trendChip.className).toContain('text-fw-danger');
    expect(trendChip.className).not.toMatch(/fw-warning|amber-/);
  });

  it('an improving SG trend chip renders via the success token', () => {
    const theme = makeTheme({
      category: 'approach',
      displayLabel: 'Approach',
      state: 'leak',
      themeStrokesPerRound: 0.4,
      causes: [makeCause({ insight_id: 'c4' })],
      trend: { direction: 'improving', recentAvg: 0.2, priorAvg: -0.1, delta: 0.3, recentN: 6, priorN: 6 },
    });
    render(<CategoryInsightsPanel themes={[theme]} />);
    expect(screen.getByText('Improving').className).toContain('text-fw-success');
  });
});

describe('CategoryInsightsPanel — cause card progressive disclosure', () => {
  it('collapsed by default: shows title + magnitude badge + one takeaway line, hides the rest of the prose', () => {
    const cause = makeCause({
      insight_id: 'c5',
      title: 'Short putts under pressure',
      content: 'You miss short putts more late in the round. This tends to happen after a bogey.',
      strokesSavedPerRound: 0.9,
      tourGapPerRound: 1.1,
      canMakePlan: true,
      drills: [{ drill_id: 'd1', slug: 'pressure-putts', title: 'Pressure Putt Ladder' }],
    });
    const theme = makeTheme({
      category: 'putting',
      displayLabel: 'Putting',
      state: 'leak',
      themeStrokesPerRound: 0.9,
      causes: [cause],
    });
    render(<CategoryInsightsPanel themes={[theme]} />);

    expect(screen.getByText('Short putts under pressure')).toBeInTheDocument();
    expect(screen.getByText('You miss short putts more late in the round.')).toBeInTheDocument();
    // The second sentence and the drill chip are behind the expand — not in the DOM yet.
    expect(screen.queryByText(/This tends to happen after a bogey/)).not.toBeInTheDocument();
    expect(screen.queryByText('Pressure Putt Ladder')).not.toBeInTheDocument();

    const trigger = screen.getByRole('button', { name: /Short putts under pressure/i });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('expanding reveals the full content, the drill chip, and the "Make it a plan" CTA — which fires onMakePlan(cause, theme)', () => {
    const cause = makeCause({
      insight_id: 'c6',
      title: 'Short putts under pressure',
      content: 'You miss short putts more late in the round. This tends to happen after a bogey.',
      strokesSavedPerRound: 0.9,
      canMakePlan: true,
      drills: [{ drill_id: 'd1', slug: 'pressure-putts', title: 'Pressure Putt Ladder' }],
    });
    const theme = makeTheme({
      category: 'putting',
      displayLabel: 'Putting',
      state: 'leak',
      themeStrokesPerRound: 0.9,
      causes: [cause],
    });
    const onMakePlan = vi.fn();
    render(<CategoryInsightsPanel themes={[theme]} onMakePlan={onMakePlan} />);

    fireEvent.click(screen.getByRole('button', { name: /Short putts under pressure/i }));

    expect(screen.getByText(/This tends to happen after a bogey/)).toBeInTheDocument();
    expect(screen.getByText('Pressure Putt Ladder')).toBeInTheDocument();

    const cta = screen.getByRole('button', { name: 'Make it a plan' });
    fireEvent.click(cta);
    expect(onMakePlan).toHaveBeenCalledWith(cause, theme);
  });

  it('a suppressed cause shows a neutral "Tendency" badge, never a danger/magnitude one', () => {
    const cause = makeCause({
      insight_id: 'c7',
      title: 'Tends to miss left on downhill putts',
      counterfactualSuppressed: true,
      strokesSavedPerRound: 0,
    });
    const theme = makeTheme({
      category: 'putting',
      displayLabel: 'Putting',
      state: 'leak',
      themeStrokesPerRound: 0.5,
      causes: [cause],
    });
    render(<CategoryInsightsPanel themes={[theme]} />);

    expect(screen.getByText('Tendency')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Tends to miss left on downhill putts/i }));
    expect(screen.getByText(/directional read from your pattern/)).toBeInTheDocument();
    expect(screen.getByText('Talk to your coach about this')).toBeInTheDocument();
  });

  it('a cause with no drill shows the honest "no drill yet" caption instead of a CTA', () => {
    const cause = makeCause({
      insight_id: 'c8',
      title: 'Weak wedge distance control',
      strokesSavedPerRound: 0.4,
      canMakePlan: true,
      drills: [],
    });
    const theme = makeTheme({
      category: 'short_game',
      displayLabel: 'Around the Green',
      state: 'leak',
      themeStrokesPerRound: 0.4,
      causes: [cause],
    });
    render(<CategoryInsightsPanel themes={[theme]} />);
    fireEvent.click(screen.getByRole('button', { name: /Weak wedge distance control/i }));
    expect(screen.getByText('No drill yet — talk to your coach.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Make it a plan' })).not.toBeInTheDocument();
  });
});

describe('CategoryInsightsPanel — organize by category', () => {
  function twoCategoryThemes(): ThemeNode[] {
    return [
      makeTheme({
        category: 'putting',
        displayLabel: 'Putting',
        state: 'leak',
        themeStrokesPerRound: 1.8,
        causes: [makeCause({ insight_id: 'p1', title: 'Putting cause' })],
      }),
      makeTheme({
        category: 'approach',
        displayLabel: 'Approach',
        state: 'leak',
        themeStrokesPerRound: 0.7,
        causes: [makeCause({ insight_id: 'a1', title: 'Approach cause' })],
      }),
      makeTheme({ category: 'tee', displayLabel: 'Off the Tee', state: 'thin' }),
    ];
  }

  it('renders a category filter and shows every substantive category by default ("All")', () => {
    render(<CategoryInsightsPanel themes={twoCategoryThemes()} />);
    expect(screen.getByRole('radio', { name: 'All' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Putting' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Approach' })).toBeInTheDocument();
    // Thin categories collapse into the "Awaiting data" footer, not a full section.
    expect(screen.queryByRole('heading', { name: 'Off the Tee' })).not.toBeInTheDocument();
    expect(screen.getByText('Awaiting data')).toBeInTheDocument();
    expect(screen.getByText('Off the Tee')).toBeInTheDocument();
  });

  it('selecting a category filters the sections to just that category', () => {
    render(<CategoryInsightsPanel themes={twoCategoryThemes()} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Approach' }));
    expect(screen.queryByRole('heading', { name: 'Putting' })).not.toBeInTheDocument();
    expect(within(screen.getByRole('heading', { name: 'Approach' }).closest('section')!).getByText('Approach cause')).toBeInTheDocument();
  });
});
