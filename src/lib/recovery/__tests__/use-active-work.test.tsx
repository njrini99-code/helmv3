import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

import { useActiveWork } from '@/lib/recovery/use-active-work';

/**
 * The coordinator's work-state gate is only as good as the screens that feed
 * it. This pins the contract the round-entry screens rely on: registered for
 * as long as the screen is mounted, re-registered when the predicate flips,
 * and released on unmount so a stale "dirty" cannot suppress recovery forever.
 */

const registerWork = vi.fn();
const releaseWork = vi.fn();

function Screen({ dirty }: { dirty: boolean }) {
  useActiveWork('golf-round-continue', dirty);
  return null;
}

beforeEach(() => {
  registerWork.mockClear();
  releaseWork.mockClear();
  (window as unknown as { __helmRecovery?: unknown }).__helmRecovery = {
    registerWork,
    releaseWork,
  };
});

afterEach(() => {
  cleanup();
  delete (window as unknown as { __helmRecovery?: unknown }).__helmRecovery;
});

describe('useActiveWork', () => {
  it('registers the screen as dirty while it has unsaved work', () => {
    render(<Screen dirty />);
    expect(registerWork).toHaveBeenCalledWith('golf-round-continue', 'dirty');
  });

  it('registers clean work as clean rather than staying silent', () => {
    render(<Screen dirty={false} />);
    expect(registerWork).toHaveBeenCalledWith('golf-round-continue', 'clean');
  });

  it('re-registers when the screen becomes dirty', () => {
    const { rerender } = render(<Screen dirty={false} />);
    registerWork.mockClear();
    rerender(<Screen dirty />);
    expect(registerWork).toHaveBeenCalledWith('golf-round-continue', 'dirty');
  });

  it('releases on unmount so a departed screen cannot block recovery', () => {
    const { unmount } = render(<Screen dirty />);
    unmount();
    expect(releaseWork).toHaveBeenCalledWith('golf-round-continue');
  });

  it('is inert when the boot coordinator is not installed', () => {
    delete (window as unknown as { __helmRecovery?: unknown }).__helmRecovery;
    expect(() => render(<Screen dirty />)).not.toThrow();
  });
});
