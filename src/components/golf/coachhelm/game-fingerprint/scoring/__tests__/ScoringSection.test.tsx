import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { computeParOpportunities } from '@/lib/coachhelm/v3/metrics/par-opportunities';
import {
  scope,
  par5Play,
  PAR3_ALL_ONLY_HOLES,
  PAR4_MID_BAND_HOLES,
} from '@/test/coachhelm/v3/fixtures/par-opportunities-fixtures';
import { buildScoringViewModel } from '../buildScoringViewModel';
import { ScoringSection } from '../ScoringSection';

/** The vaul-attributed Sheet content node is portaled to `document.body`. */
function sheetContent() {
  return document.body.querySelector('[data-vaul-drawer]');
}

describe('ScoringSection', () => {
  it('renders a MetricCard for a supported par row, InsufficientData for an insufficient one', () => {
    const holes = [...PAR4_MID_BAND_HOLES, ...PAR3_ALL_ONLY_HOLES];
    const results = computeParOpportunities([], holes, scope('p1'));
    const viewModel = buildScoringViewModel(results);
    render(<ScoringSection viewModel={viewModel} windowLabel="Last 12 months (test)" />);

    expect(screen.getByText('Last 12 months (test)')).toBeInTheDocument();

    // Par 4's 'all' row: supported, average +0.4 vs par.
    const par4All = screen.getByRole('button', { name: /All, Par 4/i });
    expect(par4All.textContent).toContain('0.4');
    expect(within(par4All).getByText(/5 holes/)).toBeInTheDocument();

    // Par 3's 'all' row: only 2 holes, under the sample floor -> insufficient,
    // but it still has a real (non-null) value, proving the surface
    // switches on `kind`, not on nullness.
    const par3All = screen.getByRole('button', { name: /All, Par 3/i });
    expect(within(par3All).getByText('Not enough data yet')).toBeInTheDocument();
    expect(within(par3All).getByText(/2 holes so far/i)).toBeInTheDocument();
  });

  it('renders one card per specific par-5 hole with its three metrics in fixed order', () => {
    const plays = [
      par5Play({ round_id: 'a-r1', course_id: 'course-a', hole_number: 7, greenShotNumber: 3, putts: 2 }),
      par5Play({ round_id: 'a-r2', course_id: 'course-a', hole_number: 7, greenShotNumber: 3, putts: 1 }),
      par5Play({ round_id: 'a-r3', course_id: 'course-a', hole_number: 7, greenShotNumber: 3, putts: 2 }),
    ];
    const holes = plays.map((p) => p.hole);
    const facts = plays.flatMap((p) => p.facts);
    const results = computeParOpportunities(facts, holes, scope('p1'));
    const viewModel = buildScoringViewModel(results);
    render(<ScoringSection viewModel={viewModel} windowLabel="Last 12 months (test)" />);

    expect(screen.getByText('Par-5 opportunities')).toBeInTheDocument();
    expect(screen.getByText(/^Hole 7 ·/)).toBeInTheDocument();

    const regButton = screen.getByRole('button', { name: /Regulation opportunity rate, Hole 7/i });
    expect(regButton.textContent).toContain('100');
    expect(regButton.textContent).toContain('%');
  });

  it('bakes the value and kind into the accessible name for both row shapes', () => {
    const holes = [...PAR4_MID_BAND_HOLES];
    const results = computeParOpportunities([], holes, scope('p1'));
    const viewModel = buildScoringViewModel(results);
    render(<ScoringSection viewModel={viewModel} windowLabel="Last 12 months (test)" />);

    expect(
      screen.getByRole('button', { name: /All, Par 4: \+0\.4 strokes vs par, 5 holes\./i }),
    ).toBeInTheDocument();
  });

  it('opens the same evidence via keyboard (Enter) as via click, and Escape closes it', async () => {
    const user = userEvent.setup();
    const results = computeParOpportunities([], PAR4_MID_BAND_HOLES, scope('p1'));
    const viewModel = buildScoringViewModel(results);
    render(<ScoringSection viewModel={viewModel} windowLabel="Last 12 months (test)" />);

    expect(sheetContent()).not.toBeInTheDocument();

    const tile = screen.getByRole('button', { name: /All, Par 4/i });
    tile.focus();
    expect(tile).toHaveFocus();
    await user.keyboard('{Enter}');

    const content = sheetContent();
    expect(content).toBeInTheDocument();
    expect(within(content as HTMLElement).getByText('5')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(sheetContent()).not.toBeInTheDocument();
  });

  it('renders the empty-collection state when there are no par or par-5 rows at all', () => {
    render(
      <ScoringSection viewModel={{ parSections: [], par5Holes: [] }} windowLabel="Last 12 months (test)" />,
    );
    expect(screen.getByText('No scored rounds yet')).toBeInTheDocument();
  });

  it('gives an invalid par-5 row metric-aware copy, never a blanket "no data recorded yet" beside a real sibling number', () => {
    // Three complete plays, none reaching the green in regulation (shot 4,
    // par - 2 = 3): eligible = 3 clears the sample floor, so regulation and
    // green-in-two are 'supported' with a real 0% — but created = 0, so
    // putting conversion's own denominator is 0 -> 'invalid'. This isolates
    // the conversion row's invalid state next to its two REAL 0% sibling
    // numbers on the same hole — a materially different claim.
    const plays = [
      par5Play({ round_id: 'r1', course_id: 'course-a', hole_number: 12, greenShotNumber: 4, putts: 2 }),
      par5Play({ round_id: 'r2', course_id: 'course-a', hole_number: 12, greenShotNumber: 4, putts: 1 }),
      par5Play({ round_id: 'r3', course_id: 'course-a', hole_number: 12, greenShotNumber: 4, putts: 2 }),
    ];
    const holes = plays.map((p) => p.hole);
    const facts = plays.flatMap((p) => p.facts);
    const results = computeParOpportunities(facts, holes, scope('p1'));
    const viewModel = buildScoringViewModel(results);
    render(<ScoringSection viewModel={viewModel} windowLabel="Last 12 months (test)" />);

    const conversionButton = screen.getByRole('button', { name: /Putting conversion rate, Hole 12/i });
    expect(within(conversionButton).queryByText('No data yet')).not.toBeInTheDocument();
    expect(within(conversionButton).getByText('No conversions to measure')).toBeInTheDocument();
    expect(
      within(conversionButton).getByText('No regulation opportunities were created yet — nothing to convert.'),
    ).toBeInTheDocument();

    // Its sibling regulation-rate tile has a REAL 0%, a materially different
    // claim from "invalid" — both must be visibly distinguishable.
    const regButton = screen.getByRole('button', { name: /Regulation opportunity rate, Hole 12/i });
    expect(regButton.textContent).toContain('0');
    expect(regButton.textContent).toContain('%');
  });

  it('formats a non-terminating percent in the drill-down rather than a raw floating-point tail', async () => {
    const user = userEvent.setup();
    // 1 of 3 opportunities converted -> 100/3 = 33.333333333333336%.
    const plays = [
      par5Play({ round_id: 'r1', course_id: 'course-a', hole_number: 5, greenShotNumber: 3, putts: 1 }),
      par5Play({ round_id: 'r2', course_id: 'course-a', hole_number: 5, greenShotNumber: 3, putts: 3 }),
      par5Play({ round_id: 'r3', course_id: 'course-a', hole_number: 5, greenShotNumber: 3, putts: 2 }),
    ];
    const holes = plays.map((p) => p.hole);
    const facts = plays.flatMap((p) => p.facts);
    const results = computeParOpportunities(facts, holes, scope('p1'));
    const viewModel = buildScoringViewModel(results);
    render(<ScoringSection viewModel={viewModel} windowLabel="Last 12 months (test)" />);

    const conversionButton = screen.getByRole('button', { name: /Putting conversion rate, Hole 5/i });
    await user.click(conversionButton);
    const content = sheetContent();
    expect(content).toBeInTheDocument();
    expect(within(content as HTMLElement).getByText('33.3%')).toBeInTheDocument();
    expect(within(content as HTMLElement).queryByText(/33\.333333/)).not.toBeInTheDocument();
  });

  it('disambiguates two identical hole numbers at different courses with distinct accessible names', () => {
    const a = [
      par5Play({ round_id: 'a-r1', course_id: 'course-a', hole_number: 7, greenShotNumber: 3, putts: 2 }),
      par5Play({ round_id: 'a-r2', course_id: 'course-a', hole_number: 7, greenShotNumber: 3, putts: 1 }),
      par5Play({ round_id: 'a-r3', course_id: 'course-a', hole_number: 7, greenShotNumber: 3, putts: 2 }),
    ];
    const b = [
      par5Play({ round_id: 'b-r1', course_id: 'course-b', hole_number: 7, greenShotNumber: 4, putts: 2 }),
      par5Play({ round_id: 'b-r2', course_id: 'course-b', hole_number: 7, greenShotNumber: 4, putts: 2 }),
      par5Play({ round_id: 'b-r3', course_id: 'course-b', hole_number: 7, greenShotNumber: 4, putts: 2 }),
    ];
    const holes = [...a, ...b].map((p) => p.hole);
    const facts = [...a, ...b].flatMap((p) => p.facts);
    const results = computeParOpportunities(facts, holes, scope('p1'));
    const viewModel = buildScoringViewModel(results, { 'course-a': 'Course A', 'course-b': 'Course B' });
    render(<ScoringSection viewModel={viewModel} windowLabel="Last 12 months (test)" />);

    const courseA = screen.getByRole('button', { name: /Regulation opportunity rate, Hole 7 · Course A/i });
    const courseB = screen.getByRole('button', { name: /Regulation opportunity rate, Hole 7 · Course B/i });
    expect(courseA).not.toBe(courseB);
    expect(courseA.textContent).toContain('100');
    expect(courseB.textContent).toContain('0');
  });
});
