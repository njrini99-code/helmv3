import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * A8.1: Ask's trend draws better as up. For a lower-is-better metric the newer, lower value sits higher on screen (a
 * smaller y), the chart's name says "Lower is better", and the paper is ruled at round numbers. The look is the yardage
 * book's (LOOK.md, direction A): ink on ruled paper, the first and the last round named, the reference said in the head.
 */

import type { AskEvidence } from '../../../../data/coachhelm-chat-thread';
import { Studio } from '../studio';
import { RuledTrend } from '../studio/drawings';

afterEach(cleanup);

type TrendBlock = Extract<AskEvidence, { kind: 'trend' }>;
const block = (goodDirection: TrendBlock['goodDirection'], values: number[]): TrendBlock =>
  ({
    kind: 'trend',
    title: 'Scoring average',
    source: null,
    unit: 'score',
    points: values.map((value, i) => ({ label: `R${i + 1}`, value, n: 1 })),
    reference: null,
    summary: 'Scoring average by round.',
    goodDirection,
    table: { caption: 'Scoring average by round', columns: ['Round', 'Value'], rows: values.map((value, i) => [`R${i + 1}`, String(value)]) },
  }) as unknown as TrendBlock;

const dots = () => [...document.querySelectorAll('.ch-aks-ruled__pt')];
const dotsY = () => dots().map((c) => Number(c.getAttribute('cy')));
/** The ruled lines' names (set at the left edge); the names under the paper are the rounds. */
const ticks = () => [...document.querySelectorAll('.ch-aks-ruled__axis[x="0"]')].map((t) => t.textContent);

describe('the Ask trend draws better as up (A8.1)', () => {
  it('lower is better: the latest, lower score is higher on screen, and the chart says so', () => {
    render(<RuledTrend block={block('down', [78, 76, 73])} />);
    const [first, , last] = dotsY();
    expect(last!).toBeLessThan(first!);
    // Said to a screen reader; on the paper the ruled lines' own names say it (the lower number is the higher line).
    expect(document.querySelector('.ch-aks-ruled__svg')!.getAttribute('aria-label')).toContain('Lower is better.');
    const named = [...document.querySelectorAll<SVGTextElement>('.ch-aks-ruled__axis[x="0"]')].map((t) => [Number(t.textContent), Number(t.getAttribute('y'))] as const);
    expect(named.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < named.length; i += 1) expect(Math.sign(named[i]![0] - named[i - 1]![0])).toBe(Math.sign(named[i]![1] - named[i - 1]![1]));
  });

  it('higher is better keeps higher values up, and its name does not say lower is better', () => {
    render(<RuledTrend block={block('up', [50, 55, 60])} />);
    const [first, , last] = dotsY();
    expect(last!).toBeLessThan(first!);
    expect(document.querySelector('.ch-aks-ruled__svg')!.getAttribute('aria-label')).not.toContain('Lower is better');
  });

  it('the ruled lines are round numbers, each printed once, and every figure sits between the first and the last of them', () => {
    render(<RuledTrend block={block('down', [78.3, 76.1, 73.4])} />);
    const t = ticks();
    expect(t.length).toBeGreaterThanOrEqual(2);
    expect(new Set(t).size).toBe(t.length);
    for (const label of t) expect(Number(label)).toSatisfy((v: number) => Number.isInteger(v * 2));
    const rules = [...document.querySelectorAll('.ch-aks-ruled__rule')].map((r) => Number(/M24 ([\d.]+)H/.exec(r.getAttribute('d')!)![1]));
    for (const y of dotsY()) expect(y >= Math.min(...rules) && y <= Math.max(...rules)).toBe(true);
  });

  it('the reference is said in the section’s head, never drawn across the line, and the first and last figures stand clear of the points', () => {
    // The last rounds run along the reference, where a drawn reference's words would sit on them.
    const b = { ...block('down', [70, 76, 74, 74, 74]), reference: { label: 'Team', value: 74 } } as TrendBlock;
    render(<Studio part={{ kind: 'trend', data: { form: 'rounds', trend: b } }} size="compact" />);
    expect(document.querySelector('.ch-aks-title small')?.textContent).toBe('Team');
    expect(document.querySelector('[class*="ref"]')).toBeNull();
    const circles = dots().map((c) => ({ x: Number(c.getAttribute('cx')), y: Number(c.getAttribute('cy')) }));
    expect(circles).toHaveLength(5);
    for (const sel of ['.ch-aks-ruled__first', '.ch-aks-ruled__last']) {
      const t = document.querySelector(sel)!;
      const x = Number(t.getAttribute('x'));
      const y = Number(t.getAttribute('y'));
      // The text's box: about 11 units above its baseline and 3 below it, 20 wide; no point's disc (radius 5) is inside it.
      const x0 = t.getAttribute('text-anchor') === 'end' ? x - 20 : x - 10;
      for (const p of circles) if (p.x + 5 > x0 && p.x - 5 < x0 + 20) expect(p.y + 5 <= y - 11 || p.y - 5 >= y + 3).toBe(true);
    }
  });

  it('the older points are hollow and the last is filled', () => {
    render(<RuledTrend block={block('up', [50, 55, 60])} />);
    expect(dots().map((d) => d.classList.contains('is-last'))).toEqual([false, false, true]);
  });

  it('every round’s figure is kept as a table for a screen reader, where the "Table" key used to show it', () => {
    render(<RuledTrend block={block('up', [50, 55, 60])} />);
    const table = document.querySelector('table.ch-sr-only')!;
    expect([...table.querySelectorAll('tbody tr')].map((r) => r.textContent)).toEqual(['R150', 'R255', 'R360']);
    expect(document.querySelector('button')).toBeNull();
  });
});
