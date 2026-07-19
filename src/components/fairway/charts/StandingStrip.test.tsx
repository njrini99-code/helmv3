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
import { render, screen, within } from '@testing-library/react';
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

describe('StandingStrip — "You" badge vs "TEAM" label overlap (mobile audit screenshot)', () => {
  it('keeps the floating "You" value badge and the "TEAM" tick label in separate, non-overlapping flow tiers', () => {
    // Worst case: player_value === team_avg, so the You marker and the Team
    // marker sit at the EXACT same horizontal position — the scenario that
    // used to make the green "You" badge visually swallow the "TEAM" label
    // behind it (only a stray letter peeking out). jsdom has no layout
    // engine, so this pins the *structural* contract that prevents the
    // collision (two stacked flow boxes, not a proximity threshold) rather
    // than asserting pixel positions.
    const { container } = render(<StandingStrip {...BASE} player_value={BASE.team_avg} />);

    const badgeTier = container.querySelector('[data-slot="you-badge-tier"]');
    const trackTier = container.querySelector('[data-slot="track-tier"]');
    expect(badgeTier).toBeTruthy();
    expect(trackTier).toBeTruthy();

    // The badge tier must be the track tier's immediately-preceding sibling —
    // i.e. they stack in normal document flow, one strictly above the other —
    // instead of both floating inside the same absolutely-positioned box.
    expect(badgeTier!.nextElementSibling).toBe(trackTier);

    // The "TEAM" label renders only inside the track tier, never inside the
    // badge tier — so it can never be hidden behind the "You" badge.
    expect(within(badgeTier as HTMLElement).queryByText('TEAM')).toBeNull();
    expect(within(trackTier as HTMLElement).getByText('TEAM')).toBeTruthy();
  });
});
