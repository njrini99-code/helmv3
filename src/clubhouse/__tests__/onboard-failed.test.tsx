import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * GAP-S-04 (P0): /golf/player when the read of who this account is fails. The page says so in the sign-in room, with Try
 * again (CH-15290), and never draws the blank player form, which would hand player onboarding to a coach or to a player
 * who already finished. The loader's own cases are in data/__tests__/onboard-load.test.ts. Synthetic data only.
 */
vi.mock('server-only', () => ({}));
vi.mock('../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn(), back: vi.fn() }));
const redirect = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => router, redirect }));
vi.mock('@/lib/utils/capacitor', () => ({ isNativeApp: () => false }));
vi.mock('../screens/auth/SceneMount', () => ({ SceneMount: () => null }));
const load = vi.hoisted(() => ({ current: { kind: 'failed' } as { kind: string } }));
vi.mock('../data/onboard', () => ({ loadPlayerOnboard: async () => load.current }));
vi.mock('../screens/onboard/Onboard', () => ({ Onboard: () => <form aria-label="player form" /> }));

import { ClubhousePlayerOnboardRoute } from '../routes/onboard';

beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false, onchange: null }));
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('player onboarding when the account read fails (GAP-S-04)', () => {
  it('CH-15290 says the account couldn’t be checked, with Try again, and never draws the player form', async () => {
    load.current = { kind: 'failed' };
    const { container } = render(await ClubhousePlayerOnboardRoute());
    const failed = container.querySelector('[data-ch-code="CH-15290"]');
    expect(failed).not.toBeNull();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Your game');
    expect(failed!.textContent).toMatch(/We couldn’t check your account just now\. Nothing you saved is lost\. Try again\./);
    expect(screen.queryByRole('form', { name: 'player form' })).toBeNull();
    expect(redirect).not.toHaveBeenCalled();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }));
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it('a read that answered draws the player form as before', async () => {
    load.current = { kind: 'ready', seed: { first: 'Ana' } } as never;
    const { container } = render(await ClubhousePlayerOnboardRoute());
    expect(container.querySelector('[data-ch-code="CH-15290"]')).toBeNull();
    expect(screen.getByRole('form', { name: 'player form' })).toBeTruthy();
  });
});
