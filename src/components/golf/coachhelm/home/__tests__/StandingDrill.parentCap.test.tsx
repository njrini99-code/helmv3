// @vitest-environment jsdom
/**
 * Wave-6 review: the Standing view's counterfactual line said closing a 17-point
 * 3–5 ft gap was worth 1.7 strokes a round (77.2 → 75.5) while all of putting
 * was 0.63 behind the Tour. With no attempts-per-round here, a part is capped at
 * its strokes-gained category (parent-cap.ts).
 */
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StageRouter } from '@/components/fairway/modules';
import { StandingDrill } from '../StandingDrill';
import type { PlayerStanding } from '@/lib/coachhelm/v3/standing/types';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const row = (metric_id: string, player_value: number, pga_value: number): PlayerStanding =>
  ({ player_id: 'p-1', metric_id, player_value, team_avg: null, team_n: 0, team_pct: null, level_avg: null, level_n: 0, level_pct: null, pga_value, pga_delta: player_value - pga_value }) as PlayerStanding;

const lines = (standingByMetric: Record<string, PlayerStanding>) => {
  const { container } = render(
    <StageRouter param="view" homeKey="home" views={[{ key: 'home', node: <StandingDrill standingByMetric={standingByMetric} playerBaseline={77.2} /> }]} />,
  );
  return [...container.querySelectorAll('p')].map((p) => p.textContent ?? '').filter((t) => t.startsWith('Closing this gap'));
};

describe('StandingDrill: a putt band never claims more than putting strokes gained', () => {
  it('3–5 ft reads 77.2 → 76.6 (0.63, all of putting), not 77.2 → 75.5', () => {
    const out = lines({ sg_putting: row('sg_putting', -0.63, 0), putts_made_3_5ft_pct: row('putts_made_3_5ft_pct', 71, 88) });
    expect(out).toContain('Closing this gap → 77.2 → 76.6 (≈4 wks)');
    expect(out.join(' ')).not.toContain('75.5');
  });

  it('without a putting row there is nothing to cap against, so the line is unchanged', () => {
    expect(lines({ putts_made_3_5ft_pct: row('putts_made_3_5ft_pct', 71, 88) })).toEqual(['Closing this gap → 77.2 → 75.5 (≈4 wks)']);
  });
});
