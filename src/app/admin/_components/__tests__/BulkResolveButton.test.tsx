import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BulkResolveButton } from '@/app/admin/_components/BulkResolveButton';

/**
 * BulkResolveButton is the shape ResolveErrorButton's two-step confirm was
 * unified onto (2026-08-25). These tests pin that shape down directly so a
 * future change to one button doesn't silently drift from the other.
 */

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
}));

beforeEach(() => {
  refresh.mockClear();
});

describe('BulkResolveButton', () => {
  it('renders nothing when there is nothing to resolve', () => {
    const { container } = render(<BulkResolveButton eventIds={[]} onResolve={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the filtered count and requires a confirm before resolving', () => {
    const onResolve = vi.fn(async () => ({ resolvedCount: 3 }));
    render(<BulkResolveButton eventIds={['e1', 'e2', 'e3']} onResolve={onResolve} />);

    expect(screen.getByRole('button', { name: /resolve all \(filtered\) · 3/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /resolve all \(filtered\)/i }));

    expect(onResolve).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /confirm — resolve 3/i })).toBeInTheDocument();
    expect(screen.getByText('This cannot be undone.')).toBeInTheDocument();
  });

  it('Cancel backs out without calling onResolve', () => {
    const onResolve = vi.fn(async () => ({ resolvedCount: 3 }));
    render(<BulkResolveButton eventIds={['e1', 'e2', 'e3']} onResolve={onResolve} />);
    fireEvent.click(screen.getByRole('button', { name: /resolve all \(filtered\)/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onResolve).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /resolve all \(filtered\) · 3/i })).toBeInTheDocument();
  });

  it('Confirm resolves the exact filtered eventIds and refreshes on success', async () => {
    const onResolve = vi.fn(async () => ({ resolvedCount: 3 }));
    render(<BulkResolveButton eventIds={['e1', 'e2', 'e3']} onResolve={onResolve} />);
    fireEvent.click(screen.getByRole('button', { name: /resolve all \(filtered\)/i }));
    fireEvent.click(screen.getByRole('button', { name: /confirm — resolve 3/i }));

    expect(onResolve).toHaveBeenCalledWith(['e1', 'e2', 'e3']);
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('surfaces a rejection instead of a silent no-op, and does not refresh', async () => {
    const onResolve = vi.fn(async () => {
      throw new Error('Unauthorized');
    });
    render(<BulkResolveButton eventIds={['e1']} onResolve={onResolve} />);
    fireEvent.click(screen.getByRole('button', { name: /resolve all \(filtered\)/i }));
    fireEvent.click(screen.getByRole('button', { name: /confirm — resolve 1/i }));

    await waitFor(() => expect(screen.getByText('Unauthorized')).toBeInTheDocument());
    expect(refresh).not.toHaveBeenCalled();
  });
});
