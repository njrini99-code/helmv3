/**
 * EditorialFrame — the double-bezel form panel for coach onboarding.
 *
 * A picture-frame "mat": an outer ring in the deeper `--paper-canvas` cream
 * holding an inner card in the lighter `--paper` cream, each with its own
 * warm `--hairline` border. Registration ticks at the outer corners (the
 * Living Annual "hero card" tell — see `PaperCard`'s `registrationTick`)
 * signal this is the ONE hero surface on the page. Depth stays letterpress
 * (inset shadow), never a drop-shadow, matching `PaperCard` (spec §4.3).
 *
 * Local to coach-onboarding rather than added to the shared
 * `@/components/baseball/living-annual` kit — this is a one-off editorial
 * "matting" treatment for a full-bleed marketing-grade auth surface, not a
 * general-purpose atom every dashboard surface should reach for.
 */
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface EditorialFrameProps {
  children: ReactNode;
  className?: string;
}

/** ~3.5% fractal-noise newsprint grain (inline data-uri, no network) — mirrors PaperCard. */
const NEWSPRINT_GRAIN =
  "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

function RegistrationTick({ side }: { side: 'left' | 'right' }) {
  return (
    <span
      aria-hidden
      className={cn(
        'pointer-events-none absolute top-3 h-3 w-3',
        side === 'left' ? 'left-3' : 'right-3',
      )}
    >
      <span
        className={cn(
          'absolute top-0 h-px w-3',
          side === 'left' ? 'left-0' : 'right-0',
          'bg-[color:var(--hairline)]',
        )}
      />
      <span
        className={cn(
          'absolute top-0 h-3 w-px',
          side === 'left' ? 'left-0' : 'right-0',
          'bg-[color:var(--hairline)]',
        )}
      />
    </span>
  );
}

export function EditorialFrame({ children, className }: EditorialFrameProps) {
  return (
    <div
      className={cn(
        'relative rounded-3xl border border-[color:var(--hairline)] bg-[var(--paper-canvas)] p-1.5',
        'shadow-[0_24px_60px_-32px_rgba(23,19,15,0.45)]',
        className,
      )}
    >
      <RegistrationTick side="left" />
      <RegistrationTick side="right" />
      <div
        className={cn(
          'relative overflow-hidden rounded-2xl border border-[color:var(--hairline)] bg-[var(--paper)]',
          'shadow-[inset_0_1px_0_rgba(255,255,255,0.55),inset_0_-1px_0_rgba(0,0,0,0.05)]',
        )}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.035] mix-blend-multiply"
          style={{ backgroundImage: NEWSPRINT_GRAIN, backgroundSize: '200px 200px' }}
        />
        <div className="relative p-6 sm:p-8">{children}</div>
      </div>
    </div>
  );
}
