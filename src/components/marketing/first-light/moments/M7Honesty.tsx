'use client';

/**
 * M7 · HONESTY BAND — pre-revenue social proof, done honestly.
 * docs/LANDING_ENTRY_WORLD_DESIGN.md M7, SAGE & CREAM amendment.
 * Background register: sage-mist tint (was flat ecru pre-amendment).
 * No fake logos. The founder line, what Helm refuses to claim, two live-
 * product stats (`AnimatedNumber` — the kit's StatRoll) that roll in on
 * FIRST VIEWPORT ENTRY, not on page mount: `AnimatedNumber` itself only
 * gates its roll behind a "first render vs. later update" distinction (see
 * that component's doc comment), so this file supplies the "first entry"
 * trigger via `useInView` and only passes the real value in once the row
 * has actually scrolled into view — before that each stat renders `0`, and
 * the swap to the real value is what `AnimatedNumber` treats as an "update"
 * (still fully animated, same easing).
 */
import { useRef } from 'react';
import { m, useInView, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { flFraunces } from '../fonts';
import { AnimatedNumber } from '@/components/ui/animated-number';

export interface M7HonestyProps {
  className?: string;
}

const STATS = [
  { value: 2, suffix: '', label: 'Sports live today — golf + baseball' },
  { value: 3, suffix: '', label: 'Things every insight must show: source, confidence, limitation' },
] as const;

export function M7Honesty({ className }: M7HonestyProps) {
  const reduced = useReducedMotion();
  const statsRef = useRef<HTMLDivElement>(null);
  const statsInView = useInView(statsRef, { once: true, amount: 0.6 });

  return (
    <section
      className={cn('relative px-6 py-24 sm:py-32', className)}
      style={{ backgroundColor: 'var(--fl-sage-mist)' }}
    >
      <div className="mx-auto max-w-2xl text-center">
        <span className="font-annual text-eyebrow font-semibold uppercase tracking-[0.28em] text-warm-500">
          Built by players
        </span>
        <m.p
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-15%' }}
          transition={reduced ? { duration: 0 } : { duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
          className={cn(flFraunces.className, 'mt-4 text-[clamp(1.5rem,3vw,2.1rem)] font-normal leading-snug text-[var(--fl-sage-ink)]')}
        >
          Built by two former collegiate athletes who got tired of running a program on spreadsheets and group texts.
        </m.p>
        <m.p
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-15%' }}
          transition={reduced ? { duration: 0 } : { duration: 0.55, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          className="mt-4 text-body text-warm-500"
        >
          We won&rsquo;t claim a client roster we don&rsquo;t have, or a stat we can&rsquo;t source. If a signal can&rsquo;t point to where it came from, it doesn&rsquo;t ship.
        </m.p>
      </div>

      <m.div
        ref={statsRef}
        initial={{ opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-15%' }}
        transition={reduced ? { duration: 0 } : { duration: 0.5, delay: 0.16, ease: [0.16, 1, 0.3, 1] }}
        className="mx-auto mt-14 flex max-w-md flex-col items-center gap-6 text-center sm:flex-row sm:justify-center sm:gap-16"
      >
        {STATS.map((stat) => (
          <div key={stat.label}>
            <AnimatedNumber
              value={statsInView ? stat.value : 0}
              suffix={stat.suffix}
              className={cn(flFraunces.className, 'text-4xl font-medium tabular-nums text-[var(--fl-sage-ink)]')}
            />
            <p className="mt-1.5 max-w-[13rem] text-caption text-warm-500">{stat.label}</p>
          </div>
        ))}
      </m.div>
    </section>
  );
}
