// @vitest-environment jsdom
/**
 * NUM-35: the Standing view used to sit beside an overview that printed team
 * percentiles ("SG Total 100%") while the rows printed raw strokes gained
 * (-1.61). The Standing view reads strokes for SG rows, and a team percentile
 * of 100 (one outlier on a small roster) is never printed as a headline.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StageRouter } from '@/components/fairway/modules';
import { StandingDrill } from '../StandingDrill';
import type { PlayerStanding } from '@/lib/coachhelm/v3/standing/types';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const sgTotal: PlayerStanding = {
  player_id: 'p-1',
  metric_id: 'sg_total',
  player_value: -1.61,
  team_avg: -2.4,
  team_n: 6,
  team_pct: 100,
  level_avg: null,
  level_n: 0,
  level_pct: null,
  pga_value: 0,
  pga_delta: -1.61,
} as PlayerStanding;

describe('StandingDrill presents strokes, not percentiles (NUM-35)', () => {
  it('prints SG: Total in strokes and never as a 100% percentile', () => {
    const { container } = render(
      <StageRouter
        param="view"
        homeKey="home"
        views={[{ key: 'home', node: <StandingDrill standingByMetric={{ sg_total: sgTotal }} playerBaseline={null} /> }]}
      />,
    );
    expect(screen.getAllByText('-1.61').length).toBeGreaterThan(0);
    expect(container.textContent).not.toMatch(/100\s*%/);
    expect(container.textContent).not.toMatch(/Top \d+%/);
  });
});
