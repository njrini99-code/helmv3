// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type {
  ApproachMiss,
  ChipLie,
  ChipShot,
  IntelRound,
  IntelTourRefs,
  PuttShot,
  TeamIntelligenceData,
} from '@/lib/golf/team-intelligence/types';
import { NO_REFS, PGA_REFS } from '@/lib/golf/team-intelligence/__tests__/fixtures';
import { ChipCause } from '../ChipCause';

const SG: IntelRound['sg'] = { tee: null, app: null, atg: null, putt: null };
const ALLOWED: ReadonlySet<number> = new Set([0, 1]);

function data(chips: ChipShot[] = [], refs: IntelTourRefs = PGA_REFS, putts: PuttShot[] = []): TeamIntelligenceData {
  return {
    teamId: 'team-1',
    baselineLabel: 'PGA Tour',
    tourLabel: 'PGA Tour',
    refs,
    today: '2026-09-28',
    players: [
      { id: 'p1', name: 'Ava Lee', avatarUrl: null },
      { id: 'p2', name: 'Ben Cho', avatarUrl: null },
    ],
    rounds: [
      { id: 'r0', playerId: 'p1', date: '2026-09-01', type: 'practice', sg: SG },
      { id: 'r1', playerId: 'p2', date: '2026-09-02', type: 'tournament', sg: SG },
    ],
    tee: [],
    approach: [],
    chips,
    putts,
  };
}

function chip(
  ri: number,
  fromYards: number,
  lie: ChipLie,
  leaveFeet: number | null,
  saved: boolean,
  miss: ApproachMiss | null = null,
): ChipShot {
  return { ri, fromYards, lie, leaveFeet, saved, miss };
}

/**
 * Team, inside 30 yd: 17 chips, 9 saved (53%), avg 12 yd.
 *   Fairway 0–10: 10 chips, 7 saved (70%)   · p1 6 chips, 3 saved (50%)
 *   Rough 10–20:   2 chips, 1 saved (low sample)
 *   Sand 20–30:    5 chips, 1 saved (20%)
 * PGA scrambling 65 / 58 / 50, weighted by these lies:
 *   (10×65 + 2×58 + 5×50) / 17 = 59.8 → 60%, so 7 pts below.
 * Leaves: 15 on the green, 9 inside 4 ft (60%), median 3 ft; 2 with no leave.
 * p1: 8 chips, 4 saved (50%), 7 leaves, 4 inside 4 ft (57%), 1 with no leave.
 * p2 also has one 40 yd chip, outside the grid.
 */
const CHIPS: ChipShot[] = [
  chip(0, 5, 'fairway', 2, true),
  chip(0, 5, 'fairway', 3, true),
  chip(0, 5, 'fairway', 1, true),
  chip(0, 5, 'fairway', 8, false, 'long'),
  chip(0, 5, 'fairway', 12, false, 'long'),
  chip(0, 5, 'fairway', 6, false, 'short'),
  chip(0, 15, 'rough', 3, true),
  chip(0, 15, 'rough', null, false, 'left'),
  chip(1, 5, 'fairway', 1, true),
  chip(1, 5, 'fairway', 2, true),
  chip(1, 5, 'fairway', 2, true),
  chip(1, 5, 'fairway', 3, true),
  chip(1, 25, 'sand', 3.5, true),
  chip(1, 25, 'sand', 10, false, 'short'),
  chip(1, 25, 'sand', 15, false, 'short'),
  chip(1, 25, 'sand', 25, false, 'short_right'),
  chip(1, 25, 'sand', null, false, 'short'),
  chip(1, 40, 'fairway', 2, true),
];

function figure(container: HTMLElement): string {
  return container.querySelector('[data-figure]')?.textContent ?? '';
}

function headlineRef(container: HTMLElement): string | null {
  return container.querySelector('[data-ref-headline]')?.textContent ?? null;
}

