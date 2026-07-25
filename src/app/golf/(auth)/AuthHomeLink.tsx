import Link from 'next/link';

/**
 * Back-to-home affordance for the auth routes.
 *
 * Extracted from the login page so every auth surface carries it: `/golf/login`
 * had it and `/golf/signup` did not, so a visitor who landed on signup from a
 * shared link had no route back to the marketing site at all — the page was a
 * dead end (audit 2026-07-24, L-19).
 *
 * Absolutely positioned against the nearest positioned ancestor, with
 * safe-area insets so it clears the notch on iOS.
 */
export function AuthHomeLink() {
  return (
    <Link
      href="/"
      aria-label="Back to home"
      className="absolute z-20 inline-flex items-center gap-1.5 rounded-full text-warm-700 transition-colors hover:text-warm-900"
      style={{
        top: 'max(1rem, calc(env(safe-area-inset-top) + 0.5rem))',
        left: 'max(1rem, env(safe-area-inset-left))',
        padding: '7px 13px 7px 10px',
        fontSize: 13.5,
        fontWeight: 600,
        background: 'rgba(255, 253, 245, 0.82)',
        WebkitBackdropFilter: 'blur(8px)',
        backdropFilter: 'blur(8px)',
        boxShadow: '0 2px 8px rgba(60, 40, 20, 0.12), inset 0 1px 0 rgba(255,255,255,0.7)',
      }}
    >
      <svg
        width="17"
        height="17"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M15 18l-6-6 6-6" />
      </svg>
      Home
    </Link>
  );
}
