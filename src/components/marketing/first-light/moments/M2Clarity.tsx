'use client';

/**
 * M2 · CLARITY — the what-is-it moment. docs/LANDING_ENTRY_WORLD_DESIGN.md
 * M2. Background register: ecru editorial (flat `var(--fl-ecru)`).
 *
 * This is the landing moment of the M1 exit scrub (spec's scroll
 * choreography map: "M1 → M2 exit... M2's serif statement writes itself
 * in line-by-line timed to arrival"). The serif statement writes itself in
 * via `MaskedReveal`'s `whileInView` one-shot entrance (the same primitive
 * M1's headline uses) — no PinnedScrub here, this section stays CALM per
 * the build brief so M3's scrubbed set piece lands harder next.
 *
 * Below: three hairline-ruled ledger lines — explicitly NOT cards.
 * Graphite ordinal numerals (font-annual/Space Grotesk, the app's UI
 * register) + green rules, the app's own idiom, pre-echoed on the
 * marketing surface.
 */
import { cn } from '@/lib/utils';
import { MaskedReveal } from '../scroll/MaskedReveal';
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
    <section
      className={cn('relative px-6 py-24 sm:py-32', className)}
      style={{ backgroundColor: 'var(--fl-ecru)' }}
    >
      <div className="mx-auto max-w-3xl">
        <MaskedReveal
          as="h2"
          lines={[
            'Helm is the operating system for college programs —',
            'roster, schedule, stats, and an AI that reads',
            'the game with you.',
          ]}
          className={cn(
            flFraunces.className,
            'text-[clamp(1.75rem,3.6vw,2.75rem)] font-normal leading-[1.15] tracking-tight text-[var(--fl-pine)]',
          )}
        />

        <div className="mt-16 flex flex-col">
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
              <div className="mb-5 flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="font-annual text-caption font-medium tabular-nums text-warm-400"
                >
                  {line.n}
                </span>
                <div className="fl-rule flex-1 origin-left" style={{ background: 'var(--fl-green)' }} />
              </div>
              <div className="flex flex-col gap-1.5 sm:flex-row sm:items-baseline sm:justify-between">
                <span className={cn(flFraunces.className, 'text-xl font-medium text-[var(--fl-pine)] sm:text-2xl')}>
                  {line.label}
                </span>
                <span className="max-w-sm text-body text-warm-500 sm:text-right">{line.detail}</span>
              </div>
            </m.div>
          ))}
        </div>
      </div>
    </section>
  );
}
