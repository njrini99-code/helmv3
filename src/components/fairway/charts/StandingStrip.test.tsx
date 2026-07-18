// @vitest-environment jsdom
/**
 * StandingStrip.tsx — regression coverage for the SG caption/arrow mismatch
 * (audit W1).
 *
 * StandingStrip is the Fairway-native "matte" replacement for the legacy
 * glass StandingBar (Card/Inline/Hero), used on the player detail Strokes
 * Gained tab (FairwayStatsCockpit). It ships its own copy of the "vs team"
 * caption wiring rather than delegating to a shared render, so when the
 * legacy StandingBar/Card.tsx was fixed to derive its caption from the same
 * mean-relative comparison as the ↑/↓ arrow, that fix never propagated here —
 * StandingStrip kept calling the older percentile-based `teamCohortText`,
 * which can disagree with the mean-relative arrow on a skewed roster.
 *
 * Concretely: player 0.81 vs team-mean 0.65 (higher_better) — 0.81 > 0.65 so
 * the arrow is UP and reads "better than team" (delta.tone === 'good'), but a
 * skewed team distribution can put 0.81 below the 50th team_pct percentile,
 * so the OLD `teamCohortText(team_pct, ...)` caption read "Below team
 * average" directly under the "better" badge.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { StandingStrip, type StandingStripProps } from './StandingStrip';

const BASE: StandingStripProps = {
  metric_id: 'sg_ott',
  metric_label: 'SG: Off the Tee',
  player_value: 0.81,
  team_avg: 0.65,
  team_n: 8,
  // A percentile that disagrees with the mean comparison — the exact skewed-
  // roster condition that produced the contradiction (0.81 is above the mean
  // but the percentile rank still lands in the "Below team average" bucket).
  team_pct: 40,
  pga_value: 0,
  direction: 'higher_better',
  unit: 'strokes',
  scale: { min: -1.5, max: 1.5 },
  size: 'card',
};

describe('StandingStrip — SG caption/arrow agreement (W1 regression)', () => {
  it('caption agrees with the up-arrow "better than team" badge when player > team mean', () => {
    render(<StandingStrip {...BASE} />);

    // Arrow badge: player (0.81) > team mean (0.65) on a higher_better metric
    // → up arrow, "better than team".
    expect(screen.getByText(/↑ vs team/)).toBeTruthy();

    // Caption must be mean-relative and MUST NOT contradict the arrow above.
    expect(screen.getByText('Above team average')).toBeTruthy();
    expect(screen.queryByText('Below team average')).toBeNull();
  });

  it('caption agrees with the down-arrow "worse than team" badge when player < team mean', () => {
    render(<StandingStrip {...BASE} player_value={0.5} team_pct={80} />);

    // Arrow: player (0.5) < team mean (0.65) on a higher_better metric → down.
    expect(screen.getByText(/↓ vs team/)).toBeTruthy();

    // Even though team_pct (80) would have read "Top quartile on your team"
    // under the old percentile-based caption, the mean-relative caption must
    // agree with the down arrow instead.
    expect(screen.getByText('Below team average')).toBeTruthy();
    expect(screen.queryByText('Above team average')).toBeNull();
    expect(screen.queryByText(/Top quartile/)).toBeNull();
  });

  it('suppresses the cohort caption on a tiny roster (team marker hidden)', () => {
    render(<StandingStrip {...BASE} team_n={2} />);
    expect(screen.queryByText(/vs team/)).toBeNull();
    expect(screen.queryByText('Above team average')).toBeNull();
    expect(screen.queryByText('Below team average')).toBeNull();
  });
});
