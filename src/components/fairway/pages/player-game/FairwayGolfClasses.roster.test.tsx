/**
 * Classes page, "All classes" roster: at 390px the rows rendered as capsules
 * and the "1 cr" / "3 cr" labels sat past the card's padding, 11px beyond the
 * phone gutter. Two causes: the rows were Fairway <Button>s, whose base is a
 * nowrap pill (`rounded-full`, `whitespace-nowrap`), and the grid had no
 * column template, so its one implicit track grew to the rows' content width.
 *
 * jsdom doesn't lay out, so this locks the class contract that fixes both.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { FairwayGolfClasses, type FairwayPlayerClass } from './FairwayGolfClasses';

const CALCULUS: FairwayPlayerClass = {
  id: 'class-1',
  player_id: 'player-1',
  class_name: 'MATH 2415 Calculus III',
  instructor: 'Dr. Rivera',
  days: ['M', 'W'],
  start_time: '09:00',
  end_time: '09:50',
  building: null,
  room: null,
  credits: 3,
  color: null,
  notes: null,
  semester: null,
  team_id: null,
  created_at: null,
  updated_at: null,
};

function renderRoster(onClassClick = vi.fn()) {
  render(
    <FairwayGolfClasses
      classes={[CALCULUS]}
      loading={false}
      hasTeam
      classesByDay={{ M: [CALCULUS], W: [CALCULUS] }}
      totalCredits={3}
      parseClassName={() => ({ code: 'MATH 2415', name: 'Calculus III' })}
      getLocationDisplay={() => null}
      formatTimeDisplay={(time) => time}
      formatDaysDisplay={(days) => days.join('')}
      onAddClass={() => {}}
      onImportSchedule={() => {}}
      onClassClick={onClassClick}
      onDeleteAll={() => {}}
    />,
  );
  return onClassClick;
}

describe('FairwayGolfClasses "All classes" roster', () => {
  it('renders each class as a card-shaped row that can shrink to the screen', () => {
    renderRoster();

    const row = screen.getByText('3 cr').closest('button');
    expect(row).not.toBeNull();
    expect(row).toHaveClass('rounded-card', 'min-w-0', 'p-4');
    expect(row).not.toHaveClass('rounded-full');
    expect(row).not.toHaveClass('whitespace-nowrap');
  });

  it('holds the roster grid to the container width on phones', () => {
    renderRoster();

    const grid = screen.getByText('3 cr').closest('button')?.parentElement;
    expect(grid).toHaveClass('grid', 'grid-cols-1', 'md:grid-cols-2');
  });

  it('opens the class when its row is pressed', () => {
    const onClassClick = renderRoster();

    fireEvent.click(screen.getByText('3 cr').closest('button') as HTMLButtonElement);
    expect(onClassClick).toHaveBeenCalledWith(CALCULUS);
  });
});
