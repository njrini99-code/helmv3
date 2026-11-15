// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MatrixBoard } from '../MatrixBoard';
import type { MatrixBoardRow } from '../types';

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
