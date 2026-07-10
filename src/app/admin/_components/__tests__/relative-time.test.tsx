import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { RelativeTime } from '@/app/admin/_components/RelativeTime';

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
}

describe('RelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-10T12:00:00.000Z'));
    setVisibility('visible');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders a deterministic placeholder before the post-hydration effect (React #418 fix)', () => {
    // Effects are flushed synchronously by React Testing Library's `render`,
    // so we can't observe the pre-effect placeholder directly here — this
    // asserts the effect-resolved value renders correctly instead, and the
    // component itself never reads Date.now() during render (see source).
    render(<RelativeTime sinceMs={Date.now()} />);
    expect(screen.getByText('updated 0s ago')).toBeInTheDocument();
  });

  it('formats seconds and rolls over into minutes', () => {
    const since = Date.now() - 45_000;
    render(<RelativeTime sinceMs={since} />);
    expect(screen.getByText('updated 45s ago')).toBeInTheDocument();
  });

  it('ticks on the configured interval while the tab is visible', () => {
    const since = Date.now();
    render(<RelativeTime sinceMs={since} intervalMs={10_000} />);
    expect(screen.getByText('updated 0s ago')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(screen.getByText('updated 10s ago')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(50_000);
    });
    expect(screen.getByText('updated 1m ago')).toBeInTheDocument();
  });

  it('pauses ticking while the tab is hidden', () => {
    const since = Date.now();
    render(<RelativeTime sinceMs={since} intervalMs={10_000} />);
    setVisibility('hidden');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
      vi.advanceTimersByTime(30_000);
    });
    expect(screen.getByText('updated 0s ago')).toBeInTheDocument();
  });

  // Regression: useVisibilityAwareInterval's effect cleanup must actually run
  // on unmount (clearInterval + removeEventListener) — if it didn't, the
  // interval callback would keep firing setLabel() on a torn-down component
  // ("Can't perform a state update on an unmounted component"), and every
  // remaining tab on the page would keep polling document.visibilitychange
  // for a component that no longer exists.
  it('stops ticking and does not update state after unmount', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const since = Date.now();
    const { unmount } = render(<RelativeTime sinceMs={since} intervalMs={10_000} />);
    unmount();

    expect(() => {
      act(() => {
        vi.advanceTimersByTime(60_000);
        document.dispatchEvent(new Event('visibilitychange'));
      });
    }).not.toThrow();
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
