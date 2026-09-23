// @vitest-environment jsdom
/**
 * Pkg 9 slice 4 — DueForReviewPanel render coverage. The derivation
 * boundaries themselves are covered in
 * `src/test/coachhelm/focus-areas/due-for-review.test.ts`; this file only
 * checks the panel renders (or doesn't) correctly from its props.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DueForReviewPanel } from './DueForReviewPanel';
import type { PlayersGridPlayer, PlayersGridFocusArea } from './PlayersGridView';

function player(overrides: Partial<PlayersGridPlayer> = {}): PlayersGridPlayer {
  return {
    id: 'p1',
    first_name: 'Jordan',
    last_name: 'Lee',
    avatar_url: null,
    graduation_year: 2027,
    handicap: 2,
    hometown: null,
    state: null,
    ...overrides,
  };
}

function focusArea(overrides: Partial<PlayersGridFocusArea> = {}): PlayersGridFocusArea {
  return {
    id: 'fa1',
    area_type: 'general',
    title: 'Cut three-putts',
    player_id: 'p1',
    status: 'active',
    target_kind: 'date',
    target_date: '2000-01-01', // fixed far-past date -> deterministically overdue
    ...overrides,
  };
}

describe('DueForReviewPanel', () => {
  it('renders nothing when nothing is due (empty state)', () => {
    const { container } = render(
      <DueForReviewPanel players={[player()]} focusAreas={[focusArea({ target_kind: null })]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for an empty roster/focus-area set', () => {
    const { container } = render(<DueForReviewPanel players={[]} focusAreas={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the due count and the player/title for an overdue area', () => {
    render(
      <DueForReviewPanel
        players={[player({ id: 'p1', first_name: 'Jordan', last_name: 'Lee' })]}
        focusAreas={[focusArea({ player_id: 'p1' })]}
      />,
    );
    expect(screen.getByText('Due for review')).toBeInTheDocument();
    expect(screen.getAllByText('Jordan Lee').length).toBeGreaterThan(0);
    expect(screen.getByText('Cut three-putts')).toBeInTheDocument();
    expect(screen.getByText('Overdue')).toBeInTheDocument();
  });

  it('calls onSelectPlayer with the area\'s player_id when "View" is clicked', async () => {
    const onSelectPlayer = vi.fn();
    const { default: userEvent } = await import('@testing-library/user-event');
    render(
      <DueForReviewPanel
        players={[player({ id: 'p1' })]}
        focusAreas={[focusArea({ player_id: 'p1' })]}
        onSelectPlayer={onSelectPlayer}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'View' }));
    expect(onSelectPlayer).toHaveBeenCalledWith('p1');
  });

  it('does not render a "View" affordance when onSelectPlayer is omitted', () => {
    render(
      <DueForReviewPanel players={[player({ id: 'p1' })]} focusAreas={[focusArea({ player_id: 'p1' })]} />,
    );
    expect(screen.queryByRole('button', { name: 'View' })).not.toBeInTheDocument();
  });
});
