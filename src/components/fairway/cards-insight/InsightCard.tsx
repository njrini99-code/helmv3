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

import {
  forwardRef,
  memo,
  useId,
  useInsertionEffect,
  type HTMLAttributes,
  type MouseEventHandler,
  type ReactNode,
} from 'react';
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
import { Skeleton } from '@/components/fairway/feedback';
import { Checkbox } from '@/components/fairway/forms/Checkbox';
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
  /**
   * Adds hover/active affordances (lift + drift) AND makes the card's body a
   * keyboard-operable "open detail" affordance. When set, the card's `onClick`
   * is routed to a real, focusable overlay `<button>` (NOT `role="button"` on
   * the `<article>`) so Enter/Space activate it natively — and so the `actions`
   * row can host real buttons WITHOUT nesting them inside an interactive element
   * (WCAG 2.1.1 + ARIA 4.1.2 nested-interactive). Action clicks never bubble to
   * the open handler because actions render above the overlay, not inside it.
   * Default false.
   */
  interactive?: boolean;
  /**
   * Accessible name for the interactive overlay's open-detail control. Defaults
   * to "Open details" when `interactive` and an `onClick` are supplied. Pass a
   * specific label (e.g. the signal title) for a clearer screen-reader name.
   */
  openLabel?: string;
  /**
   * Multi-select: when `onSelectToggle` is supplied, a lead-column checkbox is
   * rendered (above the open-detail overlay) so the card participates in bulk
   * actions without its toggle opening the detail panel. `selected` reflects the
   * current state. `selectLabel` names the checkbox for screen readers.
   */
  selected?: boolean;
  onSelectToggle?: (next: boolean) => void;
  /** Accessible name for the selection checkbox (e.g. `Select "<title>"`). */
  selectLabel?: string;
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

