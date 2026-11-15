import '../../../__tests__/dialog-polyfill';
import { LazyMotion, domAnimation } from 'motion/react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PREVIEW_TEAM_STATS } from '../../../preview/fixtures-stats';

/**
 * Stats Team's trend chart (stats and charts audit 2026-11-15): the scoring lens plots each week against par with par at 0
 * and the raw strokes only in the readout (CH-01); a change needs two weeks a half and the team's says "same players" (CH-10);
 * each player's end bar has its signed figure beside it, and with no reference there are no bars (CH-20); ticks and week names
 * never crowd (CH-21).
 */
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }) }));
vi.mock('../../../lib/haptics', () => ({ haptic: vi.fn() }));

const { TeamCharts, thinLabels } = await import('../StatsTeamIslands');
type Charts = Parameters<typeof TeamCharts>[0]['data'];
type Player = Charts['players'][number];

afterEach(() => {
  cleanup();
  sessionStorage.clear();
});

const WEEKS = ['Sep 7', 'Sep 14', 'Sep 21', 'Sep 28', 'Oct 5'];
const STARTS = ['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05'];
/** The same golf every week, +2 a round, on par-70, par-72 and par-71 courses: raw strokes move, the golf does not. */
const RAW = [72, 74, 73, 72, 74];
const TO_PAR = [2, 2, 2, 2, 2];

const mk = (id: string, toPar: Array<number | null> | undefined, score: number[]): Player => ({
  id,
  name: `${id} Player`,
  first: id,
  sg: score.map(() => 0.1),
  score,
  sgMean: 0.1,
  scoreMean: score.reduce((a, b) => a + b, 0) / score.length,
  sgHalves: null,
  scoreHalves: null,
  ...(toPar ? { toPar, toParMean: toPar.reduce<number>((a, b) => a + (b ?? 0), 0) / toPar.filter((v) => v != null).length } : {}),
});

function charts(over: { toPar?: boolean; scoreHalves?: Charts['team']['scoreHalves']; weeks?: string[]; starts?: string[] } = {}): Charts {
  const withPar = over.toPar ?? true;
  const weeks = over.weeks ?? WEEKS;
  const n = weeks.length;
  const raw = Array.from({ length: n }, (_, i) => RAW[i % RAW.length]!);
  const toPar = Array.from({ length: n }, (_, i) => TO_PAR[i % TO_PAR.length]!);
  return {
    ...PREVIEW_TEAM_STATS,
    weeks,
    weekStarts: over.starts ?? STARTS,
    team: {
      ...PREVIEW_TEAM_STATS.team,
      score: raw,
      scoreMean: 73,
      scoreHalves: over.scoreHalves === undefined ? { delta: 0, se: 0.8 } : over.scoreHalves,
      ...(withPar ? { toPar, toParMean: 2 } : { toPar: undefined, toParMean: undefined }),
    },
    players: [mk('Ava', withPar ? [1, 1, 1, 1, 1] : undefined, [71, 73, 72, 71, 73]), mk('Ben', withPar ? [-1, -1, -1, -1, -1] : undefined, [69, 71, 70, 69, 71])],
  } as Charts;
}

function draw(data: Charts) {
  const out = render(
    <LazyMotion features={domAnimation}>
      <div className="ch-root" data-ui="clubhouse">
        <TeamCharts data={data} />
      </div>
    </LazyMotion>,
  );
  fireEvent.click(screen.getByRole('radio', { name: /scoring/i }));
  return out;
}

/** The scoring plot, the one the lens swapped in (the outgoing one can still be in the DOM). */
const plot = () => [...document.querySelectorAll('.ch-sgt__svg')].find((s) => (s.getAttribute('aria-label') ?? '').startsWith('Scoring'))!;
const teamYs = () => [...(plot().querySelector('path.ch-sgt__team')!.getAttribute('d') ?? '').matchAll(/[ML]\s*(-?[\d.]+),(-?[\d.]+)/g)].map((m) => Number(m[2]));
const ends = () => [...document.querySelectorAll('.ch-sgt__end')].filter((e) => !e.closest('[aria-hidden="true"]'));

