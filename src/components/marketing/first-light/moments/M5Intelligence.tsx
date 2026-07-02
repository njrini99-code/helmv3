'use client';

/**
 * M5 · THE INTELLIGENCE — CoachHelm/signals showcase.
 * docs/LANDING_ENTRY_WORLD_DESIGN.md M5, SAGE & CREAM amendment.
 * Background register: cream → sage-mist → sage, deepening toward
 * sage-ink ONLY at the band's very far edge — the section must still
 * read light (daylight mood; never murky).
 *
 * ONE real CoachHelm signal card rendered large in `fl-glass-2` — a
 * faithful static replica of the real insight idiom (see
 * `src/components/golf/coachhelm/insight-card/InsightCard.tsx`'s hero
 * density + `src/components/golf/coachhelm/insights/EvidencePanel.tsx`'s
 * confidence-color threshold logic): a Source line and a Limitation line
 * sit OPEN, never behind a click — the whole point is nothing is hidden.
 * The confidence bar and the drift number roll in via `AnimatedNumber` on
 * first viewport entry.
 *
 * Per the amendment, kelly (`#16A34A` / Tailwind `primary-*`) is demoted
 * to product-only chrome. It appears ONLY on the confidence badge + bar
 * below, because that is a literal echo of the product's own
 * `confidenceColor()` helper (green at >=70% confidence, exactly this
 * card's 82%) — real product content, not landing chrome. Every other
 * surface on this card (icon well, top rule, labels, body ink) uses the
 * sage/cream tokens like the rest of the landing.
 */
import { useRef } from 'react';
import { m, useInView, useReducedMotion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { flFraunces } from '../fonts';
import { AnimatedNumber } from '@/components/ui/animated-number';

export interface M5IntelligenceProps {
  className?: string;
}

const CONFIDENCE = 0.82;
const DRIFT_FEET = 4.2;

export function M5Intelligence({ className }: M5IntelligenceProps) {
  const reduced = useReducedMotion();
  const cardRef = useRef<HTMLDivElement>(null);
  const inView = useInView(cardRef, { once: true, amount: 0.5 });
  const confPct = Math.round(CONFIDENCE * 100);

  return (
    <section
      className={cn('relative px-6 py-24 sm:py-32', className)}
      style={{
        background:
          'linear-gradient(180deg, var(--fl-cream) 0%, var(--fl-sage-mist) 42%, var(--fl-sage) 86%, var(--fl-sage-ink) 100%)',
      }}
    >
      <div className="relative z-10 mx-auto max-w-3xl text-center">
        <span className="font-annual text-eyebrow font-semibold uppercase tracking-[0.28em] text-[var(--fl-sage-deep)]">
          The Intelligence
        </span>
        <h2 className={cn(flFraunces.className, 'mt-4 text-[clamp(1.75rem,3.4vw,2.5rem)] font-normal leading-tight text-[var(--fl-sage-ink)]')}>
          No signal ships without its source.
        </h2>
      </div>

      <m.div
        ref={cardRef}
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-15%' }}
        transition={reduced ? { duration: 0 } : { duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="fl-glass-2 relative z-10 mx-auto mt-12 max-w-xl overflow-hidden rounded-2xl"
      >
        <div className="relative z-10">
          <div className="h-1 w-full" style={{ backgroundColor: 'var(--fl-sage)' }} aria-hidden="true" />

          <div className="p-7 sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <div
                  className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl"
                  style={{ backgroundColor: 'rgba(var(--fl-sage-ink-rgb), 0.08)' }}
                >
                  <Sparkles className="h-4 w-4" style={{ color: 'var(--fl-sage-deep)' }} aria-hidden="true" />
                </div>
                <span className="font-annual text-eyebrow font-semibold uppercase tracking-[0.18em] text-[rgba(var(--fl-sage-ink-rgb),0.55)]">
                  Coach Insight
                </span>
              </div>
              {/* Kelly, deliberately — see file header: a literal echo of
                  the product's own confidenceColor() >=70% threshold. */}
              <span
                data-testid="fl-signal-confidence-badge"
                className="flex-shrink-0 rounded-full bg-primary-600 px-3 py-1 text-xs font-semibold text-white"
              >
                {confPct}% confidence
              </span>
            </div>

            <div className="mt-5 flex items-end justify-between gap-4">
              <p className="max-w-[15rem] text-body-lg leading-snug text-[var(--fl-sage-ink)]">
                Approach proximity from 175&ndash;200yd has drifted long over the last 3 rounds.
              </p>
              <div className="flex-shrink-0 text-right">
                <div className="font-annual text-3xl font-medium tabular-nums leading-none text-[var(--fl-sage-ink)]">
                  <AnimatedNumber value={inView ? DRIFT_FEET : 0} decimals={1} prefix="+" suffix="ft" />
                </div>
                <div className="mt-1 text-eyebrow uppercase tracking-[0.14em] text-[rgba(var(--fl-sage-ink-rgb),0.5)]">
                  long
                </div>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4 border-t border-[rgba(var(--fl-sage-ink-rgb),0.14)] pt-5 sm:grid-cols-2">
              <div>
                <span className="font-annual text-eyebrow font-semibold uppercase tracking-[0.18em] text-[rgba(var(--fl-sage-ink-rgb),0.5)]">
                  Source
                </span>
                <p className="mt-1 text-body text-[rgba(var(--fl-sage-ink-rgb),0.78)]">
                  3 rounds · strokes-gained approach, 175&ndash;200yd bucket
                </p>
              </div>
              <div>
                <span className="font-annual text-eyebrow font-semibold uppercase tracking-[0.18em] text-[rgba(var(--fl-sage-ink-rgb),0.5)]">
                  Limitation
                </span>
                <p className="mt-1 text-body text-[rgba(var(--fl-sage-ink-rgb),0.78)]">
                  Small sample &mdash; 3 rounds. Confidence rises after 5+.
                </p>
              </div>
            </div>

            <div className="mt-5 flex items-center gap-3">
              <div
                role="progressbar"
                aria-valuenow={confPct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Confidence"
                className="relative h-1.5 flex-1 overflow-hidden rounded-full"
                style={{ backgroundColor: 'rgba(var(--fl-sage-ink-rgb), 0.12)' }}
              >
                <m.div
                  className="absolute inset-y-0 left-0 rounded-full bg-primary-500"
                  initial={{ width: '0%' }}
                  whileInView={{ width: `${confPct}%` }}
                  viewport={{ once: true, margin: '-15%' }}
                  transition={reduced ? { duration: 0 } : { duration: 0.8, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
                />
              </div>
              <span className="font-annual text-caption font-medium tabular-nums text-[rgba(var(--fl-sage-ink-rgb),0.6)]">
                {confPct}%
              </span>
            </div>
          </div>
        </div>
      </m.div>
    </section>
  );
}
