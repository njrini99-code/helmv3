'use client';

/**
 * BaseballHelm front-door auth shell — "The Practice Field at First
 * Light" (docs/baseball/ENTRY_SCENES_DESIGN.md ⚠ AMENDMENT + docs/
 * LANDING_ENTRY_WORLD_DESIGN.md ⚠ SAGE & CREAM AMENDMENT — "Continuity
 * into the app").
 *
 * Shared chrome for every src/app/baseball/(auth)/ page (login, signup,
 * complete-signup, forgot-password, reset-password, demo): a full-bleed
 * abstract scene (`<EntryField />` — ONE responsive component, both
 * breakpoints), a warm CREAM `fl-glass-3` panel (right-floating on
 * desktop, bottom-sheet on mobile) carrying a Fraunces serif welcome
 * line in sage-ink + a time-aware greeting, and the footer link row.
 * Baseball-only — golf keeps its own separate `(auth)` chrome
 * (`.bg-auth-golf` / `.auth-glass-card` in globals.css), untouched.
 *
 * Composes the Living Annual kit (`@/components/baseball/living-annual`) —
 * Reveal for the mount stagger, Eyebrow/HairlineRule for the masthead accent
 * (recolored to sage via explicit `className` overrides below — their
 * `ink` prop still resolves to the shared kit's kelly/clay tokens
 * internally, which the SAGE & CREAM amendment retires from all
 * landing/auth chrome; a trailing `className` wins the twMerge dedupe,
 * so no edit to the shared living-annual atoms was needed) — plus the
 * shared First Light glass grammar/serif module
 * (`@/components/marketing/first-light`) so the front door breathes on
 * the same glass + serif + sage material system as the marketing
 * landing and the rest of the redesigned product (design doc: "a
 * visitor never feels a seam").
 */
import type { ReactNode, CSSProperties } from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { LazyMotion } from 'framer-motion';
import { loadFeatures } from '@/lib/motion/load-features';
import { HelmMark } from '@/components/brand/HelmMark';
import { Eyebrow, HairlineRule, Reveal } from '@/components/baseball/living-annual';
import { EntryField } from '@/components/baseball/scenes/EntryField';
import { flFraunces } from '@/components/marketing/first-light/fonts';
import {
  getGreeting,
  getRememberedFirstName,
  resolveSceneVariant,
  type SceneVariant,
} from '@/lib/entry/greeting';
import { cn } from '@/lib/utils';
import '@/components/marketing/first-light/first-light.css';
import '@/styles/baseball-auth.css';

export type AuthInk = 'team' | 'pursuit';

// Both lanes resolve to the same sage-deep accent on auth/landing chrome
// — the SAGE & CREAM amendment demotes kelly (team) AND clay (pursuit)
// to product-only; landing/auth chrome never uses either directly. The
// `AuthInk` prop/type is kept (call sites like the demo page still pass
// `ink="pursuit"`) purely so downstream call sites don't need to change,
// but it no longer produces a visually distinct color.
const AUTH_ACCENT_VAR = 'var(--fl-sage-deep)';
const AUTH_ACCENT_CLASS = 'text-[color:var(--fl-sage-deep)]';
const AUTH_ACCENT_BG_CLASS = 'bg-[color:var(--fl-sage-deep)]';

// ---------------------------------------------------------------------------
// BaseballAuthShell — full-bleed scene + the floating/bottom-sheet glass panel
// ---------------------------------------------------------------------------

export interface BaseballAuthShellProps {
  /** id the skip-link jumps to (also the id on the content wrapper). */
  skipTargetId: string;
  /** Accessible label for the skip-link, e.g. "Skip to login form". */
  skipLabel: string;
  /** Small-caps dateline above the welcome line, e.g. "COACHES · PLAYERS · PROGRAMS". */
  eyebrow?: string;
  /** Serif Fraunces welcome line, in the spec's voice — e.g. "Welcome back to the Yard." */
  welcomeLine: ReactNode;
  /** Supporting line under the hairline accent. */
  tagline?: ReactNode;
  /** Lane ink for the eyebrow + hairline + glow — team (green) or pursuit (clay). */
  ink?: AuthInk;
  /** Larger welcome-line size for the hero pages (login/demo) vs. compact (other 4). */
  hero?: boolean;
  /** Unique per-page suffix for the scene's SVG ids. */
  sceneIdSuffix?: string;
  /** Tailwind max-width class for the panel on desktop. Defaults to 440px. */
  maxWidthClassName?: string;
  children: ReactNode;
  /** Rendered after the content column, staggered in last. */
  footer?: ReactNode;
}

