import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * /golf/forgot-password for a signed-in visitor (CH-15920): Clubhouse's reset form in the sign-in room. Ported from the
 * retired Fairway page's regression guard (docs/ui-audits/GAPS_AUDIT_ONBOARDING_2026-09-02.md §2): a malformed or empty
 * address never reaches the server action, so there is no false "sent" screen.
 */

vi.mock('../../../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../../../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('@/lib/error-logging', () => ({ logError: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn(), back: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
const reset = vi.hoisted(() => vi.fn());
vi.mock('@/app/golf/actions/auth', () => ({ requestPasswordResetAction: reset }));
vi.mock('@/lib/utils/capacitor', () => ({ isNativeApp: () => false }));
vi.mock('../SceneMount', () => ({ SceneMount: () => null }));

import { RESET_EMPTY_MESSAGE, RESET_INVALID_MESSAGE } from '../forgot-state';
import { SignedInReset } from '../SignedInReset';

beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false, onchange: null }));
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

const email = () => screen.getByRole('textbox', { name: 'Email' }) as HTMLInputElement;
const send = () => screen.getByRole('button', { name: /^send(ing)? reset link/i });

describe('the signed-in reset page', () => {
  it('fills in the visitor’s own address and sends to it', async () => {
    reset.mockResolvedValue({ success: true, message: 'sent' });
    const user = userEvent.setup();
    render(<SignedInReset email="coach@example.com" requestReset={reset} />);
    expect(email().value).toBe('coach@example.com');
    await user.click(send());
    await waitFor(() => expect(reset).toHaveBeenCalledWith('coach@example.com'));
    expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeInTheDocument();
  });

  it('never calls the action for a malformed address', async () => {
    const user = userEvent.setup();
    render(<SignedInReset email="" requestReset={reset} />);
    await user.type(email(), 'not-an-email');
    await user.click(send());
    expect(await screen.findByText(RESET_INVALID_MESSAGE)).toBeInTheDocument();
    expect(reset).not.toHaveBeenCalled();
    expect(screen.queryByRole('heading', { name: 'Check your email' })).not.toBeInTheDocument();
  });

  it('never calls the action for an empty address', async () => {
    const user = userEvent.setup();
    render(<SignedInReset email="" requestReset={reset} />);
    await user.click(send());
    expect(await screen.findByText(RESET_EMPTY_MESSAGE)).toBeInTheDocument();
    expect(reset).not.toHaveBeenCalled();
  });

  it('goes back to Settings, not sign in', async () => {
    const user = userEvent.setup();
    render(<SignedInReset email="coach@example.com" requestReset={reset} />);
    await user.click(screen.getByRole('link', { name: 'Sign in' }));
    expect(router.push).toHaveBeenCalledWith('/golf/dashboard/settings');
  });
});
