'use client';

/**
 * BaseballHelm front-door auth shell — "The Living Annual", adapted for a
 * full-bleed marketing-grade surface.
 *
 * Shared chrome for every src/app/baseball/(auth)/ page (login, signup,
 * complete-signup, forgot-password, reset-password, demo): the deep-cream
 * grain field, the wordmark moment, the double-bezel form panel, and the
 * footer link row. Baseball-only — golf keeps its own separate `(auth)`
 * chrome (`.bg-auth-golf` / `.auth-glass-card` in globals.css), untouched.
 *
 * Composes straight from the Living Annual kit (`@/components/baseball/
 * living-annual`) — Reveal for the mount stagger, Eyebrow/HairlineRule for
 * the masthead accent, PaperCard for the panel stock — so the front door
 * breathes on the exact same curves as the rest of the redesigned product
 * instead of a bespoke one-off.
 */
import type { ReactNode, CSSProperties } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { LazyMotion, domAnimation } from 'framer-motion';
import { Eyebrow, HairlineRule, PaperCard, Reveal } from '@/components/baseball/living-annual';
import { cn } from '@/lib/utils';

export type AuthInk = 'team' | 'pursuit';

const INK_VAR: Record<AuthInk, string> = {
  team: 'var(--grade-plus)',
  pursuit: 'var(--pursuit-ink)',
};

const INK_GLOW: Record<AuthInk, string> = {
  team: 'bg-grade-plus/15',
  pursuit: 'bg-pursuit/15',
};

// ---------------------------------------------------------------------------
// BaseballAuthShell — the full-bleed field + wordmark + content column
// ---------------------------------------------------------------------------

export interface BaseballAuthShellProps {
  /** id the skip-link jumps to (also the id on the content wrapper). */
  skipTargetId: string;
  /** Accessible label for the skip-link, e.g. "Skip to login form". */
  skipLabel: string;
  /** Small-caps dateline above the wordmark, e.g. "COACHES · PLAYERS · PROGRAMS". */
  eyebrow?: string;
  /** Supporting line under the hairline accent. */
  tagline?: ReactNode;
  /** Lane ink for the eyebrow + hairline + glow — team (green) or pursuit (clay). */
  ink?: AuthInk;
  /** Full hero wordmark size (login/demo) vs. a compact one (other 4 pages). */
  hero?: boolean;
  /** Tailwind max-width class for the content column. Defaults to 420px. */
  maxWidthClassName?: string;
  children: ReactNode;
  /** Rendered after the content column, staggered in last. */
  footer?: ReactNode;
}

export function BaseballAuthShell({
  skipTargetId,
  skipLabel,
  eyebrow,
  tagline,
  ink = 'team',
  hero = false,
  maxWidthClassName = 'max-w-[420px]',
  children,
  footer,
}: BaseballAuthShellProps) {
  const vignetteStyle = { '--auth-accent': INK_VAR[ink] } as CSSProperties;

  return (
    // LazyMotion loads the animation engine `m.*` primitives (Reveal,
    // HairlineRule, EditorsLetter, …) need to drive their variants — without
    // it those components render statically stuck in their `hidden` state
    // (opacity 0). The (auth) route group sits outside the dashboard/
    // onboarding template trees that already provide this, so the shell
    // supplies its own, exactly like golf's (auth) pages and baseball's
    // onboarding pages already do.
    <LazyMotion features={domAnimation}>
      <div className="auth-shell baseball-auth-field relative flex min-h-[100dvh] items-center justify-center overflow-hidden p-4 sm:p-6">
        {/* Skip to main content link for keyboard navigation */}
        <a
          href={`#${skipTargetId}`}
          className="sr-only focus:not-sr-only focus:absolute focus:z-modal focus:top-[max(1rem,env(safe-area-inset-top))] focus:left-4 bg-primary-600 text-white px-4 py-2 rounded-lg font-medium shadow-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
        >
          {skipLabel}
        </a>

        <div aria-hidden className="baseball-auth-grain" />
        <div aria-hidden className="baseball-auth-vignette" style={vignetteStyle} />

        <div className={cn('relative z-10 w-full', maxWidthClassName)}>
          <Reveal staggerIndex={0} className="mb-7 sm:mb-8 flex flex-col items-center text-center">
            <div className="relative mb-4">
              <div aria-hidden className={cn('absolute inset-0 rounded-full blur-2xl scale-150', INK_GLOW[ink])} />
              <div className="relative flex h-14 w-14 items-center justify-center">
                <Image
                  src="/helm-baseball-logo.png"
                  alt="BaseballHelm"
                  width={56}
                  height={56}
                  className="h-14 w-14 object-contain"
                  priority
                  unoptimized
                />
              </div>
            </div>

            {eyebrow ? (
              <Eyebrow ink={ink} className="mb-2">
                {eyebrow}
              </Eyebrow>
            ) : null}

            <h1
              className={cn(
                'font-annual font-semibold tracking-tight text-text-primary',
                hero ? 'text-h1 leading-[1.05] sm:text-5xl md:text-6xl' : 'text-2xl sm:text-3xl'
              )}
            >
              BaseballHelm
            </h1>

            <HairlineRule ink={ink} weight={2} className={cn('mt-3 rounded-full', hero ? 'w-20' : 'w-14')} />

            {tagline ? (
              <p className="mt-4 max-w-[360px] text-sm leading-relaxed text-warm-600 sm:text-base">{tagline}</p>
            ) : null}
          </Reveal>

          <div id={skipTargetId}>{children}</div>

          {footer ? (
            <Reveal staggerIndex={3} className="mt-6">
              {footer}
            </Reveal>
          ) : null}
        </div>
      </div>
    </LazyMotion>
  );
}

