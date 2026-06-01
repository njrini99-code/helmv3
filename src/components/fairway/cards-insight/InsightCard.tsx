'use client';

/**
 * ============================================================================
 * Fairway · InsightCard (primitive group "cards-insight")
 * ----------------------------------------------------------------------------
 * The CoachHelm + dashboard insight surface (§6 "InsightPanel / InsightCard").
 * ONE vocabulary across three weights:
 *
 *   • hero    — the ONE Liquid-Glass card per view (§4.3 item 3): warm
 *               cream-tinted glass + faint green accent ring, Fraunces title,
 *               body-lg narrative, evidence Inset, full action row. The single
 *               editorial neo-futurism flourish. Every other card stays matte.
 *   • default — the everyday matte signal card: priority tint bar, h3 title,
 *               narrative, optional evidence Inset, action row.
 *   • compact — a dense matte row for triage lists: tint bar + title + one
 *               narrative line + a trailing action cluster.
 *
 * Consistent emphasis: a `priority` (`critical | high | medium | low | info`)
 * drives the left tint bar + the lead icon tone identically in all variants, so
 * the same signal reads the same wherever it lands. Matte by default; only the
 * hero variant reaches for glass.
 *
 * Surfaces/tokens/motion all come from the locked Fairway system (§1/§4/§7) and
 * the `--fw-*` tokens. Honest emptiness (§0 principle 8) via `empty` →
 * `insufficient-data` rather than a hollow shell. Self-contained: imports only
 * the shared `cn()` and this folder's own `glass.ts` helper.
 * ============================================================================
 */

import { forwardRef, useId, useInsertionEffect, type ReactNode } from 'react';
import { motion, useReducedMotion, type HTMLMotionProps } from 'framer-motion';
import {
  AlertTriangle,
  Flame,
  Sparkles,
  Info,
  Lightbulb,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  HERO_GLASS_CLASS,
  HERO_GLASS_FALLBACK_CSS,
  heroGlassClassName,
  heroGlassStyle,
} from './glass';

/**
 * Inject the §4.3 reduced-transparency / forced-colors fallback CSS exactly
 * once on the client. Keeps this primitive self-contained (no global
 * stylesheet edits) while still honoring the required a11y fallback. No-ops on
 * the server and on every render after the first hero card mounts.
 */
function useHeroGlassFallback(active: boolean): void {
  useInsertionEffect(() => {
    if (!active || typeof document === 'undefined') return;
    const id = `fw-hero-glass-fallback`;
    if (document.getElementById(id)) return;
    const el = document.createElement('style');
    el.id = id;
    el.dataset.fairway = HERO_GLASS_CLASS;
    el.textContent = HERO_GLASS_FALLBACK_CSS;
    document.head.appendChild(el);
  }, [active]);
}

export type InsightVariant = 'hero' | 'default' | 'compact';

export type InsightPriority = 'critical' | 'high' | 'medium' | 'low' | 'info';

export interface InsightCardProps
  extends Omit<HTMLMotionProps<'article'>, 'title' | 'children'> {
  /** Variant vocabulary. `hero` is the one glass card per view. */
  variant?: InsightVariant;
  /** Drives the tint bar + lead-icon tone consistently across variants. */
  priority?: InsightPriority;
  /** Small uppercase eyebrow above the title (e.g. "Putting · Signal"). */
  overline?: ReactNode;
  /** Card title. Fraunces on hero, General Sans h3 otherwise. */
  title: ReactNode;
  /** The insight narrative / body copy. */
  children?: ReactNode;
  /** Lead icon override. Defaults to a priority-appropriate icon. */
  icon?: ReactNode;
  /** Hide the lead icon entirely. */
  hideIcon?: boolean;
  /** Evidence / supporting detail rendered in a tinted Inset (not on compact). */
  evidence?: ReactNode;
  /** Action row — Acknowledge / Dismiss / → Focus Area / Ask buttons, etc. */
  actions?: ReactNode;
  /** Right-aligned meta in the header (timestamp, source chip, confidence). */
  meta?: ReactNode;
  /** Adds hover/active affordances (lift + drift). Default false. */
  interactive?: boolean;
  /** Loading → shape-matched skeleton (never a spinner). */
  loading?: boolean;
  /** Honest emptiness — renders an `insufficient-data` state, not a hollow shell. */
  empty?: boolean;
  /** Empty-state copy. Default "Not enough data to surface an insight yet." */
  emptyMessage?: ReactNode;
}

