import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { AutoRefresh } from '@/app/admin/_components/AutoRefresh';

const mockRefresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh, push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
}

describe('AutoRefresh', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockRefresh.mockClear();
    setVisibility('visible');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders nothing', () => {
    const { container } = render(<AutoRefresh />);
    expect(container.firstChild).toBeNull();
  });

  it('calls router.refresh() on the configured interval while the tab is visible', () => {
    render(<AutoRefresh intervalMs={5000} />);
    expect(mockRefresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(5000);
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(10000);
    expect(mockRefresh).toHaveBeenCalledTimes(3);
  });

  it('pauses while the tab is hidden', () => {
    render(<AutoRefresh intervalMs={5000} />);
    setVisibility('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(20000);
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});
