import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { TriageQueue } from '@/app/admin/_components/TriageQueue';
import type { TriageItem } from '@/lib/admin/data/triage';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

// next/link's prefetch path calls `new IntersectionObserver(...)`; the
// global jsdom mock in src/test/setup.tsx is a plain vi.fn() (not
// constructor-callable), so any real next/link in a mounted tree throws.
// Swap in a plain anchor for this suite (app-row click-through, W6).
vi.mock('next/link', () => ({
  default: ({ children, href, className }: { children: ReactNode; href: string; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}));

const appItem: TriageItem = {
  key: 'app:fp-1', origin: 'app', title: 'savePartialRound failed', severity: 'error',
  sport: 'golf', occurrences: 3, affectedUsers: 2,
  firstSeen: '2026-07-01T00:00:00Z', lastSeen: '2026-07-01T02:00:00Z',
  permalink: null, eventIds: ['e1', 'e2', 'e3'], substatus: null,
  source: 'server_action', feature: 'rounds', actionName: 'savePartialRound', route: '/api/golf/rounds',
  klass: 'defect', actionable: true, klassReason: 'Unexpected failure (severity-derived)',
  hasDegradedMessage: false,
  errorCode: '42501',
  fingerprint: 'fp-1',
  hasRca: true,
  isFixture: false,
  description: 'savePartialRound failed',
  report: '# Incident report: savePartialRound failed',
};
const sentryItem: TriageItem = {
  key: 'sentry:s1', origin: 'sentry', title: 'TypeError in rounds', severity: 'error',
  sport: null, occurrences: 40, affectedUsers: 7,
  firstSeen: '2026-06-30T00:00:00Z', lastSeen: '2026-07-01T01:00:00Z',
  permalink: 'https://sentry.io/x', eventIds: [], substatus: 'regressed',
  source: 'sentry', feature: null, actionName: null, route: 'rounds',
  klass: 'defect', actionable: true, klassReason: 'Unexpected failure (severity-derived)',
  hasDegradedMessage: false,
  errorCode: null,
  fingerprint: null,
  hasRca: false,
  isFixture: false,
  description: 'TypeError in rounds',
  report: '# Incident report: TypeError in rounds',
};

describe('TriageQueue', () => {
  it('renders one aggregated row per incident with user + occurrence counts', () => {
    render(<TriageQueue items={[appItem, sentryItem]} onResolve={vi.fn()} />);
    expect(screen.getByText('savePartialRound failed')).toBeInTheDocument();
    expect(screen.getByText(/2 users/)).toBeInTheDocument();
    // The count renders as a bare number so a column of them scans
    // vertically; the unit travels as its accessible name.
    expect(screen.getByLabelText('3 events')).toBeInTheDocument();
    // Metadata is now a strip of discrete tags rather than one run-on mono
    // sentence ("source X · feature Y · action Z · route <absolute URL>"),
    // so each is asserted as its own exact chip.
    expect(screen.getByText('server_action')).toBeInTheDocument();
    expect(screen.getByText('savePartialRound')).toBeInTheDocument();
    // 'rounds' is the app row's FEATURE and also the sentry row's route,
    // so it legitimately appears twice — assert presence, not uniqueness.
    expect(screen.getAllByText('rounds').length).toBeGreaterThan(0);
    // The error code is the point of the redesign: two incidents with the
    // same title are told apart by this, and it is copyable.
    // The code is the most identifying fact on the row, so it leads the fact
    // line as text rather than sitting in its own black chip. Copying is the
    // whole-report control — one copy affordance per row, not two.
    expect(screen.getByText('42501')).toBeInTheDocument();
    // Two rows render, so two copy controls — one per incident.
    expect(screen.getAllByRole('button', { name: /copy incident report/i })).toHaveLength(2);
  });
  it('app rows expose Resolve; sentry rows keep the permalink AND gain their own in-app Resolve', () => {
    const onResolve = vi.fn(async () => ({ resolvedCount: 3 }));
    render(<TriageQueue items={[appItem, sentryItem]} onResolve={onResolve} onResolveSentry={vi.fn()} />);
    // Both origins now render a "Resolve" button — app row first, matching
    // array order (TriageQueue renders in the order it's given).
    const resolveButtons = screen.getAllByRole('button', { name: /resolve incident/i });
    expect(resolveButtons).toHaveLength(2);
    fireEvent.click(resolveButtons[0]!);
    expect(onResolve).toHaveBeenCalledWith(['e1', 'e2', 'e3']);
    const link = screen.getByRole('link', { name: /open in sentry/i });
    expect(link).toHaveAttribute('href', 'https://sentry.io/x');
  });
  it('links to the analysis when one exists, and shows nothing when it does not', () => {
    // The routine wrote five correct analyses on 2026-08-27 and every one was
    // unreachable: the detail page rendered them, the list never said they
    // existed. This is the door. Asserted both ways so a regression that drops
    // the link OR one that shows it on every row both fail.
    render(<TriageQueue items={[appItem, sentryItem]} onResolve={vi.fn()} />);
    const rca = screen.getByRole('link', { name: /rca/i });
    expect(rca).toHaveAttribute('href', '/admin/errors/fp-1#rca');
    // Exactly one — sentryItem has hasRca false and carries no app fingerprint.
    expect(screen.getAllByRole('link', { name: /rca/i })).toHaveLength(1);
  });

  it('shows no RCA link when nothing has been analysed', () => {
    render(<TriageQueue items={[{ ...appItem, hasRca: false }]} onResolve={vi.fn()} />);
    expect(screen.queryByRole('link', { name: /rca/i })).not.toBeInTheDocument();
  });

  it('renders the celebratory all-clear when empty', () => {
    render(<TriageQueue items={[]} onResolve={vi.fn()} />);
    expect(screen.getByText(/nothing in the queue/i)).toBeInTheDocument();
  });
  it('resolved rows leave the list optimistically', async () => {
    const onResolve = vi.fn(async () => ({ resolvedCount: 3 }));
    render(<TriageQueue items={[appItem]} onResolve={onResolve} />);
    fireEvent.click(screen.getAllByRole('button', { name: /resolve incident/i })[0]!);
    await waitFor(() =>
      expect(screen.queryByText('savePartialRound failed')).not.toBeInTheDocument(),
    );
  });
  it('restores the row and surfaces the error when resolveTriageEvents rejects', async () => {
    const onResolve = vi.fn(async () => {
      throw new Error('Unauthorized');
    });
    render(<TriageQueue items={[appItem]} onResolve={onResolve} />);
    fireEvent.click(screen.getAllByRole('button', { name: /resolve incident/i })[0]!);
    // Optimistically hidden immediately after the click...
    await waitFor(() => expect(onResolve).toHaveBeenCalled());
    // ...but reconciled back once the rejection is observed.
    await waitFor(() =>
      expect(screen.getByText('savePartialRound failed')).toBeInTheDocument(),
    );
    expect(screen.getByText(/resolve failed/i)).toBeInTheDocument();
    expect(screen.getByText(/unauthorized/i)).toBeInTheDocument();
    // The Resolve button must still be usable for a retry.
    expect(screen.getAllByRole('button', { name: /resolve incident/i }).length).toBeGreaterThan(0);
  });
});

describe('TriageQueue — per-row 24h sparkline', () => {
  it('renders a sparkline for an app row when appHourlyBuckets has that fingerprint', () => {
    render(
      <TriageQueue
        items={[appItem]}
        onResolve={vi.fn()}
        appHourlyBuckets={{ 'fp-1': [1, 2, 3, 0, 1, 2, 4, 5, 1, 0, 2, 3, 1, 0, 1, 2, 3, 4, 1, 0, 1, 2, 3, 4] }}
      />,
    );
    expect(screen.getByRole('img', { name: /App events, last 24h/ })).toBeInTheDocument();
  });

  it('renders a sparkline for a sentry row from sentryStats24h keyed by issue id', () => {
    const stats24h: Array<[number, number]> = Array.from({ length: 24 }, (_, i) => [i, i % 3]);
    render(
      <TriageQueue
        items={[sentryItem]}
        onResolve={vi.fn()}
        sentryStats24h={{ s1: stats24h }}
      />,
    );
    expect(screen.getByRole('img', { name: /Sentry events, last 24h/ })).toBeInTheDocument();
  });

  it('renders no sparkline when the caller has no data for that row (default empty maps)', () => {
    render(<TriageQueue items={[appItem, sentryItem]} onResolve={vi.fn()} />);
    expect(screen.queryByRole('img', { name: /events, last 24h/ })).not.toBeInTheDocument();
  });

  it('does not render a sparkline for a series shorter than 2 points — no fixed-size em-dash chip on every bare row', () => {
    render(
      <TriageQueue
        items={[sentryItem]}
        onResolve={vi.fn()}
        sentryStats24h={{ s1: [[0, 5]] }}
      />,
    );
    expect(screen.queryByRole('img', { name: /events, last 24h/ })).not.toBeInTheDocument();
  });
});

describe('TriageQueue — Sentry in-app Resolve', () => {
  it('resolves a Sentry row optimistically and calls the action with the issue id', () => {
    const onResolveSentry = vi.fn(async () => ({ ok: true }));
    render(<TriageQueue items={[sentryItem]} onResolveSentry={onResolveSentry} />);
    fireEvent.click(screen.getAllByRole('button', { name: /resolve incident/i })[0]!);
    expect(onResolveSentry).toHaveBeenCalledWith('s1');
  });

  it('hides the row optimistically, then keeps it hidden on success', async () => {
    const onResolveSentry = vi.fn(async () => ({ ok: true }));
    render(<TriageQueue items={[sentryItem]} onResolveSentry={onResolveSentry} />);
    fireEvent.click(screen.getAllByRole('button', { name: /resolve incident/i })[0]!);
    await waitFor(() =>
      expect(screen.queryByText('TypeError in rounds')).not.toBeInTheDocument(),
    );
  });

  it('restores the row and surfaces the scope message when the action reports unconfigured', async () => {
    const onResolveSentry = vi.fn(async () => ({
      ok: false,
      unconfigured: true,
      error: 'Sentry issue update failed: 403 — token lacks event:write / issue write scope — add a token with write scope',
    }));
    render(<TriageQueue items={[sentryItem]} onResolveSentry={onResolveSentry} />);
    fireEvent.click(screen.getAllByRole('button', { name: /resolve incident/i })[0]!);
    await waitFor(() => expect(onResolveSentry).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByText('TypeError in rounds')).toBeInTheDocument(),
    );
    expect(screen.getByText(/token lacks event:write/)).toBeInTheDocument();
    // Still resolvable — a retry must remain possible.
    expect(screen.getAllByRole('button', { name: /resolve incident/i }).length).toBeGreaterThan(0);
  });

  it('restores the row and surfaces the error when the action rejects outright', async () => {
    const onResolveSentry = vi.fn(async () => {
      throw new Error('Forbidden');
    });
    render(<TriageQueue items={[sentryItem]} onResolveSentry={onResolveSentry} />);
    fireEvent.click(screen.getAllByRole('button', { name: /resolve incident/i })[0]!);
    await waitFor(() => expect(onResolveSentry).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByText('TypeError in rounds')).toBeInTheDocument(),
    );
    expect(screen.getByText(/forbidden/i)).toBeInTheDocument();
  });

  it('keeps the Open in Sentry link working alongside the new Resolve button', () => {
    render(<TriageQueue items={[sentryItem]} onResolveSentry={vi.fn()} />);
    const link = screen.getByRole('link', { name: /open in sentry/i });
    expect(link).toHaveAttribute('href', 'https://sentry.io/x');
    expect(screen.getAllByRole('button', { name: /resolve incident/i }).length).toBeGreaterThan(0);
  });
});
