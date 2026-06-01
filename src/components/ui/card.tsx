import { cn } from '@/lib/utils';
import { forwardRef, HTMLAttributes } from 'react';

/**
 * Canonical Card primitive — consolidated in Wave W2B (ultra-audit MASTER
 * synthesis A4 #1 + A2). One surface primitive, four canonical variants:
 *
 *   - flat        Plain matte panel. No shadow, just a hairline border.
 *   - raised      Elevated panel with a diffused natural-light shadow and a
 *                 slow cinematic hover lift. (Replaces the old PremiumGlassCard.)
 *   - overlay     Translucent backdrop-blur surface that floats over content.
 *                 (Replaces the old GlassCard.)
 *   - interactive Clickable tile: hover lift + border glow + a keyboard
 *                 focus-visible ring so it is operable without a mouse.
 *
 * The legacy variant names (`base`, `glass`, `elevated`, `stat`) are retained
 * as thin aliases so existing consumers keep working; new code should reach
 * for the canonical four. `StatCard` is a composition over the `stat` surface.
 */
type CanonicalVariant = 'flat' | 'raised' | 'overlay' | 'interactive';
type LegacyVariant = 'base' | 'glass' | 'elevated' | 'stat';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CanonicalVariant | LegacyVariant;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  loading?: boolean;
  /**
   * Overlay-only: whether the surface lifts on hover. Defaults to `true`,
   * matching the former GlassCard contract. Pass `hover={false}` for static
   * panels (modals, list shells) that should not react to the pointer.
   */
  hover?: boolean;
  /**
   * Optional diffused glow behind the card.
   *   - overlay: `'green' | 'subtle'` halo (carried over from GlassCard).
   *   - raised:  `true` paints the soft sage natural-light glow that the
   *     former PremiumGlassCard rendered with its `glow` prop.
   */
  glow?: boolean | 'none' | 'green' | 'subtle';
  /**
   * Raised-only: drop the default padding so the surface can be edge-to-edge
   * (lists, tables). Mirrors the former PremiumGlassCard `noPadding` prop.
   */
  noPadding?: boolean;
}

const paddingClasses = {
  none: 'p-0',
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8',
};

