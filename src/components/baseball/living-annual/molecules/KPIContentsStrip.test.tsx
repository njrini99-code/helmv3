// @vitest-environment jsdom
/**
 * KPIContentsStrip.tsx tests — the pin-first ordering + StatStrip wiring
 * this component owns on top of the shared `StatStrip` layout primitive.
 * `RuledStatLine` is stubbed (it's a `'use client'` atom with its own
 * framer-motion + Number Flow mount animation, unrelated to what this
 * container decides): the stub exposes the props KPIContentsStrip forwards
 * so ordering/columns/ghost behavior is directly assertable, while the REAL
 * `StatStrip` renders underneath so the container-shape contract (grid vs
 * rail) is exercised end to end.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('..', () => ({
  RuledStatLine: (props: {
    label: string;
    value: number | string;
    leader?: boolean;
    emphasis?: boolean;
    ghost?: boolean;
  }) => (
    <div
      data-testid="ruled-stat-line"
      data-leader={String(!!props.leader)}
      data-emphasis={String(!!props.emphasis)}
      data-ghost={String(!!props.ghost)}
    >
      {props.label}:{props.ghost ? '—' : String(props.value)}
    </div>
  ),
}));

import { KPIContentsStrip, type KPIContentsItem } from './KPIContentsStrip';

function labelsOf(items: KPIContentsItem[]) {
  render(<KPIContentsStrip items={items} />);
  return screen.getAllByTestId('ruled-stat-line').map((el) => el.textContent?.split(':')[0]);
}

describe('KPIContentsStrip — table-of-contents strip over StatStrip', () => {
  it('renders one RuledStatLine per item, in order, below the rail threshold', () => {
    const items: KPIContentsItem[] = [
      { label: 'ROSTER', value: 14 },
      { label: 'ON THE RECORD', value: 0 },
      { label: 'OPEN RISKS', value: 2 },
    ];
    expect(labelsOf(items)).toEqual(['ROSTER', 'ON THE RECORD', 'OPEN RISKS']);
  });

  it('does NOT reorder below the rail threshold, even if the leader sits last', () => {
    const items: KPIContentsItem[] = [
      { label: 'A', value: 1 },
      { label: 'B', value: 2 },
      { label: 'C', value: 3, leader: true },
    ];
    expect(labelsOf(items)).toEqual(['A', 'B', 'C']);
  });

  it('pins a leader/emphasis figure first once the strip becomes a snap-rail (>= 5 items)', () => {
    const items: KPIContentsItem[] = [
      { label: 'A', value: 1 },
      { label: 'B', value: 2, emphasis: true },
      { label: 'C', value: 3 },
      { label: 'D', value: 4 },
      { label: 'E', value: 5 },
    ];
    expect(labelsOf(items)).toEqual(['B', 'A', 'C', 'D', 'E']);
  });

  it('pin-first is a stable partition — relative order preserved within each half', () => {
    const items: KPIContentsItem[] = [
      { label: 'A', value: 1 },
      { label: 'B', value: 2, leader: true },
      { label: 'C', value: 3, emphasis: true },
      { label: 'D', value: 4 },
      { label: 'E', value: 5 },
      { label: 'F', value: 6 },
    ];
    // Leaders/emphasis (B, C) keep their relative order, then the rest (A, D, E, F).
    expect(labelsOf(items)).toEqual(['B', 'C', 'A', 'D', 'E', 'F']);
  });

  it('renders as a snap-rail (role="list") once items.length >= 5', () => {
    const items: KPIContentsItem[] = Array.from({ length: 5 }, (_, i) => ({
      label: `K${i}`,
      value: i,
    }));
    render(<KPIContentsStrip items={items} />);
    expect(screen.getByRole('list', { name: 'Key figures' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(5);
  });

  it('renders as a plain grid (no role="list") below 5 items', () => {
    const items: KPIContentsItem[] = [
      { label: 'ROSTER', value: 14 },
      { label: 'OPEN RISKS', value: 2 },
    ];
    render(<KPIContentsStrip items={items} />);
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('forwards ghost items honestly (em-dash placeholder), never a fake zero', () => {
    const items: KPIContentsItem[] = [
      { label: 'ROSTER', value: 14 },
      { label: 'PENDING SYNC', value: 0, ghost: true },
    ];
    render(<KPIContentsStrip items={items} />);
    const ghostCell = screen.getByText('PENDING SYNC:—');
    expect(ghostCell).toHaveAttribute('data-ghost', 'true');
  });

  it('clamps an out-of-range columns prop into StatStrip\'s 1-6 static-map domain', () => {
    const items: KPIContentsItem[] = [
      { label: 'A', value: 1 },
      { label: 'B', value: 2 },
    ];
    const { container } = render(<KPIContentsStrip items={items} columns={12} />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('lg:grid-cols-6');
  });

  it('a columns of 1 lets StatStrip resolve its own column count from `count` instead', () => {
    const items: KPIContentsItem[] = [
      { label: 'A', value: 1 },
      { label: 'B', value: 2 },
    ];
    const { container } = render(<KPIContentsStrip items={items} columns={1} />);
    const root = container.firstElementChild as HTMLElement;
    // count=2 → StatStrip defaults resolvedColumns to 2, not the literal "1".
    expect(root.className).toContain('sm:grid-cols-2');
  });
});
