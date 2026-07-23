'use client';

/**
 * GolfAuthShell — the approved GolfHelm auth chrome (the login redesign, #650),
 * factored out so the password-reset flow matches it exactly instead of the
 * retired orb/glass look. Renders: one illustrated scene (Coastal on desktop,
 * Course on mobile/native), the floating HelmMark brand lockup, a warm-cream
 * form card, and an optional footer slot. Callers drop their form into
 * `children`; everything else is pixel-matched to the login card.
 */

import { useState, type ReactNode } from 'react';
import { LazyMotion, m, useReducedMotion } from 'framer-motion';
import { loadFeatures } from '@/lib/motion/load-features';
import { HelmMark } from '@/components/brand/HelmMark';
import { CoastalScene } from '@/components/golf/scenes/CoastalScene';
import { CourseScene } from '@/components/golf/scenes/CourseScene';
import { useMediaQuery } from '@/hooks/use-media-query';
import { Button } from '@/components/ui/button';

interface GolfAuthShellProps {
  /** Card heading, e.g. "Reset your password". */
  heading: string;
  /** Optional supporting line under the heading. */
  subheading?: ReactNode;
  /** The form (or success state) that lives inside the card. */
  children: ReactNode;
  /** Links/captions rendered below the card. */
  footer?: ReactNode;
  /** Unique suffix so multiple auth pages don't collide on scene gradient ids. */
  idSuffix: string;
}

export function GolfAuthShell({ heading, subheading, children, footer, idSuffix }: GolfAuthShellProps) {
  const prefersReducedMotion = useReducedMotion();
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const [brandMountDone, setBrandMountDone] = useState(false);

  return (
    <LazyMotion features={loadFeatures}>
      <div
        className="relative overflow-hidden"
        style={{
          height: '100dvh',
          fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif',
        }}
      >
        <a
          href="#auth-card"
          className="sr-only focus:not-sr-only focus:absolute focus:z-modal focus:top-4 focus:left-4 bg-primary-600 text-white px-4 py-2 rounded-lg font-medium shadow-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
        >
          Skip to form
        </a>

        {/* Exactly one scene per viewport — matches the login (SSR renders the
            mobile/native scene, desktop swaps to Coastal after hydration). */}
        {isDesktop ? <CoastalScene idSuffix={`${idSuffix}-coastal`} /> : <CourseScene idSuffix={idSuffix} />}

        <div
          className="relative z-10 h-full flex flex-col items-center px-5"
          style={{
            paddingTop: 'max(2.5rem, calc(env(safe-area-inset-top) + 1.75rem))',
            paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
          }}
        >
          {/* Brand lockup */}
          <m.div
            initial={prefersReducedMotion ? false : { opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            onAnimationComplete={() => setBrandMountDone(true)}
            className="flex flex-col items-center gap-2.5 shrink-0"
          >
            <div
              data-scene-animated
              style={{
                animation: 'helmSceneLogoFloat 5s ease-in-out infinite',
                willChange: brandMountDone ? undefined : 'transform',
              }}
            >
              <HelmMark
                sport="golf"
                size={64}
                className="h-16 w-16"
                priority
                imgStyle={{ filter: 'drop-shadow(0 1px 3px rgba(60,40,20,0.22))' }}
              />
            </div>
            <h1
              style={{
                fontSize: 28,
                fontWeight: 600,
                letterSpacing: '-0.033em',
                lineHeight: 1,
                filter: 'drop-shadow(0 1px 1px rgba(60,40,20,0.12))',
              }}
            >
              <span style={{ color: '#1c1917' }}>Golf</span>
              <span style={{ color: '#15803D' }}>Helm</span>
            </h1>
          </m.div>

          {/* Form card */}
          <m.div
            id="auth-card"
            role="region"
            aria-label={heading}
            initial={prefersReducedMotion ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.7, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-[420px] mt-5 shrink-0"
            style={{
              padding: '22px 20px 18px',
              background: 'rgba(255, 253, 245, 0.94)',
              borderRadius: 24,
              border: '0.5px solid rgba(255,255,255,0.9)',
              boxShadow:
                '0 20px 50px rgba(60, 40, 20, 0.18), 0 4px 12px rgba(60, 40, 20, 0.08), inset 0 1px 0 rgba(255,255,255,0.95)',
            }}
          >
            <div className="text-center">
              <h2
                style={{
                  fontSize: 24,
                  fontWeight: 700,
                  color: '#1c1917',
                  letterSpacing: '-0.03em',
                  lineHeight: 1.1,
                }}
              >
                {heading}
              </h2>
              {subheading ? (
                <p className="mt-1.5 text-warm-500 text-body-sm">{subheading}</p>
              ) : null}
            </div>

            <div className="mt-4">{children}</div>
          </m.div>

          {footer ? (
            <m.div
              initial={prefersReducedMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.5, delay: 0.5 }}
              className="w-full max-w-[420px] shrink-0"
            >
              {footer}
            </m.div>
          ) : null}

          <div className="flex-1" />
        </div>
      </div>
    </LazyMotion>
  );
}

/* ── Shared primary button, matched to the login card's submit button ──────── */

export function AuthPrimaryButton({
  children,
  loading,
  loadingLabel,
  disabled,
  ...buttonProps
}: {
  children: ReactNode;
  loading?: boolean;
  loadingLabel?: string;
} & React.ComponentProps<typeof Button>) {
  return (
    <Button
      variant="primary"
      disabled={loading || disabled}
      className="w-full min-h-[50px] py-3 bg-primary-600 text-white font-semibold text-body tracking-[-0.01em] rounded-xl shadow-lg shadow-primary-600/25 transition-all duration-200 ease-ios hover:bg-primary-700 hover:shadow-primary-600/30 active:scale-[0.97] active:duration-75 disabled:opacity-50 disabled:active:scale-100 flex items-center justify-center"
      {...buttonProps}
    >
      {loading ? (
        <span className="flex items-center gap-1" role="status" aria-label={loadingLabel ?? 'Loading'}>
          <span className="h-1.5 w-1.5 rounded-full bg-cream-50 animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="h-1.5 w-1.5 rounded-full bg-cream-50 animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="h-1.5 w-1.5 rounded-full bg-cream-50 animate-bounce" style={{ animationDelay: '300ms' }} />
          <span className="sr-only">{loadingLabel ?? 'Loading'}…</span>
        </span>
      ) : (
        children
      )}
    </Button>
  );
}