// Map legacy variant names onto the canonical four so heavily-used callers
// (e.g. variant="glass") keep rendering identically while the API converges.
const VARIANT_ALIAS: Record<LegacyVariant, CanonicalVariant | 'stat'> = {
  base: 'flat',
  glass: 'overlay',
  elevated: 'raised',
  stat: 'stat',
};

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { className, variant = 'flat', padding = 'lg', loading = false, hover, glow, noPadding, children, ...props },
  ref
) {
  if (loading) {
    return (
      <div
        ref={ref}
        className={cn(
          'bg-white border border-warm-200 rounded-2xl overflow-clip',
          paddingClasses[padding],
          className
        )}
        {...props}
      >
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-warm-100 rounded w-1/3" />
          <div className="h-8 bg-warm-100 rounded w-1/2" />
          <div className="h-4 bg-warm-100 rounded w-2/3" />
        </div>
      </div>
    );
  }

  // Resolve any legacy alias to a canonical variant (or the `stat` helper).
  const resolved = (VARIANT_ALIAS as Record<string, string>)[variant] ?? variant;

  // Overlay: translucent backdrop-blur surface that floats over content.
  // (Canonical home for the former GlassCard.) Hover lift is on by default
  // and suppressed with `hover={false}`; an optional diffused `glow` halo
  // can sit behind the surface.
  if (resolved === 'overlay') {
    const hoverOn = hover !== false;
    const hasGlow = glow === 'green' || glow === 'subtle';
    return (
      <div
        ref={ref}
        className={cn(
          'bg-cream-100/75 backdrop-blur-glass border border-warm-200/45 rounded-2xl',
          'shadow-glass transition-[background-color,box-shadow] duration-200 ease-out',
          hoverOn && 'hover:bg-cream-100/80 hover:shadow-glass-hover',
          hasGlow && 'relative',
          glow === 'green' && 'before:absolute before:inset-0 before:-z-10 before:rounded-3xl before:bg-primary-500/8 before:blur-2xl',
          glow === 'subtle' && 'before:absolute before:inset-0 before:-z-10 before:rounded-3xl before:bg-white/30 before:blur-xl',
          paddingClasses[padding],
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }

  // Interactive: clickable tile with hover lift, border glow, and a
  // keyboard focus-visible ring so it is operable without a pointer.
  if (resolved === 'interactive') {
    return (
      <div
        ref={ref}
        className={cn(
          'bg-white border border-warm-200 rounded-2xl cursor-pointer',
          'shadow-card transition-[transform,box-shadow,border-color] duration-200 ease-out',
          'hover:shadow-card-hover hover:-translate-y-1 hover:border-primary-200',
          'active:translate-y-0 active:shadow-card active:duration-75',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-cream-50',
          paddingClasses[padding],
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }

  // Raised: sculpted matte panel — 24px corners, diffused natural-light
  // shadow, slow cinematic hover lift. Canonical home for the former
  // PremiumGlassCard. `glow` paints a soft sage halo; `noPadding` (or an
  // explicit padding) overrides the generous default. The default padding
  // is the responsive p-6 md:p-7 the premium card always shipped with.
  if (resolved === 'raised') {
    const raisedGlow = glow === true || glow === 'green' || glow === 'subtle';
    // Honour an explicit padding; otherwise fall back to the premium default.
    const raisedPadding = noPadding ? 'p-0' : padding === 'lg' ? 'p-6 md:p-7' : paddingClasses[padding];
    return (
      <div
        ref={ref}
        className={cn(
          'relative overflow-clip surface-matte rounded-3xl',
          'transition-[transform,box-shadow] duration-500 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]',
          hover !== false && 'hover:-translate-y-0.5',
          raisedPadding,
          className
        )}
        {...props}
      >
        {raisedGlow && (
          <>
            <div
              aria-hidden
              className="pointer-events-none absolute -top-20 -right-16 w-56 h-56 rounded-full opacity-70"
              style={{ background: 'radial-gradient(closest-side, rgba(22,163,74,0.10), transparent 70%)' }}
            />
            <div
              aria-hidden
              className="pointer-events-none absolute -bottom-16 -left-16 w-48 h-48 rounded-full opacity-60"
              style={{ background: 'radial-gradient(closest-side, rgba(180,83,9,0.06), transparent 70%)' }}
            />
          </>
        )}
        <div className="relative z-10">{children}</div>
      </div>
    );
  }

  // Stat (legacy helper variant): 2px green left border.
  if (resolved === 'stat') {
    return (
      <div
        ref={ref}
        className={cn(
          'bg-white border border-warm-200 border-l-2 border-l-primary-600 rounded-2xl',
          'transition-[box-shadow,border-color] duration-200 ease-out',
          'hover:shadow-sm hover:border-l-primary-500',
          padding === 'lg' ? 'p-6' : paddingClasses[padding],
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }

  // Flat: plain matte panel — hairline border, no shadow.
  return (
    <div
      ref={ref}
      className={cn(
        'bg-white border border-warm-200 rounded-2xl',
        'transition-colors duration-200 ease-out',
        paddingClasses[padding],
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
});

Card.displayName = 'Card';

// StatCard — canonical stat composition over <Card>. Absorbs the surfaces
// formerly provided by GlassStatCard / PremiumStatCard. Accepts either trend
// shape so existing call sites migrate without rewriting their data:
//   - { value: string | number; positive?: boolean }  (badge style)
//   - { value: number; direction: 'up' | 'down' | 'neutral' }  (glass style)
type StatTrend =
  | { value: string | number; positive?: boolean; direction?: never }
  | { value: number; direction: 'up' | 'down' | 'neutral'; positive?: never };

interface StatCardProps extends HTMLAttributes<HTMLDivElement> {
  label: string;
  value: string | number;
  trend?: StatTrend | null;
  icon?: React.ReactNode;
  /** Small unit appended after the value (e.g. "%", "rounds"). */
  suffix?: string;
}

// Normalise either trend shape to a single internal representation.
function resolveTrend(trend: StatTrend | null | undefined): {
  positive: boolean;
  label: string;
} | null {
  if (!trend) return null;
  if ('direction' in trend && trend.direction !== undefined) {
    if (trend.direction === 'neutral') {
      return { positive: true, label: `${Math.abs(Number(trend.value))}%` };
    }
    return {
      positive: trend.direction === 'up',
      label: `${Math.abs(Number(trend.value))}%`,
    };
  }
  return { positive: !!trend.positive, label: String(trend.value) };
}

export function StatCard({ className, label, value, trend, icon, suffix, ...props }: StatCardProps) {
  const resolvedTrend = resolveTrend(trend);
  return (
    <Card variant="stat" padding="md" className={className} {...props}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-xs font-medium text-warm-500 uppercase tracking-wide mb-1">
            {label}
          </p>
          <p className="text-3xl font-bold text-warm-900 tabular-nums">
            {typeof value === 'number' ? value.toLocaleString() : value}
            {suffix && <span className="text-lg font-normal text-warm-400 ml-1">{suffix}</span>}
          </p>
          {resolvedTrend && (
            <p className={cn(
              'text-sm mt-2 flex items-center gap-1 font-medium',
              resolvedTrend.positive ? 'text-primary-600' : 'text-red-600'
            )}>
              <span className={cn(
                'inline-flex items-center justify-center w-5 h-5 rounded-full text-xs',
                resolvedTrend.positive ? 'bg-primary-50' : 'bg-red-50'
              )}>
                {resolvedTrend.positive ? (
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                  </svg>
                ) : (
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                  </svg>
                )}
              </span>
              {resolvedTrend.label}
            </p>
          )}
        </div>
        {icon && (
          <div className="p-2.5 rounded-xl bg-warm-50 text-warm-400">
            {icon}
          </div>
        )}
      </div>
    </Card>
  );
}

// Card subcomponents
export function CardHeader({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('px-8 py-6 border-b border-warm-100', className)} {...props}>
      {children}
    </div>
  );
}

export function CardContent({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('p-8', className)} {...props}>
      {children}
    </div>
  );
}

export function CardFooter({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('px-8 py-6 border-t border-warm-100 bg-warm-50/50', className)} {...props}>
      {children}
    </div>
  );
}

export function CardTitle({ className, children, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={cn('text-lg font-semibold text-warm-900', className)} {...props}>
      {children}
    </h3>
  );
}

export function CardDescription({ className, children, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn('text-sm text-warm-500 mt-1', className)} {...props}>
      {children}
    </p>
  );
}
