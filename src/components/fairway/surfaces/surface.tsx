/**
 * ============================================================================
 * Fairway · surfaces · Surface / Inset / Elevated
 * ----------------------------------------------------------------------------
 * The warm matte OPAQUE card system (DESIGN-SYSTEM.md §4.1 / §4.2). This is the
 * default container family that replaces the 30-file `bg-white/70
 * backdrop-blur-xl` inline-glass anti-pattern. Matte by default; glass is a
 * separate, allow-listed material (see ./glass-surface.tsx).
 *
 *   Surface  — THE card. bg-surface + (border-subtle OR shadow-soft, never both
 *              at rest) + rounded-card (20px) + p-6. Optional header/body/footer
 *              slots. `interactive` opts into hover shadow-raise + a gentle
 *              upward drift + a green focus-visible ring.
 *   Inset    — bg-surface-sunken well for nested rows/evidence INSIDE a card.
 *              No border (tint step, never card-in-card with two borders).
 *   Elevated — bg-elevated + shadow-raise; for things that truly float WITHOUT
 *              glass (menus, popovers, anchored panels).
 *
 * Pure presentation. Renders correctly inside a `.fairway-ds` scope on a
 * bg-canvas page. ADDITIVE ONLY — imported by nothing existing.
 * ========================================================================== */
import { forwardRef } from 'react';
import type { ElementType, HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/* ─────────────────────────────────────────────────────────────────────────
 * Shared types
 * ──────────────────────────────────────────────────────────────────────── */

/** Resting elevation strategy. Per spec a resting card uses border OR shadow,
 *  never both. Default `border`; `shadow` gives a borderless soft-lit card. */
export type SurfaceElevation = 'border' | 'shadow';

/** Padding rhythm on the 4px base (DESIGN-SYSTEM.md §4.2: p-6 default, p-8 hero). */
export type SurfacePadding = 'none' | 'sm' | 'md' | 'lg';

const PADDING: Record<SurfacePadding, string> = {
  none: 'p-0',
  sm: 'p-4', // 16px
  md: 'p-6', // 24px — DEFAULT card padding
  lg: 'p-8', // 32px — hero / roomy
};

/* ─────────────────────────────────────────────────────────────────────────
 * Surface — THE warm matte card
 * ──────────────────────────────────────────────────────────────────────── */

export interface SurfaceProps extends HTMLAttributes<HTMLDivElement> {
  /** Resting elevation: a warm hairline (`border`, default) or a soft warm
   *  shadow (`shadow`). Never both — that is the cheap-UI tell. */
  elevation?: SurfaceElevation;
  /** Inner padding rhythm. Default `md` (p-6 / 24px). */
  padding?: SurfacePadding;
  /** Opt into pointer affordance: hover lifts to `shadow-raise` with a 1px
   *  upward drift, active settles back, plus a green focus-visible ring.
   *  Leave off for static content cards. */
  interactive?: boolean;
  /** Render as another element/component (e.g. `'button'`, `'a'`, Next `Link`).
   *  Defaults to `div`. Used together with `interactive` for clickable tiles. */
  as?: ElementType;
}

/**
 * The default grouped-content container. Matte, opaque, warm, tactile.
 * Compose with `Surface.Header` / `Surface.Body` / `Surface.Footer`, or pass
 * freeform children.
 */
const SurfaceRoot = forwardRef<HTMLDivElement, SurfaceProps>(function Surface(
  {
    elevation = 'border',
    padding = 'md',
    interactive = false,
    as,
    className,
    children,
    ...props
  },
  ref,
) {
  const Comp = (as ?? 'div') as ElementType;

  return (
    <Comp
      ref={ref}
      data-slot="surface"
      data-interactive={interactive ? '' : undefined}
      className={cn(
        // base matte card
        'relative bg-surface rounded-card text-text-primary',
        PADDING[padding],
        // resting elevation — border OR shadow, never both
        elevation === 'border'
          ? 'border border-border-subtle shadow-flat'
          : 'shadow-soft',
        // interactive affordance (cinematic, small-distance transforms only)
        interactive && [
          'cursor-pointer transition-[box-shadow,transform,border-color]',
          'duration-[180ms] ease-[cubic-bezier(0.22,0.61,0.36,1)]',
          'hover:shadow-raise hover:-translate-y-px',
          'active:translate-y-[0.5px] active:shadow-flat',
          // green focus-visible ring that survives black + cream
          'outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
          // honor reduced motion — collapse transforms, keep the shadow cue
          'motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:translate-y-0',
        ],
        className,
      )}
      {...props}
    >
      {children}
    </Comp>
  );
});

/* ─────────────────────────────────────────────────────────────────────────
 * Surface.Header — flex items-start justify-between, pb-4
 * ──────────────────────────────────────────────────────────────────────── */

export interface SurfaceHeaderProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** Card title — rendered as an `h3` (General Sans 18/24 semibold) when a
   *  string is passed. Pass a node for full control. */
  title?: ReactNode;
  /** Quiet supporting line under the title (caption, text-tertiary). */
  subtitle?: ReactNode;
  /** Right-aligned action cluster (IconButton / small Button). */
  actions?: ReactNode;
}

