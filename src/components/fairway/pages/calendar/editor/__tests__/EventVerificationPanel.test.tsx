import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EventVerificationPanel, type ConflictData } from '../EventVerificationPanel';

function baseProps(overrides: Partial<React.ComponentProps<typeof EventVerificationPanel>> = {}) {
  return {
    status: 'idle' as const,
    conflicts: null as ConflictData | null,
    attendeeHydrationError: false,
    onRetryAttendees: vi.fn(),
    onRetryConflicts: vi.fn(),
    onSelectSuggestion: vi.fn(),
    ...overrides,
  };
}

describe('EventVerificationPanel', () => {
  it('renders nothing while idle', () => {
    const { container } = render(<EventVerificationPanel {...baseProps({ status: 'idle' })} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the checking state', () => {
    render(<EventVerificationPanel {...baseProps({ status: 'checking' })} />);
    expect(screen.getByText('Checking Helm schedules…')).toBeInTheDocument();
    expect(screen.getByText('Checking Helm schedules…').closest('[data-state]')).toHaveAttribute('data-state', 'checking');
  });

  it('shows the verified state when the check comes back clean', () => {
    render(
      <EventVerificationPanel
        {...baseProps({ status: 'ready', conflicts: { hasConflict: false, conflicts: [], suggestions: [] } })}
      />,
    );
    expect(screen.getByText('No conflicts found in checked Helm schedules.')).toBeInTheDocument();
    expect(screen.getByText(/No conflicts found/).closest('[data-state]')).toHaveAttribute('data-state', 'verified');
  });

  it('shows the partial state and retries conflicts (not attendees) by default', () => {
    const onRetryConflicts = vi.fn();
    const onRetryAttendees = vi.fn();
    render(
      <EventVerificationPanel
        {...baseProps({
          status: 'ready',
          conflicts: { hasConflict: false, partial: true, conflicts: [], suggestions: [] },
          onRetryConflicts,
          onRetryAttendees,
        })}
      />,
    );
    expect(screen.getByText('Schedules partially checked. Some availability is not verified.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }));
    expect(onRetryConflicts).toHaveBeenCalledTimes(1);
    expect(onRetryAttendees).not.toHaveBeenCalled();
  });

  it('shows the failed state and retries attendees when hydration itself failed', () => {
    const onRetryConflicts = vi.fn();
    const onRetryAttendees = vi.fn();
    render(
      <EventVerificationPanel
        {...baseProps({
          status: 'error',
          attendeeHydrationError: true,
          onRetryConflicts,
          onRetryAttendees,
        })}
      />,
    );
    expect(screen.getByText('Schedules not verified. The check could not finish.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }));
    expect(onRetryAttendees).toHaveBeenCalledTimes(1);
    expect(onRetryConflicts).not.toHaveBeenCalled();
  });

  it('lists overlaps with a count, expands past four, and offers suggestions', () => {
    const onSelectSuggestion = vi.fn();
    const conflicts: ConflictData = {
      hasConflict: true,
      conflicts: Array.from({ length: 5 }, (_, i) => ({
        userId: `u${i}`,
        userName: `Player ${i + 1}`,
        conflictingEvent: { title: `Commitment ${i + 1}`, type: 'event', start: '2026-06-15T14:00:00Z', end: '2026-06-15T15:00:00Z' },
      })),
      suggestions: [{ start: new Date('2026-06-15T16:00:00Z'), end: new Date('2026-06-15T17:00:00Z') }],
    };
    render(<EventVerificationPanel {...baseProps({ status: 'ready', conflicts, onSelectSuggestion })} />);

    expect(screen.getByText('5 overlaps · 5 people affected')).toBeInTheDocument();
    expect(screen.queryByText('Player 5 — Commitment 5')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show all 5 overlaps (4 shown)' }));
    expect(screen.getByText('Player 5 — Commitment 5')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Try / }));
    expect(onSelectSuggestion).toHaveBeenCalledWith(conflicts.suggestions[0]);
  });

  it('renders the conflicts state at a 320px mobile width', () => {
    const originalInnerWidth = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { value: 320, configurable: true, writable: true });
    try {
      render(
        <EventVerificationPanel
          {...baseProps({
            status: 'ready',
            conflicts: {
              hasConflict: true,
              conflicts: [
                {
                  userId: 'u1',
                  userName: 'Ava Stone',
                  conflictingEvent: { title: 'Lift', type: 'blocked', start: '2026-06-15T14:00:00Z', end: '2026-06-15T15:00:00Z' },
                },
              ],
              suggestions: [],
            },
          })}
        />,
      );
      expect(screen.getByText('Ava Stone — Lift')).toBeInTheDocument();
    } finally {
      Object.defineProperty(window, 'innerWidth', { value: originalInnerWidth, configurable: true, writable: true });
    }
  });
});
