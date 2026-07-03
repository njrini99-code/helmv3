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
  report: '# Incident report: savePartialRound failed',
};
const sentryItem: TriageItem = {
  key: 'sentry:s1', origin: 'sentry', title: 'TypeError in rounds', severity: 'error',
  sport: null, occurrences: 40, affectedUsers: 7,
  firstSeen: '2026-06-30T00:00:00Z', lastSeen: '2026-07-01T01:00:00Z',
  permalink: 'https://sentry.io/x', eventIds: [], substatus: 'regressed',
  report: '# Incident report: TypeError in rounds',
};

describe('TriageQueue', () => {
  it('renders one aggregated row per incident with user + occurrence counts', () => {
    render(<TriageQueue items={[appItem, sentryItem]} onResolve={vi.fn()} />);
    expect(screen.getByText('savePartialRound failed')).toBeInTheDocument();
    expect(screen.getByText(/2 users/)).toBeInTheDocument();
    expect(screen.getByText(/3 events/)).toBeInTheDocument();
  });
  it('app rows expose Resolve; sentry rows expose the permalink instead', () => {
    const onResolve = vi.fn(async () => ({ resolvedCount: 3 }));
    render(<TriageQueue items={[appItem, sentryItem]} onResolve={onResolve} />);
    fireEvent.click(screen.getByRole('button', { name: /resolve/i }));
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
