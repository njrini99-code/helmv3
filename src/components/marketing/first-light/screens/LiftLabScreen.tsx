'use client';

/**
 * LiftLabScreen (phone) — the player Lift Lab idiom in miniature, studied
 * from `PlayerLiftHomeClient.tsx`'s readiness-first surface: a readiness
 * score, the bar-with-plates barbell glyph (Lift Lab's own visual
 * signature), and a 3-row check-in ledger. Compact for the phone's ~130px
 * well — every figure stays legible at that width. Kelly marks only the
 * meter fill — product-only accent, per CONTRACTS.md.
 */
import { m } from 'framer-motion';
import { cn } from '@/lib/utils';
import { ScreenEyebrow, RollingStat, rowVariants, containerVariants, barVariants, KELLY, type ScreenReplicaProps } from './shared';

const CHECK_INS: ReadonlyArray<{ day: string; sleep: string; soreness: string }> = [
  { day: 'Mon', sleep: '7.5h', soreness: 'Low' },
  { day: 'Sun', sleep: '6.0h', soreness: 'Med' },
  { day: 'Sat', sleep: '8.0h', soreness: 'Low' },
];

/** The bar-with-plates glyph — Lift Lab's visual signature, built from
 * plain divs (no SVG import needed for a handful of rectangles). */
function BarbellGlyph({ instant }: { instant: boolean }) {
  return (
    <m.div
      aria-hidden="true"
      className="mx-auto flex items-center gap-[3px]"
      initial={instant ? false : { opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={instant ? { duration: 0 } : { duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
    >
      <span className="h-3 w-1.5 rounded-full" style={{ background: 'var(--fl-sage-ink)' }} />
      <span className="h-2 w-1 rounded-full" style={{ background: 'var(--fl-sage-ink)' }} />
      <span className="h-px w-8" style={{ background: 'var(--fl-sage-ink)' }} />
      <span className="h-2 w-1 rounded-full" style={{ background: 'var(--fl-sage-ink)' }} />
      <span className="h-3 w-1.5 rounded-full" style={{ background: 'var(--fl-sage-ink)' }} />
    </m.div>
  );
}

export function LiftLabScreen({ active, instant = false, className }: ScreenReplicaProps) {
  const shown = instant || active;

  return (
    <div
      className={cn('relative flex h-full w-full flex-col overflow-hidden p-2.5', className)}
      style={{ background: 'var(--fl-cream)' }}
    >
      <ScreenEyebrow className="text-center">Lift Lab</ScreenEyebrow>

      <m.div
        variants={containerVariants(0.08)}
        initial={shown ? 'shown' : 'hidden'}
        animate={shown ? 'shown' : 'hidden'}
        className="mt-2 flex flex-col items-center"
      >
        <m.div variants={rowVariants} className="text-center">
          <ScreenEyebrow>Readiness</ScreenEyebrow>
          <p style={{ color: 'var(--fl-sage-ink)' }}>
            <RollingStat value={82} active={active} instant={instant} className="text-h2" />
          </p>
        </m.div>

        <m.div
          variants={rowVariants}
          className="mt-2 h-[3px] w-full rounded-full"
          style={{ background: 'rgba(var(--fl-sage-rgb), 0.2)' }}
        >
          <m.div variants={barVariants} className="h-full origin-left rounded-full" style={{ background: KELLY, width: '82%' }} />
        </m.div>

        <div className="mt-3">
          <BarbellGlyph instant={instant} />
        </div>
      </m.div>

      <div className="fl-rule mt-3" />

      <m.div
        variants={containerVariants(0.06, 0.2)}
        initial={shown ? 'shown' : 'hidden'}
        animate={shown ? 'shown' : 'hidden'}
        className="mt-2 flex flex-1 flex-col justify-center gap-1"
      >
        {CHECK_INS.map((c) => (
          <m.div
            key={c.day}
            variants={rowVariants}
            className="flex items-center justify-between text-microbadge font-normal"
            style={{ color: 'rgba(var(--fl-sage-ink-rgb), 0.65)' }}
          >
            <span className="font-semibold uppercase tracking-wide">{c.day}</span>
            <span className="font-annual tabular-nums font-normal">{c.sleep}</span>
            <span className="font-normal">{c.soreness}</span>
          </m.div>
        ))}
      </m.div>
    </div>
  );
}
