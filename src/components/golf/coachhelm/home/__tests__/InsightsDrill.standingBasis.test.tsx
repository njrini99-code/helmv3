// @vitest-environment jsdom
/**
 * InsightsDrill — the inline standing strip under a flat-feed insight honours
 * the loader's Tour-basis omission (addendum A2). `standingByMetric` carries
 * live `PlayerStanding` rows; the flags have to cross the prop boundary or the
 * strip draws the all-shot Tour anchor beside an on-green leave.
 */
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StageRouter } from '@/components/fairway/modules';
import { InsightsDrill } from '../InsightsDrill';
import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import type { PlayerStanding } from '@/lib/coachhelm/v3/standing/types';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const standing: PlayerStanding = {
  player_id: 'p-1',
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
  computed_at: '2026-09-12T00:00:00Z',
};

const insight = {
  id: 'i-1',
  player_id: 'p-1',
  category: 'approach',
  insight_type: 'approach_miss',
  title: 'Mid-irons leave you long',
  content: 'From 125-175 you are missing long more than short.',
  signature: 'approach_miss:125_175ft',
  evidence: {
    metric: 'approach_proximity_125_175ft',
    metric_label: 'Green-hit rate 125-175 yd',
    unit: 'percent',
    your_value: 0.48,
    your_value_display: '48%',
    comparison_value: 0.6,
    comparison_label: 'Team',
    comparison_source: 'team_avg',
    sample_n: 31,
    window_days: 30,
    window_start: '2026-08-13T00:00:00.000Z',
    window_end: '2026-09-12T00:00:00.000Z',
    strokes_impact: 0.6,
    strokes_impact_method: 'peer_delta',
    confidence: 0.7,
    confidence_factors: { sample_adequacy: 1, recency: 1, variance: 0.5 },
  },
  metadata: null,
  lifecycle_state: 'detected',
  status: 'active',
  priority: 'medium',
  acknowledged_at: null,
  resolved_at: null,
  created_at: '2026-09-12T00:00:00Z',
  updated_at: '2026-09-12T00:00:00Z',
} as unknown as EvidenceInsight;

describe('InsightsDrill inline standing — Tour basis omission reaches the strip', () => {
  it('draws no Tour figure and captions why on an on-green approach standing', () => {
    const { container } = render(
      <StageRouter
        param="view"
        homeKey="home"
        views={[
          {
            key: 'home',
            node: (
              <InsightsDrill
                insights={[insight]}
                standingByMetric={{ approach_proximity_125_175ft: standing }}
                themesEnabled={false}
                themes={[]}
                onRate={vi.fn()}
                onMakePlan={vi.fn()}
                makePlanPendingId={null}
              />
            ),
          },
        ]}
      />,
    );
    expect(container.textContent).toMatch(/Approach Proximity 125-175 yd/);
    expect(container.textContent).not.toMatch(/30 ft/);
    expect(container.textContent).toMatch(/Tour proximity counts every approach/);
    const bar = container.querySelector('[aria-label*="Tour reference not shown"]');
    expect(bar).not.toBeNull();
    expect(bar?.getAttribute('aria-label')).not.toContain('PGA Tour: 30');
  });
});
