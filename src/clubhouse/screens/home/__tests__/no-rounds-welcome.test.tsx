import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }), usePathname: () => '/golf/dashboard', useSearchParams: () => new URLSearchParams() }));

import { NoRoundsYet } from '../PlayerHomePhone';
import { postRoundHref } from '../player-links';

/**
 * Staging, 16 Nov 2026 (owner's pick, "Fix the welcome wording only"): the no-rounds welcome asked for a first round while
 * its only button was Add classes. It now names the head's New round whenever round entry is on.
 */
describe('CH-2312 welcome inside the loaded page', () => {
  it('names New round when the head carries it, and keeps the plain line when it does not', () => {
    render(<NoRoundsYet />);
    if (postRoundHref()) expect(screen.getByText(/Post your first round with New round/)).toBeTruthy();
    else expect(screen.getByText(/Your stats start with the first round you post/)).toBeTruthy();
  });
});
