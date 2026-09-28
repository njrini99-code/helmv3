// @vitest-environment jsdom
/**
 * ============================================================================
 * TeamShotWeaknesses: the team's costliest shot situations
 * ----------------------------------------------------------------------------
 * Pins what the card may claim from `teamShotAnalysis`: losing situations
 * only, worst strokes gained per shot first, the lie as recorded (an "other"
 * or penalty lie is footnoted, because the baseline prices it as fairway),
 * feet on the green and yards elsewhere, and every figure labelled as
 * strokes gained on the number itself.
 * ========================================================================== */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { TeamShotAnalysis } from '@/app/golf/actions/team-category-insights';
import { TeamShotWeaknesses, buildWeaknessRows } from '../TeamShotWeaknesses';

function analysis(overrides: Partial<TeamShotAnalysis> = {}): TeamShotAnalysis {
  return {
    yardageCurve: [],
    deadZones: [],
    topWeaknesses: [],
    ...overrides,
  };
}

// Shapes as `rankWeaknessContexts` emits them: context `${lie}_${range}`.
const weaknesses: TeamShotAnalysis['topWeaknesses'] = [
  { context: 'rough_100-125', lie: 'rough', distanceRange: '100-125', avgSG: -0.31, shotCount: 40 },
  { context: 'other_0-25', lie: 'other', distanceRange: '0-25', avgSG: -0.62, shotCount: 18 },
  { context: 'green_6-10', lie: 'green', distanceRange: '6-10', avgSG: -0.12, shotCount: 212 },
  // The team GAINS here: not a weakness, whatever the ranking handed over.
  { context: 'tee_250+', lie: 'tee', distanceRange: '250+', avgSG: 0.05, shotCount: 300 },
];

describe('buildWeaknessRows', () => {
  it('keeps losing situations only, worst per shot first', () => {
    const rows = buildWeaknessRows(analysis({ topWeaknesses: weaknesses }));
    expect(rows.map((r) => r.perShot)).toEqual([-0.62, -0.31, -0.12]);
  });

  it('labels the lie as recorded, with the right unit and an en dash', () => {
    const [other, rough, putt] = buildWeaknessRows(analysis({ topWeaknesses: weaknesses }));
    expect(other).toMatchObject({ lie: 'Other lie', distance: '0–25 yd', noBaseline: true, isPutt: false });
    expect(rough).toMatchObject({ lie: 'From the rough', distance: '100–125 yd', noBaseline: false });
    expect(putt).toMatchObject({ lie: 'Putts', distance: '6–10 ft', isPutt: true });
  });

  it('totals per-shot strokes gained times the shot count', () => {
    const [other] = buildWeaknessRows(analysis({ topWeaknesses: weaknesses }));
    expect(other!.total).toBeCloseTo(-0.62 * 18, 10);
  });

  it('drops non-finite and shotless rows instead of printing them', () => {
    const rows = buildWeaknessRows(
      analysis({
        topWeaknesses: [
          { context: 'sand_0-25', lie: 'sand', distanceRange: '0-25', avgSG: Number.NaN, shotCount: 20 },
          { context: 'sand_25-50', lie: 'sand', distanceRange: '25-50', avgSG: -0.4, shotCount: 0 },
        ],
      }),
    );
    expect(rows).toEqual([]);
  });

  it('is empty for a missing payload', () => {
    expect(buildWeaknessRows(undefined)).toEqual([]);
  });
});

describe('TeamShotWeaknesses', () => {
  const data = analysis({
    topWeaknesses: weaknesses,
    deadZones: [
      { rangeStart: 100, rangeEnd: 125, deficit: 0.24 },
      { rangeStart: 150, rangeEnd: 175, deficit: 0.41 },
    ],
  });

  it('labels every figure as strokes gained, on the number itself', () => {
    render(<TeamShotWeaknesses data={data} />);
    // Three situations, two dead zones: one "SG/shot" per figure.
    expect(screen.getAllByText('SG/shot')).toHaveLength(5);
    expect(screen.getByText('−0.62', { exact: false, selector: 'p' })).toHaveTextContent('−0.62SG/shot');
    expect(screen.getByText('−11.2 SG total')).toBeInTheDocument();
  });

  it('footnotes an "other" lie, since the baseline prices it as fairway', () => {
    render(<TeamShotWeaknesses data={data} />);
    expect(screen.getByText(/There is no Tour baseline for an/)).toBeInTheDocument();
    expect(screen.getByText('(measured against the fairway baseline)', { exact: false })).toBeInTheDocument();
  });

  it('lists the dead zones worst first', () => {
    render(<TeamShotWeaknesses data={data} />);
    const bands = screen.getAllByText(/^\d+–\d+ yd$/, { selector: 'span' }).map((el) => el.textContent);
    expect(bands).toEqual(['150–175 yd', '100–125 yd']);
  });

  it('prints no "undefined" or "NaN" anywhere', () => {
    const { container } = render(<TeamShotWeaknesses data={data} />);
    expect(container.textContent).not.toMatch(/undefined|NaN/);
  });

  it('shows an honest empty state when nothing qualifies', () => {
    render(<TeamShotWeaknesses data={analysis()} />);
    expect(screen.getByText('No shot-level weaknesses yet')).toBeInTheDocument();
  });

  it('says the analysis did not load when the overview failed', () => {
    render(<TeamShotWeaknesses data={undefined} unavailable />);
    expect(screen.getByText("Shot analysis didn't load")).toBeInTheDocument();
  });
});
