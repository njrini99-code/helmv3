/**
 * CoachHelm Home cause visual: off the tee ("Where drives finish").
 *
 * Pins the honesty contract: headline figures come from the slice's counted
 * drives; a dot's height is an exact linear map of its measured length and
 * its place across a lane is packing that never leaves the lane or overlaps;
 * drives with no length are hollow and never get a height; penalties, misses
 * with no side and drives outside the yard scale are counted and said, not
 * drawn; the club picker filters the whole card without re-zooming the
 * scale; the club comparison, bunker and penalty figures reconcile with the
 * zone counts; low samples are shown but not judged; and no NaN / undefined
 * ever reaches the page.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NO_REFS } from '@/lib/golf/team-intelligence/__tests__/fixtures';
import type { IntelRound, TeamIntelligenceData, TeeShot } from '@/lib/golf/team-intelligence/types';
import { TeeCause } from '../TeeCause';

function round(id: string, playerId: string): IntelRound {
  return { id, playerId, date: '2026-09-01', type: 'practice', sg: { tee: null, app: null, atg: null, putt: null } };
}

function payload(p: Partial<TeamIntelligenceData> = {}): TeamIntelligenceData {
  return {
    teamId: 't1',
    baselineLabel: 'PGA Tour',
    tourLabel: 'PGA Tour',
    refs: NO_REFS,
    today: '2026-09-28',
    players: [
      { id: 'p1', name: 'Alex Moore', avatarUrl: null },
      { id: 'p2', name: 'Blake Hart', avatarUrl: null },
    ],
    rounds: [round('r1', 'p1'), round('r2', 'p2')],
    tee: [],
    approach: [],
    chips: [],
    putts: [],
    ...p,
  };
}

/** A drive with the driver; a missed drive defaults to finishing in the rough. */
function drive(zone: TeeShot['zone'], yards: number | null, more: Partial<TeeShot> = {}): TeeShot {
  const missed = zone === 'left' || zone === 'right' || zone === 'miss';
  return { ri: 0, zone, yards, club: 'driver', lie: missed ? 'rough' : null, penaltyType: null, ...more };
}

const BOTH_ROUNDS = new Set([0, 1]);

function expectClean(container: HTMLElement) {
  expect(container.innerHTML).not.toMatch(/NaN|undefined|Infinity/);
  // A missing figure never shows as a dash placeholder.
  expect(container.textContent).not.toContain('—');
}

const figure = (container: HTMLElement) => container.querySelector('[data-figure]')?.textContent;
const circles = (container: HTMLElement) => [...container.querySelectorAll<SVGCircleElement>('circle[data-zone]')];
const num = (el: Element, attr: string) => Number(el.getAttribute(attr));
const clubButton = (container: HTMLElement, id: string) => container.querySelector<HTMLButtonElement>(`[data-club="${id}"]`)!;
const cell = (container: HTMLElement, row: string, col: string) =>
  container.querySelector(`[data-compare] tr[data-row="${row}"] td[data-col="${col}"]`)?.textContent;

/** Deterministic 0..1 sequence for big fixtures. */
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const drives: TeeShot[] = [
  drive('fairway', 280),
  drive('right', 300),
  drive('right', null),
  drive('left', 260, { ri: 1 }),
];

