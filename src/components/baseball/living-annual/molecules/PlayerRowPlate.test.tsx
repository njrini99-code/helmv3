// @vitest-environment jsdom
/**
 * PlayerRowPlate.tsx tests — regression coverage for the roster mobile
 * name-collapse bug (visual-audit 2026-07-16, coach-roster-academics.md):
 *
 * `truncate` sets `overflow: hidden` on the name span, and per the CSS
 * Flexbox spec a flex item's "automatic minimum size" resolves to 0 once its
 * own `overflow` is anything but `visible` (unlike the sibling jersey-number
 * and `PositionChip` spans, which have no `overflow` set and so keep their
 * full content-based minimum). Under width pressure that meant ALL the
 * squeeze fell on the name — collapsing it to a single glyph or nothing at
 * all on a 390px roster row — while jersey + position chip never budged.
 * The fix reserves an explicit non-zero `min-w-[64px]` floor on the name
 * span so it degrades to a legible fragment instead of vanishing.
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { PlayerRowPlate } from './PlayerRowPlate';

describe('PlayerRowPlate — name plate width', () => {
  it('renders the full first + last name in the DOM', () => {
    render(<PlayerRowPlate firstName="Marcus" lastName="Rodriguez" stats={[]} />);
    expect(screen.getByText('Marcus')).toBeInTheDocument();
    expect(screen.getByText('Rodriguez')).toBeInTheDocument();
  });

  it('gives the name span a reserved, non-zero min-width so it cannot collapse to 0 under a `truncate` overflow-hidden squeeze', () => {
    render(<PlayerRowPlate firstName="Marcus" lastName="Rodriguez" stats={[]} />);
    const nameSpan = screen.getByText('Rodriguez').parentElement;
    expect(nameSpan?.className).toContain('truncate');
    expect(nameSpan?.className).toMatch(/min-w-\[\d/);
    expect(nameSpan?.className).not.toContain('min-w-0');
  });

  it('renders a jersey number and a 2-character position chip alongside the name (the two elements that previously won the whole width race)', () => {
    render(
      <PlayerRowPlate firstName="Marcus" lastName="Rodriguez" jerseyNumber={24} position="SS" stats={[]} />,
    );
    expect(screen.getByText('24')).toBeInTheDocument();
    expect(screen.getByText('SS')).toBeInTheDocument();
    // ...and the name is still fully present alongside them.
    expect(screen.getByText('Rodriguez')).toBeInTheDocument();
  });

  it('renders every stat column passed in, in order', () => {
    render(
      <PlayerRowPlate
        firstName="Hunter"
        lastName="Price"
        stats={[{ label: 'OPS', value: '1.752', leader: true }]}
      />,
    );
    expect(screen.getByText('OPS')).toBeInTheDocument();
    expect(screen.getByText('1.752')).toBeInTheDocument();
  });
});
