/**
 * EmailTrackingView — regression coverage for three confirmed wiring defects:
 *
 * 1. "Resend activity" cross-links used to hardcode `?tab=resend`, a
 *    top-level tab id that no longer exists after the four email surfaces
 *    were merged into Outreach sub-tabs — the link silently no-opped.
 *    Fixed hrefs must resolve both the top-level `outreach` tab AND the
 *    `resend` sub-tab via `?tab=outreach&outreach=resend`.
 * 2. The Bounced tab's "Suppress" button used to write only
 *    `crm_coaches.email_status`, never the canonical `crm_email_suppressions`
 *    table that Settings > Suppressions and the Gmail-direct-send
 *    `isSuppressed()` gate actually read. Fixed: it must also call the
 *    `addSuppression()` server action.
 * 3. `fetchData()` used to swallow fetch errors completely, falling through
 *    to the misleading "No emails sent yet" empty state. Fixed: a query
 *    error must render a distinct error state, not the empty state.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ── framer-motion — strip animation props, render plain elements ──
vi.mock('framer-motion', async () => {
  const React = await import('react');
  return {
    useReducedMotion: () => true,
    motion: new Proxy(
      {},
      {
        get: (_target, prop) =>
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          React.forwardRef<HTMLElement, any>((props, ref) => {
            const { children, layoutId: _l, transition: _t, ...rest } = props;
            void _l; void _t;
            return React.createElement(prop as string, { ...rest, ref }, children);
          }),
      }
    ),
  };
});

// ── fetchAllRowsResult — resolved per-call via a controllable queue ──
type FetchResult = { data: unknown[] | null; error: { message: string } | null };
let fetchQueue: FetchResult[] = [];
const fetchAllRowsResultMock = vi.fn(async (..._args: unknown[]) => fetchQueue.shift() ?? { data: [], error: null });
vi.mock('@/lib/supabase/fetch-all-rows', () => ({
  fetchAllRowsResult: (...args: unknown[]) => fetchAllRowsResultMock(...args),
}));

// ── addSuppression server action ──
const addSuppressionMock = vi.fn(async (..._args: unknown[]) => ({}));
vi.mock('@/app/golf/actions/crm-foundations', () => ({
  addSuppression: (...args: unknown[]) => addSuppressionMock(...args),
}));

// ── logError ──
const logErrorMock = vi.fn();
vi.mock('@/lib/error-logging', () => ({
  logError: (...args: unknown[]) => logErrorMock(...args),
}));

// ── supabase client — .rpc() for stats + .from('crm_coaches').update().eq() for suppress ──
const coachUpdateMock = vi.fn(() => ({ eq: vi.fn(async () => ({ data: null, error: null })) }));
const supabaseClientMock = {
  rpc: vi.fn(async () => ({ data: null, error: { message: 'no rpc' } })),
  from: vi.fn((table: string) => {
    if (table === 'crm_coaches') {
      return { update: coachUpdateMock };
    }
    throw new Error(`unexpected table in test: ${table}`);
  }),
};
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => supabaseClientMock,
}));

import { EmailTrackingView } from '../EmailTrackingView';

function bouncedEmailRow() {
  return {
    id: 'log-1',
    coach_id: 'coach-1',
    contact_type: 'email',
    contact_date: new Date().toISOString(),
    subject: 'Intro',
    body: null,
    resend_message_id: 'rs-1',
    crm_coaches: {
      id: 'coach-1',
      name: 'Alex Coach',
      school: 'State U',
      email: 'alex@example.com',
      email_status: 'unknown',
    },
    crm_email_events: [{ event_type: 'email.bounced', occurred_at: new Date().toISOString() }],
  };
}

describe('EmailTrackingView', () => {
  beforeEach(() => {
    fetchQueue = [];
    fetchAllRowsResultMock.mockClear();
    addSuppressionMock.mockClear();
    logErrorMock.mockClear();
    coachUpdateMock.mockClear();
    supabaseClientMock.rpc.mockClear();
  });

  it('points the Resend activity cross-link at the merged outreach/resend sub-tab', async () => {
    fetchQueue = [
      { data: [bouncedEmailRow()], error: null }, // helm emails
      { data: [bouncedEmailRow()], error: null }, // all outreach
    ];

    render(<EmailTrackingView />);

    await waitFor(() => expect(screen.getAllByText('Resend activity').length).toBeGreaterThan(0));

    for (const link of screen.getAllByText('Resend activity')) {
      const anchor = link.closest('a');
      expect(anchor).not.toBeNull();
      expect(anchor?.getAttribute('href')).toBe('/golf/admin/crm?tab=outreach&outreach=resend');
    }
  });

  it('renders an error state instead of the misleading empty state when the fetch fails', async () => {
    fetchQueue = [
      { data: null, error: { message: 'permission denied for table crm_contact_log' } },
    ];

    render(<EmailTrackingView />);

    await waitFor(() =>
      expect(screen.getByText(/couldn't load email outreach/i)).toBeInTheDocument()
    );
    expect(screen.queryByText(/no emails sent yet/i)).not.toBeInTheDocument();
    expect(logErrorMock).toHaveBeenCalledTimes(1);
  });

  it('writes to the canonical suppression table when suppressing a bounced coach', async () => {
    fetchQueue = [
      { data: [bouncedEmailRow()], error: null },
      { data: [bouncedEmailRow()], error: null },
    ];

    const user = userEvent.setup();
    render(<EmailTrackingView />);

    await waitFor(() => expect(screen.getByText('Bounced (1)')).toBeInTheDocument());
    await user.click(screen.getByText('Bounced (1)'));

    const suppressButton = await screen.findByRole('button', { name: /suppress/i });
    await user.click(suppressButton);

    await waitFor(() => expect(addSuppressionMock).toHaveBeenCalledTimes(1));
    expect(addSuppressionMock).toHaveBeenCalledWith({
      email: 'alex@example.com',
      reason: 'hard_bounce',
    });
    // The legacy write path must still run alongside the new one.
    expect(coachUpdateMock).toHaveBeenCalledWith({ email_status: 'bounced' });
  });
});
