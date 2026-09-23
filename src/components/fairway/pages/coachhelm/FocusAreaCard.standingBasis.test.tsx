// @vitest-environment jsdom
/**
 * FocusAreaCard — the standing strip honours the loader's Tour-basis omission
 * (addendum A2). The card receives a live `PlayerStanding`; before this the
 * omission flags stopped at the prop boundary and the strip drew the all-shot
 * Tour anchor beside an on-green leave anyway.
 */
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PlayerStanding } from '@/lib/coachhelm/v3/standing/types';
import { FocusAreaCard, type FocusAreaCardData } from './FocusAreaCard';

vi.mock('./PracticeRxForInsight', () => ({
  PracticeRxForInsight: () => null,
}));

function makeArea(overrides: Partial<FocusAreaCardData> = {}): FocusAreaCardData {
  return {
    id: 'fa-1',
    area_type: 'approach',
    title: 'Mid-iron proximity',
    status: 'active',
    target_metric: 'approach_proximity_125_175ft',
    target_value: 20,
    current_value: 22.6,
    ...overrides,
  };
}

const standing: PlayerStanding = {
  player_id: 'player-1',
  metric_id: 'approach_proximity_125_175ft',
  player_value: 22.6,
  team_avg: 24.1,
  team_n: 6,
  team_pct: 40,
  level_avg: null,
  level_n: 0,
  level_pct: null,
  pga_value: 30,
  pga_delta: -7.4,
  pga_omitted: true,
  pga_omitted_reason: 'basis_mismatch',
  computed_at: '2026-09-12T00:00:00.000Z',
};

describe('FocusAreaCard standing strip — Tour basis omission reaches the strip', () => {
  it('draws no Tour figure and captions why', () => {
    const { container } = render(
      <FocusAreaCard
        focusArea={makeArea()}
        standing={standing}
        // eslint-disable-next-line jsx-a11y/aria-role -- domain prop, not ARIA
        role="player"
        onLogProgress={vi.fn()}
        onComplete={vi.fn()}
      />,
    );
    expect(container.textContent).not.toMatch(/30 ft/);
    expect(container.textContent).toMatch(/Tour proximity counts every approach/);
    const bar = container.querySelector('[aria-label*="Tour reference not shown"]');
    expect(bar).not.toBeNull();
    expect(bar?.getAttribute('aria-label')).not.toContain('PGA Tour: 30');
  });
});
