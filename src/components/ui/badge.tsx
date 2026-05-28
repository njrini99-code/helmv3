import { HTMLAttributes, type ElementType } from 'react';
import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * Badge-local class merge.
 *
 * The shared `cn` in `@/lib/utils` uses the DEFAULT tailwind-merge config,
 * which doesn't know about this design system's custom `fontSize` tokens
 * (`text-eyebrow`, `text-micro`, `text-caption`, `text-body-sm`, …). As a
 * result default twMerge misclassifies e.g. `text-eyebrow` as a text-COLOR and
 * silently collapses it with a real text color like `text-amber-700` — which
 * would make a Badge that carries BOTH a tone text-color and a custom text-size
 * lose one of them.
 *
 * Since a pill genuinely needs both (a tone color AND an 11px/10px size),
 * Badge composes its classes with a merge that registers those custom sizes as
 * font-size. That keeps tone color and custom size as separate, non-colliding
 * groups, so both survive — making every migrated pill color- AND size-faithful.
 */
const CUSTOM_FONT_SIZES = [
  'display',
  'h1',
  'h2',
  'h3',
  'body-lg',
  'body',
  'body-sm',
  'caption',
  'eyebrow',
  'micro',
  'label',
];

const twMergeBadge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': CUSTOM_FONT_SIZES.map((s) => `text-${s}`),
    },
  },
});

function cn(...inputs: ClassValue[]) {
  return twMergeBadge(clsx(inputs));
}

/**
 * Badge — the single canonical pill/chip primitive (Wave W2D).
 *
 * W2D folded ~14 one-off pill/badge components into this primitive via a
 * `tone × variant` API. The goal was strict COLOR FIDELITY: each migrated
 * pill maps to the tone that reproduces its original hue — distinct colors
 * (rose vs red, emerald vs green vs primary, amber vs orange, violet vs
 * indigo, blue vs teal) are kept as distinct tones, never flattened.
 *
 * API
 * ───
 * Two ways to color a Badge, kept on the same component for back-compat:
 *
 *  1. NEW canonical surface API — pass `tone` + `appearance`:
 *       <Badge tone="rose" appearance="soft">Injured</Badge>
 *       <Badge tone="primary" appearance="solid">Active</Badge>
 *       <Badge tone="warning" appearance="outline">Pending</Badge>
 *     - `tone`       picks the hue (semantic aliases + literal hues).
 *     - `appearance` picks the surface treatment:
 *         · soft    — tinted bg + same-tone text + tinted border (default).
 *         · solid   — saturated bg + white text.
 *         · outline — transparent bg + tone border + tone text.
 *
 *  2. LEGACY semantic API — pass `variant` (no `tone`):
 *       <Badge variant="success">…</Badge>   // default|primary|secondary|
 *                                             // success|warning|danger|info|outline
 *     Preserved verbatim so the dozens of existing call sites keep their
 *     exact look. Each legacy variant resolves to a (tone, appearance) pair
 *     below — the rendered classes are byte-identical to the pre-W2D values.
 *
 * Either way the rendered markup is one <span> with the same dot / icon /
 * onRemove affordances the primitive has always shipped.
 */

// ── Hue tokens ────────────────────────────────────────────────────────────
// Semantic aliases (neutral/positive/destructive/…) plus the literal hues the
// migrated pills used directly. Both styles are first-class so migrations are
// color-faithful and the brief's tone vocabulary works as written.
export type BadgeTone =
  // semantic aliases
  | 'neutral'
  | 'primary'
  | 'positive'
  | 'warning'
  | 'destructive'
  | 'info'
  | 'accent'
  // literal hues (kept distinct for color fidelity)
  | 'warm'
  | 'green'
  | 'emerald'
  | 'amber'
  | 'orange'
  | 'rose'
  | 'red'
  | 'blue'
  | 'violet'
  | 'indigo'
  | 'teal';

export type BadgeAppearance = 'soft' | 'solid' | 'outline';

// Legacy semantic variant names — preserved for back-compat. When `tone` is
// NOT supplied, `variant` is interpreted as one of these.
export type BadgeVariant =
  | 'default'
  | 'primary'
  | 'secondary'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'outline';

type ToneScale = {
  /** Resolves to one of the literal hue families below. */
  hue: HueFamily;
};

type HueFamily =
  | 'warm'
  | 'primary'
  | 'green'
  | 'emerald'
  | 'amber'
  | 'orange'
  | 'rose'
  | 'red'
  | 'blue'
  | 'violet'
  | 'indigo'
  | 'teal';

// Map every public tone (semantic alias or literal) onto a concrete hue family.
const TONE_HUE: Record<BadgeTone, ToneScale> = {
  // semantic aliases
  neutral: { hue: 'warm' },
  primary: { hue: 'primary' },
  positive: { hue: 'primary' },
  warning: { hue: 'amber' },
  destructive: { hue: 'red' },
  info: { hue: 'blue' },
  accent: { hue: 'violet' },
  // literal hues
  warm: { hue: 'warm' },
  green: { hue: 'green' },
  emerald: { hue: 'emerald' },
  amber: { hue: 'amber' },
  orange: { hue: 'orange' },
  rose: { hue: 'rose' },
  red: { hue: 'red' },
  blue: { hue: 'blue' },
  violet: { hue: 'violet' },
  indigo: { hue: 'indigo' },
  teal: { hue: 'teal' },
};

