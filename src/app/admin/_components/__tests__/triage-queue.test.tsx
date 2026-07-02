import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TriageQueue } from '@/app/admin/_components/TriageQueue';
import type { TriageItem } from '@/lib/admin/data/triage';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

const appItem: TriageItem = {
  key: 'app:fp-1', origin: 'app', title: 'savePartialRound failed', severity: 'error',
  sport: 'golf', occurrences: 3, affectedUsers: 2,
  firstSeen: '2026-07-01T00:00:00Z', lastSeen: '2026-07-01T02:00:00Z',
  permalink: null, eventIds: ['e1', 'e2', 'e3'], substatus: null,
};
const sentryItem: TriageItem = {
  key: 'sentry:s1', origin: 'sentry', title: 'TypeError in rounds', severity: 'error',
  sport: null, occurrences: 40, affectedUsers: 7,
  firstSeen: '2026-06-30T00:00:00Z', lastSeen: '2026-07-01T01:00:00Z',
  permalink: 'https://sentry.io/x', eventIds: [], substatus: 'regressed',
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
});