describe('TeeCause', () => {
  it('leads with the average drive and fairway %, and draws every sided drive', () => {
    const { container } = render(<TeeCause data={payload({ tee: drives })} allowed={BOTH_ROUNDS} playerId={null} playerName={null} />);
    expect(figure(container)).toBe('280 yd');
    expect(screen.getByText('avg drive')).toBeInTheDocument();
    expect(screen.getByText('25% fairways')).toBeInTheDocument();
    expect(screen.getByText('Whole team · 4 drives')).toBeInTheDocument();
    expect(screen.getByText(/across a zone is packing, not a measured spot/)).toBeInTheDocument();

    expect(circles(container)).toHaveLength(4);
    expect(container.querySelectorAll('circle[data-zone="right"]')).toHaveLength(2);
    // The drive with no measured length is hollow, in the tray under the hole,
    // never at a height on the yard scale; the caption says so.
    const hollow = container.querySelectorAll('circle[data-measured="false"]');
    expect(hollow).toHaveLength(1);
    const tray = container.querySelector('[data-tray]')!;
    expect(num(hollow[0]!, 'cy')).toBeGreaterThan(num(tray, 'y'));
    expect(screen.getByText(/Hollow dots had no length measured/)).toBeInTheDocument();
    expect(container.querySelector('[data-avg-line]')).not.toBeNull();
    expectClean(container);
  });

  it('shows the untagged-miss legend entry only when there is one, and says what is not drawn', () => {
    const { container, unmount } = render(
      <TeeCause data={payload({ tee: drives })} allowed={BOTH_ROUNDS} playerId={null} playerName={null} />,
    );
    expect(container.querySelector('[data-legend="miss"]')).toBeNull();
    expect(container.querySelector('[data-legend="penalty"]')).not.toBeNull();
    expect(container.querySelector('[data-legend="sand"]')).toHaveTextContent('Fairway bunker0%(0)');
    expect(container.querySelector('[data-offmap]')).toBeNull();
    unmount();

    const withMiss = [...drives, drive('miss', 250), drive('penalty', null, { penaltyType: 'water' })];
    const view = render(<TeeCause data={payload({ tee: withMiss })} allowed={BOTH_ROUNDS} playerId={null} playerName={null} />);
    expect(view.container.querySelector('[data-legend="miss"]')).toHaveTextContent('Missed, no side17%(1)');
    expect(view.container.querySelector('[data-legend="penalty"]')).toHaveTextContent('Penalty17%(1)');
    // Neither has a side, so neither is drawn on the hole; the caption counts both.
    expect(circles(view.container)).toHaveLength(4);
    expect(view.container.querySelector('[data-offmap="penalty"]')).toHaveTextContent('1 penalty');
    expect(view.container.querySelector('[data-offmap="miss"]')).toHaveTextContent('1 miss with no side tagged');
    expectClean(view.container);
  });

  it('falls back to fairway % when no drive length was measured', () => {
    const noYards: TeeShot[] = [drive('fairway', null), drive('left', null), drive('penalty', null)];
    const { container } = render(<TeeCause data={payload({ tee: noYards })} allowed={BOTH_ROUNDS} playerId={null} playerName={null} />);
    expect(figure(container)).toBe('33%');
    expect(clubButton(container, 'all')).toHaveTextContent('All33% fairways');
    expect(screen.getByText('fairways hit')).toBeInTheDocument();
    expect(container.querySelector('[data-figure-penalties]')).toHaveTextContent('1 penalty');
    expect(screen.getByText('No drive lengths were measured, so dots are packed by zone only.')).toBeInTheDocument();
    // Every dot is hollow and packed by zone: no scale, no tray, no average.
    expect(container.querySelectorAll('circle[data-measured="false"]')).toHaveLength(2);
    expect(container.querySelector('[data-tray]')).toBeNull();
    expect(container.querySelector('[data-avg-line]')).toBeNull();
    expect(screen.queryByText(/\d+ yd/)).toBeNull();
    expectClean(container);
  });

  it("filters to the picked player's drives", () => {
    const { container } = render(
      <TeeCause data={payload({ tee: drives })} allowed={BOTH_ROUNDS} playerId="p2" playerName="Blake Hart" />,
    );
    expect(screen.getByText('Blake Hart · 1 drive')).toBeInTheDocument();
    expect(figure(container)).toBe('260 yd');
    expect(circles(container)).toHaveLength(1);
    expectClean(container);
  });

  it('ends the scale at real drives and keeps a mis-keyed length out of the average', () => {
    // One mis-keyed 620 among five 280s: the data layer leaves it out of the
    // average (past its drive ceiling), and the scale ends at the kept drives.
    const tee = [...Array.from({ length: 5 }, () => drive('fairway', 280)), drive('fairway', 620)];
    const { container } = render(<TeeCause data={payload({ tee })} allowed={BOTH_ROUNDS} playerId={null} playerName={null} />);
    expect(figure(container)).toBe('280 yd');
    expect(container.querySelector('[data-offmap="outside"]')).toHaveTextContent('1 drive outside 260–300 yd');
    // The average (280) is a real drive length, so its line is on the scale.
    expect(container.querySelector('[data-avg-line]')).not.toBeNull();
    expectClean(container);
  });

  it('keeps the legend a split of every drive, with the bunker marked as part of the misses', () => {
    const tee = [...drives, drive('left', 270, { lie: 'sand' }), drive('miss', 250), drive('penalty', null, { penaltyType: 'ob' })];
    const { container } = render(<TeeCause data={payload({ tee })} allowed={BOTH_ROUNDS} playerId={null} playerName={null} />);
    const count = (id: string) => Number(/\((\d+)\)/.exec(container.querySelector(`[data-legend="${id}"]`)?.textContent ?? '')?.[1]);
    const split = ['left', 'fairway', 'right', 'miss', 'penalty'].map(count);
    expect(split.reduce((a, b) => a + b, 0)).toBe(tee.length);
    expect(count('sand')).toBe(1);
    expect(container.querySelector('[data-legend="sand"]')).toHaveTextContent('part of the misses');
    expectClean(container);
  });

  it('says so when the slice has no tee shots', () => {
    const { container } = render(<TeeCause data={payload({ tee: drives })} allowed={new Set()} playerId={null} playerName={null} />);
    expect(screen.getByText('No tee shots tracked in these rounds')).toBeInTheDocument();
    expect(container.querySelector('svg[role="img"]')).toBeNull();
    expect(container.querySelector('[data-club]')).toBeNull();
    expectClean(container);
  });

  // -------------------------------------------------------------------------
  // The honest layout
  // -------------------------------------------------------------------------

  describe('layout at real density', () => {
    const rand = lcg(7);
    const yd = (lo: number, hi: number) => Math.round(lo + rand() * (hi - lo));
    const dense: TeeShot[] = [
      // A tight fairway band: the case that forces the smallest dots.
      ...Array.from({ length: 600 }, (_, i) => drive('fairway', yd(270, 300), { club: i % 3 === 0 ? 'other' : 'driver' })),
      ...Array.from({ length: 120 }, () => drive('left', yd(240, 320))),
      ...Array.from({ length: 30 }, () => drive('left', yd(260, 310), { lie: 'sand' })),
      ...Array.from({ length: 80 }, (_, i) => drive('right', yd(230, 330), { ri: i % 2 })),
      ...Array.from({ length: 20 }, () => drive('right', yd(250, 300), { lie: 'sand', ri: 1 })),
      ...Array.from({ length: 10 }, (_, i) => drive(i % 2 ? 'left' : 'fairway', null)),
      // One mis-keyed length: counted, never drawn at an edge.
      drive('fairway', 600),
    ];

    // A season for a whole team, shaped like the live numbers: ~1,250 drives,
    // driver ~295 yd and other clubs ~266 yd, a few duffs, two bombs that must
    // stay on the scale, and two mis-keyed lengths that must not.
    const normal = (mean: number, sd: number) =>
      Math.round(mean + sd * Math.sqrt(-2 * Math.log(Math.max(rand(), 1e-9))) * Math.cos(2 * Math.PI * rand()));
    const clubYards = (i: number) => (i % 3 === 0 ? normal(266, 22) : normal(295, 18));
    const clubOf = (i: number): TeeShot['club'] => (i % 3 === 0 ? 'other' : 'driver');
    const season: TeeShot[] = [
      ...Array.from({ length: 810 }, (_, i) => drive('fairway', clubYards(i), { club: clubOf(i), ri: i % 2 })),
      ...Array.from({ length: 165 }, (_, i) => drive('left', clubYards(i), { club: clubOf(i) })),
      ...Array.from({ length: 35 }, (_, i) => drive('left', clubYards(i), { club: clubOf(i), lie: 'sand' })),
      ...Array.from({ length: 140 }, (_, i) => drive('right', clubYards(i), { club: clubOf(i) })),
      ...Array.from({ length: 40 }, (_, i) => drive('right', clubYards(i), { club: clubOf(i), lie: 'sand' })),
      ...[128, 150, 171].map((y) => drive('left', y, { club: 'other' })),
      ...[352, 361].map((y) => drive('fairway', y)),
      ...Array.from({ length: 20 }, (_, i) => drive(i % 2 ? 'right' : 'fairway', null)),
      ...Array.from({ length: 10 }, () => drive('miss', normal(280, 20))),
      ...Array.from({ length: 57 }, () => drive('penalty', normal(285, 25), { penaltyType: 'water' })),
      drive('fairway', 5),
      drive('fairway', 620),
    ];

    function renderDense(tee: TeeShot[] = dense) {
      return render(<TeeCause data={payload({ tee })} allowed={BOTH_ROUNDS} playerId={null} playerName={null} />);
    }

    it('draws height as an exact linear map of the measured length', () => {
      const { container } = renderDense();
      const measured = circles(container).filter((c) => c.getAttribute('data-measured') === 'true');
      expect(measured).toHaveLength(850);
      const byYards = [...measured].sort((a, b) => num(a, 'data-yards') - num(b, 'data-yards'));
      const lo = byYards[0]!;
      const hi = byYards[byYards.length - 1]!;
      const slope = (num(hi, 'cy') - num(lo, 'cy')) / (num(hi, 'data-yards') - num(lo, 'data-yards'));
      expect(slope).toBeLessThan(0); // longer drives sit higher
      for (const c of measured) {
        const expected = num(lo, 'cy') + slope * (num(c, 'data-yards') - num(lo, 'data-yards'));
        expect(Math.abs(num(c, 'cy') - expected)).toBeLessThan(0.02);
      }
      expectClean(container);
    });

    it.each([
      ['a tight fairway band', dense],
      ['a whole-team season', season],
    ])('packs every dot inside its own lane with no overlap: %s', (_, tee) => {
      const { container } = renderDense(tee);
      for (const lane of container.querySelectorAll('g[data-lane]')) {
        const x0 = num(lane, 'data-x0');
        const x1 = num(lane, 'data-x1');
        const dots = [...lane.querySelectorAll('circle')]
          .map((c) => ({ x: num(c, 'cx'), y: num(c, 'cy'), r: num(c, 'r') }))
          .sort((a, b) => a.y - b.y);
        expect(dots.filter((d) => d.x - d.r < x0 || d.x + d.r > x1)).toEqual([]);
        const reach = 2 * Math.max(0, ...dots.map((d) => d.r));
        const overlaps: string[] = [];
        for (let i = 0; i < dots.length; i += 1) {
          const a = dots[i]!;
          for (let j = i + 1; j < dots.length && dots[j]!.y - a.y < reach; j += 1) {
            const b = dots[j]!;
            if (Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r - 0.02) overlaps.push(`${a.x},${a.y} / ${b.x},${b.y}`);
          }
        }
        expect(overlaps).toEqual([]);
      }
    });

    it('keeps sand drives in the bunker lanes, inside the drawn bunker', () => {
      const { container } = renderDense();
      const sand = container.querySelectorAll('circle[data-lie="sand"]');
      expect(sand).toHaveLength(50);
      for (const lane of ['left-rough', 'fairway', 'right-rough']) {
        expect(container.querySelectorAll(`g[data-lane="${lane}"] circle[data-lie="sand"]`)).toHaveLength(0);
      }
      for (const side of ['left', 'right'] as const) {
        const bunker = container.querySelector(`[data-bunker="${side}"]`)!;
        const top = num(bunker, 'y');
        const bottom = top + num(bunker, 'height');
        for (const c of container.querySelectorAll(`g[data-lane="${side}-sand"] circle[data-measured="true"]`)) {
          expect(num(c, 'cy') - num(c, 'r')).toBeGreaterThanOrEqual(top);
          expect(num(c, 'cy') + num(c, 'r')).toBeLessThanOrEqual(bottom);
        }
      }
      expect(container.querySelector('[data-legend="sand"]')).toHaveTextContent('Fairway bunker5.8%(50)');
    });

    it('counts a drive outside the yard scale in the caption instead of drawing it at an edge', () => {
      const { container } = renderDense();
      expect(container.querySelector('circle[data-yards="600"]')).toBeNull();
      expect(container.querySelector('[data-offmap="outside"]')?.textContent).toMatch(/^1 drive outside \d+–\d+ yd$/);
    });

    it('draws every drive inside the stated yard range and counts exactly the ones outside it', () => {
      const { container } = renderDense(season);
      const caption = container.querySelector('[data-offmap="outside"]')?.textContent ?? '';
      const m = /^(\d+) drives? outside (\d+)–(\d+) yd$/.exec(caption);
      expect(m).not.toBeNull();
      const [count, lo, hi] = [Number(m![1]), Number(m![2]), Number(m![3])];
      const sidedWithLength = season.filter((s) => ['fairway', 'left', 'right'].includes(s.zone) && s.yards != null);
      const outside = sidedWithLength.filter((s) => s.yards! < lo || s.yards! > hi);
      expect(count).toBe(outside.length);
      const drawn = circles(container).filter((c) => c.getAttribute('data-measured') === 'true');
      expect(drawn).toHaveLength(sidedWithLength.length - outside.length);
      expect(drawn.filter((c) => num(c, 'data-yards') < lo || num(c, 'data-yards') > hi)).toEqual([]);
      // The longest drives stay on the scale; only lengths far from the rest come off.
      for (const y of [352, 361]) expect(container.querySelector(`circle[data-yards="${y}"]`)).not.toBeNull();
      expect(container.querySelector('circle[data-yards="5"]')).toBeNull();
      expect(container.querySelector('circle[data-yards="620"]')).toBeNull();
      expect(outside.length).toBeLessThanOrEqual(5);
      // Drives with no length are hollow in the tray, never on the scale.
      expect(container.querySelectorAll('circle[data-measured="false"]')).toHaveLength(20);
      expectClean(container);
    });

    it('lays out the same way every time', () => {
      const positions = (container: HTMLElement) => circles(container).map((c) => `${c.getAttribute('cx')},${c.getAttribute('cy')}`);
      const first = renderDense();
      const a = positions(first.container);
      first.unmount();
      const b = positions(renderDense().container);
      expect(b).toEqual(a);
    });
  });

  // -------------------------------------------------------------------------
  // Club split
  // -------------------------------------------------------------------------

  const clubs: TeeShot[] = [
    drive('fairway', 300),
    drive('fairway', 310),
    drive('fairway', 290),
    drive('left', 280),
    drive('left', 270),
    drive('penalty', 305, { penaltyType: 'water' }),
    drive('fairway', 250, { club: 'other' }),
    drive('fairway', 260, { club: 'other' }),
    drive('fairway', 255, { club: 'other', ri: 1 }),
    drive('fairway', 245, { club: 'other', ri: 1 }),
    drive('right', 240, { club: 'other', ri: 1 }),
  ];

  it('shows each club option its own fairway % and average, and filters the whole card', () => {
    const { container } = render(<TeeCause data={payload({ tee: clubs })} allowed={BOTH_ROUNDS} playerId={null} playerName={null} />);
    expect(clubButton(container, 'all')).toHaveTextContent('All64% · 270 yd');
    expect(clubButton(container, 'driver')).toHaveTextContent('Driver50% · 290 yd');
    expect(clubButton(container, 'other')).toHaveTextContent('Other clubs80% · 250 yd');
    expect(clubButton(container, 'all')).toHaveAttribute('aria-pressed', 'true');
    const allY = num(container.querySelector('circle[data-yards="300"]')!, 'cy');

    fireEvent.click(clubButton(container, 'driver'));
    expect(clubButton(container, 'driver')).toHaveAttribute('aria-pressed', 'true');
    expect(clubButton(container, 'all')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('Whole team · 6 drives · Driver')).toBeInTheDocument();
    expect(figure(container)).toBe('290 yd'); // a penalty's length is not a drive
    expect(screen.getByText('50% fairways')).toBeInTheDocument();
    expect(circles(container)).toHaveLength(5); // the penalty is not drawn
    expect(container.querySelector('[data-legend="penalty"]')).toHaveTextContent('Penalty17%(1)');
    // The scale comes from every club, so a 300-yd drive keeps its height.
    expect(num(container.querySelector('circle[data-yards="300"]')!, 'cy')).toBe(allY);

    fireEvent.click(clubButton(container, 'other'));
    expect(screen.getByText('Whole team · 5 drives · Other clubs')).toBeInTheDocument();
    expect(figure(container)).toBe('250 yd');
    expect(circles(container)).toHaveLength(5);
    expect(container.querySelector('circle[data-yards="300"]')).toBeNull();
    expectClean(container);
  });

  it('compares driver with other clubs, and the counts add up to the whole slice', () => {
    const { container } = render(<TeeCause data={payload({ tee: clubs })} allowed={BOTH_ROUNDS} playerId={null} playerName={null} />);
    expect(Number(cell(container, 'n', 'driver')) + Number(cell(container, 'n', 'other'))).toBe(clubs.length);
    expect(cell(container, 'fairway', 'driver')).toBe('50%');
    expect(cell(container, 'fairway', 'other')).toBe('80%');
    expect(cell(container, 'avg', 'driver')).toBe('290 yd');
    expect(cell(container, 'avg', 'other')).toBe('250 yd');
    // Fewer sided misses than the low-sample line: a count, not a share.
    expect(cell(container, 'miss', 'driver')).toBe('2 of 2 left');
    expect(cell(container, 'miss', 'other')).toBe('1 of 1 right');
    expect(cell(container, 'penalty', 'driver')).toBe('17%');
    expect(cell(container, 'penalty', 'other')).toBe('0%');
    // 50% vs 80% is a 30-point gap: 30 fewer fairways per 100 drives, not "30% fewer".
    expect(screen.getByText('Driver goes 40 yd longer than other clubs and hits 30 fewer fairways per 100 drives.')).toBeInTheDocument();
    expectClean(container);
  });

  it.each([
    [
      'level on both',
      [...Array.from({ length: 3 }, () => drive('fairway', 280)), drive('left', 280), drive('left', 280)],
      [...Array.from({ length: 3 }, () => drive('fairway', 280, { club: 'other' })), drive('right', 280, { club: 'other' }), drive('right', 280, { club: 'other' })],
      'Driver goes as far as other clubs and hits the fairway as often.',
    ],
    [
      'shorter but straighter',
      Array.from({ length: 5 }, () => drive('fairway', 250)),
      [drive('fairway', 260, { club: 'other' }), ...Array.from({ length: 4 }, () => drive('left', 260, { club: 'other' }))],
      'Driver goes 10 yd shorter than other clubs and hits 80 more fairways per 100 drives.',
    ],
  ])('reads the driver gap from the table figures: %s', (_, driver, other, sentence) => {
    const { container } = render(
      <TeeCause data={payload({ tee: [...driver, ...other] })} allowed={BOTH_ROUNDS} playerId={null} playerName={null} />,
    );
    expect(screen.getByText(sentence)).toBeInTheDocument();
    expectClean(container);
  });

  it('gives no driver read when either club is a low sample', () => {
    const thin = clubs.filter((s) => s.club === 'driver').concat(drive('fairway', 250, { club: 'other' }));
    const { container } = render(<TeeCause data={payload({ tee: thin })} allowed={BOTH_ROUNDS} playerId={null} playerName={null} />);
    expect(cell(container, 'n', 'other')).toBe('1');
    expect(screen.queryByText(/^Driver goes/)).toBeNull();
    expectClean(container);
  });

  it('says so when a club has no drives, and when the picked club is empty', () => {
    const { container } = render(<TeeCause data={payload({ tee: drives })} allowed={BOTH_ROUNDS} playerId={null} playerName={null} />);
    expect(clubButton(container, 'other')).toHaveTextContent('Other clubsNo drives');
    expect(container.querySelector('[data-compare]')).toHaveTextContent('Every drive here was hit with driver (4 drives).');
    fireEvent.click(clubButton(container, 'other'));
    expect(screen.getByText('No drives with other clubs in these rounds')).toBeInTheDocument();
    expect(container.querySelector('svg[role="img"]')).toBeNull();
    expect(container.querySelector('[data-penalties]')).toBeNull();
    expectClean(container);
  });

  // -------------------------------------------------------------------------
  // Penalties
  // -------------------------------------------------------------------------

  it('breaks penalties down by kind, folds an unrecorded kind into Other, and reads them per round', () => {
    const three = payload({ rounds: [round('r1', 'p1'), round('r2', 'p2'), round('r3', 'p1')] });
    const pens: TeeShot[] = [
      drive('fairway', 290),
      drive('fairway', 280, { ri: 1 }),
      drive('penalty', 300, { penaltyType: 'water' }),
      drive('penalty', 310, { penaltyType: 'water' }),
      drive('penalty', 305, { penaltyType: 'water', club: 'other', ri: 1 }),
      drive('penalty', 260, { penaltyType: 'lost' }),
      drive('penalty', null, { penaltyType: 'lost', club: 'other' }),
      drive('penalty', 280, { penaltyType: 'ob', ri: 1 }),
      drive('penalty', null, { penaltyType: 'unplayable', club: 'other', ri: 1 }),
      drive('penalty', 270, { penaltyType: null }),
    ];
    // Round r3 is in the slice but has no tracked drive: it is not a denominator.
    const { container } = render(<TeeCause data={{ ...three, tee: pens }} allowed={new Set([0, 1, 2])} playerId={null} playerName={null} />);
    const kinds = [...container.querySelectorAll('[data-penalty-kind]')].map((el) => [el.getAttribute('data-penalty-kind'), el.textContent]);
    expect(kinds).toEqual([
      ['water', 'Water3'],
      ['lost', 'Lost ball2'],
      ['ob', 'Out of bounds1'],
      ['unplayable', 'Unplayable1'],
      ['other', 'Other1'],
    ]);
    // The kinds add up to the penalty count the legend shows.
    expect(container.querySelector('[data-legend="penalty"]')).toHaveTextContent('Penalty80%(8)');
    expect(container.querySelector('[data-per-round]')).toHaveTextContent('4.0');
    expect(container.querySelector('[data-penalty-note]')).toHaveTextContent(
      '8 penalties in 2 rounds with a tracked drive; 80% of drives. Other includes penalties with no kind recorded.',
    );

    // Same rounds under every club, so driver + other = all.
    fireEvent.click(clubButton(container, 'driver'));
    expect(container.querySelector('[data-per-round]')).toHaveTextContent('2.5');
    fireEvent.click(clubButton(container, 'other'));
    expect(container.querySelector('[data-per-round]')).toHaveTextContent('1.5');
    expectClean(container);
  });

  it('keeps a rare penalty visible per round and says when there are none', () => {
    const rounds = Array.from({ length: 30 }, (_, i) => round(`r${i}`, 'p1'));
    const tee = rounds.map((_, i) => drive('fairway', 280, { ri: i }));
    tee.push(drive('penalty', 290, { ri: 0, penaltyType: 'ob' }));
    const all = new Set(rounds.map((_, i) => i));
    const { container, unmount } = render(<TeeCause data={payload({ rounds, tee })} allowed={all} playerId={null} playerName={null} />);
    expect(container.querySelector('[data-per-round]')).toHaveTextContent('0.03');
    // A small share keeps one decimal, and the legend and the note agree.
    expect(container.querySelector('[data-legend="penalty"]')).toHaveTextContent('Penalty3.2%(1)');
    expect(container.querySelector('[data-penalty-note]')).toHaveTextContent('1 penalty in 30 rounds with a tracked drive; 3.2% of drives.');
    unmount();

    const clean = render(<TeeCause data={payload({ rounds, tee: tee.slice(0, -1) })} allowed={all} playerId={null} playerName={null} />);
    expect(within(clean.container.querySelector('[data-penalties]') as HTMLElement).getByText('No penalties off the tee.')).toBeInTheDocument();
    expect(clean.container.querySelector('[data-per-round]')).toHaveTextContent('0');
    expect(clean.container.querySelector('[data-penalty-note]')).toHaveTextContent('Over 30 rounds with a tracked drive.');
    expectClean(clean.container);
  });

  // -------------------------------------------------------------------------
  // Low samples
  // -------------------------------------------------------------------------

  it('names the main miss side only past the low-sample line, and never on a tie', () => {
    const lead = (tee: TeeShot[]) =>
      render(<TeeCause data={payload({ tee })} allowed={BOTH_ROUNDS} playerId={null} playerName={null} />).container.querySelector('[data-lead]');
    expect(lead([drive('left', 280), drive('left', 270), drive('left', 260), drive('right', 250)])).toBeNull();
    expect(lead([drive('left', 280), drive('left', 270), drive('left', 260), drive('right', 250), drive('right', 255), drive('right', 265)])).toBeNull();
    const shown = lead([drive('left', 280), drive('left', 270), drive('left', 260), drive('left', 265), drive('right', 250), drive('right', 255)]);
    expect(shown).toHaveTextContent('Missed left');
  });
});
