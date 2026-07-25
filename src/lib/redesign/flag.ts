/**
 * ============================================================================
 * Fairway redesign feature flag (WAVE W1 — FAIRWAY IS NOW THE ONLY TREE)
 * ----------------------------------------------------------------------------
 * Historically this gated the "Fairway" warm-premium design system behind
 * `NEXT_PUBLIC_REDESIGN` so redesigned components/pages could opt in without
 * changing the legacy app. As of Wave W1 (2026-07-09), Fairway has shipped as
 * the ONLY dashboard tree in prod for 5+ weeks — the legacy
 * `GolfDashboardShell` / `GolfSidebar` fork has been deleted, and
 * `isRedesignEnabled()` / `useRedesign()` below are hardcoded to `true`.
 *
 * `fairwayScope()` / `FAIRWAY_SCOPE` remain fully live — they are the
 * class-name helper used everywhere to opt a subtree into the `.fairway-ds`
 * token scope and are NOT deprecated.
 *
 * ── Fairway scoping (still the live pattern) ───────────────────────────────
 *
 *  1. Wrap a subtree in the `.fairway-ds` scope class so the Fairway
 *     tokens/fonts apply only inside it (use the FAIRWAY_SCOPE constant or
 *     the `fairwayScope()` helper to also merge extra classes):
 *
 *       <div className={fairwayScope('min-h-screen')}> … </div>
 *
 *  2. Inside that scope, build with the Fairway Tailwind utilities (which
 *     resolve to the --fw-* tokens) and the Fairway type roles:
 *
 *       bg-canvas / bg-surface / bg-surface-tint / bg-inset / bg-elevated
 *       text-text-primary / text-text-secondary / text-text-tertiary
 *       border-border-subtle / border-border-strong / ring-border-focus
 *       bg-accent-500 / text-fw-success-ink / bg-fw-warning-bg / text-fw-danger-ink
 *       rounded-card / shadow-soft / shadow-raise / shadow-fw-modal
 *       font-fw-display (Fraunces) / font-fw-sans (General Sans) / font-fw-mono (Fragment Mono)
 *
 * The scope class is intentionally `.fairway-ds` (NOT bare `.fairway`) so it
 * never clashes with golf-domain "fairway" terms in the codebase. The tokens
 * live on :root (always defined); the scope class is a marker for redesigned
 * subtrees and a future hook point for scoped base styles (e.g. setting the
 * Fairway body font on the scope only).
 * ============================================================================
 */

import { useMemo } from 'react';

/** The scope class redesigned Fairway subtrees opt into. */
export const FAIRWAY_SCOPE = 'fairway-ds' as const;

/** Truthy string forms accepted for the (still-live) `NEXT_PUBLIC_REDESIGN_THEMES` kill-switch below. */
const TRUTHY = new Set(['1', 'true', 'on', 'yes']);

/**
 * @deprecated Fairway is now the only golf dashboard tree (Wave W1,
 * 2026-07-09) — the legacy GolfDashboardShell/GolfSidebar fork this flag used
 * to gate has been deleted, and every `src/app/golf` / `src/components/golf`
 * call site has been removed. Hardcoded to `true`.
 *
 * NOT dead: dozens of live `src/components/fairway/**` call sites (and
 * `src/app/baseball/(dashboard)/layout.tsx`) still call this directly to
 * gate Fairway-only behavior. (`src/components/layout/header.tsx` was a
 * former BASEBALL caller of this flag; it had zero real importers left and
 * was deleted as dead code during the 2026-07 cleanup pass — it is no longer
 * a reason to keep this function around, but the many Fairway call sites
 * still are.) Do not delete this function (or {@link useRedesign}) without
 * first migrating every remaining caller off the flag.
 */
export function isRedesignEnabled(): boolean {
  return true;
}

/**
 * @deprecated See {@link isRedesignEnabled} — hardcoded to `true`. All
 * `src/app/golf` / `src/components/golf` call sites have been removed as of
 * Wave W1; kept only for any remaining non-golf client call sites.
 */
export function useRedesign(): boolean {
  return useMemo(() => true, []);
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



/**
 * Compose the Fairway scope class with optional extra classes.
 * Example: `<div className={fairwayScope('grid gap-6')}>`.
 */
export function fairwayScope(...classes: Array<string | false | null | undefined>): string {
  return [FAIRWAY_SCOPE, ...classes].filter(Boolean).join(' ');
}
