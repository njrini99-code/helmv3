import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { ToastProvider, useToast } from '../ui/Toast';

/**
 * A toast's dismiss timer outlived its provider: on CI (#2110) a roster test's
 * toast fired setState after the test environment was torn down
 * ("window is not defined"). The provider now clears its timers on unmount.
 */

function Fire() {
  const toast = useToast();
  useEffect(() => {
    toast({ title: 'Saved' });
  }, [toast]);
  return null;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('ToastProvider timers', () => {
  it('dismisses after its delay while mounted', () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <Fire />
      </ToastProvider>,
    );
    expect(screen.getByText('Saved')).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears pending dismiss timers when it unmounts', () => {
    vi.useFakeTimers();
    const { unmount } = render(
      <ToastProvider>
        <Fire />
      </ToastProvider>,
    );
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a new scope (a team switch) clears the old stack; the same scope keeps it', async () => {
    const { rerender } = render(
      <ToastProvider scope="t-men">
        <Fire />
      </ToastProvider>,
    );
    expect(screen.getByText('Saved')).toBeTruthy();
    rerender(
      <ToastProvider scope="t-men">
        <Fire />
      </ToastProvider>,
    );
    expect(screen.getByText('Saved')).toBeTruthy();
    rerender(
      <ToastProvider scope="t-women">
        <Fire />
      </ToastProvider>,
    );
    await waitFor(() => expect(screen.queryByText('Saved')).toBeNull());
  });
});
