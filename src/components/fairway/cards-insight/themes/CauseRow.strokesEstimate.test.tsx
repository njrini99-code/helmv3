// @vitest-environment jsdom
/**
 * ============================================================================
 * CauseRow — the strokes pill marks strokesSavedPerRound as an estimate
 * (Package 11 follow-up)
 * ----------------------------------------------------------------------------
 * `cause.strokesSavedPerRound` is a projection — the realistic gap-to-comp
 * strokes value, never a measured post-resolution result (the same class of
 * field #2023 already relabeled on InsightCard's OutcomeBadge and
 * FairwayEffectiveness, and this PR already relabeled on
 * PrescribedPracticePlanCard's pattern-impact chip). The pill rendered it as
 * an unhedged "N strokes/round from your team average" — this pins the "~" +
 * "(est.)" fix.
 * ========================================================================== */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CauseRow } from './CauseRow';
import type { CauseNode } from '@/lib/coachhelm/v3/themes/types';

// Via a variable, not an inline string literal — `role="coach"` as a literal
// trips eslint's jsx-a11y/aria-role (it reads `role` as an ARIA attribute
// name regardless of the component); CauseRowProps.role is CauseRow's own
// 'coach' | 'player' prop, unrelated to ARIA. Matches how ThemeCard.tsx (the
// real caller) already passes it — `role={role}`, never a literal.
const COACH = 'coach' as const;

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

describe('CauseRow — strokes pill is marked an estimate', () => {
  it('renders "~N strokes/round from your team average (est.)", never the bare unhedged number', () => {
    const cause = makeCause({
      insight_id: 'c1',
      strokesSavedPerRound: 0.9,
      tourGapPerRound: 1.4,
    });
    render(<CauseRow cause={cause} role={COACH} />);

    expect(screen.getByText('~0.9')).toBeInTheDocument();
    expect(screen.getByText(/strokes\/round from your team average \(est\.\)/)).toBeInTheDocument();
    expect(screen.queryByText('0.9')).not.toBeInTheDocument();
  });

  it('still says "from Tour (est.)" when the realistic gap equals the raw Tour gap', () => {
    const cause = makeCause({
      insight_id: 'c2',
      strokesSavedPerRound: 1.4,
      tourGapPerRound: 1.4,
    });
    render(<CauseRow cause={cause} role={COACH} />);

    expect(screen.getByText('~1.4')).toBeInTheDocument();
    expect(screen.getByText(/strokes\/round from Tour \(est\.\)/)).toBeInTheDocument();
  });
});