const InsightCardImpl = forwardRef<HTMLDivElement, InsightCardProps>(
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
      openLabel,
      selected = false,
      onSelectToggle,
      selectLabel,
      loading = false,
      empty = false,
      emptyMessage = 'Not enough data to surface an insight yet.',
      className,
      onClick,
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
      icon ?? (hideIcon ? null : <LeadIcon aria-hidden className="h-full w-full" strokeWidth={1.5} />);

    /* -- shell classes -- */
    const shell = cn(
      'group relative flex rounded-card text-left',
      'transition-[box-shadow,transform,border-color] ease-soft',
      // matte default vs hero glass
      isHero
        ? heroGlassClassName
        : 'bg-surface border border-border-subtle',
      // density — compact wraps on narrow viewports so a multi-button trailing
      // action cluster drops BELOW the title row (no horizontal overflow / title
      // crush at 360px) and sits inline on the right from `sm:` up.
      isCompact ? 'gap-x-3 gap-y-2 p-4 flex-wrap items-center' : 'gap-4',
      !isCompact && (isHero ? 'p-8' : 'p-6'),
      // interactivity — visual lift only on the container; the focus ring + the
      // actual keyboard/click affordance live on the overlay <button> (so the
      // ring follows the focusable element, and the card has-focus-within still
      // reads as the open-detail control). No role/tabindex on the <article>.
      interactive && [
        'duration-fast',
        !isHero && 'hover:shadow-soft hover:-translate-y-px hover:border-transparent',
        isHero && 'hover:-translate-y-px',
        'active:translate-y-[0.5px]',
        'has-[[data-fw-card-open]:focus-visible]:ring-2 has-[[data-fw-card-open]:focus-visible]:ring-border-focus has-[[data-fw-card-open]:focus-visible]:ring-offset-2 has-[[data-fw-card-open]:focus-visible]:ring-offset-canvas',
      ],
      !interactive && 'duration-base',
      className,
    );

    /* -- the keyboard-operable open-detail overlay --
     * When `interactive` + an `onClick` are supplied, the card's open affordance
     * is a REAL focusable <button> stretched across the card via `absolute
     * inset-0`. This is what fixes both:
     *   • WCAG 2.1.1 — Enter/Space natively activate a <button> (the old
     *     role="button" <article> had no key handler, so it was mouse-only).
     *   • ARIA 4.1.2 nested-interactive — the <article> is no longer an
     *     interactive role, so the `actions` <Button>s are not nested inside one.
     * Action controls render with `relative z-10` ABOVE this overlay, so a click
     * on an action never reaches the overlay (no propagation hack needed, and no
     * double-fire of open-detail). The overlay sits at z-0 (behind content).
     */
    const isOverlayInteractive = interactive && typeof onClick === 'function';
    const overlayButton = isOverlayInteractive ? (
      // A bare, full-bleed transparent <button> is intentional here — it is an
      // invisible inset-0 click/keyboard target, NOT a styled CTA, so the Fairway
      // <Button> (a padded pill) would be wrong. This is the same primitive-level
      // exemption the IconButton's raw <button> takes.
      // eslint-disable-next-line helm/no-raw-button
      <button
        type="button"
        data-fw-card-open=""
        aria-label={openLabel ?? 'Open details'}
        onClick={onClick as MouseEventHandler<HTMLButtonElement>}
        className="absolute inset-0 z-0 cursor-pointer rounded-card outline-none"
      />
    ) : null;

    /* -- reveal motion (drift + opacity; collapses under reduced-motion) --
     * PERF: per-row framer-motion is the dominant scroll/jank cost on the long
     * Signals "By player" list — every default/compact card was a `motion.article`
     * keeping animation machinery + an entrance tween alive across hundreds of
     * rows (and re-running on every parent filter/URL/transition re-render).
     * Only the ONE hero glass card (one per view) keeps the framer-motion
     * entrance; default/compact list rows render a plain `<article>` with no
     * motion runtime. The hero entrance also collapses under reduced-motion. */
    const reveal = prefersReduced
      ? {}
      : {
          initial: { opacity: 0, y: 8 },
          animate: { opacity: 1, y: 0 },
          transition: {
            duration: 0.52,
            ease: [0.16, 1, 0.3, 1] as const,
          },
        };

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
            <Skeleton className="h-9 w-9 shrink-0 rounded-fw-md" />
          ) : null}
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <Skeleton className="h-4 w-1/2 rounded-full" />
            {!isCompact ? (
              <>
                <Skeleton className="h-3 w-full rounded-full" />
                <Skeleton className="h-3 w-4/5 rounded-full" />
              </>
            ) : null}
          </div>
        </motion.article>
      );
    }

    /* -- card body (variant-agnostic) — rendered inside either the hero's
     *    framer-motion shell or the plain matte list-card shell below. -- */
    const body = (
      <>
        {tintBar}

        {/* keyboard-operable open-detail overlay (interactive cards only) —
            sits BEHIND the content (z-0) so action buttons (z-10) win clicks. */}
        {overlayButton}

        {/* multi-select checkbox (above the overlay so toggling never opens the
            detail panel). Only rendered when the consumer wires onSelectToggle. */}
        {onSelectToggle ? (
          <span className="relative z-20 flex shrink-0 items-center self-start pointer-events-auto">
            <Checkbox
              checked={selected}
              onCheckedChange={(next) => onSelectToggle(next === true)}
              aria-label={selectLabel ?? 'Select signal'}
            />
          </span>
        ) : null}

        {/* lead icon */}
        {leadIcon ? (
          <span
            className={cn(
              'pointer-events-none relative z-10 flex shrink-0 items-center justify-center rounded-fw-md',
              tone.iconWrap,
              isCompact ? 'h-8 w-8 p-1.5' : 'h-10 w-10 p-2',
            )}
          >
            {leadIcon}
          </span>
        ) : null}

        {/* main column — text is click-through to the overlay (pointer-events-none),
            but the interactive `actions` cluster re-enables pointer events + z-10
            so it sits ABOVE the overlay and its clicks never open the panel. */}
        <div
          className={cn(
            'relative z-10 flex min-w-0 flex-1 flex-col gap-2',
            isOverlayInteractive && 'pointer-events-none',
          )}
        >
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

          {/* action row (default/hero stack below; compact handled separately).
              `pointer-events-auto` + z above the overlay: real buttons here stay
              clickable and never trigger the card's open-detail overlay. */}
          {actions && !isCompact ? (
            <div className="relative z-20 mt-2 flex flex-wrap items-center gap-2 pointer-events-auto">
              {actions}
            </div>
          ) : null}
        </div>

        {/* compact: trailing action cluster. On narrow viewports it wraps to a
            full-width row BELOW the title (basis-full) so 3–4 buttons never
            overflow or crush the line-clamped title; from `sm:` up it collapses
            back to the inline trailing cluster on the right. The cluster itself
            wraps so each ≥44px touch target stays whole. Sits above the overlay. */}
        {actions && isCompact ? (
          <div className="relative z-20 flex basis-full flex-wrap items-center gap-1.5 pointer-events-auto sm:basis-auto sm:ml-auto sm:shrink-0 sm:flex-nowrap">
            {actions}
          </div>
        ) : null}
      </>
    );

    // When the overlay owns the click, the <article> must NOT also carry onClick
    // (that would re-introduce a non-keyboard mouse-only handler + a duplicate
    // open path). Otherwise (non-interactive, or interactive with no handler) we
    // pass the consumer's onClick straight through to the element for back-compat.
    const articleClickProps = isOverlayInteractive ? {} : { onClick };

    // When the overlay owns interactivity, strip any role/tabIndex/onKeyDown a
    // consumer may have passed (some callers added a manual `role="button"
    // tabIndex onKeyDown` workaround for the old missing-keyboard gap). Leaving
    // them would re-create a nested-interactive <article role="button"> wrapping
    // the overlay <button> (ARIA 4.1.2) and a duplicate key handler. The overlay
    // is now the single, native, keyboard-operable affordance.
    const {
      role: _consumerRole,
      tabIndex: _consumerTabIndex,
      onKeyDown: _consumerOnKeyDown,
      ...restSansInteractive
    } = rest as typeof rest & {
      role?: string;
      tabIndex?: number;
      onKeyDown?: unknown;
    };
    const articleRest = isOverlayInteractive ? restSansInteractive : rest;

    // HERO: the ONE glass card per view keeps the framer-motion entrance + the
    // glass material. This is bounded to a single instance, so its motion
    // runtime cost never scales with list length.
    if (isHero) {
      return (
        <motion.article
          ref={ref}
          aria-labelledby={titleId}
          className={shell}
          style={heroGlassStyle}
          {...reveal}
          {...articleClickProps}
          {...articleRest}
        >
          {body}
        </motion.article>
      );
    }

    // DEFAULT / COMPACT (the list rows): a plain matte <article> with NO
    // framer-motion runtime — this is what fixes the slow scroll on the long
    // "By player" Signals list. `rest` is typed as HTMLMotionProps; the
    // non-motion subset is what callers pass here (data-*, aria-*), so we cast
    // it onto the native article element.
    const nativeRest = articleRest as unknown as HTMLAttributes<HTMLElement>;
    return (
      <article
        ref={ref as React.Ref<HTMLElement>}
        aria-labelledby={titleId}
        className={shell}
        {...(articleClickProps as HTMLAttributes<HTMLElement>)}
        {...nativeRest}
      >
        {body}
      </article>
    );
  },
);

/**
 * PERF: memoized so a parent re-render (the Signals workspace churns state on
 * every filter toggle, URL sync, useTransition, and expand/collapse) does NOT
 * re-render every card in the long "By player" list — only cards whose props
 * actually change. Combined with dropping per-row framer-motion above, this is
 * what makes the dense Signals list scroll smoothly.
 */
export const InsightCard = memo(InsightCardImpl);
InsightCard.displayName = 'InsightCard';