/* -- priority → tone -------------------------------------------------------- */

/**
 * The shared priority → visual-tone contract. Exported so the sibling
 * `InsightPanel` (the expanded/docked read of the SAME signal) consumes the
 * EXACT same tint bar, lead-icon tone, default icon, and a11y word — the
 * guarantee that a signal looks identical whether scanned (card) or read
 * (panel). Do NOT fork this map; both surfaces import it.
 */
export interface PriorityTone {
  /** Left tint bar gradient/fill class. */
  bar: string;
  /** Lead-icon color + soft chip background. */
  iconWrap: string;
  /** Default lead icon. */
  icon: LucideIcon;
  /** Accessible word for the priority (used in aria-label). */
  word: string;
}

export const PRIORITY: Record<InsightPriority, PriorityTone> = {
  critical: {
    bar: 'bg-fw-danger',
    iconWrap: 'text-fw-danger bg-fw-danger-bg',
    icon: AlertTriangle,
    word: 'Critical',
  },
  high: {
    bar: 'bg-fw-warning',
    iconWrap: 'text-fw-warning bg-fw-warning-bg',
    icon: Flame,
    word: 'High priority',
  },
  medium: {
    bar: 'bg-accent-500',
    iconWrap: 'text-accent-700 bg-accent-50',
    icon: Sparkles,
    word: 'Medium priority',
  },
  low: {
    bar: 'bg-accent-300',
    iconWrap: 'text-accent-700 bg-accent-50',
    icon: Lightbulb,
    word: 'Low priority',
  },
  info: {
    bar: 'bg-border-strong',
    iconWrap: 'text-text-secondary bg-surface-sunken',
    icon: Info,
    word: 'Info',
  },
};

/* -- component -------------------------------------------------------------- */

