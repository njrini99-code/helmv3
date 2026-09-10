'use client';

/**
 * ============================================================================
 * Fairway · surfaces · GlassSurface — the ONE restrained Liquid Glass material
 * ----------------------------------------------------------------------------
 * Apple WWDC25 "Liquid Glass" rendered warm: cream-tinted backdrop blur +
 * saturation, a specular top sheen, a faint warm base edge, and (on the hero
 * variant) a green accent breath. This is a FLOATING functional layer above
 * content — NEVER a resting card texture. Default content cards are matte
 * `Surface` (see ./surface.tsx).
 *
 * ── ALLOW-LIST (DESIGN-SYSTEM.md §4.3 — glass earns its place here only) ──
 * Glass is permitted on EXACTLY these surfaces (≤ ~3 rendered at once for perf):
 *   'top-bar'  — sticky cream-side top app bar (NOT the black sidebar)
 *   'command'  — the ⌘K command palette overlay panel (stronger blur)
 *   'hero'     — the ONE hero / key-insight card per view (green breath)
 *   'overlay'  — modals / sheets / popovers + their floating panels
 *   'chrome'   — transient floating chrome (toasts, bulk-action bar, PTR pill,
 *                a moving segmented-control pill)
 *
 * The `surface` prop is REQUIRED and typed to that allow-list, so a caller
 * cannot reach for glass on an arbitrary card without naming an approved use.
 *
 * ── Material correctness ──
 *   • Always cream-tinted + warm (never neutral white-over-gray).
 *   • The blur/specular recipe + the prefers-reduced-transparency / forced-
 *     colors OPAQUE fallback live in the co-located CSS module so they are
 *     fully self-contained (no global CSS touched).
 *   • Cinematic "materialize": opacity 0→1 + scale 0.97→1, ease-emph. We NEVER
 *     animate `backdrop-filter` blur (jank) — only opacity/transform.
 *   • Honors prefers-reduced-motion (snap, no transform) via useReducedMotion.
 *
 * ── Fairway Frost tiers (2026-09-10) ──
 * The material itself is the shared `.fw-frost` recipe in globals.css (five
 * ingredients: translucency, blur, saturation, edge lighting, contact shadow)
 * in three tiers — `subtle` (toolbars, chrome bars), `floating` (dock, floating
 * toolbars, command surfaces), `modal` (sheets, major overlays). `surface`
 * still names the approved use; `tier` picks the strength (defaults per
 * surface). `edgeHighlight` and `tint` are the only decoration knobs;
 * `interactive` adds the float-hover lift.
 *
 * Renders correctly inside a `.fairway-ds` scope on a bg-canvas page.
 * ========================================================================== */

import { forwardRef } from 'react';
import type { ReactNode } from 'react';
import {
  motion,
  useReducedMotion,
  type HTMLMotionProps,
} from 'framer-motion';
import { cn } from '@/lib/utils';
import styles from './glass-surface.module.css';

/** The named, allow-listed floating surfaces that may use Liquid Glass. */
export type GlassSurfaceKind =
  | 'top-bar'
  | 'command'
  | 'hero'
  | 'overlay'
  | 'chrome';

/**
 * Per-surface glass recipe:
 *   strength — 'regular' (legible Regular glass) | 'strong' (more opaque +
 *              heavier blur for summoned panels / modals).
 *   hero     — paint the faint green accent ring (the one editorial flourish).
 *   radius   — default corner radius for the surface (callers can override).
 */
/** Frost strength. Maps to `.fw-frost-{tier}` in globals.css. */
export type GlassSurfaceTier = 'subtle' | 'floating' | 'modal';

const KIND_RECIPE: Record<
  GlassSurfaceKind,
  { tier: GlassSurfaceTier; hero: boolean; radius: string }
> = {
  'top-bar': { tier: 'subtle', hero: false, radius: 'rounded-fw-lg' },
  command: { tier: 'modal', hero: false, radius: 'rounded-fw-lg' },
  hero: { tier: 'floating', hero: true, radius: 'rounded-card' },
  overlay: { tier: 'modal', hero: false, radius: 'rounded-fw-lg' },
  chrome: { tier: 'subtle', hero: false, radius: 'rounded-full' },
};

const TIER_CLASS: Record<GlassSurfaceTier, string> = {
  subtle: 'fw-frost fw-frost-subtle',
  floating: 'fw-frost fw-frost-floating',
  modal: 'fw-frost fw-frost-modal',
};

export interface GlassSurfaceProps
  extends Omit<HTMLMotionProps<'div'>, 'children'> {
  /**
   * REQUIRED. Which allow-listed floating surface this is. Typed to the §4.3
   * allow-list so glass cannot be reached for on an arbitrary card.
   */
  surface: GlassSurfaceKind;
  /**
   * Whether to play the cinematic materialize (opacity + scale) on mount.
   * Defaults to `true`. Set `false` for surfaces whose entrance is owned by a
   * parent (e.g. a Radix dialog already animating the overlay).
   */
  animateIn?: boolean;
  /** Inner padding. Defaults to `p-6` (24px). Pass `null` for edge-to-edge. */
  padding?: 'none' | 'sm' | 'md' | 'lg' | null;
  /** Frost strength. Defaults per `surface` (top-bar/chrome → subtle, hero →
   *  floating, command/overlay → modal). */
  tier?: GlassSurfaceTier;
  /** Paint the lit top rim. Default `true`; off for a bar that touches the
   *  viewport edge. */
  edgeHighlight?: boolean;
  /** `accent` adds the faint green ring (the hero's one flourish). */
  tint?: 'neutral' | 'accent';
  /** Hover lift for a floating control surface (pointer devices only). */
  interactive?: boolean;
  children?: ReactNode;
}

const PADDING: Record<'none' | 'sm' | 'md' | 'lg', string> = {
  none: 'p-0',
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8',
};

/**
 * The single restrained Liquid Glass surface. Compose matte child controls on
 * SOLID fills inside it — never glass-on-glass (DESIGN-SYSTEM.md §4.3).
 */
export const GlassSurface = forwardRef<HTMLDivElement, GlassSurfaceProps>(
  function GlassSurface(
    {
      surface,
      animateIn = true,
      padding = 'md',
      tier,
      edgeHighlight = true,
      tint,
      interactive = false,
      className,
      children,
      style,
      ...props
    },
    ref,
  ) {
    const prefersReducedMotion = useReducedMotion();
    const recipe = KIND_RECIPE[surface];
    const resolvedTier = tier ?? recipe.tier;
    const accent = tint === 'accent' || (tint === undefined && recipe.hero);
    const shouldAnimate = animateIn && !prefersReducedMotion;

    return (
      <motion.div
        ref={ref}
        data-slot="glass-surface"
        data-surface={surface}
        // cinematic "materialize" — opacity + scale only, never backdrop-filter
        initial={shouldAnimate ? { opacity: 0, scale: 0.97 } : false}
        animate={{ opacity: 1, scale: 1 }}
        transition={
          shouldAnimate
            ? { duration: 0.52, ease: [0.32, 0.72, 0, 1] /* --fw-ease-emph */ }
            : { duration: 0 }
        }
        data-tier={resolvedTier}
        className={cn(
          TIER_CLASS[resolvedTier],
          !edgeHighlight && styles.noEdge,
          accent && styles.glassHero,
          interactive && styles.interactive,
          recipe.radius,
          'text-text-primary',
          padding ? PADDING[padding] : undefined,
          className,
        )}
        style={style}
        {...props}
      >
        {children}
      </motion.div>
    );
  },
);
