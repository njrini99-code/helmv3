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
    const { container } = render(<StandingStrip {...BASE} player_value={BASE.team_avg ?? 0} />);

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

describe('StandingStrip — dynamic domain (founder screenshot: SG Approach TEAM -2.43 / CB -1.54 on a -1.50..1.50 track)', () => {
  /** Read the "You" badge/dot's rendered `left:%` — the badge tier and the
   *  track-tier dot are computed from the SAME `you` value inside
   *  StripTrack, so either is a valid probe; the badge is the simpler
   *  selector (one child div, no ambiguity with Tick markup). */
  function youLeftPct(container: HTMLElement): number {
    const badgeTier = container.querySelector('[data-slot="you-badge-tier"]');
    const badge = badgeTier!.querySelector('div') as HTMLElement;
    return parseFloat(badge.style.left);
  }
  function labelLeftPct(container: HTMLElement, text: string): number {
    const label = within(container).getByText(text);
    const wrapper = label.closest('span[aria-hidden="true"]') as HTMLElement;
    return parseFloat(wrapper.style.left);
  }

  it('never clamps an out-of-domain team value to the same rendered position as an in-range player value', () => {
    // Under the OLD fixed -1.5..1.5 domain, BOTH -2.43 (team) and -1.54
    // (player) clamp to `toScalePct`'s raw 0%, then StandingStrip's own
    // 13/87 label-margin clamp pins both to the literal same 13% — two
    // very different values (a full stroke apart) rendering identically,
    // silently hiding that team is far worse than shown.
    const { container } = render(
      <StandingStrip {...BASE} player_value={-1.54} team_avg={-2.43} />,
    );
    const youPct = youLeftPct(container);
    const teamPct = labelLeftPct(container, 'TEAM');
    expect(Number.isFinite(youPct)).toBe(true);
    expect(Number.isFinite(teamPct)).toBe(true);
    expect(youPct).not.toBeCloseTo(teamPct, 0);
    // The out-of-range team marker must still be genuinely inside the
    // track (StandingStrip's own edge margin), never at/beyond the literal
    // 0%/100% edge — "never silently clamp or drop a marker".
    expect(teamPct).toBeGreaterThanOrEqual(13);
    expect(teamPct).toBeLessThanOrEqual(87);
  });

  it('keeps the SG field-average (0) baseline dead-center once the domain widens asymmetrically', () => {
    // team_avg blows past the negative side only; the widened domain must
    // stay SYMMETRIC around zero (existing SG convention) so the Field Avg
    // tick — which is definitionally 0 — doesn't drift off-center.
    const { container } = render(
      <StandingStrip {...BASE} player_value={-1.54} team_avg={-2.43} pga_value={0} />,
    );
    const fieldAvgPct = labelLeftPct(container, 'FIELD AVG');
    expect(fieldAvgPct).toBeCloseTo(50, 0);
  });

  it('renders the team marker even when its value is far outside the caller-supplied scale (never dropped)', () => {
    render(<StandingStrip {...BASE} player_value={0.5} team_avg={-8} />);
    // Still shown — not silently omitted for being out of the typical range.
    expect(screen.getByText('TEAM')).toBeTruthy();
  });
});

