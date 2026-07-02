'use client';

/**
 * M5 · THE INTELLIGENCE — CoachHelm/signals showcase.
 * docs/LANDING_ENTRY_WORLD_DESIGN.md M5. Background register:
 * ecru → pine gradient. One real signal card rendered large in glass —
 * source drawer, confidence score, limitation. The honesty IS the flex.
 */
import { m } from 'framer-motion';
import { cn } from '@/lib/utils';
import { flFraunces } from '../fonts';

export interface M5IntelligenceProps {
  className?: string;
}

export function M5Intelligence({ className }: M5IntelligenceProps) {
  return (
    <section
      className={cn('relative px-6 py-24 sm:py-32', className)}
      style={{
        background: 'linear-gradient(180deg, var(--fl-ecru) 0%, var(--fl-ecru) 35%, var(--fl-pine) 100%)',
      }}
    >
      <div className="mx-auto max-w-3xl text-center">
        <span className="text-eyebrow font-semibold uppercase tracking-[0.28em] text-warm-500">
          The Intelligence
        </span>
        <h2 className={cn(flFraunces.className, 'mt-4 text-[clamp(1.75rem,3.4vw,2.5rem)] font-normal leading-tight text-[var(--fl-pine)]')}>
          No signal ships without its source.
        </h2>
      </div>

      <m.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-15%' }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="fl-glass-3 mx-auto mt-12 max-w-xl rounded-2xl p-7 sm:p-8"
      >
        <div className="relative z-10">
          <div className="flex items-start justify-between gap-4">
            <div>
              <span className="text-eyebrow font-semibold uppercase tracking-[0.2em] text-[rgba(var(--fl-ecru-rgb),0.5)]">
                Coach Insight
              </span>
              <p className="mt-2 text-body-lg text-[var(--fl-ecru)]">
                Approach proximity from 175–200yd has drifted 4.2ft long over the last 3 rounds.
              </p>
            </div>
            <span
              className="flex-shrink-0 rounded-full px-3 py-1 text-xs font-semibold text-white"
              style={{ backgroundColor: 'var(--fl-green)' }}
            >
              High confidence
            </span>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 border-t border-[rgba(var(--fl-ecru-rgb),0.15)] pt-5 sm:grid-cols-2">
            <div>
              <span className="text-eyebrow font-semibold uppercase tracking-[0.18em] text-[rgba(var(--fl-ecru-rgb),0.45)]">
                Source
              </span>
              <p className="mt-1 text-body text-[rgba(var(--fl-ecru-rgb),0.75)]">3 rounds · strokes-gained approach, 175–200yd bucket</p>
            </div>
            <div>
              <span className="text-eyebrow font-semibold uppercase tracking-[0.18em] text-[rgba(var(--fl-ecru-rgb),0.45)]">
                Limitation
              </span>
              <p className="mt-1 text-body text-[rgba(var(--fl-ecru-rgb),0.75)]">Small sample — 3 rounds. Confidence rises after 5+.</p>
            </div>
          </div>
        </div>
      </m.div>
    </section>
  );
}