export function BaseballAuthShell({
  skipTargetId,
  skipLabel,
  eyebrow,
  welcomeLine,
  tagline,
  ink = 'team',
  hero = false,
  sceneIdSuffix = 'auth',
  maxWidthClassName = 'md:max-w-[440px]',
  children,
  footer,
}: BaseballAuthShellProps) {
  // `ink` no longer selects a distinct color (see AUTH_ACCENT_VAR above) —
  // it's still passed through to Eyebrow/HairlineRule below for API
  // compatibility, but their color always comes from an explicit trailing
  // `className` override (twMerge dedupe), not from `ink` itself.
  const inkStyle = { '--auth-accent': AUTH_ACCENT_VAR } as CSSProperties;

  // Time-aware personalization (docs/baseball/ENTRY_SCENES_DESIGN.md family
  // rule #6). Server + first client render agree on the neutral defaults
  // below (no localStorage/clock read possible during SSR); the effect
  // swaps in the real values right after mount — a plain prop/text update,
  // not a structural DOM change, so it never surfaces as a hydration error
  // (see CONTRACTS.md's reduced-motion section for the same reasoning).
  const [variant, setVariant] = useState<SceneVariant>('dawn');
  const [greeting, setGreeting] = useState<string | null>(null);

  useEffect(() => {
    setVariant(resolveSceneVariant());
    setGreeting(getGreeting(getRememberedFirstName()));
  }, []);

  return (
    // LazyMotion loads the animation engine `m.*` primitives (Reveal,
    // HairlineRule, EditorsLetter, …) need to drive their variants — without
    // it those components render statically stuck in their `hidden` state
    // (opacity 0). The (auth) route group sits outside the dashboard/
    // onboarding template trees that already provide this, so the shell
    // supplies its own, exactly like golf's (auth) pages and baseball's
    // onboarding pages already do.
    <LazyMotion features={loadFeatures}>
      <div className="baseball-auth-field relative min-h-[100dvh] w-full overflow-x-hidden">
        {/* Skip to main content link for keyboard navigation */}
        <a
          href={`#${skipTargetId}`}
          className="sr-only focus:not-sr-only focus:absolute focus:z-modal focus:top-[max(1rem,env(safe-area-inset-top))] focus:left-4 bg-primary-600 text-white px-4 py-2 rounded-lg font-medium shadow-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
        >
          {skipLabel}
        </a>

        {/* Full-bleed scene — fixed so it never stretches under tall content
            (the signup panel can run taller than 100dvh on small screens)
            and reads as a held frame while the page scrolls, echoing the
            landing's M3 "the frame holds" language. ONE responsive
            EntryField handles both breakpoints — no desktop/mobile
            component switch (the amendment: "portrait recomposition via
            CSS/viewBox handling, not a second component"). */}
        <div aria-hidden className="fixed inset-0 z-0">
          <EntryField idSuffix={`${sceneIdSuffix}-field`} variant={variant} />
        </div>

        <div
          className={cn(
            'relative z-10 flex min-h-[100dvh] w-full flex-col items-center justify-end',
            'md:items-end md:justify-center md:pr-[6vw] md:py-10'
          )}
        >
          <div
            id={skipTargetId}
            style={inkStyle}
            className={cn(
              'baseball-auth-panel fl-glass-3 relative w-full max-h-[88dvh] overflow-y-auto overscroll-contain',
              'rounded-t-3xl px-6 pt-7',
              'md:max-h-none md:overflow-visible md:rounded-3xl md:px-9 md:py-9',
              maxWidthClassName
            )}
          >
            <div
              className="relative z-10"
              style={{ paddingBottom: 'max(1.75rem, calc(env(safe-area-inset-bottom) + 1rem))' }}
            >
              <Reveal staggerIndex={0} className="mb-6 flex flex-col items-center text-center">
                {/* The real helm-wheel mark, in its true kelly team-green
                    — REVERTED (⚠ A-OVERRIDE, Amendment 3 §1, Nick 2026-07-02
                    18:00) from a pixel-review pass that masked/recolored it
                    to sage-deep. A real logo is content, not chrome, and is
                    exempt from the kelly-demotion rule; Nick approved this
                    auth masthead as-is with his logo on it. Don't recolor
                    this mark again for palette-consistency reasons. */}
                <div className="mb-3">
                  <HelmMark
                    sport="baseball"
                    size={44}
                    className="h-11 w-11"
                    glow
                    glowClassName="blur-2xl scale-150"
                    glowOpacity={0.15}
                    priority
                    unoptimized
                  />
                </div>

                {eyebrow ? (
                  <Eyebrow ink={ink} className={cn('mb-2', AUTH_ACCENT_CLASS)}>
                    {eyebrow}
                  </Eyebrow>
                ) : null}

                {greeting ? (
                  <p className="mb-1 text-xs font-medium tracking-[0.02em] text-warm-500">{greeting}</p>
                ) : null}

                <h1
                  className={cn(
                    flFraunces.className,
                    'font-medium tracking-tight text-text-primary',
                    hero ? 'text-[2rem] leading-[1.1] sm:text-[2.5rem]' : 'text-2xl sm:text-[1.75rem]'
                  )}
                >
                  {welcomeLine}
                </h1>

                <HairlineRule
                  ink={ink}
                  weight={2}
                  className={cn('mt-3 rounded-full', AUTH_ACCENT_BG_CLASS, hero ? 'w-16' : 'w-12')}
                />

                {tagline ? (
                  <p className="mt-3 max-w-[360px] text-sm leading-relaxed text-warm-600">{tagline}</p>
                ) : null}
              </Reveal>

              {children}

              {/* #950 — index 1 (not 3): the header/card/footer entrance on a
                  conversion page (the demo gate) should settle fast. Every
                  Reveal here still runs on the shared STAGGER_STEP/DUR.ink
                  cadence (untouched — it's reused by 200+ other surfaces),
                  just fewer steps behind the header. */}
              {footer ? (
                <Reveal staggerIndex={1} className="mt-6">
                  {footer}
                </Reveal>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </LazyMotion>
  );
}

// ---------------------------------------------------------------------------
// AuthBezel / AuthCard — thin content wrapper (the panel itself is now the
// one glass surface — CLAUDE.md's motion budget caps 2 blur layers per
// viewport, so the form no longer nests a second bezel/paper-stock card
// inside the shell's `fl-glass-3` panel).
// ---------------------------------------------------------------------------

export interface AuthBezelProps {
  id?: string;
  role?: string;
  ariaLabel?: string;
  className?: string;
  children: ReactNode;
}

export function AuthBezel({ id, role, ariaLabel, className, children }: AuthBezelProps) {
  return (
    <Reveal staggerIndex={1}>
      <div id={id} role={role} aria-label={ariaLabel} className={className}>
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

/** The form panel content — a lean wrapper now that the shell's `fl-glass-3`
 * panel already supplies the glass chrome. `registrationTick` is accepted
 * for call-site compatibility but no longer renders anything (that was a
 * `PaperCard`-only affordance, no longer applicable). */
export function AuthCard({ id, role, ariaLabel, className, contentClassName, children }: AuthCardProps) {
  return (
    <AuthBezel id={id} role={role} ariaLabel={ariaLabel} className={className}>
      <div className={cn('pt-1', contentClassName)}>{children}</div>
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
            className="rounded font-semibold entry-accent-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus-ring)] focus-visible:ring-offset-2"
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
          ← Back to Helm Sports Labs
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
  // Both lanes render the same sage-deep dot on auth chrome — see the
  // `AUTH_ACCENT_*` comment above `BaseballAuthShell`. `ink` is kept for
  // call-site compatibility only.
  void ink;
  const dot = 'bg-[color:var(--fl-sage-deep)]';
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
