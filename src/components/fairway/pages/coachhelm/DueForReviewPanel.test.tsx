// @vitest-environment jsdom
/**
 * Pkg 9 slice 4 — DueForReviewPanel render coverage. The derivation
 * boundaries themselves are covered in
 * `src/test/coachhelm/focus-areas/due-for-review.test.ts`; this file only
 * checks the panel renders (or doesn't) correctly from its props.
 *
 * `todayIso` is a required prop (#1998 review) — every render below passes a
 * fixed value so fixtures stay deterministic regardless of when the suite
 * runs.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DueForReviewPanel } from './DueForReviewPanel';
import type { PlayersGridPlayer, PlayersGridFocusArea } from './PlayersGridView';

const TODAY_ISO = '2026-09-23';

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
      <DueForReviewPanel
        players={[player()]}
        focusAreas={[focusArea({ target_kind: null })]}
        todayIso={TODAY_ISO}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for an empty roster/focus-area set', () => {
    const { container } = render(
      <DueForReviewPanel players={[]} focusAreas={[]} todayIso={TODAY_ISO} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the due count and the player/title for an overdue area', () => {
    render(
      <DueForReviewPanel
        players={[player({ id: 'p1', first_name: 'Jordan', last_name: 'Lee' })]}
        focusAreas={[focusArea({ player_id: 'p1' })]}
        todayIso={TODAY_ISO}
      />,
    );
    expect(screen.getByText('Due for review')).toBeInTheDocument();
    expect(screen.getAllByText('Jordan Lee').length).toBeGreaterThan(0);
    expect(screen.getByText('Cut three-putts')).toBeInTheDocument();
    expect(screen.getByText('Overdue')).toBeInTheDocument();
  });

  it('renders a "Due soon" badge (not "Overdue") for an area within the review window', () => {
    render(
      <DueForReviewPanel
        players={[player({ id: 'p1', first_name: 'Jordan', last_name: 'Lee' })]}
        // 3 days out from TODAY_ISO -> within the default 7-day window, not overdue.
        focusAreas={[focusArea({ player_id: 'p1', target_date: '2026-09-26' })]}
        todayIso={TODAY_ISO}
      />,
    );
    expect(screen.getByText('Due for review')).toBeInTheDocument();
    // "Due soon" appears twice when nothing is overdue: once as the header
    // readout's label, once as the row badge — assert at least one instance
    // rather than picking a single query.
    expect(screen.getAllByText('Due soon').length).toBeGreaterThan(0);
    expect(screen.queryByText('Overdue')).not.toBeInTheDocument();
  });

  it('caps the list and shows a "+N more due for review." caption past the cap', () => {
    // DUE_LIST_CAP is 5 — 7 overdue areas across distinct players should
    // render 5 rows plus a "+2 more due for review." caption.
    const players = Array.from({ length: 7 }, (_, i) => player({ id: `p${i}`, first_name: `Player${i}`, last_name: 'X' }));
    const focusAreas = players.map((p, i) =>
      focusArea({ id: `fa${i}`, player_id: p.id, target_date: `1999-01-0${(i % 9) + 1}` }),
    );
    render(<DueForReviewPanel players={players} focusAreas={focusAreas} todayIso={TODAY_ISO} />);
    expect(screen.getAllByText('Overdue')).toHaveLength(5);
    expect(screen.getByText('+2 more due for review.')).toBeInTheDocument();
  });

  it('does not show an overflow caption when due items are within the cap', () => {
    render(
      <DueForReviewPanel
        players={[player({ id: 'p1' })]}
        focusAreas={[focusArea({ player_id: 'p1' })]}
        todayIso={TODAY_ISO}
      />,
    );
    expect(screen.queryByText(/more due for review/)).not.toBeInTheDocument();
  });

  it('calls onSelectPlayer with the area\'s player_id when "View" is clicked', async () => {
    const onSelectPlayer = vi.fn();
    const { default: userEvent } = await import('@testing-library/user-event');
    render(
      <DueForReviewPanel
        players={[player({ id: 'p1' })]}
        focusAreas={[focusArea({ player_id: 'p1' })]}
        todayIso={TODAY_ISO}
        onSelectPlayer={onSelectPlayer}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'View' }));
    expect(onSelectPlayer).toHaveBeenCalledWith('p1');
  });

  it('does not render a "View" affordance when onSelectPlayer is omitted', () => {
    render(
      <DueForReviewPanel
        players={[player({ id: 'p1' })]}
        focusAreas={[focusArea({ player_id: 'p1' })]}
        todayIso={TODAY_ISO}
      />,
    );
    expect(screen.queryByRole('button', { name: 'View' })).not.toBeInTheDocument();
  });
});
