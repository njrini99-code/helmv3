import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Audit 2026-11-18 (P2): Home's round links ("Open recap", "Round recap") were not fetched ahead, so a tap committed the
 * review about 580 ms later (WebKit, coach phone) against about 45 ms from the Rounds list, whose rows are. A Button link
 * with `ahead` is marked for the idle fetch and fetches its page as the press starts, as list rows do.
 */
vi.mock('../../lib/haptics', () => ({ haptic: vi.fn() }));
import { Button } from '../Button';

afterEach(cleanup);

describe('Button ahead (A13)', () => {
  it('marks the link for the idle fetch and fetches it whole as the press starts', () => {
    const prefetch = vi.fn();
    const router = { prefetch, push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn() };
    render(
      <AppRouterContext.Provider value={router as never}>
        <Button href="/golf/dashboard/rounds/r1?from=home" ahead>
          Open recap
        </Button>
      </AppRouterContext.Provider>,
    );
    const a = screen.getByRole('link', { name: 'Open recap' });
    expect(a.getAttribute('data-ch-ahead')).toBe('/golf/dashboard/rounds/r1?from=home');
    fireEvent.pointerDown(a);
    expect(prefetch.mock.calls.some((c) => c[0] === '/golf/dashboard/rounds/r1?from=home')).toBe(true);
  });

  it('a plain link button fetches nothing ahead', () => {
    render(<Button href="/golf/dashboard/messages">Message team</Button>);
    expect(screen.getByRole('link', { name: 'Message team' }).hasAttribute('data-ch-ahead')).toBe(false);
  });
});
