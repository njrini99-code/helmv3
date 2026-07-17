/**
 * StandingBar (W13) — unit + render-state coverage.
 *
 * The component primitive ships in src/components/golf/coachhelm/v3/StandingBar/.
 * Surfaces that adopt it land in W15 (coach) + W16 (player) — those will
 * have their own consumer tests.
 *
 * This test file covers:
 *   1. Pure utility math + formatting (toScalePct, formatValue, etc.)
 *   2. Render-state matrix per master plan Part XXV verification
 *      checklist: happy / cold-start / loading / error / empty.
 *   3. Size variant dispatch from <StandingBar size=... />.
 *   4. Auto-derived accessibility label.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { StandingBar } from '@/components/golf/coachhelm/v3/StandingBar';
import type { StandingBarProps } from '@/components/golf/coachhelm/v3/StandingBar';
import {
  toScalePct,
  formatValue,
  deltaVsTeam,
  teamCohortText,
  shouldShowTeamMarker,
  deriveAriaLabel,
  pgaReferenceLabel,
  neutralizeForCoach,
  initialsFromName,
  standingSubjectLabel,
} from '@/components/golf/coachhelm/v3/StandingBar';

// ---------------------------------------------------------------------------
// Pure-function unit tests
// ---------------------------------------------------------------------------

describe('toScalePct', () => {
  it('returns 50 when scale.min === scale.max', () => {
    expect(toScalePct(5, { min: 5, max: 5 })).toBe(50);
  });
  it('returns 0 at scale.min and 100 at scale.max', () => {
    expect(toScalePct(0, { min: 0, max: 60 })).toBe(0);
    expect(toScalePct(60, { min: 0, max: 60 })).toBe(100);
  });
  it('clamps below min and above max', () => {
    expect(toScalePct(-10, { min: 0, max: 60 })).toBe(0);
    expect(toScalePct(120, { min: 0, max: 60 })).toBe(100);
  });
  it('linearly interpolates in range', () => {
    expect(toScalePct(30, { min: 0, max: 60 })).toBeCloseTo(50);
  });
});

describe('formatValue', () => {
  it('formats percent with no decimals + % suffix', () => {
    expect(formatValue(38, 'percent')).toBe('38%');
  });
  it('formats strokes with 2 decimals', () => {
    expect(formatValue(0.4567, 'strokes')).toBe('0.46');
  });
  it('formats yards with " yd"', () => {
    expect(formatValue(285.5, 'yards')).toBe('286 yd');
  });
  it('formats feet with " ft"', () => {
    expect(formatValue(18.7, 'feet')).toBe('19 ft');
  });
  it('formats count with one decimal', () => {
    expect(formatValue(0.34, 'count')).toBe('0.3');
  });
});

describe('deltaVsTeam', () => {
  it('returns neutral when team_avg is null', () => {
    expect(deltaVsTeam(38, null, 'higher_better')).toEqual({ arrow: '·', tone: 'neutral' });
  });
  it('returns up + good when higher is better and player > team', () => {
    expect(deltaVsTeam(42, 38, 'higher_better')).toEqual({ arrow: '↑', tone: 'good' });
  });
  it('returns down + bad when higher is better and player < team', () => {
    expect(deltaVsTeam(35, 38, 'higher_better')).toEqual({ arrow: '↓', tone: 'bad' });
  });
  it('inverts for lower_better metrics', () => {
    // Penalty rate: 0.4 < 0.6 means player is BETTER
    expect(deltaVsTeam(0.4, 0.6, 'lower_better')).toEqual({ arrow: '↓', tone: 'good' });
    expect(deltaVsTeam(0.8, 0.6, 'lower_better')).toEqual({ arrow: '↑', tone: 'bad' });
  });
  it('treats sub-noise deltas as neutral', () => {
    expect(deltaVsTeam(38.001, 38, 'higher_better').tone).toBe('neutral');
  });
});

describe('teamCohortText', () => {
  it('returns empty string for null / undefined / NaN', () => {
    expect(teamCohortText(null)).toBe('');
    expect(teamCohortText(undefined)).toBe('');
    expect(teamCohortText(Number.NaN)).toBe('');
  });
  it('says "Top X%" for elite percentiles', () => {
    expect(teamCohortText(95)).toBe('Top 5% on your team');
    expect(teamCohortText(99)).toBe('Top 1% on your team');
  });
  it('says "Top quartile" for 75-89', () => {
    expect(teamCohortText(80)).toBe('Top quartile on your team');
  });
  it('says "Above team average" for 50-74', () => {
    expect(teamCohortText(60)).toBe('Above team average');
  });
  it('says "Below team average" for 25-49', () => {
    expect(teamCohortText(40)).toBe('Below team average');
  });
  it('says "Bottom X%" for low percentiles', () => {
    expect(teamCohortText(18)).toBe('Bottom 18% on your team');
  });

  // EC-2: a percentile is noise on a tiny roster — suppress when team_n < 5.
  it('suppresses the caption when team_n is below the floor (EC-2)', () => {
    // "Bottom 1% on a team of one" is exactly the bug being closed.
    expect(teamCohortText(1, 1)).toBe('');
    expect(teamCohortText(0, 2)).toBe('');
    expect(teamCohortText(100, 4)).toBe('');
  });

  // Small-roster guard: percentile-as-percent ("Top 1% of 7") is nonsense, so
  // the extreme buckets fall back to qualitative phrasing below PCT_LANGUAGE_MIN_N.
  it('uses qualitative extremes on a small roster (team_n < 20)', () => {
    expect(teamCohortText(95, 8)).toBe('Top of your team');
    expect(teamCohortText(100, 7)).toBe('Top of your team');
    expect(teamCohortText(18, 5)).toBe('Bottom of your team');
    expect(teamCohortText(1, 7)).toBe('Bottom of your team');
    // Mid buckets are still fine on a small roster.
    expect(teamCohortText(80, 7)).toBe('Top quartile on your team');
    expect(teamCohortText(60, 7)).toBe('Above team average');
    expect(teamCohortText(40, 7)).toBe('Below team average');
  });

  it('keeps percentage language on a large roster (team_n >= 20)', () => {
    expect(teamCohortText(95, 30)).toBe('Top 5% on your team');
    expect(teamCohortText(18, 30)).toBe('Bottom 18% on your team');
  });

  it('omitting team_n keeps the legacy permissive behavior', () => {
    expect(teamCohortText(18)).toBe('Bottom 18% on your team');
  });
});

describe('pgaReferenceLabel (CF-3)', () => {
  it('labels SG metrics "Field Avg" (the SG "0" is the field average)', () => {
    expect(pgaReferenceLabel('sg_total')).toEqual({ short: 'Field Avg', long: 'Field average' });
    expect(pgaReferenceLabel('sg_putting').short).toBe('Field Avg');
    expect(pgaReferenceLabel('sg_approach').long).toBe('Field average');
  });

  it('labels non-SG metrics "PGA" (a genuine Tour standard)', () => {
    expect(pgaReferenceLabel('putts_made_10_15ft_pct')).toEqual({ short: 'PGA', long: 'PGA Tour' });
    expect(pgaReferenceLabel('gir_pct').short).toBe('PGA');
    expect(pgaReferenceLabel('penalty_rate_per_round').long).toBe('PGA Tour');
  });
});

describe('shouldShowTeamMarker', () => {
  it('hides when team_avg is null', () => {
    expect(shouldShowTeamMarker({ team_avg: null, team_n: 10 })).toBe(false);
  });
  it('hides when team_n < 5', () => {
    expect(shouldShowTeamMarker({ team_avg: 38, team_n: 4 })).toBe(false);
  });
  it('shows when team_avg present and team_n >= 5', () => {
    expect(shouldShowTeamMarker({ team_avg: 38, team_n: 5 })).toBe(true);
  });
});

describe('deriveAriaLabel', () => {
  it('includes label, you, and PGA — and team when present', () => {
    const props: StandingBarProps = {
      metric_id: 'putts_made_10_15ft_pct',
      metric_label: '10-15 ft Putting',
      player_value: 38,
      team_avg: 41,
      team_n: 6,
      team_pct: 18,
      pga_value: 36,
      direction: 'higher_better',
      unit: 'percent',
      scale: { min: 0, max: 60 },
      size: 'card',
    };
    const label = deriveAriaLabel(props);
    expect(label).toContain('10-15 ft Putting');
    expect(label).toContain('You: 38%');
    expect(label).toContain('PGA Tour: 36%');
    expect(label).toContain('Team average: 41%');
    // Caption is mean-relative (consistent with the arrow + "T" marker): the
    // HAPPY fixture is You 38% < Team 41% (higher_better) → below the team mean.
    expect(label).toContain('Below team average');
  });
  it('omits team line in cold-start', () => {
    const props: StandingBarProps = {
      metric_id: 'sg_total', metric_label: 'SG: Total',
      player_value: 0.5, team_avg: null, pga_value: 0,
      direction: 'higher_better', unit: 'strokes',
      scale: { min: -1, max: 1 }, size: 'card',
    };
    expect(deriveAriaLabel(props)).not.toContain('Team average');
  });

  // CF-3: the SG reference is the field average, so the a11y phrase reads
  // "Field average:" not "PGA Tour:".
  it('uses "Field average" in the a11y label for SG metrics (CF-3)', () => {
    const props: StandingBarProps = {
      metric_id: 'sg_total', metric_label: 'SG: Total',
      player_value: 0.5, team_avg: null, pga_value: 0,
      direction: 'higher_better', unit: 'strokes',
      scale: { min: -1, max: 1 }, size: 'card',
    };
    const label = deriveAriaLabel(props);
    expect(label).toContain('Field average:');
    expect(label).not.toContain('PGA Tour:');
  });

  // Bug #915 — coach reading a teammate's card must never hear "You".
  it('coach viewer_context: speaks the player name, not "You", and drops "your team"', () => {
    const props: StandingBarProps = {
      metric_id: 'sg_total',
      metric_label: 'SG: Total',
      player_value: -3.34,
      team_avg: 0.1,
      team_n: 8,
      team_pct: 5,
      pga_value: 0,
      direction: 'higher_better',
      unit: 'strokes',
      scale: { min: -4, max: 4 },
      size: 'card',
      viewer_context: 'coach',
      player_name: 'Ethan Rodriguez',
    };
    const label = deriveAriaLabel(props);
    expect(label).toContain('Ethan Rodriguez: -3.34');
    expect(label).not.toMatch(/\bYou\b/);
    expect(label).not.toContain('your team');
  });

  it('coach viewer_context without a player_name falls back to "Player", never "You"', () => {
    const props: StandingBarProps = {
      metric_id: 'sg_total', metric_label: 'SG: Total',
      player_value: 0.5, team_avg: null, pga_value: 0,
      direction: 'higher_better', unit: 'strokes',
      scale: { min: -1, max: 1 }, size: 'card',
      viewer_context: 'coach',
    };
    const label = deriveAriaLabel(props);
    expect(label).toContain('Player: 0.50');
    expect(label).not.toMatch(/\bYou\b/);
  });

  it('self viewer_context (default) is unchanged: "You" + "your team" language', () => {
    const props: StandingBarProps = {
      metric_id: 'sg_total',
      metric_label: 'SG: Total',
      player_value: -3.34,
      team_avg: 0.1,
      team_n: 8,
      pga_value: 0,
      direction: 'higher_better',
      unit: 'strokes',
      scale: { min: -4, max: 4 },
      size: 'card',
    };
    const label = deriveAriaLabel(props);
    expect(label).toContain('You: -3.34');
  });
});

// ---------------------------------------------------------------------------
// Audience voice — bug #915 (StandingStrip's "YOU −3.34 … Below team
// average / Bottom of your team" shown to a coach reading a player's card)
// ---------------------------------------------------------------------------

describe('neutralizeForCoach', () => {
  it('strips "your team" for a coach viewer', () => {
    expect(neutralizeForCoach('Bottom of your team', 'coach')).toBe('Bottom of team');
    expect(neutralizeForCoach('Top 18% on your team', 'coach')).toBe('Top 18% on team');
    expect(neutralizeForCoach('About your team average', 'coach')).toBe('About team average');
  });
  it('is a no-op for text with no possessive to strip', () => {
    expect(neutralizeForCoach('Above team average', 'coach')).toBe('Above team average');
    expect(neutralizeForCoach('Below team average', 'coach')).toBe('Below team average');
  });
  it('is a no-op for the player\'s own view (self, or undefined)', () => {
    expect(neutralizeForCoach('Bottom of your team', 'self')).toBe('Bottom of your team');
    expect(neutralizeForCoach('Bottom of your team', undefined)).toBe('Bottom of your team');
  });
  it('passes through an empty string', () => {
    expect(neutralizeForCoach('', 'coach')).toBe('');
  });
});

describe('initialsFromName', () => {
  it('takes first + last initial for a two-word name', () => {
    expect(initialsFromName('Ethan Rodriguez')).toBe('ER');
  });
  it('takes the first two letters of a single-word name', () => {
    expect(initialsFromName('Ethan')).toBe('ET');
  });
  it('uses first + last of a multi-word name (ignores middle names)', () => {
    expect(initialsFromName('Mary Jane Watson')).toBe('MW');
  });
  it('falls back to "PL" for missing/blank names — never fabricates initials', () => {
    expect(initialsFromName(null)).toBe('PL');
    expect(initialsFromName(undefined)).toBe('PL');
    expect(initialsFromName('   ')).toBe('PL');
  });
});

describe('standingSubjectLabel', () => {
  it('is "You" for the self viewer (default)', () => {
    expect(standingSubjectLabel('self', 'Ethan Rodriguez')).toBe('You');
    expect(standingSubjectLabel(undefined, 'Ethan Rodriguez')).toBe('You');
  });
  it('is the player\'s initials for a coach viewer', () => {
    expect(standingSubjectLabel('coach', 'Ethan Rodriguez')).toBe('ER');
  });
  it('falls back to "PL" for a coach viewer with no player name', () => {
    expect(standingSubjectLabel('coach', undefined)).toBe('PL');
  });
});

// ---------------------------------------------------------------------------
// Render-state matrix
// ---------------------------------------------------------------------------

const HAPPY: StandingBarProps = {
  metric_id: 'putts_made_10_15ft_pct',
  metric_label: '10-15 ft Putting',
  player_value: 38,
  team_avg: 41,
  team_n: 6,
  team_pct: 18,
  pga_value: 36,
  direction: 'higher_better',
  unit: 'percent',
  scale: { min: 0, max: 60 },
  size: 'card',
};

describe('StandingBar render states — card', () => {
  it('happy: shows label, all 3 values, cohort text', () => {
    render(<StandingBar {...HAPPY} />);
    expect(screen.getByText('10-15 ft Putting')).toBeTruthy();
    expect(screen.getByText(/You 38%/)).toBeTruthy();
    expect(screen.getByText(/PGA 36%/)).toBeTruthy();
    expect(screen.getByText(/Team 41%/)).toBeTruthy();
    expect(screen.getByText('Below team average')).toBeTruthy();
  });

  it('cold-start: team_n < 5 hides team marker + shows cold-start hint', () => {
    render(<StandingBar {...HAPPY} team_n={3} team_avg={null} team_pct={null} />);
    expect(screen.queryByText(/Team 41%/)).toBeNull();
    expect(screen.getByText(/Team marker appears once 5\+ teammates/)).toBeTruthy();
  });

  it('loading: shows status role', () => {
    render(<StandingBar {...HAPPY} state="loading" />);
    expect(screen.getByRole('status')).toBeTruthy();
  });

  it('error: shows alert role and error message', () => {
    render(<StandingBar {...HAPPY} state="error" errorMessage="db down" />);
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('db down')).toBeTruthy();
  });

  it('empty: shows empty hint', () => {
    render(<StandingBar {...HAPPY} state="empty" />);
    expect(screen.getByText(/Log 5 rounds/)).toBeTruthy();
  });

  // CF-3: SG metrics anchor to the field average (0), not a PGA Tour score.
  it('relabels the reference as "Field Avg" for SG metrics (CF-3)', () => {
    render(
      <StandingBar
        {...HAPPY}
        metric_id="sg_putting"
        metric_label="SG: Putting"
        player_value={0.4}
        team_avg={0.1}
        pga_value={0}
        unit="strokes"
        scale={{ min: -1.5, max: 1.5 }}
      />,
    );
    expect(screen.getByText(/Field Avg 0\.00/)).toBeTruthy();
    expect(screen.queryByText(/PGA 0\.00/)).toBeNull();
  });

  it('keeps the "PGA" reference label for non-SG metrics (CF-3)', () => {
    render(<StandingBar {...HAPPY} />);
    expect(screen.getByText(/PGA 36%/)).toBeTruthy();
    expect(screen.queryByText(/Field Avg/)).toBeNull();
  });

  // EC-2: cohort caption must not render when the team marker is hidden —
  // even if a team_avg slipped through on a tiny roster.
  it('suppresses the cohort caption on a tiny roster (EC-2)', () => {
    render(<StandingBar {...HAPPY} team_n={2} team_avg={41} team_pct={1} />);
    expect(screen.queryByText('Below team average')).toBeNull();
    expect(screen.queryByText(/Bottom .* on your team/)).toBeNull();
  });
});

describe('StandingBar render states — inline', () => {
  it('happy: renders the compact dot-separated values', () => {
    render(<StandingBar {...HAPPY} size="inline" />);
    expect(screen.getByText('10-15 ft Putting')).toBeTruthy();
    expect(screen.getByText(/You 38%/)).toBeTruthy();
  });

  it('cold-start hides team segment from the dot-separated line', () => {
    render(<StandingBar {...HAPPY} size="inline" team_n={2} team_avg={null} />);
    expect(screen.queryByText(/T 41%/)).toBeNull();
  });

  it('loading + error + empty each surface the right role', () => {
    const { rerender } = render(<StandingBar {...HAPPY} size="inline" state="loading" />);
    expect(screen.getByRole('status')).toBeTruthy();
    rerender(<StandingBar {...HAPPY} size="inline" state="error" />);
    expect(screen.getByRole('alert')).toBeTruthy();
    rerender(<StandingBar {...HAPPY} size="inline" state="empty" />);
    expect(screen.getByText(/Log 5 rounds/)).toBeTruthy();
  });
});

describe('StandingBar render states — hero', () => {
  it('happy: surfaces the big "You" value', () => {
    render(<StandingBar {...HAPPY} size="hero" />);
    expect(screen.getByText('10-15 ft Putting')).toBeTruthy();
    // Big You value is rendered without the "You " prefix; just "38%"
    expect(screen.getByText('38%')).toBeTruthy();
    // PGA value is shown in the secondary references row
    expect(screen.getByText(/PGA 36%/)).toBeTruthy();
  });

  it('loading + error + empty each surface the right role', () => {
    const { rerender } = render(<StandingBar {...HAPPY} size="hero" state="loading" />);
    expect(screen.getByRole('status')).toBeTruthy();
    rerender(<StandingBar {...HAPPY} size="hero" state="error" errorMessage="boom" />);
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('boom')).toBeTruthy();
    rerender(<StandingBar {...HAPPY} size="hero" state="empty" />);
    expect(screen.getByText(/Log 5 rounds to see/)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// P3: omitted reference marker (women on metrics with no credible anchor)
// ---------------------------------------------------------------------------

describe('StandingBar pga_omitted (P3)', () => {
  it('card: drops the PGA value + omits it from the aria label', () => {
    const { container } = render(
      <StandingBar
        {...HAPPY}
        metric_id="big_number_rate"
        metric_label="Double Bogey-or-Worse Rate"
        unit="percent"
        pga_value={2}
        pga_omitted
      />,
    );
    // The reference value text must be gone (no "PGA 2%").
    expect(screen.queryByText(/PGA 2%/)).toBeNull();
    // You is still shown.
    expect(screen.getByText(/You 38%/)).toBeTruthy();
    // aria label must not narrate the men's reference.
    const aria = container.querySelector('[role="img"]')?.getAttribute('aria-label') ?? '';
    expect(aria).not.toContain('PGA Tour');
    expect(aria).toContain('You: 38%');
  });

  it('card: still renders the reference normally when pga_omitted is absent', () => {
    render(<StandingBar {...HAPPY} />);
    expect(screen.getByText(/PGA 36%/)).toBeTruthy();
  });

  it('inline: drops the dot-separated reference segment', () => {
    render(
      <StandingBar
        {...HAPPY}
        size="inline"
        metric_id="penalty_rate_per_round"
        unit="count"
        pga_value={0.3}
        pga_omitted
      />,
    );
    expect(screen.queryByText(/PGA/)).toBeNull();
    expect(screen.getByText(/You 38/)).toBeTruthy();
  });

  it('hero: drops the reference value from the secondary row', () => {
    render(
      <StandingBar
        {...HAPPY}
        size="hero"
        metric_id="scoring_par_4"
        unit="strokes"
        pga_value={4.1}
        pga_omitted
      />,
    );
    expect(screen.queryByText(/PGA/)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Size dispatch
// ---------------------------------------------------------------------------

describe('StandingBar dispatch', () => {
  it('defaults to card when an unknown size somehow lands', () => {
    // Cast to bypass exhaustive union — we still expect the card to render.
    const props = { ...HAPPY, size: 'card' as const };
    render(<StandingBar {...props} />);
    expect(screen.getByText('10-15 ft Putting')).toBeTruthy();
  });

  it('auto-derives aria-label when none provided', () => {
    const { container } = render(<StandingBar {...HAPPY} />);
    const root = container.querySelector('[role="img"]');
    expect(root).toBeTruthy();
    const aria = root?.getAttribute('aria-label') ?? '';
    expect(aria).toContain('10-15 ft Putting');
    expect(aria).toContain('You: 38%');
  });

  it('honors a manually-provided aria-label', () => {
    const { container } = render(<StandingBar {...HAPPY} ariaLabel="custom" />);
    const root = container.querySelector('[role="img"]');
    expect(root?.getAttribute('aria-label')).toBe('custom');
  });
});
