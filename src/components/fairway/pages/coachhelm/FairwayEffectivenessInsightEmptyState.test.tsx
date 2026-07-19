// @vitest-environment jsdom
/**
 * ============================================================================
 * InsightEffectivenessSection — ONE honest empty-state, not two (audit W2)
 * ----------------------------------------------------------------------------
 * Bug: when `outcomesMeasured === 0`, the by-type effectiveness block
 * rendered a bare `ChartCard state="insufficient-data"` box AND, directly
 * beneath it, a second, richer `InsufficientData` panel with its own
 * progress meter + CTA — both saying "no outcomes recorded yet" for the
 * SAME condition. A coach landing on the Insights drill-down with a fresh
 * team saw the identical "no data" story told twice, in two different
 * visual treatments, back to back.
 *
 * This locks the fix: exactly one empty-state surface (the richer
 * `InsufficientData` + CTA, the SAME honest pattern `OutcomesInstrument` and
 * `PatternImpactDeck` already use elsewhere on this page) renders per
 * starved state.
 * ========================================================================== */
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { InsightEffectivenessData } from '@/app/golf/actions/coachhelm-analytics';
import { InsightEffectivenessSection } from './FairwayEffectiveness';

// A NON-empty trust ledger, so `InsightTrustBand`'s own separate "no tracked
// insights yet" empty-state (a distinct concern from the by-type
// effectiveness block below it) never fires — isolating this test to just
// the by-type section's duplicate-empty-state bug.
const populatedTrust = {
  status: 'ready' as const,
  rows: [
    {
      id: 'insight-1',
      title: 'Scoring decline flagged',
      typeLabel: 'Scoring decline',
      playerName: 'Jordan Lee',
      signal: {
        insightId: 'insight-1',
        shown: 3,
        acted: 1,
        worked: 0,
        measured: 0,
        recentTrend: null,
        status: 'new_hypothesis' as const,
      },
    },
  ],
  error: null,
};

function effectiveness(totalWithOutcome: number, totalGenerated: number): InsightEffectivenessData {
  return {
    overall: {
      totalGenerated,
      totalWithOutcome,
      totalImproved: 0,
      totalNoChange: 0,
      totalWorsened: 0,
      overallEffectivenessScore: 0,
    },
    byType: [],
    periodStart: '2026-01-01',
    periodEnd: '2026-01-31',
  } as unknown as InsightEffectivenessData;
}

describe('InsightEffectivenessSection — one honest empty-state pattern', () => {
  it('renders exactly ONE "no outcomes" surface when outcomesMeasured is 0, not two', () => {
    const { container, getAllByText } = render(
      <InsightEffectivenessSection data={effectiveness(0, 12)} trust={populatedTrust} />,
    );

    // The regression: a `ChartCard` (role="status" from ChartFrame's
    // ChartStateSurface) used to render ABOVE a second InsufficientData
    // panel for the exact same condition. Only the ONE InsufficientData
    // surface (role="status", `aria-live="polite"`) should be present now.
    const statusSurfaces = container.querySelectorAll('[role="status"]');
    expect(statusSurfaces.length).toBe(1);

    // The single surviving message reads once, not twice.
    expect(getAllByText(/none has a recorded outcome yet/i)).toHaveLength(1);

    // The actionable CTA from the richer panel is still present.
    expect(container.querySelector('a[href="/golf/dashboard/development"]')).not.toBeNull();
  });

  it('renders the by-type BarCompare chart (no empty-state surface) once outcomes exist', () => {
    const data: InsightEffectivenessData = {
      overall: {
        totalGenerated: 12,
        totalWithOutcome: 8,
        totalImproved: 5,
        totalNoChange: 2,
        totalWorsened: 1,
        overallEffectivenessScore: 0.62,
      },
      byType: [
        {
          insightType: 'scoring_decline',
          effectivenessScore: 0.7,
          outcomesImproved: 5,
          outcomesNoChange: 2,
          outcomesWorsened: 1,
        },
      ],
      periodStart: '2026-01-01',
      periodEnd: '2026-01-31',
    } as unknown as InsightEffectivenessData;

    const { container } = render(<InsightEffectivenessSection data={data} trust={populatedTrust} />);
    expect(container.querySelectorAll('[role="status"]').length).toBe(0);
  });
});
