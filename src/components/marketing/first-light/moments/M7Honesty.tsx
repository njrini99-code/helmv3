'use client';

/**
 * M7 · HONESTY BAND — pre-revenue social proof, done honestly.
 * docs/LANDING_ENTRY_WORLD_DESIGN.md M7, SAGE & CREAM amendment, ⚠
 * AMENDMENT 2 — IMMACULATE, ⚠ AMENDMENT 3 — BRAND & ARCHITECTURE §C.2/§D.3.
 * Background register: `.fl-aurora`'s radial field composited OVER a
 * sage-mist base (an inline `backgroundColor` override sits under the
 * aurora class's own radial `background-image` layers — the two are
 * separate CSS properties, so the tint survives) rather than plain cream,
 * preserving this section's deeper "band" feel per Amendment 2 §A.1's
 * explicit carve-out for M7 while still killing the flat single-color
 * fill. No fake logos.
 *
 * Amendment 3 §D.3 goes left-weighted: the founder line and what-Helm-
 * refuses-to-claim line hold the LEFT column; the two live-product stats
 * move into a tabular-nums ledger block (divide-y rows, not the old
 * side-by-side row) in the RIGHT column. A rosette eyebrow ("Built by
 * players") stays centered above the split as the section's opening mark,
 * same convention as M2/M5.
 *
 * §C.2 — THE ONE GOLD MOMENT: the brass rule under the founder line draws
 * in (scaleX, origin-left) and then carries a single slow glint sweep —
 * a 1px-tall traveling highlight (a masked gradient span translated via
 * `x`, transform-only) that runs ONCE on first entry, then stays still.
 * This is the page's ONLY animated gold; nothing else on the page should
 * animate a brass/gold value. Reduced-motion renders the rule fully drawn,
 * static, with no glint element at all (not just a disabled transition —
 * the sweep span isn't mounted).
 */
import { useRef } from 'react';
import { m, useInView, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { flFraunces } from '../fonts';
import { HelmRosette } from '../brand';
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
  const ruleRef = useRef<HTMLDivElement>(null);
  const ruleInView = useInView(ruleRef, { once: true, amount: 0.8 });
  const statsRef = useRef<HTMLDivElement>(null);
  const statsInView = useInView(statsRef, { once: true, amount: 0.6 });

  return (
    <section
      className={cn('fl-aurora relative px-6 py-24 sm:py-32', className)}
      style={{ backgroundColor: 'var(--fl-sage-mist)' }}
    >
      <div className="relative mx-auto max-w-5xl">
        <div className="mx-auto mb-14 flex max-w-xs items-center justify-center gap-3 sm:mb-16">
          <span aria-hidden="true" className="fl-rule h-px flex-1" />
          <span className="font-annual text-eyebrow font-semibold uppercase tracking-[0.28em] text-[var(--fl-sage-deep)]">
            Built by players
          </span>
          <HelmRosette size={12} className="flex-shrink-0 text-[var(--fl-brass)]" />
          <span aria-hidden="true" className="fl-rule h-px flex-1" />
        </div>

        <div className="grid gap-12 md:grid-cols-[1.3fr_1fr] md:items-start md:gap-16">
          {/* LEFT — founder line, the one gold rule, the refusals line. */}
          <div className="text-left">
            <m.p
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-15%' }}
              transition={reduced ? { duration: 0 } : { duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
              className={cn(flFraunces.className, 'text-balance text-[clamp(1.5rem,3vw,2.1rem)] font-normal leading-snug text-[var(--fl-sage-ink)]')}
            >
              Built by two former collegiate athletes who got tired of running a program on spreadsheets and group texts.
            </m.p>

            <div ref={ruleRef} className="relative my-6 h-px w-32 overflow-hidden" aria-hidden="true">
              <m.div
                className="absolute inset-0 origin-left"
                style={{
                  background: 'linear-gradient(90deg, rgba(var(--fl-brass-rgb), 0.75), rgba(var(--fl-brass-rgb), 0.25))',
                }}
                initial={{ scaleX: 0 }}
                animate={ruleInView ? { scaleX: 1 } : { scaleX: 0 }}
                transition={reduced ? { duration: 0 } : { duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
              />
              {!reduced && (
                <m.div
                  className="absolute inset-y-0 w-10"
                  style={{
                    background:
                      'linear-gradient(90deg, transparent, rgba(var(--fl-cream-high-rgb), 0.9), transparent)',
                  }}
                  initial={{ x: '-140%' }}
                  animate={ruleInView ? { x: '240%' } : { x: '-140%' }}
                  transition={{ duration: 1.1, delay: 0.85, ease: [0.4, 0, 0.2, 1] }}
                />
              )}
            </div>

            <m.p
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-15%' }}
              transition={reduced ? { duration: 0 } : { duration: 0.55, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
              className="text-pretty text-body leading-[1.65] text-[rgba(var(--fl-sage-ink-rgb),0.72)]"
            >
              We won&rsquo;t claim a client roster we don&rsquo;t have, or a stat we can&rsquo;t source. If a signal can&rsquo;t point to where it came from, it doesn&rsquo;t ship.
            </m.p>
          </div>

          {/* RIGHT — the tabular-nums stat ledger. */}
          <div className="relative">
            <div
              aria-hidden="true"
              className="fl-light-pool left-1/2 top-1/2 h-64 w-72 -translate-x-1/2 -translate-y-1/2"
            />
            <m.div
              ref={statsRef}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-15%' }}
              transition={reduced ? { duration: 0 } : { duration: 0.5, delay: 0.16, ease: [0.16, 1, 0.3, 1] }}
              className="relative flex flex-col divide-y divide-[rgba(var(--fl-sage-ink-rgb),0.14)] border-t border-[rgba(var(--fl-sage-ink-rgb),0.14)]"
            >
              {STATS.map((stat) => (
                <div key={stat.label} className="flex items-baseline justify-between gap-6 py-5">
                  <AnimatedNumber
                    value={statsInView ? stat.value : 0}
                    suffix={stat.suffix}
                    className={cn(flFraunces.className, 'text-3xl font-medium tabular-nums text-[var(--fl-sage-ink)]')}
                  />
                  <p className="max-w-[11rem] text-right text-caption text-[rgba(var(--fl-sage-ink-rgb),0.6)]">{stat.label}</p>
                </div>
              ))}
            </m.div>
          </div>
        </div>
      </div>
    </section>
  );
}