// Per-hue surface classes. `soft` is the dominant look across the migrated
// pills (50-tint bg + 700 text + 200 border). `solid` and `outline` cover the
// saturated / transparent looks.
const HUE_SOFT: Record<HueFamily, string> = {
  warm: 'border-warm-200 text-warm-700 bg-warm-50',
  primary: 'border-primary-200 text-primary-700 bg-primary-50',
  green: 'border-green-200 text-green-700 bg-green-50',
  emerald: 'border-emerald-200 text-emerald-700 bg-emerald-50',
  amber: 'border-amber-200 text-amber-700 bg-amber-50',
  orange: 'border-orange-200 text-orange-700 bg-orange-50',
  rose: 'border-rose-200 text-rose-700 bg-rose-50',
  red: 'border-red-200 text-red-700 bg-red-50',
  blue: 'border-blue-200 text-blue-700 bg-blue-50',
  violet: 'border-violet-200 text-violet-700 bg-violet-50',
  indigo: 'border-indigo-200 text-indigo-700 bg-indigo-50',
  teal: 'border-teal-200 text-teal-700 bg-teal-50',
};

const HUE_SOLID: Record<HueFamily, string> = {
  warm: 'border-transparent text-white bg-warm-700',
  primary: 'border-transparent text-white bg-primary-600',
  green: 'border-transparent text-white bg-green-600',
  emerald: 'border-transparent text-white bg-emerald-500',
  amber: 'border-transparent text-white bg-amber-500',
  orange: 'border-transparent text-white bg-orange-500',
  rose: 'border-transparent text-white bg-rose-500',
  red: 'border-transparent text-white bg-red-500',
  blue: 'border-transparent text-white bg-blue-600',
  violet: 'border-transparent text-white bg-violet-600',
  indigo: 'border-transparent text-white bg-indigo-600',
  teal: 'border-transparent text-white bg-teal-600',
};

const HUE_OUTLINE: Record<HueFamily, string> = {
  warm: 'border-warm-300 text-warm-600 bg-transparent',
  primary: 'border-primary-300 text-primary-700 bg-transparent',
  green: 'border-green-300 text-green-700 bg-transparent',
  emerald: 'border-emerald-300 text-emerald-700 bg-transparent',
  amber: 'border-amber-300 text-amber-700 bg-transparent',
  orange: 'border-orange-300 text-orange-700 bg-transparent',
  rose: 'border-rose-300 text-rose-700 bg-transparent',
  red: 'border-red-300 text-red-700 bg-transparent',
  blue: 'border-blue-300 text-blue-700 bg-transparent',
  violet: 'border-violet-300 text-violet-700 bg-transparent',
  indigo: 'border-indigo-300 text-indigo-700 bg-transparent',
  teal: 'border-teal-300 text-teal-700 bg-transparent',
};

const HUE_DOT: Record<HueFamily, string> = {
  warm: 'bg-warm-500',
  primary: 'bg-primary-500',
  green: 'bg-green-500',
  emerald: 'bg-emerald-500',
  amber: 'bg-amber-500',
  orange: 'bg-orange-500',
  rose: 'bg-rose-500',
  red: 'bg-red-500',
  blue: 'bg-blue-500',
  violet: 'bg-violet-500',
  indigo: 'bg-indigo-500',
  teal: 'bg-teal-500',
};

/**
 * Legacy `variant` → (hue, appearance, dot) resolution.
 *
 * These reproduce the EXACT classes the pre-W2D Badge rendered. The pre-W2D
 * `soft` look used a `/50`-alpha tint + a 300 border + 700 text; preserved
 * verbatim here so every existing <Badge variant="…"> call site is unchanged.
 */
const LEGACY_VARIANT: Record<
  BadgeVariant,
  { box: string; dot: string }
> = {
  default: { box: 'border-warm-300 text-warm-600 bg-warm-50/50', dot: 'bg-warm-500' },
  primary: { box: 'border-primary-300 text-primary-700 bg-primary-50/50', dot: 'bg-primary-500' },
  secondary: { box: 'border-warm-200 text-warm-500 bg-warm-50/50', dot: 'bg-warm-400' },
  success: { box: 'border-primary-300 text-primary-700 bg-primary-50/50', dot: 'bg-primary-500' },
  warning: { box: 'border-amber-300 text-amber-700 bg-amber-50/50', dot: 'bg-amber-500' },
  danger: { box: 'border-red-300 text-red-700 bg-red-50/50', dot: 'bg-red-500' },
  info: { box: 'border-blue-300 text-blue-700 bg-blue-50/50', dot: 'bg-blue-500' },
  outline: { box: 'border-warm-300 text-warm-600 bg-transparent', dot: 'bg-warm-500' },
};

