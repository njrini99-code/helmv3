/**
 * Recurring-series scope picker — renders for SERIES rows (audit finding #6).
 *
 * The page select now ships parent_event_id + recurrence_rule end-to-end, so
 * an event carrying either field must surface the scope picker (with series
 * copy) on Delete and on Save, instead of firing a plain single-event delete
 * that cascade-wipes the series.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import * as React from 'react';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';

vi.mock('@/components/fairway/overlays/ModalShell', () => {
  interface ShellProps {
    open: boolean;
    title?: string;
    children?: React.ReactNode;
  }
  function ModalShellRoot({ open, title, children }: ShellProps) {
    return open ? <div role="dialog" aria-label={title}>{children}</div> : null;
  }
  ModalShellRoot.Body = function Body({ children }: { children?: React.ReactNode }) {
    return <div>{children}</div>;
  };
  ModalShellRoot.Footer = function Footer({ children }: { children?: React.ReactNode }) {
    return <div>{children}</div>;
  };
  return { ModalShell: ModalShellRoot };
});

vi.mock('@/components/fairway/controls/button', () => ({
  Button: ({
    children,
    onClick,
    disabled,
    type,
  }: {
    children?: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    type?: 'button' | 'submit' | 'reset';
  }) => (
    <button type={type ?? 'button'} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

vi.mock('@/components/fairway/forms/Switch', () => ({
  Switch: ({ checked }: { checked?: boolean }) => (
    <input type="checkbox" readOnly checked={Boolean(checked)} />
  ),
}));

vi.mock('@/app/golf/actions/golf', () => ({
  getEventRSVP: vi.fn(async () => ({
    success: true,
    data: { summary: { accepted: 0, declined: 0, tentative: 0, pending: 0, total: 0, attendees: [] } },
  })),
  checkScheduleConflicts: vi.fn(async () => ({ success: true, data: null })),
}));

import { FairwayEventEditor } from '../FairwayEventEditor';

function makeSeriesEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  const start = '2026-07-01T15:00:00+00:00';
  return {
    id: 'evt-series-child',
    team_id: 'team-1',
    title: 'Tuesday Practice',
    event_type: 'practice',
    start_date: start,
    end_date: start,
    start_time: start,
    end_time: start,
    location: null,
    description: null,
    // Series membership: a child carries parent_event_id back to the root.
    parent_event_id: 'evt-series-root',
    recurrence_rule: null,
    ...overrides,
  };
}

function renderEditor(event: CalendarEvent) {
  const onDelete = vi.fn(async () => {});
  const onSave = vi.fn(async () => {});
  render(
    <FairwayEventEditor
      open
      onClose={vi.fn()}
      event={event}
      isCoach
      onSave={onSave}
      onDelete={onDelete}
      isSaving={false}
      teamPlayers={[]}
    />,
  );
  return { onDelete, onSave };
}

describe('FairwayEventEditor — series scope picker', () => {
  it('Delete on a series CHILD surfaces the scope picker with series-effect copy', async () => {
    const { onDelete } = renderEditor(makeSeriesEvent());

    fireEvent.click(screen.getByText('Delete'));

    await waitFor(() => {
      expect(screen.getByText('Delete recurring event')).toBeInTheDocument();
    });
    expect(screen.getByText(/part of a series/)).toBeInTheDocument();
    expect(screen.getByText('This event only')).toBeInTheDocument();
    expect(screen.getByText('This and all future events')).toBeInTheDocument();
    expect(screen.getByText('All events in the series')).toBeInTheDocument();
    // Destructive copy warns about whole-series effects.
    expect(screen.getByText(/removes the whole series/)).toBeInTheDocument();
    // Nothing deleted until a scope is chosen.
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('Delete on a series ROOT (recurrence_rule, no parent) also surfaces the picker', async () => {
    renderEditor(
      makeSeriesEvent({
        id: 'evt-series-root',
        parent_event_id: null,
        recurrence_rule: 'RRULE:FREQ=WEEKLY;INTERVAL=1;COUNT=10',
      }),
    );

    fireEvent.click(screen.getByText('Delete'));

    await waitFor(() => {
      expect(screen.getByText('Delete recurring event')).toBeInTheDocument();
    });
  });

  it('choosing a scope forwards it to onDelete', async () => {
    const { onDelete } = renderEditor(makeSeriesEvent());

    fireEvent.click(screen.getByText('Delete'));
    await waitFor(() => {
      expect(screen.getByText('All events in the series')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('All events in the series'));

    await waitFor(() => {
      expect(onDelete).toHaveBeenCalledWith('all');
    });
  });

  it('one-off events keep the plain soft-cancel confirm flow (no scope picker)', async () => {
    renderEditor(makeSeriesEvent({ parent_event_id: null, recurrence_rule: null }));

    // One-off deletes are a SOFT CANCEL, so the affordance reads "Cancel event".
    fireEvent.click(screen.getByText('Cancel event'));

    await waitFor(() => {
      expect(screen.getByText('Tap to confirm')).toBeInTheDocument();
    });
    expect(screen.queryByText('Delete recurring event')).not.toBeInTheDocument();
  });
});
