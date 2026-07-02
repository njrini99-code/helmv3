'use client';

/**
 * M6 · FOR THE PLAYER — the player as audience, not afterthought.
 * docs/LANDING_ENTRY_WORLD_DESIGN.md M6, SAGE & CREAM amendment, ⚠
 * AMENDMENT 2 — IMMACULATE, ⚠ AMENDMENT 3 — BRAND & ARCHITECTURE §B.3/§D.2.
 * Background register: `.fl-aurora` (the pre-amendment flat cream→sage-mist
 * gradient is retired per §A.1 — "the cream should never be a flat fill").
 *
 * Amendment 3 §D.2 replaces the equal-thirds row with an asymmetric 6-col
 * bento (research §6.1's "no equal-thirds row" recipe): Readiness is now
 * the dominant tile (`md:col-span-4 md:row-span-2`, grown to carry a small
 * ledger-style sparkline idiom — 7 thin divs, no chart lib) with the
 * Passport and Lift Lab vignettes stacked beside it at `md:col-span-2`
 * each. Every tile keeps the `.fl-card fl-card-lift` recipe from Amendment
 * 2 §B.6 (glass is chrome-only; these are content cards on cream, not
 * floating chrome) and gains a small sage `SportGlyph`/`HelmRosette` in its
 * header per §B.3 (passport→baseball, lift→lift, readiness→neutral
 * rosette — the design system's literal per-tile glyph assignment, not a
 * thematic claim that passport content "is" baseball). No new glow utility
 * is added here — the page's `.fl-cta-glow` budget is already spent on
 * M1/M8 (§E). Mobile collapses to a single column with generous gaps.
 *
 * Copy speaks to the athlete, not the buyer. Each vignette carries one
 * small real-product detail (a completeness bar, a logged-session line, a
 * readiness sparkline + band dot) rather than being pure copy — echoes
 * M5's "show, don't just tell" without competing with it for attention
 * (calm entry reveals only, no scroll-linked motion here). Accents use
 * sage-deep (landing/auth chrome) — kelly stays product-only per the
 * amendment, so nothing here reaches for it.
 *
 * The hover lift uses framer-motion's `whileHover={{ y: -4 }}` rather than
 * `.fl-card-lift`'s own CSS `:hover { transform }` rule — this `m.div`
 * already animates its entrance via the `y` motion value (`initial`/
 * `whileInView`), and framer keeps that value bound to an inline
 * `transform` style for the component's lifetime. An inline style always
 * wins over an external stylesheet's `:hover` selector regardless of
 * specificity, so a CSS-only lift would be silently dead here; driving the
 * same -4px offset through `whileHover` lets framer resolve it correctly
 * against its own already-inline-controlled transform. `.fl-card-lift`'s
 * CSS `:hover` rule still does useful work for the box-shadow swell, which
 * framer doesn't touch.
 */
