/**
 * ============================================================================
 * Fairway redesign feature flag (FOUNDATION — ADDITIVE)
 * ----------------------------------------------------------------------------
 * Gates the "Fairway" warm-premium design system so redesigned components/pages
 * can opt in WITHOUT changing the current app. Default = OFF: with the flag off,
 * nothing here changes any rendered output — the design tokens and fonts are
 * merely *available*; only opted-in Fairway components consume them.
 *
 * ── How a future redesigned component opts in ──────────────────────────────
 *
 *  1. Gate on the flag (server or client — `NEXT_PUBLIC_*` is readable in both):
 *
 *       import { isRedesignEnabled, useRedesign, FAIRWAY_SCOPE } from '@/lib/redesign/flag';
 *
 *       // server component / module scope:
 *       if (isRedesignEnabled()) return <FairwayDashboard … />;
 *       return <LegacyDashboard … />;
 *
 *       // client component:
 *       const redesign = useRedesign();
 *
 *  2. Wrap the redesigned subtree in the `.fairway-ds` scope class so the
 *     Fairway tokens/fonts apply only inside it (use the FAIRWAY_SCOPE constant
 *     or the `fairwayScope()` helper to also merge extra classes):
 *
 *       <div className={fairwayScope('min-h-screen')}> … </div>
 *
 *  3. Inside that scope, build with the Fairway Tailwind utilities (which
 *     resolve to the --fw-* tokens) and the Fairway type roles:
 *
 *       bg-canvas / bg-surface / bg-surface-tint / bg-inset / bg-elevated
 *       text-text-primary / text-text-secondary / text-text-tertiary
 *       border-border-subtle / border-border-strong / ring-border-focus
 *       bg-accent-500 / text-fw-success / bg-fw-warning-bg / text-fw-danger
 *       rounded-card / shadow-soft / shadow-raise / shadow-fw-modal
 *       font-fw-display (Fraunces) / font-fw-sans (General Sans) / font-fw-mono (Fragment Mono)
 *
 * The scope class is intentionally `.fairway-ds` (NOT bare `.fairway`) so it
 * never clashes with golf-domain "fairway" terms in the codebase. The tokens
 * live on :root (always defined); the scope class is a marker for redesigned
 * subtrees and a future hook point for scoped base styles (e.g. setting the
 * Fairway body font on the scope only).
 *
 * Enable by setting `NEXT_PUBLIC_REDESIGN=true` (or 1 / on / yes) in the env.
 * ============================================================================
 */

import { useMemo } from 'react';

/** The scope class redesigned Fairway subtrees opt into. */
export const FAIRWAY_SCOPE = 'fairway-ds' as const;

/** Truthy string forms accepted for the env flag. */
const TRUTHY = new Set(['1', 'true', 'on', 'yes']);

/**
 * Whether the Fairway redesign is enabled. Reads `NEXT_PUBLIC_REDESIGN`
 * (must be statically referenced so Next.js inlines it for the client bundle).
 * Defaults to `false` (redesign off — current app unchanged).
 */
export function isRedesignEnabled(): boolean {
  const raw = process.env.NEXT_PUBLIC_REDESIGN;
  return typeof raw === 'string' && TRUTHY.has(raw.trim().toLowerCase());
}

/**
 * React hook returning the redesign flag. Stable across renders. Safe in client
 * components; the underlying value is build-time-inlined so it does not change
 * at runtime, but the hook gives redesigned components a conventional API.
 */
export function useRedesign(): boolean {
  return useMemo(() => isRedesignEnabled(), []);
}

/**
 * Whether the hierarchical CoachHelm THEME insights (ThemesPanel/ThemeCard) are
 * shown in place of the flat insight feed. Reads `NEXT_PUBLIC_REDESIGN_THEMES`:
 *   - explicitly set (1/true/on/yes OR 0/false/off/no) → that value wins, both ways;
 *   - UNSET → defaults to following {@link isRedesignEnabled} (themes ship wherever
 *     the redesign is already on — zero extra config to go live), while still
 *     leaving an independent kill-switch (set it to 0 to disable just themes).
 * The host surfaces only render the theme view inside their existing redesign
 * fork, so this never affects the flag-off (legacy) app.
 */
export function isThemesEnabled(): boolean {
  const raw = process.env.NEXT_PUBLIC_REDESIGN_THEMES;
  if (typeof raw === 'string' && raw.trim() !== '') {
    return TRUTHY.has(raw.trim().toLowerCase());
  }
  return isRedesignEnabled();
}

/** Client hook mirror of {@link isThemesEnabled} (build-time-inlined value). */
export function useThemesInsights(): boolean {
  return useMemo(() => isThemesEnabled(), []);
}

/**
 * Compose the Fairway scope class with optional extra classes.
 * Example: `<div className={fairwayScope('grid gap-6')}>`.
 */
export function fairwayScope(...classes: Array<string | false | null | undefined>): string {
  return [FAIRWAY_SCOPE, ...classes].filter(Boolean).join(' ');
}
