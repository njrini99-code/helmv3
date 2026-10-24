import { render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Ribbon } from '../screens/rounds/parts';

// F-57: three rounds on one day read "2 Aug 2 Aug 2 Aug" under the season ribbon.
describe('Rounds season ribbon', () => {
  it('labels a day once, under the first of its rounds', () => {
    const r = (id: string, date: string, score: number) => ({ id, date, score, toPar: score - 72, type: 'practice' as const });
    const { container } = render(
      <Ribbon rounds={[r('a', '2026-08-02', 69), r('b', '2026-08-02', 70), r('c', '2026-08-02', 71), r('d', '2026-09-25', 70), r('e', '2026-09-26', 71)]} avg={-1.8} compact />,
    );
    const days = [...container.querySelectorAll('.ch-rd-rib__d')].map((t) => t.textContent);
    expect(days).toEqual(['2', '25', '26']);
    // Every round still has its bar and its score.
    expect(container.querySelectorAll('rect.is-under, rect.is-over, rect.is-even, rect.is-q')).toHaveLength(5);
  });

  it('sets its figures in even-width digits (row 113): the ticks, the day numbers and the average chip', () => {
    const r = (id: string, date: string, score: number) => ({ id, date, score, toPar: score - 72, type: 'practice' as const });
    const { container } = render(<Ribbon rounds={[r('a', '2026-08-02', 69), r('b', '2026-08-09', 74)]} avg={-0.5} compact={false} />);
    const figures = [...container.querySelectorAll('text.ch-rd-rib__d, text.ch-rd-rib__t')].filter((t) => /\d/.test(t.textContent ?? ''));
    expect(figures.length).toBeGreaterThan(0);
    for (const t of figures) expect(t.classList.contains('ch-num'), t.textContent ?? '').toBe(true);
  });

  it('keeps those digits even although the ribbon text sets its own font shorthand later', () => {
    const base = readFileSync(join(__dirname, '../styles/base.css'), 'utf8');
    expect(base).toMatch(/\.ch-num,\s*svg \.ch-num \{\s*font-variant-numeric: tabular-nums;/);
  });
});
