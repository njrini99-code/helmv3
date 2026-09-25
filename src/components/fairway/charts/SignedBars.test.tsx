import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SignedBars, type SignedBarRow } from './SignedBars';

const ROWS: SignedBarRow[] = [
  { id: 'ott', label: 'Off the tee', metricId: 'sg_ott', value: 0.4, sample: 12 },
  { id: 'app', label: 'Approach', metricId: 'sg_approach', value: -1.2, sample: 12 },
  { id: 'arg', label: 'Around the green', metricId: 'sg_around_green', value: 0.1, sample: 4 },
  { id: 'putt', label: 'Putting', metricId: 'sg_putting', value: -0.6, sample: 1 },
];

describe('SignedBars', () => {
  it('is a named list with one readable item per row, sorted by magnitude with unreadable rows last', () => {
    const { container } = render(<SignedBars rows={ROWS} label="Strokes gained by category" />);
    const list = screen.getByRole('list', { name: 'Strokes gained by category' });
    expect(list.querySelectorAll('li')).toHaveLength(4);
    const order = [...container.querySelectorAll('li')].map((li) => li.getAttribute('data-row'));
    expect(order).toEqual(['app', 'ott', 'arg', 'putt']);
    expect(screen.getByText('Approach: minus 1.20')).toBeTruthy();
  });

  it('draws better to the right in green and worse to the left in amber, with registry text', () => {
    const { container } = render(<SignedBars rows={ROWS} label="SG" />);
    const app = container.querySelector('[data-row="app"] [data-bar]')!;
    expect(app.getAttribute('data-bar')).toBe('left');
    expect(app.className).toContain('bg-fw-warning');
    const ott = container.querySelector('[data-row="ott"] [data-bar]')!;
    expect(ott.getAttribute('data-bar')).toBe('right');
    expect(ott.className).toContain('bg-accent-fill');
    expect(container.querySelector('[data-row="app"]')!.textContent).toContain('−1.20');
    expect(container.querySelector('[data-row="ott"]')!.textContent).toContain('+0.40');
  });

  it('draws direction from the metric tone, so a lower-is-better saving goes right', () => {
    const { container } = render(
      <SignedBars rows={[{ id: 'leak', label: 'Three-putts', metricId: 'strokes_impact', value: -0.8 }]} label="Leaks" />,
    );
    const bar = container.querySelector('[data-bar]')!;
    expect(bar.getAttribute('data-bar')).toBe('right');
    expect(bar.className).toContain('bg-accent-fill');
  });

  it('scales the longest bar to the track and the rest in proportion', () => {
    const { container } = render(<SignedBars rows={ROWS} label="SG" />);
    const width = (id: string) => (container.querySelector(`[data-row="${id}"] [data-bar]`) as HTMLElement).style.width;
    expect(width('app')).toMatch(/calc\(1 \*/);
    expect(width('ott')).toMatch(/calc\(0\.33 \*/);
  });

  it('draws an early read hollow and a row under its floor as a ghost with the reason', () => {
    const { container } = render(<SignedBars rows={ROWS} label="SG" />);
    expect(container.querySelector('[data-row="arg"] [data-bar]')!.className).toContain('border-2');
    const putt = container.querySelector('[data-row="putt"]')!;
    expect(putt.querySelector('[data-bar]')).toBeNull();
    expect(putt.getAttribute('data-drawn')).toBeNull();
    expect(putt.textContent).toContain('Needs 2 more rounds');
    expect(putt.textContent).not.toContain('0');
  });

  it('shows a locked row as a ghost with its reason', () => {
    render(
      <SignedBars
        rows={[{ id: 'x', label: 'Approach', metricId: 'sg_approach', value: 1, locked: true, lockedReason: 'Track shots to unlock' }]}
        label="SG"
      />,
    );
    expect(screen.getByText('Approach: Track shots to unlock')).toBeTruthy();
  });

  it('keeps the given order for a ladder and renders a total under a rule', () => {
    const { container } = render(
      <SignedBars
        rows={ROWS.slice(0, 2)}
        sort="none"
        label="SG"
        total={{ id: 'total', label: 'Total', metricId: 'sg_total', value: -0.8, sample: 12 }}
      />,
    );
    const order = [...container.querySelectorAll('li')].map((li) => li.getAttribute('data-row'));
    expect(order).toEqual(['ott', 'app', 'total']);
    expect(screen.getByRole('list', { name: 'Total' })).toBeTruthy();
  });

  it('makes a row with an href one link', () => {
    render(<SignedBars rows={[{ ...ROWS[0]!, href: '/golf/game/driving' }]} label="SG" />);
    expect(screen.getByRole('link', { name: 'Off the tee: plus 0.40' }).getAttribute('href')).toBe('/golf/game/driving');
  });
});