function refLines(container: HTMLElement): string[] {
  return [...container.querySelectorAll('[data-ref-line]')].map((el) => el.getAttribute('data-ref-line') ?? '');
}

function dotsIn(container: HTMLElement) {
  return [...container.querySelectorAll('circle[data-ft]')].map((el) => ({
    ft: Number(el.getAttribute('data-ft')),
    cx: Number(el.getAttribute('cx')),
    cy: Number(el.getAttribute('cy')),
    r: Number(el.getAttribute('r')),
  }));
}

/** Packing never stacks one dot on another. */
function expectNoOverlap(dots: readonly { cx: number; cy: number; r: number }[]) {
  for (let a = 0; a < dots.length; a += 1) {
    for (let b = a + 1; b < dots.length; b += 1) {
      const p = dots[a]!;
      const q = dots[b]!;
      expect(Math.hypot(p.cx - q.cx, p.cy - q.cy)).toBeGreaterThanOrEqual(p.r + q.r - 1e-6);
    }
  }
}

function grid(): HTMLElement {
  return screen.getByRole('group', { name: 'Up and down by lie and distance' });
}

function expectClean(container: HTMLElement) {
  expect(container.innerHTML).not.toMatch(/NaN|undefined|Infinity/);
  // No em dashes in copy.
  expect(container.textContent ?? '').not.toContain('—');
}

