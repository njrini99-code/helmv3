// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { IntelRound, IntelTourRefs, PuttShot, TeamIntelligenceData } from '@/lib/golf/team-intelligence/types';
import { NO_REFS, PGA_REFS } from '@/lib/golf/team-intelligence/__tests__/fixtures';
import { PuttCause } from '../PuttCause';

const SG: IntelRound['sg'] = { tee: null, app: null, atg: null, putt: null };
const ALLOWED: ReadonlySet<number> = new Set([0, 1]);

function data(
  putts: PuttShot[],
  opts: { refs?: IntelTourRefs; tourLabel?: TeamIntelligenceData['tourLabel'] } = {},
): TeamIntelligenceData {
  return {
    teamId: 'team-1',
    baselineLabel: 'PGA Tour',
    tourLabel: opts.tourLabel ?? 'PGA Tour',
    refs: opts.refs ?? PGA_REFS,
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
    chips: [],
    putts,
  };
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

const many = (n: number, make: () => PuttShot) => Array.from({ length: n }, make);

/**
 * 23 putts, 12 made (52%). Ten first putts from 25 ft (25+ band, exactly the
 * n = 10 floor): 1 made (10% vs the tour's 5.5, shown 6%, so +4), 2 three-putts
 * (20%). Lag from 25+: 8 measured leaves averaging 3.4 ft, 3 of them under
 * 3 ft, plus the holed one: 4 of 9 known finishes (44%); one miss has no
 * leave. 3–5 ft: five second putts, 4 made (80%, under the floor, hollow).
 * 2 ft: eight tap-ins, 7 made, no break / slope tag (too few for a column).
 * Misses 11, tagged 9, placed 8 at 8 distinct spots; sided 7 (low 5) and
 * depthed 6 (short 4), both under the floor, so no lean is called.
 */
const PUTTS: PuttShot[] = [
  putt(0, 26, true, { first: true, brk: 'lr', slope: 'up' }),
  putt(0, 26, false, { first: true, brk: 'rl', slope: 'down', side: 'low', depth: 'short', leaveFeet: 3 }),
  putt(0, 26, false, { first: true, brk: 'rl', slope: 'down', side: 'low', leaveFeet: 2 }),
  putt(0, 26, false, { first: true, brk: 'rl', slope: 'down', depth: 'short', leaveFeet: 4 }),
  putt(0, 26, false, {
    first: true,
    threePutt: true,
    brk: 'rl',
    slope: 'down',
    side: 'high',
    depth: 'long',
    leaveFeet: 6,
  }),
  putt(0, 26, false, { first: true, brk: 'rl', slope: 'down', side: 'low', depth: 'short', leaveFeet: 2.5 }),
  putt(0, 26, false, { first: true, brk: 'lr', slope: 'up', depth: 'short', leaveFeet: 1.5 }),
  putt(0, 26, false, { first: true, threePutt: true, brk: 'lr', slope: 'up', side: 'low', leaveFeet: 5 }),
  putt(0, 26, false, { first: true, brk: 'lr', slope: 'up', leaveFeet: 3 }),
  putt(0, 26, false, { first: true, brk: 'lr', slope: 'up', side: 'low' }),
  putt(0, 4, true, { brk: 'st', slope: 'level' }),
  putt(0, 4, true, { brk: 'st', slope: 'level' }),
  putt(0, 4, true, { brk: 'st', slope: 'level' }),
  putt(0, 4, true, { brk: 'st', slope: 'level' }),
  putt(0, 4, false, { brk: 'st', slope: 'level', side: 'high', depth: 'long', leaveFeet: 1 }),
  ...many(7, () => putt(0, 2, true)),
  putt(0, 2, false, { leaveFeet: 1 }),
];

/**
 * Team-scale shape, whole feet like the real data: many misses share a spot.
 *   Inside 3 ft: 12 tap-ins, 11 made (92%), a column once it has 10.
 *   6 ft: 20 first putts, 8 made (40% vs 62%: −22). Misses: 10 low at 1 ft,
 *         2 high at 2 ft.
 *   30 ft: 12 first putts, none holed (0% vs 6%: −6). Leaves: 6 short at 4 ft,
 *          3 long at 2 ft, 3 low at 8 ft (each a 3-putt).
 * Placed 24 at 5 spots (10, 6, 3, 3, 2). Sided 15 (low 13 = 87%), so the low
 * side is the lean; depthed 9 stays under the floor.
 * Lag 25+: 12 first putts, avg leave 4.5 ft, 3 of 12 inside 3 ft, 3-putts 25%.
 */
const DENSE: PuttShot[] = [
  ...many(11, () => putt(0, 2, true)),
  putt(0, 2, false, { leaveFeet: 1 }),
  ...many(8, () => putt(0, 6, true, { first: true })),
  ...many(10, () => putt(0, 6, false, { first: true, side: 'low', leaveFeet: 1 })),
  ...many(2, () => putt(0, 6, false, { first: true, side: 'high', leaveFeet: 2 })),
  ...many(6, () => putt(0, 30, false, { first: true, depth: 'short', leaveFeet: 4 })),
  ...many(3, () => putt(0, 30, false, { first: true, depth: 'long', leaveFeet: 2 })),
  ...many(3, () => putt(0, 30, false, { first: true, threePutt: true, side: 'low', leaveFeet: 8 })),
];

function figure(container: HTMLElement): string {
  return container.querySelector('[data-figure]')?.textContent ?? '';
}

function expectClean(container: HTMLElement) {
  expect(container.innerHTML).not.toMatch(/NaN|undefined|Infinity/);
  // No em dashes in copy or placeholders.
  expect(container.textContent).not.toContain('\u2014');
}

const lengths = () => screen.getByRole('group', { name: 'Make % by length, feet' });
const grid = () => screen.getByRole('group', { name: 'Make % by break and slope' });

describe('PuttCause', () => {
  it('reads make % and the 3-putt rate on first putts', () => {
    const { container } = render(<PuttCause data={data(PUTTS)} allowed={ALLOWED} playerId={null} playerName={null} />);
    expect(figure(container)).toBe('52%');
    expect(screen.getByText('3-putt 20%')).toBeTruthy();
    expect(screen.queryByText(/Low sample/)).toBeNull();
    // Eight tap-ins are too few for their own column, so they are named instead.
    expect(within(lengths()).queryByRole('button', { name: /^Inside 3 ft/ })).toBeNull();
    expect(screen.getByText(/All includes 8 putts inside 3 ft\./)).toBeTruthy();
    // Nothing is picked, so the head carries a quiet hint rather than a clear button.
    expect(screen.getByText('Tap a length to filter')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^All lengths/ })).toBeNull();
    expect(screen.getByText('Whole team · 23 putts')).toBeTruthy();
    expectClean(container);
  });

  it('draws the tour mark per length, judges only lengths with 10 putts, and gaps on the rounded figures', () => {
    const { container } = render(<PuttCause data={data(PUTTS)} allowed={ALLOWED} playerId={null} playerName={null} />);
    const group = lengths();
    // Every length with a standard gets its tour mark; the 25+ band sits exactly on the floor.
    expect(group.querySelectorAll('[data-tour-mark]')).toHaveLength(5);
    const far = within(group).getByRole('button', { name: /^25\+ ft: 10% made, 10 putts\. PGA Tour 6%\. 4 points above$/ });
    expect(far.querySelector('[data-bar]')?.getAttribute('data-bar')).toBe('solid');
    expect(far.querySelector('[data-gap]')?.textContent).toBe('+4 pts');
    expect(far.querySelector('[data-gap]')?.className).toContain('text-accent-ink');
    // Five putts: drawn hollow, not compared, no gap.
    const short = within(group).getByRole('button', {
      name: /^3–5 ft: 80% made, 5 putts\. PGA Tour 91%\. Under 10 putts, not compared$/,
    });
    expect(short.querySelector('[data-bar]')?.getAttribute('data-bar')).toBe('hollow');
    expect(short.querySelector('[data-gap]')).toBeNull();
    expect(screen.getByText('Under 10 putts, not compared')).toBeTruthy();
    expect(screen.getByText('PGA Tour make %')).toBeTruthy();
    // Nothing judged sits under its tour mark, so there is no gap band to name.
    expect(screen.queryByText('Gap to PGA Tour')).toBeNull();
    expect(screen.getByText('At or above PGA Tour at every length with 10+ putts.')).toBeTruthy();
    expectClean(container);
  });

  it('the length chart is the band filter', () => {
    const { container } = render(<PuttCause data={data(PUTTS)} allowed={ALLOWED} playerId={null} playerName={null} />);
    const far = screen.getByRole('button', { name: /^25\+ ft: 10% made, 10 putts/ });
    fireEvent.click(far);
    expect(far.getAttribute('aria-pressed')).toBe('true');
    expect(figure(container)).toBe('10%');
    expect(screen.getByText('3-putt 20%')).toBeTruthy();
    expect(screen.getByText('Whole team · 10 putts · 25+ ft')).toBeTruthy();
    // A picked length swaps the hint for the way back, which names the whole read.
    expect(screen.queryByText('Tap a length to filter')).toBeNull();
    expect(screen.getByRole('button', { name: 'All lengths: 52% made, 23 putts' })).toBeTruthy();

    const short = screen.getByRole('button', { name: /^3–5 ft: 80% made, 5 putts/ });
    fireEvent.click(short);
    expect(figure(container)).toBe('80%');
    expect(screen.getByText('No first putts')).toBeTruthy();
    expect(screen.getByText('Low sample · 5 putts')).toBeTruthy();

    const empty = screen.getByRole('button', { name: '5–10 ft: no putts' });
    expect(empty.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(empty);
    expect(figure(container)).toBe('80%');

    // Tapping the picked length again, or All lengths, clears it.
    fireEvent.click(short);
    expect(figure(container)).toBe('52%');
    fireEvent.click(far);
    fireEvent.click(screen.getByRole('button', { name: /^All lengths/ }));
    expect(figure(container)).toBe('52%');
    expect(screen.getByText('Tap a length to filter')).toBeTruthy();
    // The chip leaves with the pick, so focus lands on the length it cleared, not the page.
    expect(document.activeElement).toBe(far);
    expectClean(container);
  });

  it('reads lag putting from first putts at 15 ft and out', () => {
    const { container } = render(<PuttCause data={data(PUTTS)} allowed={ALLOWED} playerId={null} playerName={null} />);
    const row = container.querySelector<HTMLElement>('[data-lag="25"]')!;
    expect(within(row).getByText('10 first putts')).toBeTruthy();
    expect(within(row).getByText('3.4 ft')).toBeTruthy();
    expect(within(row).getByText('44%')).toBeTruthy();
    expect(within(row).getByText('20%')).toBeTruthy();
    expect(
      within(row).getByRole('img', {
        name: 'Where 9 first putts from 25+ ft finished: 1 holed, 3 inside 3 ft, 4 at 3 to 6 ft, 1 at 6 ft or more.',
      }),
    ).toBeTruthy();
    const mid = container.querySelector<HTMLElement>('[data-lag="15"]')!;
    expect(within(mid).getByText('0 first putts')).toBeTruthy();
    expect(
      screen.getByText(
        "Leave is the next putt's measured length. 1 missed lag with no next putt recorded is left out of the leave figures.",
      ),
    ).toBeTruthy();
    expectClean(container);
  });

  it('places tagged misses by measured leave, with the direction coverage at the map', () => {
    const { container } = render(<PuttCause data={data(PUTTS)} allowed={ALLOWED} playerId={null} playerName={null} />);
    expect(screen.getByText('Direction tagged on 9 of 11 misses')).toBeTruthy();
    expect(container.querySelector('[data-coverage]')?.textContent).toContain("(82%). The other 2 can't be placed.");
    const green = screen.getByRole('img', { name: /Missed putts around the hole: 8 placed/ });
    expect(green.getAttribute('aria-label')).toBe(
      'Missed putts around the hole: 8 placed by measured leave and tagged direction, at 8 spots. Of 7 first putts placed, 2 led to a 3-putt.',
    );
    const spots = [...green.querySelectorAll('[data-spot-count]')];
    expect(spots).toHaveLength(8);
    expect(spots.reduce((s, el) => s + Number(el.getAttribute('data-spot-count')), 0)).toBe(8);
    expect(green.textContent).toContain('Long, high side, 4 ft or more: 1 miss; 1 of 1 first putt led to a 3-putt');
    expect(green.textContent).toContain('Short, low side, 2.5 ft: 1 miss');
    for (const label of ['1 ft', '2 ft', '3 ft', '4+ ft', 'Low side', 'High side', 'Long', 'Short']) {
      expect(green.textContent).toContain(label);
    }
    expect(
      screen.getByText(
        "Distance from the hole is the measured leave (the next putt's length); direction is the tagged side and depth. Leaves of 4 ft or more share the outer ring. 1 tagged miss with no leave recorded isn't drawn.",
      ),
    ).toBeTruthy();
    expect(screen.getByText('5 of 7 tagged')).toBeTruthy();
    expect(screen.getByText('4 of 6 tagged')).toBeTruthy();
    // Seven side tags and six depth tags are under the floor: no lean is called.
    expect(container.querySelector('[data-lean]')).toBeNull();
    expectClean(container);
  });

  it('a break × slope cell filters the read, with low-sample cells marked and tour gaps off', () => {
    const { container } = render(<PuttCause data={data(PUTTS)} allowed={ALLOWED} playerId={null} playerName={null} />);
    const cell = within(grid()).getByRole('button', { name: 'Downhill, right to left: 0% made, 5 putts, low sample' });
    expect(within(grid()).getAllByText('low sample')).toHaveLength(3);
    expect(within(grid()).getAllByText('no putts')).toHaveLength(6);
    expect(screen.getByText(/8 putts without a break and slope tag aren't in the grid\./)).toBeTruthy();
    fireEvent.click(cell);
    expect(cell.getAttribute('aria-pressed')).toBe('true');
    expect(figure(container)).toBe('0%');
    // The tour figure covers every putt at a length, so a filtered slice is not judged against it.
    const far = within(lengths()).getByRole('button', {
      name: '25+ ft: 0% made, 5 putts. PGA Tour 6% for all putts. Under 10 putts, not compared',
    });
    expect(far).toBeTruthy();
    expect(lengths().querySelectorAll('[data-gap]')).toHaveLength(0);
    expect(lengths().querySelectorAll('[data-tour-mark]')).toHaveLength(5);
    expect(screen.getByText(/PGA Tour marks cover all putts, so gaps are off while break and slope filter the card\./)).toBeTruthy();
    fireEvent.click(cell);
    expect(figure(container)).toBe('52%');
    expectClean(container);
  });

  it('at team density, misses sharing a spot are one circle sized by count, and the lean is called', () => {
    const { container } = render(<PuttCause data={data(DENSE)} allowed={ALLOWED} playerId={null} playerName={null} />);
    const green = screen.getByRole('img', { name: /Missed putts around the hole/ });
    expect(green.getAttribute('aria-label')).toBe(
      'Missed putts around the hole: 24 placed by measured leave and tagged direction, at 5 spots; 87% of tagged misses finish on the low side. Of 24 first putts placed, 3 led to a 3-putt.',
    );
    const counts = [...green.querySelectorAll('[data-spot-count]')].map((el) => Number(el.getAttribute('data-spot-count')));
    expect(counts).toEqual([10, 6, 3, 3, 2]);
    expect(counts.reduce((s, n) => s + n, 0)).toBe(24);
    // Busy spots print their count; small ones leave it to the circle's title.
    const printed = [...green.querySelectorAll('text')].map((t) => t.textContent);
    expect(printed).toContain('10');
    expect(printed).toContain('6');
    expect(printed).not.toContain('3');
    expect(green.textContent).toContain('Low side, 4 ft or more: 3 misses; 3 of 3 first putts led to a 3-putt');
    // Every first putt at that spot led to a 3-putt: the arc closes into a full ring.
    const full = green.querySelector('[data-three-putt-share="1"] [data-arc]');
    expect(full?.getAttribute('stroke-dasharray')).toBeNull();
    expect(container.querySelector('[data-lean]')?.getAttribute('data-tile')).toBe('low');
    expect(screen.getByText('Direction tagged on 24 of 25 misses')).toBeTruthy();
    expect(container.querySelector('[data-coverage]')?.textContent).toContain("(96%). The other miss can't be placed.");
    expectClean(container);
  });

  it('marks the 3-putt share as an arc on the spot outline, and drops a ring label that would sit on a spot', () => {
    // 16 misses at 1 ft in each of the eight tagged directions crowd the first ring;
    // 16 short misses at 4 ft or more, 2 of them 3-putts, share one spot.
    const dirs: Partial<PuttShot>[] = [
      { side: 'low' },
      { side: 'high' },
      { depth: 'short' },
      { depth: 'long' },
      { side: 'low', depth: 'short' },
      { side: 'low', depth: 'long' },
      { side: 'high', depth: 'short' },
      { side: 'high', depth: 'long' },
    ];
    const crowded: PuttShot[] = [
      ...dirs.flatMap((d) => many(16, () => putt(0, 6, false, { first: true, leaveFeet: 1, ...d }))),
      ...many(14, () => putt(0, 30, false, { first: true, depth: 'short', leaveFeet: 5 })),
      ...many(2, () => putt(0, 30, false, { first: true, threePutt: true, depth: 'short', leaveFeet: 6 })),
    ];
    render(<PuttCause data={data(crowded)} allowed={ALLOWED} playerId={null} playerName={null} />);
    const green = screen.getByRole('img', { name: /Missed putts around the hole/ });
    // Only the deep spot carries 3-putts: 2 of its 16 misses.
    const deep = green.querySelectorAll('[data-three-putt-share]');
    expect(deep).toHaveLength(1);
    const spot = deep[0]!;
    expect(spot.getAttribute('data-three-putt-share')).toBe('0.125');
    expect(spot.querySelector('title')?.textContent).toBe(
      'Short, 4 ft or more: 16 misses; 2 of 16 first putts led to a 3-putt',
    );
    const outer = spot.querySelector('circle:not([data-arc])')!;
    const arc = spot.querySelector('[data-arc]')!;
    const r = Number(outer.getAttribute('r'));
    const [dash] = (arc.getAttribute('stroke-dasharray') ?? '').split(' ').map(Number);
    expect(dash! / (2 * Math.PI * r)).toBeCloseTo(0.125, 5);
    // The arc rides the outline, so the count stays centred on the spot.
    const count = spot.querySelector('text')!;
    expect(count.textContent).toBe('16');
    expect(count.getAttribute('y')).toBe(outer.getAttribute('cy'));
    // Every half-angle on the first ring is under a spot, so "1 ft" is left off; the rest still read.
    const printed = [...green.querySelectorAll('text')].map((t) => t.textContent);
    expect(printed).not.toContain('1 ft');
    for (const label of ['2 ft', '3 ft', '4+ ft']) expect(printed).toContain(label);
  });

  it('takes the 3-putt arc over first putts only, since only they carry the flag', () => {
    const mixed: PuttShot[] = [
      // Short, 4 ft or more: 3 missed first putts (1 a 3-putt) and 1 missed second putt.
      ...many(2, () => putt(0, 30, false, { first: true, depth: 'short', leaveFeet: 5 })),
      putt(0, 30, false, { first: true, threePutt: true, depth: 'short', leaveFeet: 6 }),
      putt(0, 6, false, { depth: 'short', leaveFeet: 4 }),
      // Low side, 1 ft: second putts only, so no arc at all.
      ...many(2, () => putt(0, 4, false, { side: 'low', leaveFeet: 1 })),
    ];
    render(<PuttCause data={data(mixed)} allowed={ALLOWED} playerId={null} playerName={null} />);
    const green = screen.getByRole('img', { name: /Missed putts around the hole/ });
    expect(green.getAttribute('aria-label')).toBe(
      'Missed putts around the hole: 6 placed by measured leave and tagged direction, at 2 spots. Of 3 first putts placed, 1 led to a 3-putt.',
    );
    const arcs = green.querySelectorAll('[data-three-putt-share]');
    expect(arcs).toHaveLength(1);
    expect(Number(arcs[0]!.getAttribute('data-three-putt-share'))).toBeCloseTo(1 / 3, 5);
    expect(arcs[0]!.querySelector('title')?.textContent).toBe(
      'Short, 4 ft or more: 4 misses; 1 of 3 first putts led to a 3-putt',
    );
    expect(green.textContent).toContain('Low side, 1 ft: 2 misses');
    expect(green.textContent).not.toContain('Low side, 1 ft: 2 misses;');
    expect(screen.getByText('Arc: first putts that led to a 3-putt')).toBeTruthy();
  });

  it('shows inside 3 ft as its own column once it has 10 putts, with no tour mark', () => {
    const { container } = render(<PuttCause data={data(DENSE)} allowed={ALLOWED} playerId={null} playerName={null} />);
    const inside = within(lengths()).getByRole('button', { name: 'Inside 3 ft: 92% made, 12 putts. No tour standard' });
    expect(inside.querySelector('[data-tour-mark]')).toBeNull();
    expect(screen.queryByText(/All includes/)).toBeNull();
    expect(screen.getByText(/Inside 3 ft has no tour standard\./)).toBeTruthy();
    expect(screen.getByText('Furthest behind PGA Tour at 5–10 ft: 40% made vs 62%.')).toBeTruthy();
    const mid = within(lengths()).getByRole('button', { name: '5–10 ft: 40% made, 20 putts. PGA Tour 62%. 22 points below' });
    expect(mid.querySelector('[data-gap]')?.textContent).toBe('−22 pts');
    expect(mid.querySelector('[data-gap]')?.className).toContain('text-fw-warning-text');
    expect(screen.getByText('Gap to PGA Tour')).toBeTruthy();

    fireEvent.click(inside);
    expect(figure(container)).toBe('92%');
    expect(screen.getByText('Whole team · 12 putts · Inside 3 ft')).toBeTruthy();
    expect(screen.getByText('Direction tagged on 0 of 1 miss')).toBeTruthy();
    expect(screen.queryByRole('img', { name: /Missed putts around the hole/ })).toBeNull();
    expectClean(container);
  });

  it('lag at team density: leave split, average and 3-putts', () => {
    const { container } = render(<PuttCause data={data(DENSE)} allowed={ALLOWED} playerId={null} playerName={null} />);
    const row = container.querySelector<HTMLElement>('[data-lag="25"]')!;
    expect(within(row).getByText('12 first putts')).toBeTruthy();
    expect(within(row).getByText('4.5 ft')).toBeTruthy();
    expect(within(row).getAllByText('25%')).toHaveLength(2);
    expect(
      within(row).getByRole('img', {
        name: 'Where 12 first putts from 25+ ft finished: 0 holed, 3 inside 3 ft, 6 at 3 to 6 ft, 3 at 6 ft or more.',
      }),
    ).toBeTruthy();
    expect(screen.getByText("Leave is the next putt's measured length.")).toBeTruthy();
    // Picking 25+ highlights its lag row; the other stays for comparison.
    fireEvent.click(screen.getByRole('button', { name: /^25\+ ft:/ }));
    expect(container.querySelector('[data-lag="25"]')?.className).toContain('bg-surface-sunken');
    expect(container.querySelector('[data-lag="15"]')?.className).not.toContain('bg-surface-sunken');
    expectClean(container);
  });

  it('prints a gap inside 3 points in neutral ink', () => {
    // 20 first putts from 30 ft, 1 holed: 5% against the tour's 5.5 (shown 6%), so −1.
    const level = [
      ...many(1, () => putt(0, 30, true, { first: true })),
      ...many(19, () => putt(0, 30, false, { first: true, leaveFeet: 2 })),
    ];
    render(<PuttCause data={data(level)} allowed={ALLOWED} playerId={null} playerName={null} />);
    const far = within(lengths()).getByRole('button', { name: /^25\+ ft: 5% made, 20 putts/ });
    expect(far.querySelector('[data-gap]')?.textContent).toBe('−1 pt');
    expect(far.querySelector('[data-gap]')?.className).toContain('text-text-primary');
  });

  it('draws no tour mark and no gap when the tour has no row', () => {
    const { container } = render(
      <PuttCause data={data(DENSE, { refs: NO_REFS })} allowed={ALLOWED} playerId={null} playerName={null} />,
    );
    expect(lengths().querySelectorAll('[data-tour-mark]')).toHaveLength(0);
    expect(lengths().querySelectorAll('[data-gap]')).toHaveLength(0);
    expect(screen.queryByText('PGA Tour make %')).toBeNull();
    expect(screen.queryByText('Gap to PGA Tour')).toBeNull();
    expect(screen.queryByText(/Furthest behind/)).toBeNull();
    expect(screen.getByText(/No tour make % on file, so lengths are not compared\./)).toBeTruthy();
    expect(within(lengths()).getByRole('button', { name: '5–10 ft: 40% made, 20 putts' })).toBeTruthy();
    expectClean(container);
  });

  it('names the tour the refs came from', () => {
    render(<PuttCause data={data(DENSE, { tourLabel: 'LPGA' })} allowed={ALLOWED} playerId={null} playerName={null} />);
    expect(screen.getByText('Furthest behind LPGA at 5–10 ft: 40% made vs 62%.')).toBeTruthy();
    expect(screen.getByText('LPGA make %')).toBeTruthy();
  });

  it('handles a slice where every putt was made', () => {
    const made = [putt(0, 6, true, { first: true }), putt(0, 12, true, { first: true }), putt(0, 3, true)];
    const { container } = render(<PuttCause data={data(made)} allowed={ALLOWED} playerId={null} playerName={null} />);
    expect(figure(container)).toBe('100%');
    expect(screen.getByText('3-putt 0%')).toBeTruthy();
    expect(screen.getByText('Low sample · 3 putts')).toBeTruthy();
    expect(screen.getByText('No misses in this slice.')).toBeTruthy();
    expect(screen.queryByText('No tags')).toBeNull();
    expect(screen.getByText('No first putts from 15 ft or more in this slice.')).toBeTruthy();
    expectClean(container);
  });

  it('shows the empty state for a player with no putts', () => {
    const { container } = render(<PuttCause data={data(PUTTS)} allowed={ALLOWED} playerId="p2" playerName="Ben Cho" />);
    expect(screen.getByText('No putts in this slice')).toBeTruthy();
    expect(screen.getByText('Ben Cho · 0 putts')).toBeTruthy();
    expectClean(container);
  });
});