export const InsightCard = forwardRef<HTMLDivElement, InsightCardProps>(
  function InsightCard(
    {
      variant = 'default',
      priority = 'medium',
      overline,
      title,
      children,
      icon,
      hideIcon = false,
      evidence,
      actions,
      meta,
      interactive = false,
      loading = false,
      empty = false,
      emptyMessage = 'Not enough data to surface an insight yet.',
      className,
      ...rest
    },
    ref,
  ) {
    const prefersReduced = useReducedMotion();
    const tone = PRIORITY[priority];
    const titleId = useId();
    const isHero = variant === 'hero';
    const isCompact = variant === 'compact';

    useHeroGlassFallback(isHero);

    const LeadIcon = tone.icon;
    const leadIcon =
      icon ?? (hideIcon ? null : <LeadIcon aria-hidden className="h-full w-full" strokeWidth={2} />);

    /* -- shell classes -- */
    const shell = cn(
      'group relative flex rounded-card text-left',
      'transition-[box-shadow,transform,border-color] ease-soft',
      // matte default vs hero glass
      isHero
        ? heroGlassClassName
        : 'bg-surface border border-border-subtle',
      // density
      isCompact ? 'gap-3 p-4 items-center' : 'gap-4',
      !isCompact && (isHero ? 'p-8' : 'p-6'),
      // interactivity
      interactive && [
        'cursor-pointer duration-fast',
        !isHero && 'hover:shadow-soft hover:-translate-y-px hover:border-transparent',
        isHero && 'hover:-translate-y-px',
        'active:translate-y-[0.5px]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
      ],
      !interactive && 'duration-base',
      className,
    );

    /* -- reveal motion (drift + opacity; collapses under reduced-motion) -- */
    const reveal = prefersReduced
      ? {}
      : {
          initial: { opacity: 0, y: isHero ? 8 : 4 },
          animate: { opacity: 1, y: 0 },
          transition: {
            duration: isHero ? 0.52 : 0.28,
            ease: isHero ? ([0.16, 1, 0.3, 1] as const) : ([0.22, 0.61, 0.36, 1] as const),
          },
        };

    const interactiveProps = interactive
      ? { tabIndex: 0, role: 'button' as const }
      : {};

    /* -- the left priority tint bar (consistent across variants) -- */
    const tintBar = (
      <span
        aria-hidden
        className={cn(
          'absolute left-0 top-0 h-full w-1 rounded-l-card',
          tone.bar,
          // hero glass: soften the bar to a breath rather than a hard stripe
          isHero && 'opacity-80',
        )}
      />
    );

    /* -- loading skeleton -- */
    if (loading) {
      return (
        <motion.article
          ref={ref}
          aria-busy="true"
          aria-live="polite"
          className={cn(shell, 'pointer-events-none select-none')}
          style={isHero ? heroGlassStyle : undefined}
          {...rest}
        >
          {tintBar}
          {!hideIcon ? (
            <span className="h-9 w-9 shrink-0 animate-pulse rounded-fw-md bg-surface-sunken" />
          ) : null}
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <span className="h-4 w-1/2 animate-pulse rounded-full bg-surface-sunken" />
            {!isCompact ? (
              <>
                <span className="h-3 w-full animate-pulse rounded-full bg-surface-sunken" />
                <span className="h-3 w-4/5 animate-pulse rounded-full bg-surface-sunken" />
              </>
            ) : null}
          </div>
        </motion.article>
      );
    }

    return (
      <motion.article
        ref={ref}
        aria-labelledby={titleId}
        className={shell}
        style={isHero ? heroGlassStyle : undefined}
        {...reveal}
        {...interactiveProps}
        {...rest}
      >
        {tintBar}

        {/* lead icon */}
        {leadIcon ? (
          <span
            className={cn(
              'flex shrink-0 items-center justify-center rounded-fw-md',
              tone.iconWrap,
              isCompact ? 'h-8 w-8 p-1.5' : 'h-10 w-10 p-2',
            )}
          >
            {leadIcon}
          </span>
        ) : null}

        {/* main column */}
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {/* header row: overline + title (left) · meta (right) */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-1">
              {overline ? (
                <span className="font-fw-sans text-eyebrow uppercase text-text-tertiary">
                  {overline}
                </span>
              ) : null}
              <h3
                id={titleId}
                className={cn(
                  'min-w-0 text-text-primary',
                  isHero
                    ? 'font-fw-display text-h2 font-medium tracking-[-0.005em]'
                    : isCompact
                      ? 'font-fw-sans text-body font-semibold leading-snug'
                      : 'font-fw-sans text-h3 font-semibold',
                )}
              >
                {title}
              </h3>
            </div>
            {meta ? (
              <span className="shrink-0 font-fw-sans text-caption text-text-tertiary">
                {meta}
              </span>
            ) : null}
          </div>

          {/* narrative */}
          {empty ? (
            <p className="font-fw-sans text-body text-text-tertiary">{emptyMessage}</p>
          ) : children ? (
            <div
              className={cn(
                'font-fw-sans text-text-secondary',
                isHero ? 'text-body-lg leading-relaxed' : 'text-body',
                isCompact && 'line-clamp-1',
              )}
            >
              {children}
            </div>
          ) : null}

          {/* evidence inset (not on compact, not when empty) */}
          {evidence && !isCompact && !empty ? (
            <div className="mt-1 rounded-fw-md bg-surface-sunken p-4 font-fw-sans text-body-sm text-text-secondary">
              {evidence}
            </div>
          ) : null}

          {/* action row (default/hero stack below; compact handled separately) */}
          {actions && !isCompact ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">{actions}</div>
          ) : null}
        </div>

        {/* compact: trailing action cluster on the right */}
        {actions && isCompact ? (
          <div className="flex shrink-0 items-center gap-1.5">{actions}</div>
        ) : null}
      </motion.article>
    );
  },
);
