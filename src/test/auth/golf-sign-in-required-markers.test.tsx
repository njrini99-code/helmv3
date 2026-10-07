/**
 * The golf sign-in form is the first screen every coach and player sees.
 *
 * History: on 2026-08-17 production rendered "Email*" next to a plain
 * "Password" because the password label was hand-rolled beside the "Forgot
 * password?" link, so one required field read as optional. The fix at the time
 * added the asterisk to both.
 *
 * The 2026-09 redesign (owner request) removes required markers entirely: a
 * two-field sign-in form doesn't need them, and the fields are now an iOS
 * inset-grouped pair with placeholder-only visible names. This test still
 * guards what the original one cared about, which is that the two fields are
 * treated the same:
 *   - neither label carries a marker (no asymmetry can come back),
 *   - both inputs keep a bound <label> and stay genuinely `required`,
 *   - the password-reset escape hatch is still offered (now below the button).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { GolfSignInForm } from '@/components/auth/golf-sign-in-form';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/app/golf/actions/auth', () => ({ loginAction: vi.fn() }));
vi.mock('@/lib/error-logging', () => ({ logError: vi.fn() }));
vi.mock('@/lib/utils/capacitor', () => ({ triggerHaptic: vi.fn() }));
vi.mock('@/lib/fairway/haptics', () => ({ fwHapticSequence: vi.fn(), fwHaptic: vi.fn() }));

afterEach(() => cleanup());

/** The label element associated with an input, by its `for`/`id` pairing. */
function labelTextFor(id: string): string {
  const label = document.querySelector(`label[for="${id}"]`);
  if (!label) throw new Error(`no label bound to #${id}`);
  return label.textContent ?? '';
}

describe('golf sign-in — required markers', () => {
  it('labels both fields identically, with no required asterisk on either', () => {
    render(<GolfSignInForm />);

    expect(labelTextFor('golf-signin-email')).toBe('Email');
    expect(labelTextFor('golf-signin-password')).toBe('Password');
    expect(document.body.textContent).not.toContain('*');
  });

  it('keeps both inputs genuinely required', () => {
    render(<GolfSignInForm />);

    const email = document.querySelector<HTMLInputElement>('#golf-signin-email');
    const password = document.querySelector<HTMLInputElement>('#golf-signin-password');
    expect(email?.required).toBe(true);
    expect(password?.required).toBe(true);
  });

  it('still offers the password-reset escape hatch', () => {
    render(<GolfSignInForm />);
    const link = screen.getByRole('link', { name: /forgot password/i });
    expect(link.getAttribute('href')).toBe('/golf/forgot-password');
  });
});
