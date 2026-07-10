/**
 * HelmMark — the single shared "Helm wheel" logo mark for both products.
 *
 * Every call site used to hand-roll its own `<Image src="/helm-*-logo*.png" />`
 * wrapper, and the wrapper shape silently drifted between them — one page
 * (baseball coach-onboarding) lost its `flex items-center justify-center`
 * during an unrelated redesign, which let next/image's inline-level <img>
 * sit on its text baseline and overflow the fixed-height slot instead of
 * being centered inside it. HelmMark makes the flex-centered box + optional
 * glow backdrop a structural invariant instead of something a future diff
 * can silently drop.
 *
 * Renders identically to the previous per-site markup — same DOM shape
 * (relative glow wrapper > relative flex-centered box > next/image), just
 * sourced from one place. `size` drives next/image's intrinsic width/height
 * (and the default box size); pass `className` with the site's own
 * (possibly responsive) `h-*`/`w-*` utilities when the rendered box differs
 * from `size` at a breakpoint — it's applied to both the sizing box and the
 * image itself, matching the pattern every working instance already used.
 */
import Image from 'next/image';
import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';

export type HelmMarkSport = 'baseball' | 'golf';

const SPORT_SRC: Record<HelmMarkSport, string> = {
  baseball: '/helm-baseball-logo.png',
  golf: '/helm-golf-logo-transparent.png',
};

export interface HelmMarkProps {
  /** Which product's mark to render. */
  sport: HelmMarkSport;
  /** Square intrinsic size in px passed to next/image (and the default box size). */
  size: number;
  /** Extra classes for the sizing box — also forwarded onto the <Image> so object-contain sizing matches (e.g. responsive `h-10 w-10 sm:h-12 sm:h-12`). */
  className?: string;
  /** Render the decorative blur backdrop behind the mark. Off by default. */
  glow?: boolean;
  /** Tailwind blur/scale utilities for the glow (e.g. `blur-xl scale-150`). */
  glowClassName?: string;
  /** Alpha for the glow's `--fl-sage-deep-rgb` background. */
  glowOpacity?: number;
  /** Alt text — most call sites treat the mark as decorative (''). */
  alt?: string;
  /** Forwarded to next/image `priority`. Defaults false — only set true where the mark is above-the-fold LCP content, matching each call site's prior behavior. */
  priority?: boolean;
  /** Forwarded to next/image `unoptimized`. Defaults false, matching each call site's prior behavior. */
  unoptimized?: boolean;
  /** Inline style forwarded directly onto the <Image> (e.g. a drop-shadow filter). */
  imgStyle?: CSSProperties;
}

export function HelmMark({
  sport,
  size,
  className,
  glow = false,
  glowClassName = 'blur-xl scale-150',
  glowOpacity = 0.15,
  alt = '',
  priority = false,
  unoptimized = false,
  imgStyle,
}: HelmMarkProps) {
  return (
    <div className="relative">
      {glow ? (
        <div
          aria-hidden
          className={cn('absolute inset-0 rounded-full', glowClassName)}
          style={{ background: `rgba(var(--fl-sage-deep-rgb), ${glowOpacity})` }}
        />
      ) : null}
      <div
        className={cn('relative flex items-center justify-center', className)}
        style={!className ? { width: size, height: size } : undefined}
      >
        <Image
          src={SPORT_SRC[sport]}
          alt={alt}
          width={size}
          height={size}
          className={cn('object-contain', className)}
          priority={priority}
          unoptimized={unoptimized}
          style={imgStyle}
        />
      </div>
    </div>
  );
}