describe('StandingStrip — marker collision handling (near-equal values)', () => {
  function labelLeftPct(container: HTMLElement, text: string): number {
    const label = within(container).getByText(text);
    const wrapper = label.closest('span[aria-hidden="true"]') as HTMLElement;
    return parseFloat(wrapper.style.left);
  }
  function youLeftPct(container: HTMLElement): number {
    const badgeTier = container.querySelector('[data-slot="you-badge-tier"]');
    const badge = badgeTier!.querySelector('div') as HTMLElement;
    return parseFloat(badge.style.left);
  }

  it('nudges the You marker apart from a near-equal Team value instead of overlapping', () => {
    // 0.81 vs 0.70 on a -1.5..1.5 scale is only ~3.7% apart raw — well
    // inside collision range.
    const { container } = render(
      <StandingStrip {...BASE} player_value={0.81} team_avg={0.7} pga_value={0} />,
    );
    const youPct = youLeftPct(container);
    const teamPct = labelLeftPct(container, 'TEAM');
    expect(Math.abs(youPct - teamPct)).toBeGreaterThanOrEqual(8.9);
  });

  it('the "You" floating badge and the track-tier dot agree on the nudged position (no tier drift)', () => {
    const { container } = render(
      <StandingStrip {...BASE} player_value={0.81} team_avg={0.7} pga_value={0} />,
    );
    const badgeLeft = youLeftPct(container);
    const dot = container.querySelector(
      '[data-slot="track-tier"] span.rounded-full.bg-accent-500',
    ) as HTMLElement;
    expect(parseFloat(dot.style.left)).toBeCloseTo(badgeLeft, 5);
  });
});

describe('StandingStrip — equality verdict (founder screenshot: CB 65% vs TEAM 65% displaying red "Below team average")', () => {
  const GIR_LIKE: StandingStripProps = {
    metric_id: 'gir_pct',
    metric_label: 'GIR %',
    player_value: 64.6,
    team_avg: 65.3,
    team_n: 8,
    team_pct: 40,
    pga_value: 68,
    direction: 'higher_better',
    unit: 'percent',
    scale: { min: 30, max: 80 },
    size: 'card',
  };

  it('renders a neutral "Matches team average" — not red "Below team average" — when values DISPLAY identically (64.6% vs 65.3%, both "65%")', () => {
    render(<StandingStrip {...GIR_LIKE} />);
    expect(screen.getByText('Matches team average')).toBeTruthy();
    expect(screen.queryByText('Below team average')).toBeNull();
    expect(screen.queryByText('Above team average')).toBeNull();
  });

  it('the header pill shows the neutral dot arrow, not an up/down arrow, for a display-equal pair', () => {
    render(<StandingStrip {...GIR_LIKE} />);
    expect(screen.getByText(/·\s*vs team/)).toBeTruthy();
    expect(screen.queryByText(/↑\s*vs team/)).toBeNull();
    expect(screen.queryByText(/↓\s*vs team/)).toBeNull();
  });

  it('the neutral caption uses the neutral token, never the warning/red tone class', () => {
    const { container } = render(<StandingStrip {...GIR_LIKE} />);
    const caption = screen.getByText('Matches team average');
    expect(caption.className).not.toContain('fw-warning');
    expect(caption.className).toContain('text-text-tertiary');
    const pill = container.querySelector('[data-slot="standing-strip"] span.rounded-full');
    expect(pill?.className).not.toContain('fw-warning');
  });

  it('a genuinely different pair (not a rounding tie) still verdicts normally', () => {
    render(<StandingStrip {...GIR_LIKE} player_value={50} team_avg={65.3} />);
    expect(screen.getByText('Below team average')).toBeTruthy();
    expect(screen.queryByText('Matches team average')).toBeNull();
  });
});

describe('StandingStrip — metric title wraps instead of truncating (finding [120])', () => {
  it('renders the full title text with no ellipsis-causing `truncate` class', () => {
    const longLabel = 'SG: Off the Tee (Long Approaches, 190-220 yards)';
    const { container } = render(<StandingStrip {...BASE} metric_label={longLabel} />);

    const title = container.querySelector('h4');
    expect(title).toBeTruthy();
    // The full label — including its distinguishing suffix — must be present
    // in the DOM. A `truncate` (single-line ellipsis) class visually clips
    // overflow via CSS, but doesn't remove text from the DOM, so this alone
    // doesn't prove the bug; the class assertion below does.
    expect(title!.textContent).toBe(longLabel);
    // `truncate` (Tailwind's `overflow:hidden;text-overflow:ellipsis;
    // white-space:nowrap`) is exactly what silently swallows a label's
    // distinguishing suffix — assert it's gone in favor of wrapping.
    expect(title!.className).not.toContain('truncate');
    expect(title!.className).toContain('break-words');
  });
});