describe('ChipCause', () => {
  it('reads the whole team against tour scrambling from the same lies', () => {
    const { container } = render(<ChipCause data={data(CHIPS)} allowed={ALLOWED} playerId={null} playerName={null} />);
    expect(figure(container)).toBe('53%');
    expect(screen.getByText('Whole team · 17 chips · avg 12 yd')).toBeTruthy();
    // Lie-weighted tour expectation: 60%, so 53% is 7 pts below.
    expect(screen.getByText('7 pts below tour')).toBeTruthy();
    expect(headlineRef(container)).toBe('PGA Tour 60% from these lies');

    expect(
      screen.getByRole('button', { name: /^Fairway, 0–10 yd: 70% up and down, 10 chips, PGA Tour scrambling 65%$/ }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: /^Sand, 20–30 yd: 20% up and down, 5 chips, PGA Tour scrambling 50%$/ }),
    ).toBeTruthy();
    const rough = screen.getByRole('button', {
      name: /^Rough, 10–20 yd: 50% up and down, 2 chips, low sample, PGA Tour scrambling 58%$/,
    });
    // Judged against the lie's tour figure; a low sample is shown, not judged.
    expect(screen.getByRole('button', { name: /^Fairway, 0–10 yd/ }).getAttribute('data-judgement')).toBe('gain');
    expect(screen.getByRole('button', { name: /^Sand, 20–30 yd/ }).getAttribute('data-judgement')).toBe('lossStrong');
    expect(rough.getAttribute('data-judgement')).toBe('unjudged');
    // One dashed tour line per cell with chips, at that lie's tour figure.
    expect(refLines(container)).toEqual(['65', '58', '50']);
    expect(within(grid()).getAllByText('low sample')).toHaveLength(1);
    expect(within(grid()).getAllByText('no chips')).toHaveLength(6);
    // Each cell with chips has one gauge holding its fill and reference line and
    // no text, so a line never crosses a figure; an empty cell has no gauge.
    const gauges = [...grid().querySelectorAll('[data-gauge]')];
    expect(gauges).toHaveLength(3);
    expect(gauges.map((g) => g.querySelector('[data-fill]')?.getAttribute('data-fill'))).toEqual(['70', '50', '20']);
    for (const g of gauges) expect(g.textContent).toBe('');
    expect([...container.querySelectorAll('[data-ref-line]')].every((el) => el.closest('[data-gauge]'))).toBe(true);
    expect(within(grid()).getByText('70%').closest('[data-gauge]')).toBeNull();

    // Row labels: chips and average distance per lie, and the tour figure.
    const fairwayRow = screen.getByRole('button', { name: 'Fairway, all distances' });
    expect(within(fairwayRow).getByText('10 chips · avg 5 yd')).toBeTruthy();
    expect(within(fairwayRow).getByText('PGA Tour 65%')).toBeTruthy();
    expect(within(screen.getByRole('button', { name: 'Sand, all distances' })).getByText('5 chips · avg 25 yd')).toBeTruthy();

    expect(
      screen.getByText(
        'Dashed line: PGA Tour scrambling from that lie, any distance. Tour counts par saves: close to, not the same as, up and down.',
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "2 chips with no measured leave count toward up and down but aren't plotted. 1 chip from 30 yd or more is outside this card.",
      ),
    ).toBeTruthy();
    expect(screen.getByText('Misses mostly short · 63% of 8 tagged')).toBeTruthy();
    // The sand chip's 3.5 ft leave is not a whole foot, so the note says what is layout without it.
    expect(
      screen.getByText('Dots sit near their measured leave, never across the 4 ft line; exact spot and height are layout only.'),
    ).toBeTruthy();
    expectClean(container);
  });

  it('a cell tap filters the headline and the tour comparison follows the lie', () => {
    const { container } = render(<ChipCause data={data(CHIPS)} allowed={ALLOWED} playerId={null} playerName={null} />);
    const sand = screen.getByRole('button', { name: /^Sand, 20–30 yd/ });
    expect(sand.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(sand);
    expect(figure(container)).toBe('20%');
    expect(sand.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('Whole team · 5 chips · 20–30 yd · sand')).toBeTruthy();
    expect(screen.getByText('30 pts below tour')).toBeTruthy();
    expect(headlineRef(container)).toBe('PGA Tour 50% from these lies');
    fireEvent.click(sand);
    expect(figure(container)).toBe('53%');
    expect(sand.getAttribute('aria-pressed')).toBe('false');
  });

  it('rows and columns filter one axis each; empty cells ignore taps', () => {
    const { container } = render(<ChipCause data={data(CHIPS)} allowed={ALLOWED} playerId={null} playerName={null} />);
    const fairwayRow = screen.getByRole('button', { name: 'Fairway, all distances' });
    fireEvent.click(fairwayRow);
    expect(fairwayRow.getAttribute('aria-pressed')).toBe('true');
    expect(figure(container)).toBe('70%');
    expect(screen.getByText('Whole team · 10 chips · fairway · avg 5 yd')).toBeTruthy();
    expect(screen.getByText('5 pts above tour')).toBeTruthy();
    fireEvent.click(fairwayRow);
    const farColumn = screen.getByRole('button', { name: '20–30 yd, all lies' });
    fireEvent.click(farColumn);
    expect(figure(container)).toBe('20%');
    fireEvent.click(farColumn);

    const empty = screen.getByRole('button', { name: 'Fairway, 20–30 yd: no chips' });
    expect(empty.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(empty);
    expect(empty.getAttribute('aria-pressed')).toBe('false');
    expect(figure(container)).toBe('53%');
  });

  it('a row and a column that share no chips show no figure, only "No chips"', () => {
    const { container } = render(<ChipCause data={data(CHIPS)} allowed={ALLOWED} playerId={null} playerName={null} />);
    fireEvent.click(screen.getByRole('button', { name: '20–30 yd, all lies' }));
    fireEvent.click(screen.getByRole('button', { name: 'Fairway, all distances' }));
    expect(container.querySelector('[data-figure]')).toBeNull();
    expect(screen.queryByText('up and down')).toBeNull();
    expect(screen.getByText('No chips')).toBeTruthy();
    expect(headlineRef(container)).toBeNull();
    expect(screen.getByText('No chips match this filter.')).toBeTruthy();
    expectClean(container);
    // The same in a player view (Ava Lee has fairway and rough chips, none shared).
    const player = render(<ChipCause data={data(CHIPS)} allowed={ALLOWED} playerId="p1" playerName="Ava Lee" />);
    const view = within(player.container);
    fireEvent.click(view.getByRole('button', { name: '10–20 yd, all lies' }));
    fireEvent.click(view.getByRole('button', { name: 'Fairway, all distances' }));
    expect(player.container.querySelector('[data-figure]')).toBeNull();
    expect(view.getByText('No chips')).toBeTruthy();
    expect(headlineRef(player.container)).toBeNull();
    expectClean(player.container);
  });

  it('a lie with no tour figure leaves the tour comparison, and says so', () => {
    const noSand: IntelTourRefs = { ...PGA_REFS, scrambling: { fairway: 65, rough: 58, sand: null } };
    const { container } = render(<ChipCause data={data(CHIPS, noSand)} allowed={ALLOWED} playerId={null} playerName={null} />);
    expect(figure(container)).toBe('53%');
    // Fairway + rough only: 8 of 12 saved (67%) against (10×65 + 2×58) / 12 = 64%.
    expect(screen.getByText('3 pts above tour')).toBeTruthy();
    expect(headlineRef(container)).toBe('Fairway and rough 67% vs PGA Tour 64%');
    expect(refLines(container)).toEqual(['65', '58']);
    expect(screen.getByRole('button', { name: /^Sand, 20–30 yd: 20% up and down, 5 chips$/ }).getAttribute('data-judgement')).toBe(
      'unjudged',
    );
    expect(within(screen.getByRole('button', { name: 'Sand, all distances' })).queryByText(/PGA Tour/)).toBeNull();
    expect(screen.getByText(/No PGA Tour sand figure, so sand chips have no tour comparison\.$/)).toBeTruthy();
    expectClean(container);
  });

  it('without tour figures there is no tour comparison', () => {
    const { container } = render(<ChipCause data={data(CHIPS, NO_REFS)} allowed={ALLOWED} playerId={null} playerName={null} />);
    expect(figure(container)).toBe('53%');
    expect(screen.queryByText(/pts? (below|above)/)).toBeNull();
    expect(headlineRef(container)).toBeNull();
    expect(refLines(container)).toEqual([]);
    expect(screen.getByText('No PGA Tour scrambling figure for these lies, so there is no tour comparison.')).toBeTruthy();
    const judged = [...container.querySelectorAll('[data-judgement]')].map((el) => el.getAttribute('data-judgement'));
    expect(judged).toEqual(['unjudged', 'unjudged', 'unjudged']);
    expectClean(container);
  });

  it('reads a player against the whole team, cell by cell', () => {
    const { container } = render(<ChipCause data={data(CHIPS)} allowed={ALLOWED} playerId="p1" playerName="Ava Lee" />);
    expect(figure(container)).toBe('50%');
    expect(screen.getByText('3 pts below team')).toBeTruthy();
    expect(headlineRef(container)).toBe('Whole team 53%');
    // A player is never read against the tour.
    expect(screen.queryByText(/PGA Tour/)).toBeNull();
    expect(screen.getByText('Dashed line: the whole team from the same lie and distance.')).toBeTruthy();
    // Team rate in the same cell: fairway 0–10 70%, rough 10–20 50%; Ava has no sand chips.
    expect(refLines(container)).toEqual(['70', '50']);
    expect(screen.getByText('57% of 7 inside 4 ft · team 60%')).toBeTruthy();
    expect(
      screen.getByText("1 chip with no measured leave counts toward up and down but isn't plotted."),
    ).toBeTruthy();
    // The leave bars carry the whole team's rate as a tick.
    expect(container.querySelectorAll('[data-team-tick]').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: /^Fairway, 0–10 yd/ }));
    expect(figure(container)).toBe('50%');
    expect(screen.getByText('20 pts below team')).toBeTruthy();
    expect(headlineRef(container)).toBe('Whole team 70%');
    expect(screen.getByRole('img', { name: /First-chip leaves: 6 chips on the green, median 4\.5 ft/ })).toBeTruthy();
    expectClean(container);
  });

  it('what the leave was worth: up and down by first-chip leave, each band up to the next', () => {
    // 20 fairway chips from 5 yd, one leave band at a time, plus one with no leave.
    const leaves: [number, boolean][] = [
      [0, true], [1, true], [2, true], [3, true], [3, true], // inside 4 ft: 5 of 5
      [4, true], [4, true], [5, true], [7, false], [7, false], // 4–8 ft: 3 of 5
      [8, true], [10, false], [12, false], [14, false], [14, false], // 8–15 ft: 1 of 5
      [15, false], [25, true], [29, false], [30, true], [31, false], // 15+ ft: 2 of 5
    ];
    const chips = [...leaves.map(([ft, saved]) => chip(0, 5, 'fairway', ft, saved)), chip(0, 5, 'fairway', null, false)];
    const { container } = render(<ChipCause data={data(chips)} allowed={ALLOWED} playerId={null} playerName={null} />);
    const bands = [...container.querySelectorAll('[data-leave-band]')];
    expect(bands.map((el) => el.getAttribute('data-leave-band'))).toEqual(['in4', '4', '8', '15']);
    expect(bands.map((el) => el.getAttribute('data-n'))).toEqual(['5', '5', '5', '5']);
    expect(bands.map((el) => within(el as HTMLElement).getByText(/^\d+%$/).textContent)).toEqual([
      '100%',
      '60%',
      '20%',
      '40%',
    ]);
    // Same convention as the grid's yard bands: 8 ft is in 8–15 ft, 15 ft in 15+.
    expect(within(bands[1] as HTMLElement).getByText('4–8 ft')).toBeTruthy();
    expect(within(bands[2] as HTMLElement).getByText('8–15 ft')).toBeTruthy();
    expect(screen.getByText('1 chip with no measured leave counts toward up and down but isn\'t plotted.')).toBeTruthy();
    expectClean(container);
  });

  it('draws every dot inside its logged foot, on its side of the make zone, 30+ in its own lane', () => {
    const leaves = [0, 1, 3, 3, 3, 4, 4, 4, 6, 8, 8, 10, 15, 29, 30, 31, 45];
    const chips = leaves.map((ft, i) => chip(i % 2, 5, 'fairway', ft, i % 3 !== 0));
    const { container } = render(<ChipCause data={data(chips)} allowed={ALLOWED} playerId={null} playerName={null} />);
    const svg = screen.getByRole('img', { name: /^First-chip leaves: 17 chips on the green/ });
    expect(svg.getAttribute('aria-label')).toContain('3 at 30 ft or more.');
    const x0 = Number(svg.getAttribute('data-x0'));
    const ppf = Number(svg.getAttribute('data-px-per-ft'));
    const zone = container.querySelector('[data-make-zone]')!;
    const zoneR = Number(zone.getAttribute('x')) + Number(zone.getAttribute('width'));
    // Whole-foot leaves: the zone edge sits between logged 3 ft and 4 ft.
    expect(zoneR).toBeCloseTo(x0 + 3.5 * ppf, 6);
    const lane = container.querySelector('[data-lane]')!;
    const laneL = Number(lane.getAttribute('x'));
    const laneR = laneL + Number(lane.getAttribute('width'));
    const dots = dotsIn(container);
    expect(dots).toHaveLength(leaves.length);
    const eps = 1e-6;
    for (const d of dots) {
      if (d.ft >= 30) {
        expect(d.cx - d.r).toBeGreaterThanOrEqual(laneL - eps);
        expect(d.cx + d.r).toBeLessThanOrEqual(laneR + eps);
        continue;
      }
      // Inside its logged foot (±0.4 ft), never left of 0 ft.
      expect(Math.abs(d.cx - (x0 + d.ft * ppf))).toBeLessThanOrEqual(0.4 * ppf + eps);
      expect(d.cx).toBeGreaterThanOrEqual(x0 - eps);
      // Inside 4 ft sits in the make zone; 4 ft and longer sit outside it.
      if (d.ft < 4) expect(d.cx + d.r).toBeLessThanOrEqual(zoneR + eps);
      else expect(d.cx - d.r).toBeGreaterThanOrEqual(zoneR - eps);
    }
    expectNoOverlap(dots);
    expect(screen.getByText('30+ ft')).toBeTruthy();
    // Median of the 17 logged leaves (the ninth): 6 ft.
    expect(container.querySelector('[data-median]')?.getAttribute('data-median')).toBe('6');
    // Where a dot sits inside the 30+ lane is packing too, and the note says so.
    expect(
      screen.getByText(
        'Leaves are logged to the foot; spread within a foot, place in the 30+ lane and height are layout only.',
      ),
    ).toBeTruthy();
    expectClean(container);
  });

  it('keeps a fractional leave near its exact value, on its side of a 4 ft zone edge', () => {
    const leaves = [0.5, 2.25, 3.8, 3.95, 4, 4.1, 7.5, 12.25, 29.9, 31.5];
    const chips = leaves.map((ft, i) => chip(i % 2, 5, 'fairway', ft, i % 3 !== 0));
    const { container } = render(<ChipCause data={data(chips)} allowed={ALLOWED} playerId={null} playerName={null} />);
    const svg = screen.getByRole('img', { name: /^First-chip leaves: 10 chips on the green/ });
    const x0 = Number(svg.getAttribute('data-x0'));
    const ppf = Number(svg.getAttribute('data-px-per-ft'));
    const zone = container.querySelector('[data-make-zone]')!;
    const zoneR = Number(zone.getAttribute('x')) + Number(zone.getAttribute('width'));
    // Not every leave is a whole foot, so the edge is drawn at 4 ft itself.
    expect(zoneR).toBeCloseTo(x0 + 4 * ppf, 6);
    const dots = dotsIn(container);
    expect(dots).toHaveLength(leaves.length);
    const eps = 1e-6;
    for (const d of dots) {
      if (d.ft >= 30) continue;
      // Within the spread of its exact value (or a dot's own half-width at the edge).
      const halfGap = Math.max(0.6, d.r * 0.3) / 2;
      expect(Math.abs(d.cx - (x0 + d.ft * ppf))).toBeLessThanOrEqual(Math.max(0.4 * ppf, d.r + halfGap) + eps);
      if (d.ft < 4) expect(d.cx + d.r).toBeLessThanOrEqual(zoneR + eps);
      else expect(d.cx - d.r).toBeGreaterThanOrEqual(zoneR - eps);
    }
    expectNoOverlap(dots);
    expect(
      screen.getByText(
        'Dots sit near their measured leave, never across the 4 ft line; exact spot, place in the 30+ lane and height are layout only.',
      ),
    ).toBeTruthy();
    expectClean(container);
  });

  it('says so when no chip finished on the green', () => {
    const offGreen = [0, 1, 2, 3, 4].map(() => chip(0, 8, 'rough', null, false));
    const { container } = render(<ChipCause data={data(offGreen)} allowed={ALLOWED} playerId={null} playerName={null} />);
    expect(figure(container)).toBe('0%');
    expect(screen.getByText('None of these chips finished on the green.')).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
    expect(container.querySelector('[data-leave-band]')).toBeNull();
    expectClean(container);
  });

  it('shows the empty state with no chips in the slice', () => {
    const { container } = render(<ChipCause data={data([])} allowed={ALLOWED} playerId={null} playerName={null} />);
    expect(screen.getByText('No chips in this slice')).toBeTruthy();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expectClean(container);
  });
});
