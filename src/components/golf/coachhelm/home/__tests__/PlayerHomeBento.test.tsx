// @vitest-environment jsdom
/**
 * ============================================================================
 * PlayerHomeBento — mini-visual coverage (Wave 3: "cards need to be more
 * full")
 * ----------------------------------------------------------------------------
 * Locks in that every thin/blank cell audited in this wave (Game profile,
 * Standing, Trend, Themes, Insight library, Focus areas) now carries a REAL,
 * non-interactive mini-visual fed by realistic fixture data — never a
 * text-only cell, and never a `<button>`/`<select>`/etc. nested inside the
 * cell's own whole-cell `onOpen` button (the nested-button hydration-crash
 * class this component's header comment documents).
 *
 * Mounts the REAL `StageRouter` (as `PlayerCoachHelmHome.hooks-stability`
 * already does for this tree) so `useStage()` resolves for real instead of
 * needing a hand-rolled context provider.
 * ========================================================================== */
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { StageRouter } from '@/components/fairway/modules';
import { PlayerHomeBento, type PlayerHomeBentoProps } from '../PlayerHomeBento';
import type { PlayerStanding } from '@/lib/coachhelm/v3/standing/types';
import type { ThemeNode, CauseNode } from '@/lib/coachhelm/v3/themes/types';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

// Deterministic regardless of NEXT_PUBLIC_REDESIGN_THEMES in the CI env —
// this suite explicitly wants the Themes cell exercised.
vi.mock('@/lib/redesign/flag', () => ({
  isThemesEnabled: () => true,
}));

function standingRow(overrides: Partial<PlayerStanding>): PlayerStanding {
  return {
    player_id: 'p-1',
    metric_id: 'sg_total',
    player_value: 0,
    team_avg: null,
    team_n: 5,
    team_pct: null,
    level_avg: null,
    level_n: 0,
    level_pct: null,
    pga_value: 0,
    pga_delta: null,
    computed_at: '2026-07-20T00:00:00Z',
    ...overrides,
  } as PlayerStanding;
}

function causes(n: number): CauseNode[] {
  return Array.from({ length: n }, (_, i) => ({ insight_id: `c-${i}` }) as unknown as CauseNode);
}

function theme(overrides: Partial<ThemeNode>): ThemeNode {
  return {
    category: 'putting',
    sgMetricId: 'sg_putting',
    displayLabel: 'Putting',
    isOutcomeTheme: false,
    themeStrokesPerRound: 0,
    tourGapPerRound: 0,
    sgPerRound: null,
    causes: [],
    state: 'thin',
    ...overrides,
  } as ThemeNode;
}

function baseProps(overrides: Partial<PlayerHomeBentoProps> = {}): PlayerHomeBentoProps {
  return {
    topInsight: null,
    activeFocusAreaCount: 4,
    topFocusAreaLabel: 'Putting',
    genomeAxes: [
      { label: 'Driving', value: 72 },
      { label: 'Approach', value: 58 },
      { label: 'Short Game', value: 40 },
      { label: 'Putting', value: 81 },
    ],
    standingByMetric: {
      sg_putting: standingRow({ metric_id: 'sg_putting', team_pct: 88 }),
      sg_ott: standingRow({ metric_id: 'sg_ott', team_pct: 61 }),
      sg_approach: standingRow({ metric_id: 'sg_approach', team_pct: 34 }),
      sg_around_green: standingRow({ metric_id: 'sg_around_green', team_pct: 12 }),
    },
    trendSummary: 'Strong improving',
    themes: [
      theme({ category: 'putting', displayLabel: 'Putting', themeStrokesPerRound: -0.6, state: 'leak', causes: causes(2) }),
      theme({ category: 'tee', sgMetricId: 'sg_ott', displayLabel: 'Off the Tee', themeStrokesPerRound: 0.3, state: 'strength', causes: causes(1) }),
      theme({ category: 'approach', sgMetricId: 'sg_approach', displayLabel: 'Approach', themeStrokesPerRound: -0.2, state: 'leak', causes: causes(1) }),
      theme({ category: 'short_game', sgMetricId: 'sg_around_green', displayLabel: 'Around the Green', themeStrokesPerRound: 0, state: 'thin', causes: [] }),
      theme({ category: 'scoring', sgMetricId: null, isOutcomeTheme: true, displayLabel: 'Scoring', themeStrokesPerRound: -0.1, state: 'leak', causes: causes(3) }),
      theme({ category: 'course_management', sgMetricId: null, isOutcomeTheme: true, displayLabel: 'Course Management', themeStrokesPerRound: 0, state: 'thin', causes: [] }),
      theme({ category: 'pressure', sgMetricId: null, isOutcomeTheme: true, displayLabel: 'Pressure', themeStrokesPerRound: 0.15, state: 'strength', causes: causes(1) }),
    ],
    insightCount: 5,
    performanceSnapshot: {
      scoringAverage: 74.2,
      fairwayPct: 61,
      girPct: 55,
      scramblingPct: 48,
      puttsPerRound: 29.4,
    },
    onRateTopInsight: vi.fn(),
    ...overrides,
  };
}

