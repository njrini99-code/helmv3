/* eslint-disable jsx-a11y/anchor-is-valid, helm/no-raw-button -- thin test stand-ins for next/link and the design-system Button, not user-facing UI */
/**
 * FairwayEventDetailDrawer — RSVP gating + cancelled rendering + coach
 * attendance mount (audit findings #16, #19/#10-cancelled, AttendancePanel
 * contract).
 *
 *  - non-RSVP events: no RSVP buttons
 *  - past events / passed deadline: locked state (no live buttons)
 *  - future RSVP events: buttons + "Respond by" deadline in local time
 *  - typed lock errors from the server render specific copy
 *  - cancelled events render a Cancelled badge instead of disappearing
 *  - coach view mounts AttendancePanel with { eventId, teamId, canManage }
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import * as React from 'react';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';
import type { RsvpRespondResult } from '@/hooks/useRSVP';

// next/link in jsdom triggers IntersectionObserver-backed prefetch (an uncaught
// async throw). Stub it to a plain anchor so the cross-link renders without it.
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children?: React.ReactNode } & Record<string, unknown>) => (
    <a href={typeof href === 'string' ? href : '#'} {...rest}>
      {children}
    </a>
  ),
}));

// The drawer's ONLY next/dynamic usage is the coach AttendancePanel — stub it
// so we can assert the mount + contract props without loading the real panel.
vi.mock('next/dynamic', () => ({
  default: () => {
    function DynamicStub(props: Record<string, unknown>) {
      return (
        <div
          data-testid="attendance-panel"
          data-event-id={String(props.eventId ?? '')}
          data-team-id={String(props.teamId ?? '')}
          data-can-manage={String(props.canManage ?? '')}
        />
      );
    }
    return DynamicStub;
  },
}));

// Light stand-ins for the Fairway kit (the real Sheet is vaul-backed).
vi.mock('@/components/fairway', () => {
  interface SheetProps {
    open: boolean;
    title?: string;
    children?: React.ReactNode;
  }
  function SheetRoot({ open, title, children }: SheetProps) {
    return open ? <div role="dialog" aria-label={title}>{children}</div> : null;
  }
  SheetRoot.Body = function Body({ children }: { children?: React.ReactNode }) {
    return <div>{children}</div>;
  };
  return {
    Sheet: SheetRoot,
    Inset: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    Readout: ({ value, label }: { value: number; label: string }) => (
      <div>
        {label}: {value}
      </div>
    ),
    Button: ({
      children,
      onClick,
      disabled,
    }: {
      children?: React.ReactNode;
      onClick?: () => void;
      disabled?: boolean;
    }) => (
      <button type="button" onClick={onClick} disabled={disabled}>
        {children}
      </button>
    ),
    StatusPill: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
  };
});

// The calendar→travel cross-link (P440) looks up the linked itinerary on open.
// Mock the server action so the lookup is deterministic + offline. Default = no
// linked trip; individual tests override via `mockResolvedValueOnce`.
const getItineraryForEvent = vi.fn(
  async (_eventId: string): Promise<{ success: boolean; data?: { id: string; event_name: string; destination: string } | null }> => ({
    success: true,
    data: null,
  }),
);
vi.mock('@/app/golf/actions/travel', () => ({
  getItineraryForEvent: (eventId: string) => getItineraryForEvent(eventId),
}));

import { FairwayEventDetailDrawer } from '../FairwayEventDetailDrawer';

const DAY_MS = 24 * 60 * 60 * 1000;

function makeEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  const start = new Date(Date.now() + 7 * DAY_MS).toISOString();
  return {
    id: 'evt-1',
    team_id: 'team-1',
    title: 'Qualifying Round',
    event_type: 'practice',
    start_date: start,
    end_date: start,
    start_time: start,
    end_time: start,
    location: null,
    description: null,
    requires_rsvp: true,
    rsvp_deadline: new Date(Date.now() + 3 * DAY_MS).toISOString(),
    ...overrides,
  };
}

function renderDrawer(props: Partial<React.ComponentProps<typeof FairwayEventDetailDrawer>> = {}) {
  const defaults: React.ComponentProps<typeof FairwayEventDetailDrawer> = {
    event: makeEvent(),
    open: true,
    onOpenChange: vi.fn(),
    isCoach: false,
    rsvpStatus: null,
    rsvpSummary: null,
    onRespond: vi.fn(async (): Promise<RsvpRespondResult> => ({ success: true })),
  };
  return render(<FairwayEventDetailDrawer {...defaults} {...props} />);
}

describe('FairwayEventDetailDrawer — player RSVP gating', () => {
  it('renders RSVP buttons + local-time deadline for a future RSVP event', () => {
    renderDrawer();
    expect(screen.getByText('Going')).toBeInTheDocument();
    expect(screen.getByText('Maybe')).toBeInTheDocument();
    expect(screen.getByText('Decline')).toBeInTheDocument();
    expect(screen.getByText(/Respond by/)).toBeInTheDocument();
  });

  it('hides the RSVP section entirely for non-RSVP events', () => {
    renderDrawer({ event: makeEvent({ requires_rsvp: false, rsvp_deadline: null }) });
    expect(screen.queryByText('Going')).not.toBeInTheDocument();
    expect(screen.queryByText('Your response')).not.toBeInTheDocument();
  });

  it('locks RSVP for past events (no live buttons, em-dash empty response)', () => {
    const past = new Date(Date.now() - 2 * DAY_MS).toISOString();
    renderDrawer({
      event: makeEvent({ start_time: past, start_date: past, rsvp_deadline: null }),
    });
    expect(screen.queryByText('Going')).not.toBeInTheDocument();
    expect(screen.getByText(/already started/)).toBeInTheDocument();
    expect(screen.getByText(/Your response: —/)).toBeInTheDocument();
  });

  it('locks RSVP after the deadline and shows the current response', () => {
    renderDrawer({
      event: makeEvent({ rsvp_deadline: new Date(Date.now() - DAY_MS).toISOString() }),
      rsvpStatus: 'accepted',
    });
    expect(screen.queryByText('Decline')).not.toBeInTheDocument();
    expect(screen.getByText(/deadline has passed/)).toBeInTheDocument();
    expect(screen.getByText(/Your response: Going/)).toBeInTheDocument();
  });

  it('renders typed lock errors from the server with specific copy', async () => {
    const onRespond = vi.fn(
      async (): Promise<RsvpRespondResult> => ({
        success: false,
        error: 'Failed to update RSVP',
        code: 'rsvp_deadline_passed',
      }),
    );
    renderDrawer({ onRespond });
    fireEvent.click(screen.getByText('Going'));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'RSVPs are locked — the deadline has passed.',
      );
    });
  });
});

describe('FairwayEventDetailDrawer — cancelled events', () => {
  it('renders a Cancelled badge and suppresses RSVP', () => {
    renderDrawer({ event: makeEvent({ status: 'cancelled' }) });
    expect(screen.getByText('Cancelled')).toBeInTheDocument();
    expect(screen.queryByText('Going')).not.toBeInTheDocument();
    expect(screen.getByText(/has been cancelled/)).toBeInTheDocument();
  });
});

describe('FairwayEventDetailDrawer — coach view', () => {
  it('mounts AttendancePanel with the { eventId, teamId, canManage } contract', () => {
    renderDrawer({
      isCoach: true,
      onRespond: undefined,
      rsvpSummary: { accepted: 3, declined: 1, tentative: 0, pending: 2, total: 6 },
    });
    const panel = screen.getByTestId('attendance-panel');
    expect(panel).toHaveAttribute('data-event-id', 'evt-1');
    expect(panel).toHaveAttribute('data-team-id', 'team-1');
    expect(panel).toHaveAttribute('data-can-manage', 'true');
    // No player RSVP controls in the coach view.
    expect(screen.queryByText('Going')).not.toBeInTheDocument();
  });
});

// P440 — calendar↔travel cross-link. The drawer offers a "View itinerary" deep
// link ONLY when the reverse join returns a linked trip; otherwise it's hidden
// (honest — never assert a trip that isn't there).
describe('FairwayEventDetailDrawer — linked travel itinerary (P440)', () => {
  beforeEach(() => {
    getItineraryForEvent.mockClear();
  });

  it('renders a "View itinerary" link to Travel HQ when the event has a linked trip', async () => {
    getItineraryForEvent.mockResolvedValueOnce({
      success: true,
      data: { id: 'trip-9', event_name: 'Spring Invitational', destination: 'Pinehurst, NC' },
    });
    renderDrawer();
    const link = await screen.findByRole('link', { name: /View itinerary/i });
    // P440 symmetric fix: deep-links to the SPECIFIC trip (?trip=<id>) so
    // Travel HQ auto-selects it, rather than just landing on the general hub.
    expect(link).toHaveAttribute('href', '/golf/dashboard/travel?trip=trip-9');
    expect(link).toHaveTextContent('Pinehurst, NC');
    expect(getItineraryForEvent).toHaveBeenCalledWith('evt-1');
  });

  it('hides the link when the event has no linked itinerary', async () => {
    getItineraryForEvent.mockResolvedValueOnce({ success: true, data: null });
    renderDrawer();
    // Wait a microtask for the lookup effect to settle, then assert absence.
    await waitFor(() => expect(getItineraryForEvent).toHaveBeenCalled());
    expect(screen.queryByText(/View itinerary/i)).not.toBeInTheDocument();
  });

  it('hides the link (fails silent) when the lookup errors', async () => {
    getItineraryForEvent.mockResolvedValueOnce({ success: false });
    renderDrawer();
    await waitFor(() => expect(getItineraryForEvent).toHaveBeenCalled());
    expect(screen.queryByText(/View itinerary/i)).not.toBeInTheDocument();
  });
});

describe('FairwayEventDetailDrawer — all-day RSVP and response continuity', () => {
  it('allows a response during the server all-day grace window', () => {
    const start = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
    renderDrawer({ event: makeEvent({ start_time: start, start_date: start, all_day: true, rsvp_deadline: null }) });
    expect(screen.getByRole('button', { name: 'Going' })).toBeEnabled();
    expect(screen.queryByText(/already started/)).not.toBeInTheDocument();
  });

  it('locks all-day responses when the grace window has elapsed', () => {
    const start = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    renderDrawer({ event: makeEvent({ start_time: start, start_date: start, all_day: true, rsvp_deadline: null }) });
    expect(screen.queryByRole('button', { name: 'Going' })).not.toBeInTheDocument();
    expect(screen.getByText(/already started/)).toBeInTheDocument();
  });

  it('honors an explicit all-day deadline before the grace window expires', () => {
    const start = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
    renderDrawer({ event: makeEvent({ start_time: start, start_date: start, all_day: true, rsvp_deadline: new Date(Date.now() - 60_000).toISOString() }) });
    expect(screen.queryByRole('button', { name: 'Going' })).not.toBeInTheDocument();
    expect(screen.getByText(/deadline has passed/)).toBeInTheDocument();
  });

  it('keeps a successful response visible until the player chooses to close', async () => {
    const onOpenChange = vi.fn();
    renderDrawer({ onOpenChange });
    fireEvent.click(screen.getByRole('button', { name: 'Going' }));
    expect(await screen.findByText('Response saved · Going')).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('allows retry after a thrown response request', async () => {
    const onRespond = vi.fn().mockRejectedValue(new Error('offline'));
    renderDrawer({ onRespond });
    fireEvent.click(screen.getByRole('button', { name: 'Going' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save your response. Try again.');
    expect(screen.getByRole('button', { name: 'Going' })).toBeEnabled();
  });

  it('ignores a response belonging to the previously opened event', async () => {
    let resolveResponse!: (result: RsvpRespondResult) => void;
    const onRespond = vi.fn(() => new Promise<RsvpRespondResult>((resolve) => { resolveResponse = resolve; }));
    const common = { open: true, isCoach: false, onOpenChange: vi.fn(), onRespond };
    const { rerender } = render(<FairwayEventDetailDrawer {...common} event={makeEvent()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Going' }));
    rerender(<FairwayEventDetailDrawer {...common} event={makeEvent({ id: 'evt-2', title: 'Next event' })} />);
    resolveResponse({ success: false, error: 'Old event error' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Going' })).toBeEnabled());
    expect(screen.queryByText('Old event error')).not.toBeInTheDocument();
    expect(screen.queryByText(/Response saved/)).not.toBeInTheDocument();
  });
});
