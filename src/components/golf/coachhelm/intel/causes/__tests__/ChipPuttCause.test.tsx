// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type {
  ApproachMiss,
  ChipLie,
  ChipShot,
  IntelRound,
  PuttShot,
  TeamIntelligenceData,
} from '@/lib/golf/team-intelligence/types';
import { ChipCause } from '../ChipCause';
import { PuttCause } from '../PuttCause';

const SG: IntelRound['sg'] = { tee: null, app: null, atg: null, putt: null };
const ALLOWED: ReadonlySet<number> = new Set([0, 1]);

function data(chips: ChipShot[] = [], putts: PuttShot[] = []): TeamIntelligenceData {
  return {
    teamId: 'team-1',
    baselineLabel: 'PGA Tour',
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

function putt(ri: number, feet: number, made: boolean, extra: Partial<PuttShot> = {}): PuttShot {
  return {
    ri,
    feet,
    made,
    first: false,
    threePutt: false,
    brk: null,
    slope: null,
    side: null,
    depth: null,
    leaveFeet: null,
    ...extra,
  };
}

/**
 * Team, inside 30 yd: 17 chips, 9 saved (53%).
 *   Fairway 0–10: 10 chips, 7 saved (70%)   · p1 6 chips, 3 saved (50%)
 *   Rough 10–20:   2 chips, 1 saved (low sample)
 *   Sand 20–30:    5 chips, 1 saved (20%)
 * p1: 8 chips, 4 saved (50%), 7 leaves, 4 inside 4 ft (57%), 1 off the green.
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

/**
 * 23 putts, 12 made (52%). 10 first putts from 25 ft, 1 made, 2 three-putts
 * (3-putt 20%). 3–5 ft: five second putts, 4 made (80%), no first putts.
 * 2 ft: eight tap-ins, 7 made, no break / slope tag.
 * Tagged misses: sided 7 (low 5 = 71%), depthed 6 (short 4 = 67%).
 * Placed 8; untagged 2; tagged without a leave 1.
 */
const PUTTS: PuttShot[] = [
  putt(0, 25, true, { first: true, brk: 'lr', slope: 'up' }),
  putt(0, 25, false, { first: true, brk: 'rl', slope: 'down', side: 'low', depth: 'short', leaveFeet: 3 }),
  putt(0, 25, false, { first: true, brk: 'rl', slope: 'down', side: 'low', leaveFeet: 2 }),
  putt(0, 25, false, { first: true, brk: 'rl', slope: 'down', depth: 'short', leaveFeet: 4 }),
  putt(0, 25, false, {
    first: true,
    threePutt: true,
    brk: 'rl',
    slope: 'down',
    side: 'high',
    depth: 'long',
    leaveFeet: 6,
  }),
  putt(0, 25, false, { first: true, brk: 'rl', slope: 'down', side: 'low', depth: 'short', leaveFeet: 2.5 }),
  putt(0, 25, false, { first: true, brk: 'lr', slope: 'up', depth: 'short', leaveFeet: 1.5 }),
  putt(0, 25, false, { first: true, threePutt: true, brk: 'lr', slope: 'up', side: 'low', leaveFeet: 5 }),
  putt(0, 25, false, { first: true, brk: 'lr', slope: 'up', leaveFeet: 3 }),
  putt(0, 25, false, { first: true, brk: 'lr', slope: 'up', side: 'low' }),
  putt(0, 4, true, { brk: 'st', slope: 'level' }),
  putt(0, 4, true, { brk: 'st', slope: 'level' }),
  putt(0, 4, true, { brk: 'st', slope: 'level' }),
  putt(0, 4, true, { brk: 'st', slope: 'level' }),
  putt(0, 4, false, { brk: 'st', slope: 'level', side: 'high', depth: 'long', leaveFeet: 1 }),
  ...Array.from({ length: 7 }, () => putt(0, 2, true)),
  putt(0, 2, false, { leaveFeet: 1 }),
];

function figure(container: HTMLElement): string {
  return container.querySelector('[data-figure]')?.textContent ?? '';
}

function expectClean(container: HTMLElement) {
  expect(container.innerHTML).not.toMatch(/NaN|undefined|Infinity/);
}

describe('ChipCause', () => {
  it('reads the whole team: up-and-down %, low-sample and empty cells, the out-of-range footnote', () => {
    const { container } = render(<ChipCause data={data(CHIPS)} allowed={ALLOWED} playerId={null} playerName={null} />);
    expect(figure(container)).toBe('53%');
    expect(screen.getByText('Whole team · 17 chips')).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Fairway, 0–10 yd: 70% up and down, 10 chips/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Sand, 20–30 yd: 20% up and down, 5 chips/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Rough, 10–20 yd: 50% up and down, 2 chips, low sample/ })).toBeTruthy();
    expect(screen.getAllByText('low sample')).toHaveLength(1);
    expect(screen.getAllByText('no chips')).toHaveLength(6);
    // Team slice: no comparison pill, and the reference is the team's own rate.
    expect(screen.queryByText(/pts? (below|above) team/)).toBeNull();
    expect(screen.getByText("The tick is the team's overall rate, 53%.")).toBeTruthy();
    expect(screen.getByText('1 chip from 30 yd or more is left out of this card.')).toBeTruthy();
    expect(screen.getByText('Misses mostly short · 63% of 8 tagged')).toBeTruthy();
    expectClean(container);
  });

  it('a cell tap filters the headline and a second tap clears it', () => {
    const { container } = render(<ChipCause data={data(CHIPS)} allowed={ALLOWED} playerId={null} playerName={null} />);
    const sand = screen.getByRole('button', { name: /^Sand, 20–30 yd/ });
    expect(sand.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(sand);
    expect(figure(container)).toBe('20%');
    expect(sand.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('Whole team · 5 chips · 20–30 yd · sand')).toBeTruthy();
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

  it('reads a player against the whole team, cell by cell', () => {
    const { container } = render(<ChipCause data={data(CHIPS)} allowed={ALLOWED} playerId="p1" playerName="Ava Lee" />);
    expect(figure(container)).toBe('50%');
    expect(screen.getByText('3 pts below team')).toBeTruthy();
    expect(screen.getByText('57% of 7 inside 4 ft · team 60%')).toBeTruthy();
    expect(
      screen.getByText("1 chip that finished off the green counts toward up and down but isn't plotted."),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Fairway, 0–10 yd/ }));
    expect(figure(container)).toBe('50%');
    expect(screen.getByText('20 pts below team')).toBeTruthy();
    expect(screen.getByRole('img', { name: /First-chip leaves: 6 chips on the green, median 4\.5 ft/ })).toBeTruthy();
    expectClean(container);
  });

  it('says so when no chip finished on the green', () => {
    const offGreen = [0, 1, 2, 3, 4].map(() => chip(0, 8, 'rough', null, false));
    const { container } = render(<ChipCause data={data(offGreen)} allowed={ALLOWED} playerId={null} playerName={null} />);
    expect(figure(container)).toBe('0%');
    expect(screen.getByText('None of these chips finished on the green.')).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
    expectClean(container);
  });

  it('shows the empty state with no chips in the slice', () => {
    const { container } = render(<ChipCause data={data([])} allowed={ALLOWED} playerId={null} playerName={null} />);
    expect(screen.getByText('No chips in this slice')).toBeTruthy();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expectClean(container);
  });
});

