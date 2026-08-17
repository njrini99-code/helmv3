/**
 * The golf sign-in form is the first screen every coach and player sees.
 *
 * Both fields are genuinely required — verified in production 2026-08-17 on
 * helmsportslabs.com/golf/login, where the DOM reports `required: true` and
 * `aria-required: "true"` on BOTH inputs. But the rendered labels read:
 *
 *     Email*        <- shared <Input label="Email" required /> adds the marker
 *     Password      <- hand-rolled <label>, no marker
 *
 * The password field is hand-rolled because it needs the "Forgot password?"
 * link on the same row (golf-sign-in-form.tsx:287-296), which the shared
 * component cannot express — so it silently loses the asterisk the shared
 * component would have supplied.
 *
 * The consequence is small but it is on the highest-traffic screen in the
 * product: a user scanning the form sees exactly one field marked required and
 * can reasonably read the other as optional. The two fields are also visually
 * inconsistent with each other, side by side.
 *
 * Assertion is on the RENDERED label, not the input attribute — the attribute
 * was already correct, and testing it would have passed while the user-visible
 * defect remained.
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
vi.mock('@/lib/fairway/haptics', () => ({ fwHapticSequence: vi.fn() }));

afterEach(() => cleanup());

/** The label element associated with an input, by its `for`/`id` pairing. */
function labelTextFor(id: string): string {
  const label = document.querySelector(`label[for="${id}"]`);
  if (!label) throw new Error(`no label bound to #${id}`);
  return label.textContent ?? '';
}

describe('golf sign-in — required markers', () => {
  it('marks BOTH required fields, not just the email', () => {
    render(<GolfSignInForm />);

    expect(labelTextFor('golf-signin-email')).toContain('*');
    expect(labelTextFor('golf-signin-password')).toContain('*');
  });

  it('keeps both inputs genuinely required (the attribute half was never broken)', () => {
    render(<GolfSignInForm />);

    const email = document.querySelector<HTMLInputElement>('#golf-signin-email');
    const password = document.querySelector<HTMLInputElement>('#golf-signin-password');
    expect(email?.required).toBe(true);
    expect(password?.required).toBe(true);
  });

  it('still offers the password-reset escape hatch beside the label', () => {
    // The hand-rolled label exists to fit this link on the same row; a fix that
    // reverts to the shared <Input label=...> would drop it.
    render(<GolfSignInForm />);
    expect(screen.getByRole('link', { name: /forgot password/i })).toBeTruthy();
  });
});
