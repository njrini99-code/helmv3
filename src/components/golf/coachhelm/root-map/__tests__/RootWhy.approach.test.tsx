// @vitest-environment jsdom
/**
 * RootWhy on an approach branch: the gated length → par → shape evidence
 * renders (compass as an SVG image with a spoken label, the par × length
 * grid with the chosen slice, the three ranges), and each piece is omitted
 * when its gate did not pass.
 */
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ApproachWhyView } from '@/lib/coachhelm/root-map/approach-context';
import type { BranchDetail, RootMapModel } from '@/lib/coachhelm/root-map/build-root-map';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('view=root&insight=far'),
}));
vi.mock('@/app/golf/actions/development', () => ({ createFocusAreaFromInsightV2: vi.fn() }));
vi.mock('@/components/fairway/pages/coachhelm/FocusAreaModal', () => ({ FocusAreaModal: () => null }));

import { RootWhy } from '../RootWhy';

const model: RootMapModel = {
  scale: 1,
  gains: [],
  losses: [],
  netSg: -0.9,
  unsized: [],
  other: [],
  defaultSelectedId: null,
  newCount: 0,
};

const detail: BranchDetail = {
  id: 'far',
  title: 'Greens from 175+',
  content: 'c',
  metricLabel: 'Greens hit from 175+ yds',
  unit: 'percent',
  yourValue: 45,
  yourDisplay: '45%',
  comparisonValue: 60,
  comparisonLabel: 'Tour',
  secondaryValue: null,
  secondaryLabel: null,
  sampleN: 75,
  windowStart: null,
  windowEnd: null,
  confidence: 0.8,
  tier: 'solid',
  style: 'likely',
  causality: 'inferred_hypothesis',
  symptom: null,
  rootCause: 'The record does not say why.',
  recommendedAction: null,
  confidenceReason: null,
  driver: null,
  sequence: null,
  strokes: null,
  projection: null,
};

function view(over: Partial<ApproachWhyView> = {}): ApproachWhyView {
  return {
    band: '175_plus_ft',
    bandLabel: '175+ yd',
    rounds: 18,
    narrowing: {
      path: ['175+ yd', 'par 4s', 'short-right'],
      sentence: 's',
      stoppedAt: null,
      excluded: { layup: 49 },
      steps: [
        { level: 'length', passed: true, label: '175+ yd', statement: '34 of 75 approaches from 175+ yd missed the green (18 rounds)' },
        { level: 'par', passed: true, label: 'par 4s', statement: 'on par 4s 13 of 18 missed the green (72%), vs 21 of 57 elsewhere (37%)' },
        { level: 'shape', passed: true, label: 'short-right', statement: 'most misses on par 4s finish short-right (8 of 10 short, 7 of 11 right; 13 of 13 with a recorded direction)' },
      ],
    },
    grid: {
      cells: [
        { id: 'par3_long', par: 3, length: 'long', attempts: 22, misses: 12 },
        { id: 'par4_long', par: 4, length: 'long', attempts: 11, misses: 9 },
      ],
      selectedId: 'par4',
      selectedLabel: 'par 4s',
    },
    compass: {
      population: 'par 4s from 175+ yd',
      misses: 13,
      covered: 13,
      quadrants: { short_left: 1, short: 2, short_right: 5, left: 2, right: 1, long_left: 1, long: 0, long_right: 1 },
      short: 8,
      long: 2,
      left: 4,
      right: 7,
      shape: 'short-right',
    },
    metrics: [
      { band: '50_125ft', label: '50–125 yd', greensPct: 73, greensHit: 63, attempts: 86, proximityFt: 24, severePct: 2, supported: true },
      { band: '175_plus_ft', label: '175+ yd', greensPct: 55, greensHit: 41, attempts: 75, proximityFt: 38, severePct: 7, supported: true },
    ],
    strokesLost: 0.57,
    ...over,
  };
}

function renderWhy(v: ApproachWhyView | null) {
  return render(
    <RootWhy
      model={model}
      details={{ far: detail }}
      insights={[{ id: 'far', playerId: 'p1', category: 'approach' }]}
      approachWhy={v ? { far: v } : null}
    />,
  );
}

describe('RootWhy — approach context', () => {
  it('renders the path, the counted steps, the compass image, the grid and the ranges', () => {
    renderWhy(view());
    expect(screen.getByText('175+ yd → par 4s → short-right')).toBeTruthy();
    expect(screen.getByText(/On par 4s 13 of 18 missed the green/)).toBeTruthy();
    expect(screen.getByText(/strokes a round\s+lost from 175\+ yd/)).toBeTruthy();
    const compass = screen.getByRole('img', { name: /Where 13 recorded misses finished, par 4s from 175\+ yd/ });
    expect(compass.getAttribute('aria-label')).toMatch(/short right 5/);
    expect(compass.getAttribute('aria-label')).toMatch(/Most finish short-right/);
    const grid = screen.getByRole('table', { name: /by par and hole length; misses concentrate on par 4s/ });
    expect(within(grid).getByText('9/11')).toBeTruthy();
    const ranges = screen.getByRole('table', { name: /Approach results by distance range, last 18 rounds/ });
    expect(within(ranges).getByText('175+ yd').closest('tr')?.getAttribute('aria-current')).toBe('true');
    expect(screen.getByText(/this is where the misses gather, not what causes them/)).toBeTruthy();
  });

  it('omits the compass and grid when their gates did not pass, and states the stop', () => {
    renderWhy(
      view({
        compass: null,
        grid: null,
        strokesLost: null,
        narrowing: {
          path: [],
          sentence: 's',
          stoppedAt: 'length',
          excluded: {},
          steps: [{ level: 'length', passed: false, label: null, statement: '3 of 7 approaches from 175+ yd missed the green (1 round): too few to narrow' }],
        },
      }),
    );
    expect(screen.queryByRole('img', { name: /recorded misses finished/ })).toBeNull();
    expect(screen.queryByRole('table', { name: /hole length/ })).toBeNull();
    expect(screen.getByText(/Not narrowed further: 3 of 7 approaches/)).toBeTruthy();
  });

  it('non-approach branches get no approach section', () => {
    renderWhy(null);
    expect(screen.queryByText('Where it concentrates')).toBeNull();
  });
});
