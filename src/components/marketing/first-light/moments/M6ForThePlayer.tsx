'use client';

/**
 * M6 · FOR THE PLAYER — the player as audience, not afterthought.
 * docs/LANDING_ENTRY_WORLD_DESIGN.md M6, SAGE & CREAM amendment.
 * Background register: warm cream → sage-mist (daylight — replaces the
 * pre-amendment dark clay/pine dusk gradient, which read moody/off-spec).
 *
 * Three small `fl-glass-2` vignettes: passport completeness, Lift Lab
 * check-in, readiness. Copy speaks to the athlete, not the buyer. Each
 * vignette carries one small real-product detail (a completeness bar, a
 * logged-session line, a readiness band dot) rather than being pure copy —
 * echoes M5's "show, don't just tell" without competing with it for
 * attention (calm entry reveals only, no scroll-linked motion here).
 * Accents use sage-deep (landing/auth chrome) — kelly stays product-only
 * per the amendment, so nothing here reaches for it.
 */
import { m, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { flFraunces } from '../fonts';

export interface M6ForThePlayerProps {
  className?: string;
}

const VIGNETTES = [
  {
    title: 'Your passport',
    line: 'Stats, highlights, and your story — always current, always yours to share.',
    detail: <PassportDetail />,
  },
  {
    title: 'Lift Lab check-in',
    line: 'Log the work. The bar tracks your progress so you don’t have to.',
    detail: <LiftLabDetail />,
  },
  {
    title: 'Readiness',
    line: 'A daily read on how you’re showing up — for you and your coach.',
    detail: <ReadinessDetail />,
  },
];

export function M6ForThePlayer({ className }: M6ForThePlayerProps) {
  const reduced = useReducedMotion();

  return (
    <section
      className={cn('relative px-6 py-24 sm:py-32', className)}
      style={{
        background:
          'linear-gradient(160deg, var(--fl-cream) 0%, var(--fl-sage-mist) 62%, var(--fl-cream-high) 100%)',
      }}
    >
      <div className="relative z-10 mx-auto max-w-2xl text-center">
        <span className="font-annual text-eyebrow font-semibold uppercase tracking-[0.28em] text-[var(--fl-sage-deep)]">
          For the Player
        </span>
        <h2 className={cn(flFraunces.className, 'mt-4 text-[clamp(1.75rem,3.4vw,2.5rem)] font-normal leading-tight text-[var(--fl-sage-ink)]')}>
          You&rsquo;re not just on the roster.
        </h2>
      </div>

      <div className="relative z-10 mx-auto mt-14 grid max-w-5xl grid-cols-1 gap-5 sm:grid-cols-3">
        {VIGNETTES.map((v, i) => (
          <m.div
            key={v.title}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-10%' }}
            transition={
              reduced ? { duration: 0 } : { duration: 0.5, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }
            }
            className="fl-glass-2 rounded-2xl p-6"
          >
            <div className="relative z-10">
              <h3 className={cn(flFraunces.className, 'text-lg font-medium text-[var(--fl-sage-ink)]')}>{v.title}</h3>
              <p className="mt-2 text-body-sm leading-relaxed text-[rgba(var(--fl-sage-ink-rgb),0.72)]">{v.line}</p>
              <div className="mt-4 border-t border-[rgba(var(--fl-sage-ink-rgb),0.12)] pt-4">{v.detail}</div>
            </div>
          </m.div>
        ))}
      </div>
    </section>
  );
}

function PassportDetail() {
  const pct = 92;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="font-annual text-caption font-medium uppercase tracking-[0.1em] text-[rgba(var(--fl-sage-ink-rgb),0.55)]">
          Complete
        </span>
        <span className="font-annual text-body-sm font-medium tabular-nums text-[var(--fl-sage-ink)]">{pct}%</span>
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full" style={{ backgroundColor: 'rgba(var(--fl-sage-ink-rgb), 0.12)' }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: 'var(--fl-sage-deep)' }} />
      </div>
    </div>
  );
}

function LiftLabDetail() {
  return (
    <div className="flex items-center gap-2">
      <span
        className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: 'var(--fl-sage-deep)' }}
        aria-hidden="true"
      >
        <svg viewBox="0 0 12 12" width={8} height={8} fill="none" stroke="var(--fl-cream-high)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 6.5l2.5 2.5L10 3" />
        </svg>
      </span>
      <span className="font-annual text-body-sm text-[rgba(var(--fl-sage-ink-rgb),0.72)]">
        Today logged <span className="tabular-nums text-[var(--fl-sage-ink)]">· 4 sets</span>
      </span>
    </div>
  );
}

function ReadinessDetail() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: 'var(--fl-sage-deep)' }} aria-hidden="true" />
      <span className="font-annual text-body-sm text-[rgba(var(--fl-sage-ink-rgb),0.72)]">
        <span className="tabular-nums text-[var(--fl-sage-ink)]">4.6</span> of 5 &mdash; ready to go
      </span>
    </div>
  );
}
