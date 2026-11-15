import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

/**
 * Swap audit F-30: the loading boundary above the dashboard layout painted Fairway's shell and dashboard skeleton on
 * every cold entry. Clubhouse is the only coach and player UI (Fairway retired, 2026-11-14), so it always draws
 * Clubhouse's frame, and it reads nothing from the request to do so.
 */
vi.mock('server-only', () => ({}));
const reads = vi.hoisted(() => ({ session: 0 }));
vi.mock('@/lib/auth/session', () => ({
  getGolfSessionProfile: async () => {
    reads.session += 1;
    return null;
  },
}));
vi.mock('../lib/fonts', () => ({ clubhouseFontVariables: '' }));

import GolfLoading from '@/app/golf/loading';

describe('/golf loading boundary', () => {
  it('draws the Clubhouse frame, and only it', () => {
    const { container } = render(<GolfLoading />);
    expect(container.querySelector('[data-ui="clubhouse"]')).not.toBeNull();
    expect(container.querySelector('.ch-topbar')).not.toBeNull();
    expect(container.querySelector('[data-loading-frame="neutral"]')).toBeNull();
    expect(container.querySelector('.fairway-ds')).toBeNull();
    expect(reads.session).toBe(0);
  });

  it('marks itself for the front door’s boot script, which hides it on a hard load of the sign in', () => {
    const { container } = render(<GolfLoading />);
    expect(container.querySelector('[data-ch-boot-skeleton]')).not.toBeNull();
  });
});
