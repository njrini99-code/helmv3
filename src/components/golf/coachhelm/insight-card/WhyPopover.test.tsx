// @vitest-environment jsdom
/**
 * ============================================================================
 * WhyPopover — the generated explanation's gap must carry the same unit as
 * its paired comparison value (Package 11)
 * ----------------------------------------------------------------------------
 * Bug: `formatComparisonValue` suffixes non-percent units (strokes/yards/
 * feet), but the sibling `formatGapLabel` only special-cased `percent` and
 * fell through to a bare `gap.toFixed(1)` for every other unit — the same
 * sentence read "vs +1.2 yd team_avg → 3.4 gap.", ambiguous next to the
 * unit-suffixed comparison value right before it.
 * ========================================================================== */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WhyPopover } from './WhyPopover';
import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import type { InsightEvidence, InsightUnit } from '@/lib/coachhelm/v2/insights/types';

// Force the desktop (Radix Popover) branch — the mobile vaul Drawer branch
// needs jsdom pointer-capture polyfills this test doesn't otherwise need.
beforeEach(() => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: true,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
});

function insight(unit: InsightUnit, yourValue: number, comparisonValue: number): EvidenceInsight {
  const evidence: InsightEvidence = {
    metric: 'approach_proximity',
    metric_label: 'Approach proximity',
    unit,
    your_value: yourValue,
    your_value_display: String(yourValue),
    comparison_value: comparisonValue,
    comparison_label: 'team avg',
    comparison_source: 'team_avg',
    sample_n: 12,
    window_days: 30,
    window_start: '2026-08-01',
    window_end: '2026-08-30',
    strokes_impact: 0.5,
    strokes_impact_method: 'sg_baseline',
    confidence: 0.7,
    confidence_factors: { sample_adequacy: 0.8, recency: 1, variance: 0.6 },
  };
  return {
    id: 'ins-1',
    player_id: 'p1',
    category: 'approach',
    title: 'Approach proximity gap',
    content: '',
    signature: null,
    evidence,
    metadata: null,
    lifecycle_state: 'detected',
    status: 'active',
    priority: 'medium',
    acknowledged_at: null,
    resolved_at: null,
    created_at: '2026-08-30T00:00:00Z',
    updated_at: '2026-08-30T00:00:00Z',
  };
}

async function openAndReadExplanation(node: EvidenceInsight): Promise<string> {
  const user = userEvent.setup();
  render(<WhyPopover insight={node} />);
  await user.click(screen.getByTestId('why-popover-trigger'));
  const explanation = await screen.findByTestId('why-generated-explanation');
  return explanation.textContent ?? '';
}

describe('WhyPopover — generated explanation gap unit (Package 11)', () => {
  it('suffixes a strokes-unit gap with its unit, matching the comparison value', async () => {
    const text = await openAndReadExplanation(insight('strokes', 1.0, 2.4));
    expect(text).toMatch(/1\.4 str gap/);
  });

  it('suffixes a yards-unit gap with its unit', async () => {
    const text = await openAndReadExplanation(insight('yards', 10, 22));
    expect(text).toMatch(/12 yd gap/);
  });

  it('suffixes a feet-unit gap with its unit', async () => {
    const text = await openAndReadExplanation(insight('feet', 3, 9));
    expect(text).toMatch(/6 ft gap/);
  });

  it('keeps the existing "pt" suffix for a percent-unit gap', async () => {
    const text = await openAndReadExplanation(insight('percent', 0.4, 0.65));
    expect(text).toMatch(/25pt gap/);
  });
});