const SurfaceHeader = forwardRef<HTMLDivElement, SurfaceHeaderProps>(function SurfaceHeader(
  { title, subtitle, actions, className, children, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      data-slot="surface-header"
      className={cn('flex items-start justify-between gap-4 pb-4', className)}
      {...props}
    >
      {/* explicit title/subtitle path */}
      {(title || subtitle) && (
        <div className="min-w-0 space-y-1">
          {typeof title === 'string' ? (
            <h3 className="font-fw-sans text-h3 font-semibold text-text-primary">{title}</h3>
          ) : (
            title
          )}
          {subtitle ? (
            <p className="font-fw-sans text-caption text-text-tertiary">{subtitle}</p>
          ) : null}
        </div>
      )}
      {/* freeform children (when not using title/subtitle) */}
      {children}
      {actions ? (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
});

/* ─────────────────────────────────────────────────────────────────────────
 * Surface.Body — vertical rhythm via spacing, no internal divider lines
 * ──────────────────────────────────────────────────────────────────────── */

const SurfaceBody = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function SurfaceBody({ className, children, ...props }, ref) {
    return (
      <div
        ref={ref}
        data-slot="surface-body"
        className={cn('space-y-4 font-fw-sans text-body text-text-secondary', className)}
        {...props}
      >
        {children}
      </div>
    );
  },
);

/* ─────────────────────────────────────────────────────────────────────────
 * Surface.Footer — pt-4 + a single warm top hairline (ONLY for actions/meta)
 * ──────────────────────────────────────────────────────────────────────── */

const SurfaceFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function SurfaceFooter({ className, children, ...props }, ref) {
    return (
      <div
        ref={ref}
        data-slot="surface-footer"
        className={cn(
          'flex items-center justify-between gap-3 pt-4',
          'border-t border-border-subtle',
          className,
        )}
        {...props}
      >
        {children}
      </div>
    );
  },
);

/* ─────────────────────────────────────────────────────────────────────────
 * Inset — bg-surface-sunken well for nested rows (no border; tint step)
 * ──────────────────────────────────────────────────────────────────────── */

export interface InsetProps extends HTMLAttributes<HTMLDivElement> {
  /** Inner padding. Default `sm` (p-4 / 16px) — insets sit inside a padded card. */
  padding?: SurfacePadding;
  /** Render as another element/component. Defaults to `div`. */
  as?: ElementType;
}

/**
 * A toasted-cream sunken well for content nested INSIDE a Surface (evidence
 * blocks, list rows, input tracks). Tint step down, never a second border.
 */
export const Inset = forwardRef<HTMLDivElement, InsetProps>(function Inset(
  { padding = 'sm', as, className, children, ...props },
  ref,
) {
  const Comp = (as ?? 'div') as ElementType;
  return (
    <Comp
      ref={ref}
      data-slot="inset"
      className={cn(
        'bg-surface-sunken rounded-fw-md text-text-secondary',
        PADDING[padding],
        className,
      )}
      {...props}
    >
      {children}
    </Comp>
  );
});

/* ─────────────────────────────────────────────────────────────────────────
 * Elevated — bg-elevated + shadow-raise; floats WITHOUT glass
 * ──────────────────────────────────────────────────────────────────────── */

export interface ElevatedProps extends HTMLAttributes<HTMLDivElement> {
  /** Float intensity. `raise` (default) for popovers/menus; `pop` for the
   *  lightest anchored panels; `modal` for sheet-grade depth (opaque, no glass). */
  level?: 'raise' | 'pop' | 'modal';
  /** Inner padding. Default `sm` (p-4). */
  padding?: SurfacePadding;
  /** Render as another element/component. Defaults to `div`. */
  as?: ElementType;
}

const ELEVATED_SHADOW: Record<NonNullable<ElevatedProps['level']>, string> = {
  raise: 'shadow-raise',
  pop: 'shadow-pop',
  modal: 'shadow-fw-modal',
};

/**
 * An opaque surface that genuinely floats above content (menus, popovers,
 * anchored panels) without using the Liquid Glass material. Use this when
 * glass is NOT on the §4.3 allow-list or transparency is undesirable.
 */
export const Elevated = forwardRef<HTMLDivElement, ElevatedProps>(function Elevated(
  { level = 'raise', padding = 'sm', as, className, children, ...props },
  ref,
) {
  const Comp = (as ?? 'div') as ElementType;
  return (
    <Comp
      ref={ref}
      data-slot="elevated"
      className={cn(
        'bg-elevated rounded-fw-lg text-text-primary',
        ELEVATED_SHADOW[level],
        PADDING[padding],
        className,
      )}
      {...props}
    >
      {children}
    </Comp>
  );
});

/* ─────────────────────────────────────────────────────────────────────────
 * Compound export — Surface.Header / Surface.Body / Surface.Footer
 * ──────────────────────────────────────────────────────────────────────── */

type SurfaceComponent = typeof SurfaceRoot & {
  Header: typeof SurfaceHeader;
  Body: typeof SurfaceBody;
  Footer: typeof SurfaceFooter;
};

export const Surface = Object.assign(SurfaceRoot, {
  Header: SurfaceHeader,
  Body: SurfaceBody,
  Footer: SurfaceFooter,
}) as SurfaceComponent;

export { SurfaceHeader, SurfaceBody, SurfaceFooter };
