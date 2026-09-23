import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { computeDistanceProfile } from '@/lib/coachhelm/v3/metrics/distance-profile';
import {
  scope,
  SCENARIO_A_125_175,
  SCENARIO_B_UNDER_ATTEMPTS_50_125,
  SCENARIO_C_UNDER_ROUNDS_175_PLUS,
  SCENARIO_C_HOLES,
  SCENARIO_F_BOTH_FLOORS_125_175,
} from '@/test/coachhelm/v3/fixtures/distance-profile-fixtures';
import { buildDistanceProfileViewModel } from '../buildDistanceProfileViewModel';
import { DistanceProfileSection } from '../DistanceProfileSection';

/** The vaul-attributed Sheet content node is portaled to `document.body`. */
function sheetContent() {
  return document.body.querySelector('[data-vaul-drawer]');
}

describe('DistanceProfileSection', () => {
  it('renders a MetricCard number for a supported row, InsufficientData for an insufficient one, and an empty state for an invalid one', () => {
    // Scenario A is fully-supported in 125_175ft; scenario B is under-floor
    // in 50_125ft (its `denominator` is nonzero, so `kind` is
    // 'insufficient', not 'invalid'); 175_plus_ft gets no fixture shots at
    // all, so its rows are 'invalid' (denominator 0). Both fixtures' shots
    // are merged into ONE computeDistanceProfile call — computeDistanceProfile
    // always emits a full row set for all 3 bands, so calling it once per
    // fixture and concatenating the results would let the second call's own
    // (empty) row for the first fixture's band silently overwrite the real
    // one.
    const results = computeDistanceProfile(
      [...SCENARIO_A_125_175, ...SCENARIO_B_UNDER_ATTEMPTS_50_125],
      scope('p1'),
      [],
    );
    const sections = buildDistanceProfileViewModel(results);
    render(<DistanceProfileSection sections={sections} windowLabel="Last 12 months (test)" />);

    // Supported: 125_175ft's green-hit-rate row renders a real MetricCard
    // number (60%, per the fixture's own known-answer header comment).
    expect(screen.getByText('Last 12 months (test)')).toBeInTheDocument();
    // NumberFlow renders the value/suffix as separate text nodes ("60", "%"),
    // so a plain-text query for '60%' is too brittle — check the button's
    // whole rendered text instead.
    const supportedButton = screen.getByRole('button', { name: /Greens hit, 125-175 yd/i });
    expect(supportedButton.textContent).toContain('60');
    expect(supportedButton.textContent).toContain('%');

    // Insufficient: 50_125ft's own green-hit-rate row is under-floor but
    // still carries a real (non-null) value — InsufficientData renders
    // regardless, proving the surface switches on `kind`, not on nullness.
    // The SPECIFIC floor it's short of (8 of the MIN_ATTEMPTS=10 attempts —
    // scenario B's 4 rounds already clear MIN_ROUNDS=3) must actually be
    // STATED, not a generic count with no floor named — `describeSupportGap`
    // is the metric core's own fix for this, not something the surface
    // reconstructs on its own.
    const insufficientButton = screen.getByRole('button', { name: /Greens hit, 50-125 yd/i });
    expect(within(insufficientButton).getByText('Not enough data yet')).toBeInTheDocument();
    expect(within(insufficientButton).getByText(/8 of 10 attempts/i)).toBeInTheDocument();

    // Invalid: 175_plus_ft never received a fixture shot — denominator 0.
    const invalidButton = screen.getByRole('button', { name: /Greens hit, 175\+ yd/i });
    expect(within(invalidButton).getByText('No data yet')).toBeInTheDocument();
  });

  it('names the ROUNDS floor specifically when that (not attempts) is what an insufficient row is short of', () => {
    // Scenario C clears MIN_ATTEMPTS (12 >= 10) but only has 2 distinct
    // rounds against MIN_ROUNDS=3 — describeSupportGap must report "2 of 3
    // rounds", not the attempts count, since rounds is the actual shortfall.
    const results = computeDistanceProfile(SCENARIO_C_UNDER_ROUNDS_175_PLUS, scope('p1'), SCENARIO_C_HOLES);
    const sections = buildDistanceProfileViewModel(results);
    render(<DistanceProfileSection sections={sections} windowLabel="Last 12 months (test)" />);

    const button = screen.getByRole('button', { name: /Greens hit, 175\+ yd/i });
    expect(within(button).getByText(/2 of 3 rounds/i)).toBeInTheDocument();
  });

  it('names the true attempts gap on the proximity tile, never "greens hit" — its own reading-count floor is cleared (#2008 review, MUST 1 repro)', () => {
    // Before this fix, the proximity tile read its OWN eligibleCount/
    // distinctRounds (scoped to the narrower 3-shot reading population) and
    // reported "3 of 3 greens hit" — self-contradictory, since that floor is
    // actually cleared, and hiding the real problem (8 of 10 attempts).
    const results = computeDistanceProfile(SCENARIO_B_UNDER_ATTEMPTS_50_125, scope('p1'), []);
    const sections = buildDistanceProfileViewModel(results);
    render(<DistanceProfileSection sections={sections} windowLabel="Last 12 months (test)" />);

    const button = screen.getByRole('button', { name: /Proximity when on the green, 50-125 yd/i });
    expect(within(button).getByText(/8 of 10 attempts/i)).toBeInTheDocument();
    expect(within(button).queryByText(/greens hit/i)).not.toBeInTheDocument();
  });

  it('names the same attempts gap on the direction-coverage and severe-outcome tiles, not their own narrower row counts', () => {
    const results = computeDistanceProfile(SCENARIO_B_UNDER_ATTEMPTS_50_125, scope('p1'), []);
    const sections = buildDistanceProfileViewModel(results);
    render(<DistanceProfileSection sections={sections} windowLabel="Last 12 months (test)" />);

    const coverage = screen.getByRole('button', { name: /Miss-direction data coverage, 50-125 yd/i });
    expect(within(coverage).getByText(/8 of 10 attempts/i)).toBeInTheDocument();

    const severe = screen.getByRole('button', { name: /Severe-outcome rate, 50-125 yd/i });
    expect(within(severe).getByText(/8 of 10 attempts/i)).toBeInTheDocument();
  });

  it('names every failed floor at once, on every rate tile, when rounds/attempts/greens all fail together', () => {
    const results = computeDistanceProfile(SCENARIO_F_BOTH_FLOORS_125_175, scope('p1'), []);
    const sections = buildDistanceProfileViewModel(results);
    render(<DistanceProfileSection sections={sections} windowLabel="Last 12 months (test)" />);

    const greenHit = screen.getByRole('button', { name: /Greens hit, 125-175 yd/i });
    expect(within(greenHit).getByText(/2 of 3 rounds and 4 of 10 attempts/i)).toBeInTheDocument();

    const proximity = screen.getByRole('button', { name: /Proximity when on the green, 125-175 yd/i });
    expect(
      within(proximity).getByText(/2 of 3 rounds and 4 of 10 attempts and 1 of 3 greens hit/i),
    ).toBeInTheDocument();

    const coverage = screen.getByRole('button', { name: /Miss-direction data coverage, 125-175 yd/i });
    expect(within(coverage).getByText(/2 of 3 rounds and 4 of 10 attempts/i)).toBeInTheDocument();

    const severe = screen.getByRole('button', { name: /Severe-outcome rate, 125-175 yd/i });
    expect(within(severe).getByText(/2 of 3 rounds and 4 of 10 attempts/i)).toBeInTheDocument();
  });

  it('bakes the value and kind into the accessible name, not just the metric/band identity', () => {
    // A bare aria-label on the tile's wrapping element replaces its
    // descendants' text for assistive tech, so the label itself has to
    // state what a sighted user reads visually — otherwise a screen-reader
    // user gets strictly less information than a mouse user looking at the
    // same tile.
    const results = computeDistanceProfile(
      [...SCENARIO_A_125_175, ...SCENARIO_B_UNDER_ATTEMPTS_50_125],
      scope('p1'),
      [],
    );
    const sections = buildDistanceProfileViewModel(results);
    render(<DistanceProfileSection sections={sections} windowLabel="Last 12 months (test)" />);

    expect(
      screen.getByRole('button', { name: /Greens hit, 125-175 yd: 60% of 10 attempts\./i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: /Greens hit, 50-125 yd: not enough data yet, 8 of 10 attempts\./i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Greens hit, 175\+ yd: no data recorded yet\./i }),
    ).toBeInTheDocument();
  });

  it('renders "Measured attempts" as a real number even when its own band is under the support floor', () => {
    // approach_measured_contribution's whole job is to STATE the count —
    // A2 never nulls its value, even below the floor — so it must render as
    // a MetricCard (a real "8"), never as an InsufficientData hedge, for a
    // band whose OTHER four rows are legitimately insufficient.
    const results = computeDistanceProfile(SCENARIO_B_UNDER_ATTEMPTS_50_125, scope('p1'), []);
    const sections = buildDistanceProfileViewModel(results);
    render(<DistanceProfileSection sections={sections} windowLabel="Last 12 months (test)" />);

    const contributionButton = screen.getByRole('button', { name: /Measured attempts, 50-125 yd/i });
    expect(within(contributionButton).queryByText('Not enough data yet')).not.toBeInTheDocument();
    expect(contributionButton.textContent).toContain('8');
    expect(contributionButton.textContent).toContain('Below support floor');
  });

  it('opens the same evidence via keyboard (Enter) as via click, and Escape closes it', async () => {
    const user = userEvent.setup();
    const results = computeDistanceProfile(SCENARIO_A_125_175, scope('p1'), []);
    const sections = buildDistanceProfileViewModel(results);
    render(<DistanceProfileSection sections={sections} windowLabel="Last 12 months (test)" />);

    expect(sheetContent()).not.toBeInTheDocument();

    const tile = screen.getByRole('button', { name: /Greens hit, 125-175 yd/i });
    tile.focus();
    expect(tile).toHaveFocus();
    await user.keyboard('{Enter}');

    const content = sheetContent();
    expect(content).toBeInTheDocument();
    // The drill-down is built from the SAME MetricResult the tile rendered:
    // scenario A's green-hit-rate row is 6/10, denominator 10.
    expect(within(content as HTMLElement).getByText('6 / 10')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(sheetContent()).not.toBeInTheDocument();
  });

  it('renders the empty state for a synthetic empty sections array (defensive — computeDistanceProfile never actually produces this)', () => {
    render(<DistanceProfileSection sections={[]} windowLabel="Last 12 months (test)" />);
    expect(screen.getByText('No approach shots yet')).toBeInTheDocument();
  });

  it('renders the empty state for the REALISTIC no-shots-yet case: computeDistanceProfile([]) still emits a full row set, all invalid (#2008 review, SHOULD 2)', () => {
    // A brand-new player's real path never produces sections=[] — every band
    // still gets a row set, every row 'invalid' (denominator 0). Testing
    // sections=[] alone would miss a regression in buildDistanceProfileViewModel
    // or the `hasAnyNonInvalidRow` gate itself.
    const results = computeDistanceProfile([], scope('p1'), []);
    const sections = buildDistanceProfileViewModel(results);
    expect(sections.length).toBeGreaterThan(0);
    render(<DistanceProfileSection sections={sections} windowLabel="Last 12 months (test)" />);
    expect(screen.getByText('No approach shots yet')).toBeInTheDocument();
  });
});
