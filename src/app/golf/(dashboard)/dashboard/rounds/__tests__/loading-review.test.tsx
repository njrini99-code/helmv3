import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * E-1 (audit 2026-11-19): a tap on a round before Next knows the review's route shape commits onto the rounds boundary.
 * At a round's address it draws the review's skeleton (with the hero the row carried), not the team list's.
 */
const nav = vi.hoisted(() => ({ path: '/golf/dashboard/rounds' }));
vi.mock('next/navigation', () => ({ usePathname: () => nav.path }));
vi.mock('@/clubhouse/shell/context', () => ({ useClubhouseRole: () => 'coach' }));

import Loading from '../loading';

afterEach(cleanup);

describe('the rounds loading boundary', () => {
  it('is the team list at the list', () => {
    nav.path = '/golf/dashboard/rounds';
    const { container } = render(<Loading />);
    expect(container.querySelector('main')!.getAttribute('aria-label')).toBe('Loading team rounds');
  });

  it('is the review at a round', () => {
    nav.path = '/golf/dashboard/rounds/57413afb-0000-4000-8000-000000000000';
    const { container } = render(<Loading />);
    expect(container.querySelector('main')!.getAttribute('aria-label')).toBe('Loading the round');
  });

  it('is the list at a round entry address', () => {
    nav.path = '/golf/dashboard/rounds/new';
    const { container } = render(<Loading />);
    expect(container.querySelector('main')!.getAttribute('aria-label')).toBe('Loading team rounds');
  });
});
