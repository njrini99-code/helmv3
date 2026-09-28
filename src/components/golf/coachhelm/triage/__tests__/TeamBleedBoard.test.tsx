// @vitest-environment jsdom
/**
 * ============================================================================
 * TeamBleedBoard: "Where the team is bleeding strokes"
 * ----------------------------------------------------------------------------
 * Pins the formatting and the player selection the section's numbers rest on,
 * and the strokes-per-round figure the old leak band showed: a coach reported
 * strokes gained "missing" from the redesign, so every strokes figure that
 * used to be on this page has to still be on it.
 * ========================================================================== */
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { CategoryInsight, PlayerCategoryStat, TeamCategory } from '@/app/golf/actions/team-category-insights';
import {
  TeamBleedBoard,
  areaContributors,
  formatAreaValue,
  formatStrokesPerRound,
  strokesAvailable,
} from '../TeamBleedBoard';

function player(
  playerId: string,
  value: number,
  overrides: Partial<PlayerCategoryStat> = {},
): PlayerCategoryStat {
  return {
    playerId,
    playerName: `Player ${playerId.toUpperCase()}`,
    avatarUrl: null,
    value,
    trend: 'stable',
    trendDelta: 0,
    needsAttention: false,
    ...overrides,
  };
}

function category(overrides: Partial<TeamCategory> = {}): TeamCategory {
  return {
    id: 'driving',
    label: 'Driving',
    teamAvg: 60,
    teamAvgLabel: '60%',
    trend: 'stable',
    insights: [],
    players: [],
    primaryMetric: 'Fairways Hit %',
    attentionCount: 0,
    ...overrides,
  };
}

const engineInsight = (strokesSavedPerRound: number | null): CategoryInsight => ({
  id: 'engine-1',
  message: '~0.7 strokes/round on the table in putting: Alex three-putts from long range.',
  tone: 'negative',
  engineBacked: true,
  strokesSavedPerRound,
});

describe('formatAreaValue', () => {
  it('prints each area in its own unit, with a true minus', () => {
    expect(formatAreaValue('driving', 63.456)).toBe('63%');
    expect(formatAreaValue('approach', 41.5)).toBe('42%');
    expect(formatAreaValue('short_game', 38)).toBe('38%');
    expect(formatAreaValue('putting', 31.25)).toBe('31.3');
    expect(formatAreaValue('scoring', 2.345)).toBe('+2.3');
    expect(formatAreaValue('scoring', -1.2)).toBe('−1.2');
    expect(formatAreaValue('scoring', 0)).toBe('0.0');
  });

  it('prints nothing, never "NaN", for a non-finite value', () => {
    expect(formatAreaValue('putting', Number.NaN)).toBe('');
    expect(formatAreaValue('driving', Number.POSITIVE_INFINITY)).toBe('');
  });
});

describe('areaContributors', () => {
  it('reads "below average" the right way round when higher is better (fairways hit)', () => {
    // Sorted best to worst, as the action returns them.
    const c = category({
      teamAvg: 60,
      players: [player('a', 80), player('b', 65), player('c', 55), player('d', 40, { needsAttention: true })],
    });
    const { shown, more } = areaContributors(c);
    expect(shown.map((p) => p.playerId)).toEqual(['d', 'c']);
    expect(more).toBe(0);
  });

  it('reads "below average" the right way round when lower is better (putts per round)', () => {
    const c = category({
      id: 'putting',
      teamAvg: 31,
      players: [player('a', 29), player('b', 30.5), player('c', 31.8), player('d', 34, { needsAttention: true })],
    });
    expect(areaContributors(c).shown.map((p) => p.playerId)).toEqual(['d', 'c']);
  });

  it('puts flagged players first, then the rest worst first, three at most, counting the remainder', () => {
    const c = category({
      teamAvg: 60,
      players: [
        player('a', 75),
        player('b', 58),
        player('c', 57),
        player('d', 52),
        player('e', 45, { needsAttention: true }),
      ],
    });
    const { shown, more } = areaContributors(c);
    expect(shown.map((p) => p.playerId)).toEqual(['e', 'd', 'c']);
    expect(more).toBe(1);
  });

  it('returns nobody for an area nobody has been scored in', () => {
    expect(areaContributors(category())).toEqual({ shown: [], more: 0 });
  });
});