describe('PuttCause', () => {
  it('reads make % and the 3-putt rate on first putts', () => {
    const { container } = render(<PuttCause data={data([], PUTTS)} allowed={ALLOWED} playerId={null} playerName={null} />);
    expect(figure(container)).toBe('52%');
    expect(screen.getByText('3-putt 20%')).toBeTruthy();
    expect(screen.queryByText(/Low sample/)).toBeNull();
    expect(screen.getByText('All includes 8 putts inside 3 ft.')).toBeTruthy();
    expect(screen.getByRole('button', { name: /^All lengths: 52% made, 23 putts/ }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expectClean(container);
  });

  it('the band picker changes the make %', () => {
    const { container } = render(<PuttCause data={data([], PUTTS)} allowed={ALLOWED} playerId={null} playerName={null} />);
    const far = screen.getByRole('button', { name: /^20–30 ft: 10% made, 10 putts/ });
    fireEvent.click(far);
    expect(far.getAttribute('aria-pressed')).toBe('true');
    expect(figure(container)).toBe('10%');
    expect(screen.getByText('3-putt 20%')).toBeTruthy();

    const short = screen.getByRole('button', { name: /^3–5 ft: 80% made, 5 putts/ });
    fireEvent.click(short);
    expect(figure(container)).toBe('80%');
    expect(screen.getByText('No first putts')).toBeTruthy();
    expect(screen.getByText('Low sample · 5 putts')).toBeTruthy();

    const empty = screen.getByRole('button', { name: '5–10 ft: no putts' });
    expect(empty.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(empty);
    expect(figure(container)).toBe('80%');
    expectClean(container);
  });

  it('places tagged misses by measured leave and counts the rest', () => {
    const { container } = render(<PuttCause data={data([], PUTTS)} allowed={ALLOWED} playerId={null} playerName={null} />);
    const green = screen.getByRole('img', { name: /Missed putts around the hole: 8 placed/ });
    expect(green.getAttribute('aria-label')).toMatch(/71% of tagged misses finish on the low side/);
    expect(green.getAttribute('aria-label')).toMatch(/2 led to a 3-putt/);
    expect(green.querySelectorAll('circle[r="3.25"]')).toHaveLength(8);
    for (const label of ['1 ft', '2 ft', '3 ft', '4+ ft', 'Low side', 'High side', 'Long', 'Short']) {
      expect(green.textContent).toContain(label);
    }
    expect(
      screen.getByText(
        "Leave is measured (the next putt's length); direction is the tagged side. Not placed: 2 untagged misses and 1 with no leave recorded.",
      ),
    ).toBeTruthy();
    expect(screen.getByText('5 of 7 tagged')).toBeTruthy();
    expect(screen.getByText('4 of 6 tagged')).toBeTruthy();
    expectClean(container);
  });

  it('a break × slope cell filters the read, with low-sample cells marked', () => {
    const { container } = render(<PuttCause data={data([], PUTTS)} allowed={ALLOWED} playerId={null} playerName={null} />);
    const cell = screen.getByRole('button', { name: 'Downhill, right to left: 0% made, 5 putts, low sample' });
    expect(screen.getAllByText('low sample')).toHaveLength(3);
    expect(screen.getAllByText('no putts')).toHaveLength(6);
    expect(screen.getByText(/8 putts without a break and slope tag aren't in the grid\./)).toBeTruthy();
    fireEvent.click(cell);
    expect(cell.getAttribute('aria-pressed')).toBe('true');
    expect(figure(container)).toBe('0%');
    expect(screen.getByRole('button', { name: /^20–30 ft: 0% made, 5 putts/ })).toBeTruthy();
    fireEvent.click(cell);
    expect(figure(container)).toBe('52%');
    expectClean(container);
  });

  it('handles a slice where every putt was made', () => {
    const made = [putt(0, 6, true, { first: true }), putt(0, 12, true, { first: true }), putt(0, 3, true)];
    const { container } = render(<PuttCause data={data([], made)} allowed={ALLOWED} playerId={null} playerName={null} />);
    expect(figure(container)).toBe('100%');
    expect(screen.getByText('3-putt 0%')).toBeTruthy();
    expect(screen.getByText('Low sample · 3 putts')).toBeTruthy();
    expect(screen.getAllByText('No tags')).toHaveLength(4);
    expect(screen.getByText('No misses in this slice.')).toBeTruthy();
    expectClean(container);
  });

  it("shows the empty state for a player with no putts", () => {
    const { container } = render(<PuttCause data={data([], PUTTS)} allowed={ALLOWED} playerId="p2" playerName="Ben Cho" />);
    expect(screen.getByText('No putts in this slice')).toBeTruthy();
    expect(screen.getByText('Ben Cho · 0 putts')).toBeTruthy();
    expectClean(container);
  });
});
