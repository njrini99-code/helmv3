'use client';

/**
 * M2 · CLARITY — the what-is-it moment. docs/LANDING_ENTRY_WORLD_DESIGN.md
 * M2, SAGE & CREAM amendment, ⚠ AMENDMENT 2 — IMMACULATE, ⚠ AMENDMENT 3 —
 * BRAND & ARCHITECTURE §A.2/§D.1. Background register: `.fl-aurora`
 * (low-chroma sage radial field over cream) — the pre-amendment flat
 * `var(--fl-cream)` fill is retired per Amendment 2 §A.1 ("the cream should
 * never be a flat fill"). One `.fl-light-pool` sits behind the eyebrow/
 * statement anchor (§A.2).
 *
 * Amendment 3 §D.1 breaks the centered axis: an asymmetric editorial split
 * (research §6.2's `1.1fr/0.9fr` recipe) — the serif statement holds the
 * left column, the 01/02/03 ledger holds the right column with a
 * `md:translate-y-8` stagger. A centered eyebrow punctuation row (hairline
 * — "Clarity" — brass `HelmRosette` — hairline, §A.2: "the eyebrow's
 * flanking hairlines meet a brass rosette at center") sits above the split
 * as the section's opening mark; the split itself stays off-axis below it.
 * Mobile collapses to a single stacked column (statement, then ledger, no
 * translate) — the research doc's explicit mobile carve-out for this
 * layout.
 *
 * This is the landing moment of the M1 exit scrub (spec's scroll
 * choreography map: "M1 → M2 exit... M2's serif statement writes itself
 * in line-by-line timed to arrival"). The serif statement writes itself in
 * via `MaskedReveal`'s `whileInView` one-shot entrance (the same primitive
 * M1's headline uses) — no PinnedScrub here, this section stays CALM per
 * the build brief so M3's scrubbed set piece lands harder next.
 *
 * Below: three hairline-ruled ledger lines — explicitly NOT cards.
 * Sage-ink ordinal numerals (font-annual/Space Grotesk, the app's UI
 * register) + sage rules, the app's own idiom, pre-echoed on the
 * marketing surface.
 */
import { cn } from '@/lib/utils';
import { MaskedReveal } from '../scroll/MaskedReveal';
import { HelmRosette } from '../brand';
import { flFraunces } from '../fonts';
import { m, useReducedMotion } from 'framer-motion';

export interface M2ClarityProps {
  className?: string;
}

const LEDGER_LINES = [
  {
    n: '01',
    label: 'Run the program',
    detail: 'Roster, calendar, tasks, travel — one shared source of truth.',
  },
  {
    n: '02',
    label: 'See every number',
    detail: 'Strokes-gained, live stat lines, and readiness tracked automatically.',
  },
  {
    n: '03',
    label: 'Know what matters',
    detail: 'CoachHelm surfaces the one thing worth a conversation this week.',
  },
] as const;

export function M2Clarity({ className }: M2ClarityProps) {
  const reduced = useReducedMotion();

  return (
    <section className={cn('fl-aurora relative px-6 py-24 sm:py-32', className)}>
      <div
        aria-hidden="true"
        className="fl-light-pool left-1/2 top-0 h-[28rem] w-[42rem] -translate-x-1/2"
      />

      <div className="relative mx-auto max-w-5xl">
        {/* Centered eyebrow punctuation — the section's opening mark. The
            asymmetric split below stays off-axis; only this row earns center
            (Amendment 3 §A.2/§D — "set pieces earn center... editorial
            moments break the axis"). */}
        <div className="mx-auto mb-14 flex max-w-xs items-center justify-center gap-3 sm:mb-16">
          <span aria-hidden="true" className="fl-rule h-px flex-1" />
          <span className="font-annual text-eyebrow font-semibold uppercase tracking-[0.28em] text-[var(--fl-sage-deep)]">
            Clarity
          </span>
          <HelmRosette size={12} className="flex-shrink-0 text-[var(--fl-brass)]" />
          <span aria-hidden="true" className="fl-rule h-px flex-1" />
        </div>

        <div className="grid gap-12 md:grid-cols-[1.1fr_0.9fr] md:items-start md:gap-14 lg:gap-20">
          <MaskedReveal
            as="h2"
            lines={[
              'Helm is the operating system for college programs —',
              'roster, schedule, stats, and an AI that reads',
              'the game with you.',
            ]}
            className={cn(
              flFraunces.className,
              'text-balance text-[clamp(1.75rem,3.6vw,2.75rem)] font-normal leading-[1.15] tracking-tight text-[var(--fl-sage-ink)]',
            )}
          />

          <div className="flex flex-col md:translate-y-8">
            {LEDGER_LINES.map((line, i) => (
              <m.div
                key={line.label}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-15%' }}
                transition={
                  reduced
                    ? { duration: 0 }
                    : { duration: 0.5, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }
                }
                className="py-6 sm:py-7"
                style={i > 0 ? { borderTop: '1px solid rgba(var(--fl-brass-rgb), 0.4)' } : undefined}
              >
                <div className="mb-4 flex items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="font-annual text-caption font-medium tabular-nums text-[var(--fl-sage-ink)]"
                  >
                    {line.n}
                  </span>
                  <m.div
                    className="fl-rule flex-1 origin-left"
                    style={{ background: 'var(--fl-sage)' }}
                    initial={{ scaleX: 0 }}
                    whileInView={{ scaleX: 1 }}
                    viewport={{ once: true, margin: '-15%' }}
                    transition={
                      reduced
                        ? { duration: 0 }
                        : { duration: 0.7, delay: i * 0.08 + 0.1, ease: [0.16, 1, 0.3, 1] }
                    }
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className={cn(flFraunces.className, 'text-lg font-medium text-[var(--fl-sage-ink)] sm:text-xl')}>
                    {line.label}
                  </span>
                  <span className="text-body-sm leading-[1.65] text-[rgba(var(--fl-sage-ink-rgb),0.7)]">{line.detail}</span>
                </div>
              </m.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
