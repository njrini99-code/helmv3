'use client';

/**
 * M6 · FOR THE PLAYER — the player as audience, not afterthought.
 * docs/LANDING_ENTRY_WORLD_DESIGN.md M6. Background register: warm (clay).
 * Three small glass vignettes: passport completeness, Lift Lab check-in,
 * readiness. Copy speaks to the athlete, not the buyer.
 */
import { m } from 'framer-motion';
import { cn } from '@/lib/utils';
import { flFraunces } from '../fonts';

export interface M6ForThePlayerProps {
  className?: string;
}

const VIGNETTES = [
  {
    title: 'Your passport',
    line: 'Stats, highlights, and your story — always current, always yours to share.',
  },
  {
    title: 'Lift Lab check-in',
    line: 'Log the work. The bar tracks your progress so you don’t have to.',
  },
  {
    title: 'Readiness',
    line: 'A daily read on how you’re showing up — for you and your coach.',
  },
];

export function M6ForThePlayer({ className }: M6ForThePlayerProps) {
  return (
    <section
      className={cn('relative px-6 py-24 sm:py-32', className)}
      style={{
        background:
          'linear-gradient(165deg, var(--fl-clay) 0%, #8f5a2f 55%, var(--fl-pine) 130%)',
      }}
    >
      <div className="mx-auto max-w-2xl text-center">
        <span className="text-eyebrow font-semibold uppercase tracking-[0.28em] text-white/60">
          For the Player
        </span>
        <h2 className={cn(flFraunces.className, 'mt-4 text-[clamp(1.75rem,3.4vw,2.5rem)] font-normal leading-tight text-white')}>
          You&rsquo;re not just on the roster.
        </h2>
      </div>

      <div className="mx-auto mt-14 grid max-w-5xl grid-cols-1 gap-5 sm:grid-cols-3">
        {VIGNETTES.map((v, i) => (
          <m.div
            key={v.title}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-10%' }}
            transition={{ duration: 0.5, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }}
            className="fl-glass-2 rounded-2xl p-6"
          >
            <div className="relative z-10">
              <h3 className={cn(flFraunces.className, 'text-lg font-medium text-white')}>{v.title}</h3>
              <p className="mt-2 text-body-sm leading-relaxed text-white/75">{v.line}</p>
            </div>
          </m.div>
        ))}
      </div>
    </section>
  );
}