function renderBento(overrides: Partial<PlayerHomeBentoProps> = {}) {
  return render(
    <StageRouter param="view" homeKey="home" views={[{ key: 'home', node: <PlayerHomeBento {...baseProps(overrides)} /> }]} />,
  );
}

describe('PlayerHomeBento — mini-visual cells (realistic data)', () => {
  it('renders a non-interactive SVG radar (no nested button) in the Game profile cell', () => {
    const { container } = renderBento();
    const cell = screen.getByRole('button', { name: /open game profile/i });
    // The nested-button hydration-crash class this file's header documents —
    // an onOpen cell's own whole-cell button must never contain another button.
    expect(cell.querySelectorAll('button').length).toBe(0);

    const svg = container.querySelector('svg[role="img"]');
    expect(svg).not.toBeNull();
    expect(svg?.querySelector('polygon')).not.toBeNull();
    expect(svg?.querySelectorAll('line').length).toBe(4); // one spoke per axis
  });

  it('shows a dynamic strongest/weakest sentence for Game profile, not the static fallback', () => {
    renderBento();
    expect(screen.getByText(/strongest in putting; furthest to grow in short game/i)).toBeInTheDocument();
  });

  it('renders a RailBars preview (strongest metrics + the leak) in the Standing cell', () => {
    const { container } = renderBento();
    const cell = screen.getByRole('button', { name: /open standing/i });
    expect(cell.querySelectorAll('button').length).toBe(0);

    const rail = container.querySelector('[data-slot="rail-bars"]') as HTMLElement | null;
    expect(rail).not.toBeNull();
    // Strongest (Putting 88%, Off the Tee 61%) + the single weakest (Around the Green 12%) —
    // scoped to the rail itself since the headline above it separately repeats the strongest metric's label/value.
    expect(within(rail!).getByText('SG: Putting')).toBeInTheDocument();
    expect(within(rail!).getByText('SG: Around the Green')).toBeInTheDocument();
    expect(within(rail!).getByText('88%')).toBeInTheDocument();
    expect(within(rail!).getByText('12%')).toBeInTheDocument();
  });

  it('renders a SignalChip in the Trend cell for a recognized signal', () => {
    renderBento();
    const cell = screen.getByRole('button', { name: /open trend/i });
    expect(cell.querySelectorAll('button').length).toBe(0);
    const chip = within(cell).getByText('Improving');
    expect(chip.closest('[data-slot="signal-chip"]')).toHaveAttribute('data-tone', 'hot');
  });

  it('omits the Trend chip (never fabricates one) when the signal is unrecognized', () => {
    renderBento({ trendSummary: 'Some unrelated free-text summary' });
    const cell = screen.getByRole('button', { name: /open trend/i });
    expect(cell.querySelector('[data-slot="signal-chip"]')).toBeNull();
  });

  it('renders TickerStrip magnitude bars in the Themes cell', () => {
    const { container } = renderBento();
    const cell = screen.getByRole('button', { name: /open themes/i });
    expect(cell.querySelectorAll('button').length).toBe(0);
    const strip = container.querySelector('[data-slot="ticker-strip"]');
    expect(strip).not.toBeNull();
    // Biggest |themeStrokesPerRound| in the fixture is Putting (-0.6) → abbreviated "Putt".
    expect(within(cell).getByText('Putt')).toBeInTheDocument();
  });

  it('renders leak/strength count chips in the Insight library cell', () => {
    renderBento();
    const cell = screen.getByRole('button', { name: /open insight library/i });
    expect(cell.querySelectorAll('button').length).toBe(0);
    // leak causes: Putting(2) + Approach(1) + Scoring(3) = 6; strength causes: Off the Tee(1) + Pressure(1) = 2.
    expect(within(cell).getByText('6 to work on')).toBeInTheDocument();
    expect(within(cell).getByText('2 strengths')).toBeInTheDocument();
  });

  it('renders count dots in the Focus areas cell, capped with an overflow badge', () => {
    renderBento({ activeFocusAreaCount: 8 });
    const cell = screen.getByRole('button', { name: /open focus areas/i });
    expect(cell.querySelectorAll('button').length).toBe(0);
    const dots = cell.querySelectorAll('[aria-hidden="true"] > span.rounded-full');
    expect(dots.length).toBe(6);
    expect(within(cell).getByText('+2')).toBeInTheDocument();
  });

  it('shows no mini-visual (never fabricated) when a cell has no underlying data', () => {
    const { container } = renderBento({
      genomeAxes: [],
      standingByMetric: {},
      trendSummary: null,
      themes: [],
      activeFocusAreaCount: 0,
    });
    expect(container.querySelector('svg[role="img"]')).toBeNull();
    expect(container.querySelector('[data-slot="rail-bars"]')).toBeNull();
    expect(container.querySelector('[data-slot="signal-chip"]')).toBeNull();
    // Themes cell itself is flag+data-gated off entirely when themes is empty.
    expect(screen.queryByRole('button', { name: /open themes/i })).toBeNull();
  });
});
