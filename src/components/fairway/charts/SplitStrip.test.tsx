import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SplitStrip, type SplitStripRow } from './SplitStrip';

const PRESSURE: SplitStripRow = { id: 'tq', label: 'Tournament and qualifier', rounds: [4, 2, 5, 3, 1, 3] };
const PRACTICE: SplitStripRow = { id: 'pr', label: 'Practice', rounds: [1, -1, 2, 0, 1, 3] };

describe('SplitStrip', () => {
  it('speaks both means, both samples and the gap in one image label', () => {
    render(<SplitStrip rows={[PRESSURE, PRACTICE]} />);
    const img = screen.getByRole('img');
    expect(img.getAttribute('aria-label')).toBe(
      'Tournament and qualifier: 6 rounds, average plus 3.0. Practice: 6 rounds, average plus 1.0. Pressure gap plus 2.0',
    );
  });

  it('draws a tick per round toned by to par, and one mean bar per row', () => {
    const { container } = render(<SplitStrip rows={[PRESSURE, PRACTICE]} />);
    const practice = container.querySelector('[data-row="pr"]')!;
    const ticks = [...practice.querySelectorAll('[data-tick]')];
    expect(ticks).toHaveLength(6);
    expect(ticks[1]!.className).toContain('bg-accent-fill');
    expect(ticks[0]!.className).toContain('bg-fw-warning');
    expect(ticks[3]!.className).toContain('bg-text-secondary');
    expect(container.querySelectorAll('[data-mean]')).toHaveLength(2);
  });

  it('puts both rows on one axis: the higher mean sits further right', () => {
    const { container } = render(<SplitStrip rows={[PRESSURE, PRACTICE]} />);
    const at = (id: string) =>
      parseFloat((container.querySelector(`[data-row="${id}"] [data-mean]`) as HTMLElement).style.left);
    const par = parseFloat((container.querySelector('[data-par]') as HTMLElement).style.left);
    expect(at('tq')).toBeGreaterThan(at('pr'));
    expect(at('pr')).toBeGreaterThan(par);
  });

  it('writes the gap between the rows, amber when pressure scores higher', () => {
    const { container } = render(<SplitStrip rows={[PRESSURE, PRACTICE]} />);
    const gap = [...container.querySelectorAll('p')].find((p) => p.textContent?.startsWith('Pressure gap'))!;
    expect(gap.textContent).toContain('+2.0');
    expect(gap.querySelector('.tabular-nums')!.className).toContain('text-fw-warning-ink');
  });

  it('prints an early mean in secondary ink and a solid one in primary', () => {
    const { container } = render(<SplitStrip rows={[{ ...PRESSURE, rounds: [4, 2, 5] }, PRACTICE]} />);
    expect(container.querySelector('[data-row="tq"] [data-mean-text]')!.className).toContain('text-text-secondary');
    expect(container.querySelector('[data-row="pr"] [data-mean-text]')!.className).toContain('text-text-primary');
  });

  it('prints no mean or gap for a row under the floor', () => {
    const { container } = render(<SplitStrip rows={[{ ...PRESSURE, rounds: [4] }, PRACTICE]} />);
    expect(container.querySelector('[data-row="tq"] [data-mean]')).toBeNull();
    expect(container.textContent).toContain('Needs 2 more rounds');
    expect(screen.getByRole('img').getAttribute('aria-label')).toContain('Pressure gap Needs 1 more round');
  });
});