const SIZES = {
  sm: 'px-2 py-0.5 text-micro',
  md: 'px-2.5 py-0.5 text-xs',
  lg: 'px-3 py-1 text-sm',
  // `none` emits NO size utilities — for pills that fully own their padding /
  // text-size via className (e.g. custom `text-eyebrow`/`xs` size scales) so
  // Badge's default `text-xs` never conflicts with the caller's choice.
  none: '',
} as const;

export type BadgeSize = keyof typeof SIZES;

interface BadgeOwnProps {
  /**
   * Hue token (semantic alias or literal). When set, `variant` is interpreted
   * as a surface (`appearance`) — see `appearance`. When omitted, the legacy
   * `variant` semantic API is used instead.
   */
  tone?: BadgeTone;
  /** Surface treatment when `tone` is set. Defaults to `soft`. */
  appearance?: BadgeAppearance;
  /**
   * Legacy semantic variant (used only when `tone` is NOT supplied). Kept for
   * full backward-compatibility with pre-W2D call sites.
   */
  variant?: BadgeVariant;
  size?: BadgeSize;
  showDot?: boolean;
  pulse?: boolean;
  icon?: React.ReactNode;
  onRemove?: () => void;
  /**
   * Render element. Defaults to `span`. Pass `motion.span` (framer-motion) so a
   * pill can carry entrance/whileHover animations while still delegating its
   * colored shell to this primitive. Extra animation props (initial/animate/…)
   * flow through via `...props`.
   */
  as?: ElementType;
}

/**
 * When `as` renders a non-span element (e.g. `motion.span`, `motion.button`),
 * callers pass props that element accepts — framer-motion animation props
 * (`initial`/`animate`/`whileHover`/`transition`), button attrs (`type`),
 * `role`, `title`, `data-*`, etc. Allowing those forwarded props keeps Badge
 * polymorphic without coupling it to framer-motion's types. They flow through
 * verbatim via `...props` to the rendered element.
 */
type BadgeProps = BadgeOwnProps &
  HTMLAttributes<HTMLSpanElement> & {
    // Forwarded props for the polymorphic `as` element (motion/button/etc.).
    [forwarded: string]: unknown;
  };

export const Badge = ({
  className,
  tone,
  appearance = 'soft',
  variant = 'default',
  size = 'md',
  showDot = false,
  pulse = false,
  icon,
  onRemove,
  as,
  children,
  ...props
}: BadgeProps) => {
  const Comp: ElementType = as ?? 'span';
  // Resolve the box + dot classes from whichever API the caller used.
  let boxClasses: string;
  let dotClass: string;

  if (tone) {
    const { hue } = TONE_HUE[tone];
    boxClasses =
      appearance === 'solid'
        ? HUE_SOLID[hue]
        : appearance === 'outline'
          ? HUE_OUTLINE[hue]
          : HUE_SOFT[hue];
    // Solid surfaces use a white dot so it reads against the saturated bg.
    dotClass = appearance === 'solid' ? 'bg-white/85' : HUE_DOT[hue];
  } else {
    const legacy = LEGACY_VARIANT[variant];
    boxClasses = legacy.box;
    dotClass = legacy.dot;
  }

  return (
    <Comp
      className={cn(
        'inline-flex items-center gap-1.5 font-medium border rounded-full',
        'transition-all duration-200',
        boxClasses,
        SIZES[size],
        pulse && 'animate-badge-pulse',
        className
      )}
      {...props}
    >
      {showDot && (
        <span className={cn(
          'w-1.5 h-1.5 rounded-full flex-shrink-0',
          dotClass,
          pulse && 'animate-pulse-subtle',
        )} />
      )}
      {icon && <span className="flex-shrink-0 -ml-0.5">{icon}</span>}
      {children}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label="Remove"
          className={cn(
            'flex-shrink-0 -mr-1 w-4 h-4 rounded-full',
            'inline-flex items-center justify-center',
            'hover:bg-black/10 transition-colors duration-150',
            'active:scale-90',
          )}
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </Comp>
  );
};

// Count badge for notifications
interface CountBadgeProps {
  count: number;
  max?: number;
  variant?: 'primary' | 'danger' | 'warning';
  className?: string;
}

export function CountBadge({ count, max = 99, variant = 'danger', className }: CountBadgeProps) {
  if (count <= 0) return null;

  const displayCount = count > max ? `${max}+` : count.toString();

  const variantClasses = {
    primary: 'bg-primary-600 text-white',
    // iOS system red — matches native notification badges on the home screen
    danger: 'text-white',
    warning: 'bg-amber-500 text-white',
  };

  const inlineStyle =
    variant === 'danger' ? { backgroundColor: '#FF3B30' } : undefined;

  return (
    <span
      className={cn(
        'inline-flex items-center justify-center min-w-[18px] h-[18px] px-1',
        'text-micro font-bold rounded-full tabular-nums',
        'animate-scale-in',
        variantClasses[variant],
        className
      )}
      style={inlineStyle}
    >
      {displayCount}
    </span>
  );
}