import { m, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { flFraunces } from '../fonts';
import { HelmRosette, SportGlyph } from '../brand';

export interface M6ForThePlayerProps {
  className?: string;
}

/** Last 7 days, Tailwind height-scale steps (4px grid) — last bar is "today". */
const SPARKLINE_HEIGHTS = ['h-3', 'h-5', 'h-4', 'h-7', 'h-5', 'h-6', 'h-9'] as const;

export function M6ForThePlayer({ className }: M6ForThePlayerProps) {
  const reduced = useReducedMotion();
  const lift = reduced ? undefined : { y: -4, transition: { duration: 0.24, ease: [0.33, 1, 0.68, 1] as const } };

  return (
    <section className={cn('fl-aurora relative px-6 py-24 sm:py-32', className)}>
      <div className="relative z-10 mx-auto max-w-2xl text-center">
        <span className="font-annual text-eyebrow font-semibold uppercase tracking-[0.28em] text-[var(--fl-sage-deep)]">
          For the Player
        </span>
        <h2 className={cn(flFraunces.className, 'mt-4 text-balance text-[clamp(1.75rem,3.4vw,2.5rem)] font-normal leading-tight text-[var(--fl-sage-ink)]')}>
          You&rsquo;re not just on the roster.
        </h2>
      </div>

      <div className="relative z-10 mx-auto mt-14 grid max-w-5xl auto-rows-[minmax(180px,auto)] grid-cols-1 gap-6 md:grid-cols-6 md:gap-5">
        {/* Readiness — the dominant tile. */}
        <m.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          whileHover={lift}
          viewport={{ once: true, margin: '-10%' }}
          transition={reduced ? { duration: 0 } : { duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="fl-card fl-card-lift flex flex-col p-7 md:col-span-4 md:row-span-2"
        >
          <div className="relative z-10 flex h-full flex-col">
            <div className="flex items-center gap-2">
              <HelmRosette size={16} className="flex-shrink-0 text-[var(--fl-sage)]" />
              <h3 className={cn(flFraunces.className, 'text-lg font-medium text-[var(--fl-sage-ink)]')}>Readiness</h3>
            </div>
            <p className="mt-2 max-w-sm text-body-sm leading-[1.65] text-[rgba(var(--fl-sage-ink-rgb),0.72)]">
              A daily read on how you&rsquo;re showing up &mdash; for you and your coach.
            </p>

            <div className="mt-auto flex flex-col gap-5 pt-8 sm:flex-row sm:items-end sm:justify-between">
              <div aria-hidden="true" className="flex items-end gap-2">
                {SPARKLINE_HEIGHTS.map((h, i) => (
                  <div
                    key={i}
                    className={cn('w-3 rounded-full', h)}
                    style={{ backgroundColor: i === SPARKLINE_HEIGHTS.length - 1 ? 'var(--fl-sage-deep)' : 'var(--fl-sage)' }}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2.5">
                <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: 'var(--fl-sage-deep)' }} aria-hidden="true" />
                <span className="font-annual text-body-sm text-[rgba(var(--fl-sage-ink-rgb),0.72)]">
                  <span className="tabular-nums text-[var(--fl-sage-ink)]">4.6</span> of 5 &mdash; ready to go
                </span>
              </div>
            </div>
          </div>
        </m.div>

        {/* Passport — stacked, upper. */}
        <m.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          whileHover={lift}
          viewport={{ once: true, margin: '-10%' }}
          transition={reduced ? { duration: 0 } : { duration: 0.5, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
          className="fl-card fl-card-lift p-6 md:col-span-2"
        >
          <div className="relative z-10">
            <div className="flex items-center gap-2">
              <SportGlyph sport="baseball" size={16} className="flex-shrink-0 text-[var(--fl-sage)]" />
              <h3 className={cn(flFraunces.className, 'text-lg font-medium text-[var(--fl-sage-ink)]')}>Your passport</h3>
            </div>
            <p className="mt-2 text-body-sm leading-[1.65] text-[rgba(var(--fl-sage-ink-rgb),0.72)]">
              Stats, highlights, and your story &mdash; always current, always yours to share.
            </p>
            <div className="mt-4 border-t border-[rgba(var(--fl-sage-ink-rgb),0.12)] pt-4">
              <PassportDetail />
            </div>
          </div>
        </m.div>

        {/* Lift Lab — stacked, lower. */}
        <m.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          whileHover={lift}
          viewport={{ once: true, margin: '-10%' }}
          transition={reduced ? { duration: 0 } : { duration: 0.5, delay: 0.16, ease: [0.16, 1, 0.3, 1] }}
          className="fl-card fl-card-lift p-6 md:col-span-2"
        >
          <div className="relative z-10">
            <div className="flex items-center gap-2">
              <SportGlyph sport="lift" size={16} className="flex-shrink-0 text-[var(--fl-sage)]" />
              <h3 className={cn(flFraunces.className, 'text-lg font-medium text-[var(--fl-sage-ink)]')}>Lift Lab check-in</h3>
            </div>
            <p className="mt-2 text-body-sm leading-[1.65] text-[rgba(var(--fl-sage-ink-rgb),0.72)]">
              Log the work. The bar tracks your progress so you don&rsquo;t have to.
            </p>
            <div className="mt-4 border-t border-[rgba(var(--fl-sage-ink-rgb),0.12)] pt-4">
              <LiftLabDetail />
            </div>
          </div>
        </m.div>
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