describe('strokesAvailable', () => {
  it('reads the engine-backed live counterfactual', () => {
    const c = category({ insights: [engineInsight(0.74), { id: 't', message: 'Template', tone: 'neutral' }] });
    expect(strokesAvailable(c)).toEqual({ perRound: 0.74, message: engineInsight(0.74).message });
  });

  it('never reads a template sentence, a diagnostic-only row, or a non-positive figure', () => {
    expect(strokesAvailable(category({ insights: [{ id: 't', message: 'Template', tone: 'negative' }] }))).toBeNull();
    expect(strokesAvailable(category({ insights: [engineInsight(null)] }))).toBeNull();
    expect(strokesAvailable(category({ insights: [engineInsight(0)] }))).toBeNull();
    expect(strokesAvailable(category({ insights: [engineInsight(Number.NaN)] }))).toBeNull();
    expect(
      strokesAvailable(category({ insights: [{ id: 'x', message: 'x', tone: 'negative', strokesSavedPerRound: 0.9 }] })),
    ).toBeNull();
  });
});

describe('formatStrokesPerRound', () => {
  it('uses one decimal, and two below 0.1 so a real figure never reads 0.0', () => {
    expect(formatStrokesPerRound(0.74)).toBe('0.7');
    expect(formatStrokesPerRound(2.5)).toBe('2.5');
    expect(formatStrokesPerRound(0.08)).toBe('0.08');
  });
});

describe('TeamBleedBoard', () => {
  const categories: TeamCategory[] = [
    category({
      id: 'driving',
      label: 'Driving',
      teamAvg: 58.4,
      players: [player('a', 70), player('b', 60), player('c', 45, { needsAttention: true, trend: 'declining' })],
      attentionCount: 1,
    }),
    category({
      id: 'putting',
      label: 'Putting',
      teamAvg: 31.2,
      trend: 'declining',
      insights: [engineInsight(0.74)],
      players: [player('a', 29.5), player('b', 31), player('c', 33.1, { needsAttention: true })],
      attentionCount: 1,
    }),
    category({
      id: 'short_game',
      label: 'Short Game',
      teamAvg: 41,
      players: [player('a', 52), player('b', 40), player('c', 31)],
    }),
    category({ id: 'scoring', label: 'Scoring', teamAvg: 0, players: [] }),
  ];

  it('heads every area and names the players below the team average in it', () => {
    render(<TeamBleedBoard categories={categories} teamHealth={67} />);
    expect(screen.getByRole('heading', { name: 'Where the team is bleeding strokes' })).toBeInTheDocument();
    const driving = screen.getByRole('heading', { name: 'Driving' }).closest('li')!;
    expect(within(driving).getByText('58%')).toBeInTheDocument();
    expect(within(driving).getByText(/Player C/)).toBeInTheDocument();
    expect(within(driving).queryByText(/Player A/)).not.toBeInTheDocument();
    expect(within(driving).getByText('1 of 3 flagged')).toBeInTheDocument();
  });

  it('keeps the strokes-per-round figure on an area whose top signal carries one, and only there', () => {
    render(<TeamBleedBoard categories={categories} teamHealth={67} />);
    const putting = screen.getByRole('heading', { name: 'Putting' }).closest('li')!;
    expect(within(putting).getByText(/\+0\.7 strokes\/round available/)).toBeInTheDocument();
    const driving = screen.getByRole('heading', { name: 'Driving' }).closest('li')!;
    expect(within(driving).queryByText(/strokes\/round available/)).not.toBeInTheDocument();
  });

  it('says a short-game trend is unavailable rather than calling it steady', () => {
    render(<TeamBleedBoard categories={categories} teamHealth={67} />);
    const shortGame = screen.getByRole('heading', { name: 'Short Game' }).closest('li')!;
    expect(within(shortGame).getByText('Trend unavailable')).toBeInTheDocument();
  });

  it('reads "Awaiting rounds" for an area nobody has been scored in, not a 0', () => {
    render(<TeamBleedBoard categories={categories} teamHealth={67} />);
    const scoring = screen.getByRole('heading', { name: 'Scoring' }).closest('li')!;
    expect(within(scoring).getByText('Awaiting rounds')).toBeInTheDocument();
    expect(within(scoring).queryByText('0.0')).not.toBeInTheDocument();
  });

  it('prints no "undefined" or "NaN" anywhere', () => {
    const { container } = render(<TeamBleedBoard categories={categories} teamHealth={67} />);
    expect(container.textContent).not.toMatch(/undefined|NaN/);
  });

  it('does not draw a health score when no area has a scored player', () => {
    render(<TeamBleedBoard categories={[category({ players: [] })]} teamHealth={0} />);
    expect(screen.queryByText('Team health')).not.toBeInTheDocument();
  });
});
