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
  report: '# Incident report: TypeError in rounds',
};

describe('TriageQueue', () => {
  it('renders one aggregated row per incident with user + occurrence counts', () => {
    render(<TriageQueue items={[appItem, sentryItem]} onResolve={vi.fn()} />);
    expect(screen.getByText('savePartialRound failed')).toBeInTheDocument();
    expect(screen.getByText(/2 users/)).toBeInTheDocument();
    expect(screen.getByText(/3 events/)).toBeInTheDocument();
    expect(screen.getByText(/source server_action/)).toBeInTheDocument();
    expect(screen.getByText(/action savePartialRound/)).toBeInTheDocument();
  });
  it('app rows expose Resolve; sentry rows keep the permalink AND gain their own in-app Resolve', () => {
    const onResolve = vi.fn(async () => ({ resolvedCount: 3 }));
    render(<TriageQueue items={[appItem, sentryItem]} onResolve={onResolve} onResolveSentry={vi.fn()} />);
    // Both origins now render a "Resolve" button — app row first, matching
    // array order (TriageQueue renders in the order it's given).
    const resolveButtons = screen.getAllByRole('button', { name: /^resolve$/i });
    expect(resolveButtons).toHaveLength(2);
    fireEvent.click(resolveButtons[0]!);
    expect(onResolve).toHaveBeenCalledWith(['e1', 'e2', 'e3']);
    const link = screen.getByRole('link', { name: /open in sentry/i });
    expect(link).toHaveAttribute('href', 'https://sentry.io/x');
  });
  it('renders the celebratory all-clear when empty', () => {
    render(<TriageQueue items={[]} onResolve={vi.fn()} />);
    expect(screen.getByText(/nothing in the queue/i)).toBeInTheDocument();
  });
  it('resolved rows leave the list optimistically', async () => {
    const onResolve = vi.fn(async () => ({ resolvedCount: 3 }));
    render(<TriageQueue items={[appItem]} onResolve={onResolve} />);
    fireEvent.click(screen.getByRole('button', { name: /resolve/i }));
    await waitFor(() =>
      expect(screen.queryByText('savePartialRound failed')).not.toBeInTheDocument(),
    );
  });
  it('restores the row and surfaces the error when resolveTriageEvents rejects', async () => {
    const onResolve = vi.fn(async () => {
      throw new Error('Unauthorized');
    });
    render(<TriageQueue items={[appItem]} onResolve={onResolve} />);
    fireEvent.click(screen.getByRole('button', { name: /resolve/i }));
    // Optimistically hidden immediately after the click...
    await waitFor(() => expect(onResolve).toHaveBeenCalled());
    // ...but reconciled back once the rejection is observed.
    await waitFor(() =>
      expect(screen.getByText('savePartialRound failed')).toBeInTheDocument(),
    );
    expect(screen.getByText(/resolve failed/i)).toBeInTheDocument();
    expect(screen.getByText(/unauthorized/i)).toBeInTheDocument();
    // The Resolve button must still be usable for a retry.
    expect(screen.getByRole('button', { name: /resolve/i })).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole('button', { name: /resolve/i }));
    expect(onResolveSentry).toHaveBeenCalledWith('s1');
  });

  it('hides the row optimistically, then keeps it hidden on success', async () => {
    const onResolveSentry = vi.fn(async () => ({ ok: true }));
    render(<TriageQueue items={[sentryItem]} onResolveSentry={onResolveSentry} />);
    fireEvent.click(screen.getByRole('button', { name: /resolve/i }));
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
    fireEvent.click(screen.getByRole('button', { name: /resolve/i }));
    await waitFor(() => expect(onResolveSentry).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByText('TypeError in rounds')).toBeInTheDocument(),
    );
    expect(screen.getByText(/token lacks event:write/)).toBeInTheDocument();
    // Still resolvable — a retry must remain possible.
    expect(screen.getByRole('button', { name: /resolve/i })).toBeInTheDocument();
  });

  it('restores the row and surfaces the error when the action rejects outright', async () => {
    const onResolveSentry = vi.fn(async () => {
      throw new Error('Forbidden');
    });
    render(<TriageQueue items={[sentryItem]} onResolveSentry={onResolveSentry} />);
    fireEvent.click(screen.getByRole('button', { name: /resolve/i }));
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
    expect(screen.getByRole('button', { name: /resolve/i })).toBeInTheDocument();
  });
});
