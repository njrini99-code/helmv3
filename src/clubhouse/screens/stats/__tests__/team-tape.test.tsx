import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { TeamTape, type TapeItem } from '../TeamTape';

/**
 * Stats Team's tape of small weekly lines (stats and charts audit 2026-11-15): a figure that held still draws mid-height, not on the
 * "worse" or "better" edge (CH-06); a wobble inside the measure's own noise draws nearly flat (CH-06); weeks sit by their dates, as
 * the trend above the tape does (CH-11); segments are straight and break across a week with no value (CH-15); and the end dot is a
 * round dot, not an oval stretched with the plot (CH-23).
 */
afterEach(cleanup);

const item = (over: Partial<TapeItem>): TapeItem => ({
  label: 'Greens in regulation',
  value: '50',
  unit: '%',
  delta: null,
  deltaDigits: 0,
  lowerIsBetter: false,
  context: 'vs previous 10',
  series: [50, 50, 50, 50],
  ...over,
});

/** The tape's plot height, from its viewBox. */
const plotH = (svg: SVGSVGElement) => Number(svg.getAttribute('viewBox')!.split(' ')[3]);
/** Every point of a cell's line, as [x, y]. */
const points = (cell: Element) =>
  [...(cell.querySelector('.ch-tp__line')?.getAttribute('d') ?? '').matchAll(/[ML]\s*(-?[\d.]+),(-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])] as const);
const cells = () => [...document.querySelectorAll('.ch-tp__c')];

describe('TeamTape · honest small lines', () => {
  it('a flat series draws at mid-height, for a higher-is-better rate and a lower-is-better score alike (CH-06)', () => {
    render(<TeamTape items={[item({}), item({ label: 'Scoring average', value: '74.0', unit: '', lowerIsBetter: true, series: [74, 74, 74] })]} />);
    for (const cell of cells()) {
      const h = plotH(cell.querySelector('svg')!);
      const ys = points(cell).map(([, y]) => y);
      expect(ys.length).toBeGreaterThan(1);
      for (const y of ys) expect(Math.abs(y - h / 2)).toBeLessThanOrEqual(1);
    }
  });

  it('a wobble inside the measure’s minimum span draws nearly flat, not across the whole cell (CH-06)', () => {
    render(<TeamTape items={[item({ label: 'Scoring average', lowerIsBetter: true, series: [74, 74.3, 74], minSpan: 2 })]} />);
    const cell = cells()[0]!;
    const h = plotH(cell.querySelector('svg')!);
    const ys = points(cell).map(([, y]) => y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(0.3 * h);
  });

  it('weeks dated 1, 2 and 30 October sit by their dates: the first step is under a tenth of the second (CH-11)', () => {
    render(<TeamTape items={[item({ series: [40, 50, 60] })]} starts={['2026-10-01', '2026-10-02', '2026-10-30']} />);
    const [a, b, c] = points(cells()[0]!).map(([x]) => x);
    expect(b! - a!).toBeLessThan(0.1 * (c! - b!));
  });

  it('straight segments, broken across a week with no value (CH-15)', () => {
    render(<TeamTape items={[item({ series: [40, 50, null, 60, 55] })]} />);
    const d = cells()[0]!.querySelector('.ch-tp__line')!.getAttribute('d')!;
    expect(d).not.toMatch(/C/);
    expect(d.match(/M/g)).toHaveLength(2);
  });

  it('weeks that alternate with empty ones each keep a dot, so none disappears from the broken line (CH-15)', () => {
    render(<TeamTape items={[item({ series: [40, null, 50, null, 60] })]} />);
    const cell = cells()[0]!;
    // Three measured weeks, none with a neighbour: the line has nothing to draw, so the first two are dots and the newest the end dot.
    expect([...cell.querySelectorAll('.ch-tp__pt')]).toHaveLength(2);
    expect(cell.querySelectorAll('.ch-tp__dot')).toHaveLength(1);
    const lefts = [...cell.querySelectorAll<HTMLElement>('.ch-tp__pt, .ch-tp__dot')].map((e) => parseFloat(e.style.left));
    expect(lefts).toEqual([...lefts].sort((a, b) => a - b));
    expect(new Set(lefts).size).toBe(3);
  });

  it('a week inside a run of two or more takes no extra dot', () => {
    render(<TeamTape items={[item({ series: [40, 50, null, 60, 55] })]} />);
    expect(cells()[0]!.querySelectorAll('.ch-tp__pt')).toHaveLength(0);
  });

  it('the end dot is drawn outside the stretched drawing, so it stays round (CH-23)', () => {
    render(<TeamTape items={[item({ series: [40, 50, 60] })]} />);
    const cell = cells()[0]!;
    expect(cell.querySelector('svg circle')).toBeNull();
    const dot = cell.querySelector('.ch-tp__dot') as HTMLElement;
    expect(dot.tagName).toBe('I');
    expect(dot.style.left).toMatch(/%$/);
    expect(dot.style.top).toMatch(/%$/);
  });
});
