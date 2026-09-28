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
import { TeamShotWeaknesses, buildWeaknessRows, formatZoneRange } from '../TeamShotWeaknesses';

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
  { context: 'green_5-10', lie: 'green', distanceRange: '5-10', avgSG: -0.12, shotCount: 212 },
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
    expect(putt).toMatchObject({ lie: 'Putts', distance: '5–10 ft', isPutt: true });
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

describe('formatZoneRange', () => {
  it('reads the curve\'s last band as open-ended: it holds every shot past 300 yards', () => {
    expect(formatZoneRange(275, 300)).toBe('275+ yd');
    expect(formatZoneRange(50, 75)).toBe('50–75 yd');
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

/**
 * Demo University Golf, last 90 days, recomputed independently in read-only
 * SQL on 2026-09-27: the same Broadie baseline table, bucket edges, unit
 * handling (green in feet, other lies in yards, feet / 3) and holed rule as
 * `analyzeShotsByContext` and `buildYardageCurve`, over the team's completed
 * non-test rounds. The payload below is what that yields, rounded to three
 * decimals the way `getTeamOverview` rounds it. The 175-200 yd curve band sits
 * at exactly -0.200 and is left out: `findDeadZones` needs a deficit ABOVE 0.2.
 */
describe('TeamShotWeaknesses on the demo team', () => {
  const demo = analysis({
    topWeaknesses: [
      { context: 'other_0-25', lie: 'other', distanceRange: '0-25', avgSG: -0.511, shotCount: 19 },
      { context: 'tee_250+', lie: 'tee', distanceRange: '250+', avgSG: -0.505, shotCount: 641 },
      { context: 'fairway_175-200', lie: 'fairway', distanceRange: '175-200', avgSG: -0.337, shotCount: 46 },
      { context: 'green_3-5', lie: 'green', distanceRange: '3-5', avgSG: -0.303, shotCount: 106 },
      { context: 'rough_200-225', lie: 'rough', distanceRange: '200-225', avgSG: -0.245, shotCount: 18 },
    ],
    deadZones: [
      { rangeStart: 50, rangeEnd: 75, deficit: 0.321 },
      { rangeStart: 75, rangeEnd: 100, deficit: 0.274 },
      { rangeStart: 200, rangeEnd: 225, deficit: 0.259 },
      { rangeStart: 275, rangeEnd: 300, deficit: 0.492 },
    ],
  });

  it('lists the five situations worst first, each with its lie, count and SG total', () => {
    const { container } = render(<TeamShotWeaknesses data={demo} />);
    const rows = Array.from(container.querySelectorAll('ol > li')).map((li) => li.textContent ?? '');
    expect(rows).toHaveLength(5);
    expect(rows[0]).toMatch(/^10–25 ydOther lie\* \(measured against the fairway baseline\) · 19 shots−0\.51SG\/shot−9\.7 SG total$/);
    expect(rows[1]).toMatch(/^2250\+ ydFrom the tee · 641 shots−0\.5\dSG\/shot−323\.7 SG total$/);
    expect(rows[2]).toMatch(/^3175–200 ydFrom the fairway · 46 shots−0\.34SG\/shot−15\.5 SG total$/);
    expect(rows[3]).toMatch(/^43–5 ftPutts · 106 putts−0\.30SG\/shot−32\.1 SG total$/);
    expect(rows[4]).toMatch(/^5200–225 ydFrom the rough · 18 shots−0\.2\dSG\/shot−4\.4 SG total$/);
  });

  it('lists the dead zones worst first, the open-ended last band included', () => {
    render(<TeamShotWeaknesses data={demo} />);
    const bands = screen.getAllByText(/ yd$/, { selector: 'ul span' }).map((el) => el.textContent);
    expect(bands).toEqual(['275+ yd', '50–75 yd', '75–100 yd', '200–225 yd']);
  });
});
