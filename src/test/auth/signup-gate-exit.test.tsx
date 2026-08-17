/**
 * The signup access-code gate is where every new user arrives from the login
 * page — `login/page.tsx:32` sends "Create an account" to `/golf/signup`.
 *
 * The gate serves exactly one audience. Verified in production 2026-08-17, its
 * entire content is:
 *
 *     Enter your team code
 *     Use the code your coach gave you. You'll join their team automatically.
 *     [ Continue ]
 *     Already have an account? Sign in
 *
 * …with only two links on the page, Home and Sign in.
 *
 * A coach — the buyer, per `.claude/rules/golf-review.md` — has no coach and no
 * team code, and the failure message ("Check it with your coach") points them
 * back at someone who does not exist. Production logs confirm this is the only
 * live path, deliberately:
 *
 *     SIGNUP_ACCESS_CODE is unset — by design: signup is team join_code only
 *     (37 occurrences, most recent 2026-08-17 02:46 UTC)
 *
 * So the copy is correct and self-serve coach signup is intentionally sales-led.
 * The gap is that `/golf/demo` — public, and built for precisely this visitor
 * ("Step inside a live GolfHelm team … no setup, no credit card") — is linked
 * from neither this page nor the login page.
 *
 * See #1483. This test pins the exit only; where else a coach should be routed
 * is a product decision left open there.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import SignupPage from '@/app/golf/(auth)/signup/page';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/app/golf/actions/access-code', () => ({ validateAccessCode: vi.fn() }));
vi.mock('@/lib/utils/capacitor', () => ({ isNativeApp: () => false, triggerHaptic: vi.fn() }));
vi.mock('@/hooks/use-media-query', () => ({ useMediaQuery: () => false }));

afterEach(() => cleanup());

describe('signup access-code gate', () => {
  it('offers a way forward for someone who has no team code', () => {
    render(<SignupPage />);

    const demo = document.querySelector('a[href="/golf/demo"]');
    expect(demo, 'expected a link to /golf/demo on the access-code gate').not.toBeNull();
  });

  it('still leads a returning user to sign in', () => {
    // The existing exit must survive the new one.
    render(<SignupPage />);
    expect(document.querySelector('a[href="/golf/login"]')).not.toBeNull();
  });

  it('still asks for the team code, which is the live path', () => {
    render(<SignupPage />);
    expect(screen.getByText(/enter your team code/i)).toBeTruthy();
  });
});
