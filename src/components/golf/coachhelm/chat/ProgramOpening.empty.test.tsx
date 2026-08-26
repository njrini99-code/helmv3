/**
 * ============================================================================
 * ProgramOpening — empty-pulse honesty regression (owner report 2026-08-26)
 * ----------------------------------------------------------------------------
 * `items.length === 0` used to `return null`, which left the bottom
 * two-thirds of an empty Ask page as blank cream canvas on a program with no
 * pulse yet — while the route skeleton painted a findings list the page then
 * never delivered. An empty pulse is a state this section owns: it must say
 * so, compactly, instead of vanishing.
 * ============================================================================
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProgramOpening } from './ProgramOpening';

describe('ProgramOpening with an empty pulse', () => {
  it('renders a compact honest empty state instead of nothing', () => {
    render(<ProgramOpening items={[]} coverage={null} asOfLabel={null} onAsk={vi.fn()} />);

    expect(screen.getByText('Nothing to report yet')).toBeInTheDocument();
    expect(
      screen.getByText(/Findings appear here as rounds, qualifiers and schedule activity/i),
    ).toBeInTheDocument();
  });

  it('keeps the honest coverage line when the server sent one', () => {
    render(
      <ProgramOpening
        items={[]}
        coverage="0 of 8 players have recorded rounds"
        asOfLabel={null}
        onAsk={vi.fn()}
      />,
    );

    expect(screen.getByText('0 of 8 players have recorded rounds')).toBeInTheDocument();
  });
});
