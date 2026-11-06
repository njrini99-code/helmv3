import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DateTile, GoalDraft, LineupDraft, NoteDraft, TaskDraft, TripDraft, draftDate } from '../DraftVisual';

afterEach(() => cleanup());

/** FID-ASK-1: each flow draws its own draft from the card's values, and nothing the card doesn't hold. */
describe('a draft draws its flow', () => {
  it('a task counts the days to its due date and caps its coins', () => {
    render(<TaskDraft visual={{ kind: 'task', title: 'Log 50 putts', due: '2026-11-11', who: ['A B', 'C D', 'E F', 'G H', 'I J'] }} today="2026-11-06" />);
    expect(screen.getByText('5')).toBeTruthy();
    expect(screen.getByText('days')).toBeTruthy();
    expect(screen.getByText('+2')).toBeTruthy();
  });
  it('a task with no due date draws no ring rather than a made-up count', () => {
    const { container } = render(<TaskDraft visual={{ kind: 'task', title: 'Log putts', due: null, who: ['A B'] }} today="2026-11-06" />);
    expect(container.querySelector('svg')).toBeNull();
  });
  it('a trip names both ends in its own words, and a lineup marks its alternate', () => {
    render(<TripDraft visual={{ kind: 'trip', from: null, to: 'Hargrove CC', how: 'van', leave: '2026-11-08', back: null }} />);
    expect(screen.getByText('Hargrove CC')).toBeTruthy();
    expect(screen.getByText('Leaves')).toBeTruthy();
    render(<LineupDraft visual={{ kind: 'lineup', seats: [{ slot: 1, name: 'Eli B', alternate: false }, { slot: null, name: 'Owen P', alternate: true }] }} />);
    expect(screen.getByText('Alt')).toBeTruthy();
  });
  it('a goal shows its target and a note its words', () => {
    render(<GoalDraft visual={{ kind: 'goal', player: 'Jonah', stat: 'Greens', target: 50, days: 30 }} />);
    expect(screen.getByText('50')).toBeTruthy();
    render(<NoteDraft visual={{ kind: 'note', player: 'Theo', note: 'Take the extra club.' }} />);
    expect(screen.getByText('Take the extra club.')).toBeTruthy();
  });
  it('the date tile uses the draft’s own date, and none for a flow without one', () => {
    expect(draftDate({ kind: 'trip', from: null, to: 'x', how: 'van', leave: '2026-11-08', back: null })).toBe('2026-11-08');
    expect(draftDate({ kind: 'note', player: 'x', note: 'y' })).toBeNull();
    render(<DateTile date="2026-11-08" />);
    expect(screen.getByText('8')).toBeTruthy();
  });
});
