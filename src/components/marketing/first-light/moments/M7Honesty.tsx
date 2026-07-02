'use client';

/**
 * M7 · HONESTY BAND — pre-revenue social proof, done honestly.
 * docs/LANDING_ENTRY_WORLD_DESIGN.md M7. Background register: ecru.
 * No fake logos. The founder line, what Helm refuses to claim, a live-
 * product stat or two (StatRoll on first entry via `AnimatedNumber`).
 */
import { m } from 'framer-motion';
import { cn } from '@/lib/utils';
import { flFraunces } from '../fonts';
import { AnimatedNumber } from '@/components/ui/animated-number';

export interface M7HonestyProps {
  className?: string;
}

const STATS = [{ value: 2, suffix: '', label: 'Sports live today: golf + baseball' }] as const;

export function M7Honesty({ className }: M7HonestyProps) {
  return (
    <section
      className={cn('relative px-6 py-24 sm:py-32', className)}
      style={{ backgroundColor: 'var(--fl-ecru)' }}
    >
      <div className="mx-auto max-w-2xl text-center">
        <span className="text-eyebrow font-semibold uppercase tracking-[0.28em] text-warm-500">
          Built by players
        </span>
        <m.p
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-15%' }}
          transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
          className={cn(flFraunces.className, 'mt-4 text-[clamp(1.5rem,3vw,2.1rem)] font-normal leading-snug text-[var(--fl-pine)]')}
        >
          Built by two former collegiate athletes who got tired of running a program on spreadsheets and group texts.
        </m.p>
        <m.p
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-15%' }}
          transition={{ duration: 0.55, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          className="mt-4 text-body text-warm-500"
        >
          We won&rsquo;t claim a client roster we don&rsquo;t have, or a stat we can&rsquo;t source. If a signal can&rsquo;t point to where it came from, it doesn&rsquo;t ship.
        </m.p>
      </div>

      <div className="mx-auto mt-14 flex max-w-md flex-col items-center gap-6 text-center sm:flex-row sm:justify-center sm:gap-16">
        {STATS.map((stat, i) => (
          <m.div
            key={stat.label}
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-15%' }}
            transition={{ duration: 0.5, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }}
          >
            <AnimatedNumber
              value={stat.value}
              suffix={stat.suffix}
              staggerIndex={i}
              className={cn(flFraunces.className, 'text-4xl font-medium tabular-nums text-[var(--fl-pine)]')}
            />
            <p className="mt-1.5 text-caption text-warm-500">{stat.label}</p>
          </m.div>
        ))}
        <div className="max-w-[14rem] text-caption text-warm-500">
          Every insight cites its source, confidence, and limitation — no exceptions.
        </div>
      </div>
    </section>
  );
}