describe('team trend · the scoring lens is against par (CH-01)', () => {
  it('the same golf at par-70, par-72 and par-71 courses draws one flat line', () => {
    draw(charts());
    const ys = teamYs();
    expect(ys.length).toBe(5);
    for (const y of ys) expect(y).toBeCloseTo(ys[0]!, 5);
  });

  it('the dashed line is par, at 0, labelled Par, and the caption says against par per 18 and that better is up', () => {
    draw(charts());
    expect(plot().querySelector('.ch-sgt__reflab')!.textContent).toBe('Par');
    const zero = [...plot().querySelectorAll('.ch-tick')].find((t) => t.textContent === 'E');
    expect(zero).toBeTruthy();
    const caption = [...document.querySelectorAll('.ch-sgt__vs')].at(-1)!.textContent!;
    expect(caption).toMatch(/^Against par, per 18 holes · /);
    expect(caption).toMatch(/better is up/);
  });

  it('the figures read against par, and the raw strokes stay in the readout', () => {
    draw(charts());
    const facts = [...document.querySelectorAll('.ch-sgt__facts dd')].map((d) => d.firstChild!.textContent);
    expect(facts[0]).toBe('+2.0');
    // A pointer on the plot reads the week, its figure against par and the strokes behind it.
    const svg = plot() as SVGSVGElement;
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 900, height: 300, right: 900, bottom: 300, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    fireEvent.pointerMove(svg, { clientX: 880, pointerType: 'mouse' });
    expect(svg.querySelector('.ch-sgt__scrub text')!.textContent).toBe('Oct 5 · +2.0 · 74.0 strokes');
  });

  it('data with no par draws raw strokes, says so, and has no par line or end bars (CH-20)', () => {
    draw(charts({ toPar: false }));
    expect(plot().querySelector('.ch-sgt__reflab')).toBeNull();
    expect([...document.querySelectorAll('.ch-sgt__vs')].at(-1)!.textContent).toMatch(/^Strokes per round · /);
    expect(ends().length).toBeGreaterThan(0);
    for (const e of ends()) expect(e.querySelector('.ch-sgt__bar')).toBeNull();
  });
});

describe('team trend · end bars say their side in words (CH-20)', () => {
  it('each bar has its signed figure beside it', () => {
    draw(charts());
    const shown = ends();
    expect(shown.length).toBeGreaterThan(0);
    for (const e of shown) {
      expect(e.querySelector('.ch-sgt__bar')).not.toBeNull();
      expect(e.querySelector('b')!.textContent).toMatch(/^([+−]\d|E$)/);
    }
  });
});

describe('team trend · a change needs four weeks and the same players (CH-10)', () => {
  const note = () => [...document.querySelectorAll('.ch-sgt > .ch-note')].at(-1)!.textContent!;

  it('three weeks is not enough to read a change', () => {
    draw(charts({ weeks: WEEKS.slice(0, 3), starts: STARTS.slice(0, 3), scoreHalves: { delta: 3, se: 0.2 } }));
    expect(note()).toBe('The team has 3 weeks in this window so far; a change needs four.');
  });

  it('a window with too few of the same players on both halves says so', () => {
    draw(charts({ scoreHalves: null }));
    expect(note()).toBe('Not enough of the same players on both halves to read a change in team scoring.');
  });

  it('a clear change says it compares the same players', () => {
    draw(charts({ scoreHalves: { delta: -2, se: 0.5 } }));
    expect(note()).toBe('Team scoring is down 2.0 strokes a round, same players, newer half vs older half.');
  });
});

describe('team trend · the axes never crowd (CH-21)', () => {
  it('a 30-stroke range has at most seven ticks', () => {
    const wide = charts();
    draw({ ...wide, team: { ...wide.team, toPar: [-2, 28, 5, 4, 3] } });
    const ticks = [...plot().querySelectorAll('.ch-tick')].filter((t) => t.getAttribute('text-anchor') === 'end');
    expect(ticks.length).toBeLessThanOrEqual(7);
    expect(ticks.length).toBeGreaterThanOrEqual(3);
  });

  it('thirty weeks across 600 units print no two names closer than the least gap, and always the newest', () => {
    const labels = Array.from({ length: 30 }, (_, i) => `Oct ${(i % 28) + 1}`);
    const xs = labels.map((_, i) => (i * 600) / 29);
    const shown = thinLabels(xs, labels);
    expect(shown.at(-1)).toBe(29);
    expect(shown.length).toBeLessThanOrEqual(15);
    for (let k = 1; k < shown.length; k++) {
      const a = shown[k - 1]!;
      const b = shown[k]!;
      expect(xs[b]! - (labels[b]!.length * 6.6) / 2 - (xs[a]! + (labels[a]!.length * 6.6) / 2)).toBeGreaterThanOrEqual(8);
    }
  });
});
