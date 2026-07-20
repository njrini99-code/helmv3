// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Filmstrip } from '../Filmstrip';
import { MatrixBoard } from '../MatrixBoard';
import type { FilmstripHole, MatrixBoardRow } from '../types';

const HOLES: FilmstripHole[] = Array.from({ length: 18 }, (_, i) => ({
  n: i + 1,
  par: 4,
  score: 4,
}));

describe('Filmstrip', () => {
  it('renders 18 buttons', () => {
    render(<Filmstrip holes={HOLES} />);
    expect(screen.getAllByRole('button')).toHaveLength(18);
  });

  it('fires onScrub with hole 7 on click', () => {
    const onScrub = vi.fn();
    render(<Filmstrip holes={HOLES} onScrub={onScrub} />);
    fireEvent.click(screen.getByRole('button', { name: 'Hole 7, par 4, score 4' }));
    expect(onScrub).toHaveBeenCalledTimes(1);
    expect(onScrub).toHaveBeenCalledWith(expect.objectContaining({ n: 7, par: 4, score: 4 }));
  });
});

describe('MatrixBoard', () => {
  const rowWithExpand: MatrixBoardRow = {
    id: 'mason',
    cells: ['Mason Rivers', '2', '3'],
    expand: <div>Slump length 6 rds</div>,
    ariaLabel: 'Mason Rivers, expandable row',
  };
  const rowWithoutExpand: MatrixBoardRow = {
    id: 'jackson',
    cells: ['Jackson Hale', '1', '2'],
    ariaLabel: 'Jackson Hale row',
  };

  const columns = [
    { key: 'who', label: 'Player' },
    { key: 'tee', label: 'Tee', align: 'center' as const },
    { key: 'app', label: 'App', align: 'center' as const },
  ];

  it('toggles aria-expanded when an expandable row is clicked', () => {
    render(
      <MatrixBoard
        kpis={[{ label: 'Team scoring', value: '73.6' }]}
        columns={columns}
        rows={[rowWithExpand]}
      />,
    );
    const row = screen.getByRole('button', { name: 'Mason Rivers, expandable row' });
    expect(row).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(row);
    expect(row).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Slump length 6 rds')).toBeInTheDocument();

    fireEvent.click(row);
    expect(row).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Slump length 6 rds')).not.toBeInTheDocument();
  });

  it('omits aria-expanded on a row with no expand content', () => {
    render(<MatrixBoard kpis={[]} columns={columns} rows={[rowWithoutExpand]} />);
    const row = screen.getByRole('button', { name: 'Jackson Hale row' });
    expect(row).not.toHaveAttribute('aria-expanded');
  });
});
