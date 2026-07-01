/**
 * ClayCanvas — the ONE dark surface in the product (spec §4.3 + §8).
 *
 * A `--clay` (warm dirt-black, never blue-black) frame carrying a `--chalk`
 * graticule grid and a faint scan-line vignette, like a chart dropped into a
 * magazine spread. This is a FRAME ONLY: children are the viz (pitch break,
 * spray, season climb). The `<Trace>` stroke primitive that draws on it lands
 * in a later wave.
 *
 * ┌─ QUARANTINE RULE ─────────────────────────────────────────────────────┐
 * │ `--clay` must NEVER be a page, sidebar, or card background. It appears  │
 * │ ONLY inside this frame. Cutting to it should feel like cutting to the   │
 * │ analytics desk — a PR reviewer should reject `--clay` used anywhere     │
 * │ else. (spec §4.2 rule 3, §8.)                                           │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * No hooks — safe in a server component.
 */
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface ClayCanvasProps {
  children?: ReactNode;
  /** Small chalk dateline in the corner, e.g. `THE BREAK ROOM`. */
  label?: string;
  /** Draw the chalk graticule grid (default on). */
  grid?: boolean;
  /** Optional aspect-ratio utility (e.g. `aspect-[4/3]`) for a bare frame. */
  aspect?: string;
  className?: string;
}

/** Chalk graticule — hairlines at ~8% on both axes, every 32px. */
const GRATICULE = [
  'repeating-linear-gradient(0deg, color-mix(in oklch, var(--chalk) 8%, transparent) 0 1px, transparent 1px 32px)',
  'repeating-linear-gradient(90deg, color-mix(in oklch, var(--chalk) 8%, transparent) 0 1px, transparent 1px 32px)',
].join(',');

/** Scan-line vignette — darkened edges + very faint chalk scan lines. */
const SCANLINE_VIGNETTE = [
  'radial-gradient(130% 100% at 50% 0%, transparent 58%, rgba(0,0,0,0.38) 100%)',
  'repeating-linear-gradient(0deg, rgba(244,239,230,0.02) 0 2px, transparent 2px 4px)',
].join(',');

export function ClayCanvas({ children, label, grid = true, aspect, className }: ClayCanvasProps) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-fw-lg bg-[var(--clay)] text-[color:var(--chalk)]',
        aspect,
        className,
      )}
    >
      {grid ? (
        <span aria-hidden className="pointer-events-none absolute inset-0" style={{ backgroundImage: GRATICULE }} />
      ) : null}
      <span aria-hidden className="pointer-events-none absolute inset-0" style={{ background: SCANLINE_VIGNETTE }} />
      {label ? (
        <span className="pointer-events-none absolute left-4 top-3 z-10 text-eyebrow font-semibold uppercase tracking-[0.18em] text-[color:var(--chalk)]/70">
          {label}
        </span>
      ) : null}
      <div className="relative z-10">{children}</div>
    </div>
  );
}