// ---------------------------------------------------------------------------
// AuthBezel / AuthCard — the double-bezel form panel
// ---------------------------------------------------------------------------

export interface AuthBezelProps {
  id?: string;
  role?: string;
  ariaLabel?: string;
  className?: string;
  children: ReactNode;
}

/** The outer ring of the double-bezel: a deeper-cream frame the panel stock sits inside. */
export function AuthBezel({ id, role, ariaLabel, className, children }: AuthBezelProps) {
  return (
    <Reveal staggerIndex={1}>
      <div
        id={id}
        role={role}
        aria-label={ariaLabel}
        className={cn('baseball-auth-bezel rounded-3xl p-1.5 sm:p-2', className)}
      >
        {children}
      </div>
    </Reveal>
  );
}

export interface AuthCardProps extends Omit<AuthBezelProps, 'children'> {
  registrationTick?: boolean;
  contentClassName?: string;
  children: ReactNode;
}

/** The full double-bezel panel: outer AuthBezel ring + inner PaperCard stock. */
export function AuthCard({ id, role, ariaLabel, className, registrationTick = true, contentClassName, children }: AuthCardProps) {
  return (
    <AuthBezel id={id} role={role} ariaLabel={ariaLabel} className={className}>
      <PaperCard registrationTick={registrationTick} className={cn('p-7 sm:p-9', contentClassName)}>
        {children}
      </PaperCard>
    </AuthBezel>
  );
}

// ---------------------------------------------------------------------------
// AuthFooterLinks — the shared footer row
// ---------------------------------------------------------------------------

export interface AuthFooterLinksProps {
  /** e.g. "Don't have an account?" */
  switchLabel?: string;
  switchHref?: string;
  /** e.g. "Sign up" */
  switchCta?: ReactNode;
  showBackToHelmLabs?: boolean;
  className?: string;
}

export function AuthFooterLinks({
  switchLabel,
  switchHref,
  switchCta,
  showBackToHelmLabs = true,
  className,
}: AuthFooterLinksProps) {
  return (
    <div className={cn('flex flex-col items-center gap-1', className)}>
      {switchLabel && switchHref && switchCta ? (
        <p className="text-center text-sm text-warm-600">
          {switchLabel}{' '}
          <Link
            href={switchHref}
            className="rounded font-semibold text-grade-plus transition-colors hover:text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus-ring)] focus-visible:ring-offset-2"
          >
            {switchCta}
          </Link>
        </p>
      ) : null}

      {showBackToHelmLabs ? (
        <Link
          href="/"
          className="mt-2 inline-flex min-h-[44px] items-center gap-1 rounded-lg px-3 py-3 -my-3 text-sm text-warm-500 transition-colors hover:text-warm-700 active:bg-warm-100/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus-ring)] focus-visible:ring-offset-2"
        >
          ← Back to HelmLabs
        </Link>
      ) : null}

      <div className="mt-1 flex items-center justify-center gap-2">
        <Link
          href="/privacy"
          className="flex min-h-[44px] items-center rounded-lg px-3 py-3 -my-3 text-xs text-warm-400 transition-colors hover:text-warm-600 active:bg-warm-100/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus-ring)] focus-visible:ring-offset-2"
        >
          Privacy
        </Link>
        <span aria-hidden className="text-warm-300">·</span>
        <Link
          href="/terms"
          className="flex min-h-[44px] items-center rounded-lg px-3 py-3 -my-3 text-xs text-warm-400 transition-colors hover:text-warm-600 active:bg-warm-100/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus-ring)] focus-visible:ring-offset-2"
        >
          Terms
        </Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared skeleton dots — replaces the ad-hoc bounce/shimmer dots that were
// duplicated (with slightly different markup) across all six pages.
// ---------------------------------------------------------------------------

export function AuthPendingDots({ label, ink = 'team' }: { label: string; ink?: AuthInk }) {
  const dot = ink === 'pursuit' ? 'bg-pursuit' : 'bg-grade-plus';
  return (
    <span role="status" aria-label={label} className="flex items-center gap-1.5">
      <span className={cn('h-2 w-2 rounded-full skeleton-shimmer', dot)} style={{ animationDelay: '0ms' }} />
      <span className={cn('h-2 w-2 rounded-full skeleton-shimmer', dot)} style={{ animationDelay: '150ms' }} />
      <span className={cn('h-2 w-2 rounded-full skeleton-shimmer', dot)} style={{ animationDelay: '300ms' }} />
      <span className="sr-only">{label}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Humanized error copy — a small defensive net so a raw Supabase/server
// error string never lands verbatim in the UI even if a call site forgets
// to map it. Callers should still prefer their own specific mapping first;
// this only catches what falls through.
// ---------------------------------------------------------------------------

export function humanizeAuthError(message: string): string {
  const lower = message.toLowerCase();

  if (lower.includes('rate limit') || lower.includes('too many') || /wait \d+ seconds?/.test(lower)) {
    return message; // already a specific, friendly wait-time message
  }
  if (lower.includes('network') || lower.includes('fetch failed') || lower === 'load failed') {
    return 'Unable to reach the server. Please check your internet connection and try again.';
  }
  if (lower.includes('jwt') || (lower.includes('token') && lower.includes('expired'))) {
    return 'Your session has expired. Please request a new link and try again.';
  }
  if (lower.includes('authapierror') || lower.includes('authretryablefetcherror') || lower.startsWith('error:')) {
    return 'Something went wrong on our end. Please try again in a moment.';
  }
  // Already a plain, human sentence (Supabase's own copy is usually fine,
  // e.g. "Password should be at least 8 characters.") — pass it through.
  return message;
}
