import { LazyMotion, domAnimation } from 'motion/react';
import type { ReactNode } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }), usePathname: () => '/golf/dashboard/practice/plan/x' }));

import { ToastProvider } from '../../ui/Toast';
import { ClubhouseNotFound } from '../NotFound';

const wrap = (node: ReactNode) =>
  render(
    <LazyMotion features={domAnimation}>
      <ToastProvider>
        <div className="ch-root" data-ui="clubhouse">{node}</div>
      </ToastProvider>
    </LazyMotion>,
  );

afterEach(cleanup);

const page = () => document.querySelector('[data-ch-code="CH-1306"]') as HTMLElement | null;

/**
 * GAP-S-24: one voice for missing content. A section's not-found names the thing and goes back to the section; the
 * dashboard's own names nothing and goes Home. Both say the same line.
 */
describe('ClubhouseNotFound · one not-found voice (CH-1306)', () => {
  it('names the thing and goes back to its section', async () => {
    wrap(<ClubhouseNotFound thing="This plan" back={{ href: '/golf/dashboard/practice', label: 'Back to Practice' }} />);
    await waitFor(() => expect(page()).not.toBeNull());
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('This plan isn’t here');
    expect(page()!.textContent).toMatch(/It may have been deleted, or the link is wrong\./);
    const back = screen.getByRole('link', { name: 'Back to Practice' });
    expect(back.getAttribute('href')).toBe('/golf/dashboard/practice');
    expect(screen.queryByRole('link', { name: 'Back to Home' })).toBeNull();
  });

  it('without a thing is the dashboard 404, the same line, and goes Home', async () => {
    wrap(<ClubhouseNotFound />);
    await waitFor(() => expect(page()).not.toBeNull());
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('We couldn’t find that');
    expect(page()!.textContent).toMatch(/It may have been deleted, or the link is wrong\./);
    expect(screen.getByRole('link', { name: 'Back to Home' }).getAttribute('href')).toBe('/golf/dashboard');
  });
});
