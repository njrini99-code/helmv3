import { GolfAuthShell } from '@/components/auth/GolfAuthShell';

/**
 * Route Suspense fallback for /golf/reset-password.
 *
 * ResetPasswordPage (page.tsx:16) is a `'use client'` default export with no
 * Suspense boundary of its own, so its whole tree — including
 * `<GolfAuthShell>` — is what mounts on first paint. Its `recoveryState`
 * starts as `useState<RecoveryState>('verifying')` (page.tsx:22) and only
 * flips to `'ready'`/`'invalid'` inside an async effect that awaits a
 * Supabase session/PKCE round trip (page.tsx:32-74). Until that resolves,
 * the derived `heading`/`subheading` (page.tsx:114-120) are unconditionally
 * "Reset your password" / "Verifying your reset link…", and the shell's
 * children render the three-dot status row (page.tsx:148-155) — not the
 * two-field password form, which only exists once `recoveryState ===
 * 'ready'`.
 *
 * This previously reconstructed a `bg-auth-golf` / `glass-standard` card
 * with skeleton rows for both password inputs — the retired orb/glass
 * chrome GolfAuthShell's own docstring (GolfAuthShell.tsx:3-10) says this
 * flow was moved off of, and the page's *populated* form shape rather than
 * its actual first-paint ("verifying") branch. Importing the real
 * GolfAuthShell here (rather than hand-copying its scene/motion/card
 * markup) makes the chrome correct by construction; the known, accepted
 * trade is that the brand lockup and card replay their mount-in animation
 * once more when the real page tree takes over — still strictly better
 * than the chrome/shape mismatch this replaces.
 */
export default function Loading() {
  return (
    <div role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading password reset…</span>
      <GolfAuthShell
        idSuffix="golf-reset-loading"
        heading="Reset your password"
        subheading="Verifying your reset link…"
      >
        <div className="flex justify-center py-6" aria-hidden="true">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-primary-600 skeleton-shimmer" style={{ animationDelay: '0ms' }} />
            <span className="h-2 w-2 rounded-full bg-primary-600 skeleton-shimmer" style={{ animationDelay: '150ms' }} />
            <span className="h-2 w-2 rounded-full bg-primary-600 skeleton-shimmer" style={{ animationDelay: '300ms' }} />
          </span>
        </div>
      </GolfAuthShell>
    </div>
  );
}
