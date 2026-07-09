/**
 * PaperCard — the Paper surface family (spec §4.3).
 *
 * Flat `--paper` cream, a warm `--hairline` border, a 2–3% newsprint grain
 * overlay, and LETTERPRESS depth — an inset shadow, never a drop-shadow (real
 * elevation is reserved for actively-dragged objects). Optionally wears a
 * die-cut registration-corner tick, the editorial "hero card" tell.
 *
 * This is the reading stock: passport, roster spread, postgame, command
 * center. No hooks — safe in a server component.
 */
import type { ComponentPropsWithoutRef, ElementType, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface PaperCardProps extends Omit<ComponentPropsWithoutRef<'div'>, 'className' | 'children'> {
  children: ReactNode;
  /** Die-cut registration crop-mark at the top-right corner (hero cards). */
  registrationTick?: boolean;
  /** Newsprint grain overlay (default on). */
  grain?: boolean;
  as?: ElementType;
  className?: string;
}

/** ~2.5% fractal-noise newsprint grain (inline data-uri, no network). */
const NEWSPRINT_GRAIN =
  "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

/** Letterpress depth — inset highlight + inset shade, NOT a drop shadow. */
const LETTERPRESS = 'shadow-[inset_0_1px_0_rgba(255,255,255,0.6),inset_0_-1px_0_rgba(0,0,0,0.06)]';

function RegistrationTick() {
  return (
    <span aria-hidden className="pointer-events-none absolute right-3 top-3 h-3.5 w-3.5">
      <span className="absolute right-0 top-0 h-px w-3.5 bg-[color:var(--hairline)]" />
      <span className="absolute right-0 top-0 h-3.5 w-px bg-[color:var(--hairline)]" />
    </span>
  );
}

export function PaperCard({ children, registrationTick = false, grain = true, as, className, ...rest }: PaperCardProps) {
  const Comp: ElementType = as ?? 'div';
  return (
    <Comp
      className={cn(
        'relative overflow-hidden rounded-card border border-[color:var(--hairline)] bg-[var(--paper)]',
        LETTERPRESS,
        className,
      )}
      {...rest}
    >
      {grain ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.03] mix-blend-multiply"
          style={{ backgroundImage: NEWSPRINT_GRAIN, backgroundSize: '200px 200px' }}
        />
      ) : null}
      {registrationTick ? <RegistrationTick /> : null}
      <div className="relative z-10">{children}</div>
    </Comp>
  );
}
